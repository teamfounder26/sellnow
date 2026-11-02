import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, makeLiveStore, makeSeller } from "./helpers";
import type { DB } from "@/lib/db";
import { disbursementAttempts, ledgerEntries, orders, paymentTransactions, settlementBatches, settlementItems, settlements, workspaces } from "@/lib/db/schema";
import { registerUser } from "@/lib/auth/service";
import { createCheckout, type CheckoutInput } from "@/lib/commerce/checkout";
import { applyPaymentEvent } from "@/lib/commerce/events";
import { refundOrder } from "@/lib/commerce/orders";
import { TestGateway } from "@/lib/payments/test-gateway";
import { newId } from "@/lib/ids";
import { accountBalance, ledgerIntegrity } from "@/lib/finance/ledger";
import { changeBankAccount, reviewBankAccount, reviewSellerAccount, submitActivation, currentBankAccount } from "@/lib/finance/selltro-pay";
import { setConfig, DEFAULT_CONFIG } from "@/lib/finance/settings";
import * as st from "@/lib/finance/settlement";
import { __setPayoutFetchForTests, poChecksum } from "@/lib/finance/payment-orders";

let db: DB;
let finance: string; // platform finance admin
let finance2: string;
beforeAll(async () => {
  db = await makeDb();
  finance = (await registerUser(db, { name: "Finance One", email: `fin1-${Date.now()}@sellnow.test`, password: "password123" })).id;
  finance2 = (await registerUser(db, { name: "Finance Two", email: `fin2-${Date.now()}@sellnow.test`, password: "password123" })).id;
});
afterEach(async () => {
  __setPayoutFetchForTests(null);
  delete process.env.SELLTRO_PAY_MODE;
  await setConfig(db, finance, "settlement", DEFAULT_CONFIG.settlement);
  await setConfig(db, finance, "payoutsEnabled", false);
  await setConfig(db, finance, "processingFee", DEFAULT_CONFIG.processingFee);
});

const urls = { base: "http://localhost:3100", slug: "x" };
const buyer = (productId: string, extra: Partial<CheckoutInput> = {}): CheckoutInput => ({
  idempotencyKey: newId("idem"),
  lines: [{ productId, quantity: 1 }],
  customer: { name: "Pembeli Satu", email: "buyer@example.com", phone: "0123456789", marketingConsent: false },
  address: { line1: "No 1, Jalan Mawar", postcode: "43000", city: "Kajang", state: "Selangor" },
  deliveryMethod: "shipping",
  ...extra,
});
const bank = { bankCode: "MBBEMYKL", accountNumber: "512345678901", holderName: "Mak Teh Enterprise", accountType: "business" as const };

/** Seller with Selltro Pay activated, reviewed and a verified bank (test mode = simulated money). */
async function selltroSeller() {
  const s = await makeLiveStore(db);
  await submitActivation(db, s, { businessType: "sole_prop", legalName: "Mak Teh Enterprise", registrationNumber: "202301234567", idNumber: "900101-14-5678", contactPhone: "0123456789", acceptTerms: true, bank });
  await reviewSellerAccount(db, finance, s.workspaceId, "approve");
  await reviewBankAccount(db, finance, (await currentBankAccount(db, s.workspaceId))!.id, "verify");
  return s;
}

async function paidOrder(s: { workspaceId: string; productId: string }, at?: Date) {
  const r = await createCheckout(db, s.workspaceId, buyer(s.productId), urls);
  const o = (await db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
  const { body, signature } = TestGateway.signEvent(o.id, "paid", o.totalSen);
  await applyPaymentEvent(db, s.workspaceId, TestGateway.verifyWebhook(body, signature, "selltro_pay"));
  if (at) await db.update(paymentTransactions).set({ paidAt: at }).where(eq(paymentTransactions.orderId, o.id));
  return (await db.query.orders.findFirst({ where: eq(orders.id, o.id) }))!;
}

describe("T+1 calendar-day settlement dates (Asia/Kuala_Lumpur)", () => {
  it("every day of the week, holidays included; cutoff rolls to T+2", () => {
    expect(st.settlementDateFor(new Date("2026-11-06T10:00:00+08:00"), "23:59")).toBe("2026-11-07"); // Fri → Sat
    expect(st.settlementDateFor(new Date("2026-11-07T10:00:00+08:00"), "23:59")).toBe("2026-11-08"); // Sat → Sun
    expect(st.settlementDateFor(new Date("2026-11-08T10:00:00+08:00"), "23:59")).toBe("2026-11-09"); // Sun → Mon
    expect(st.settlementDateFor(new Date("2026-08-30T12:00:00+08:00"), "23:59")).toBe("2026-08-31"); // into Merdeka Day
    expect(st.settlementDateFor(new Date("2026-11-06T23:59:30+08:00"), "23:59")).toBe("2026-11-08"); // after cutoff
    expect(st.settlementDateFor(new Date("2026-11-06T16:30:00Z"), "23:59")).toBe("2026-11-08"); // 00:30 MYT Sat → Sun
  });
});

describe("Selltro Pay onboarding", () => {
  it("bank details are encrypted/masked, the maker can't verify their own bank, changes need the password", async () => {
    const s = await makeLiveStore(db);
    await submitActivation(db, s, { businessType: "individual", legalName: "Aina Binti Ali", idNumber: "900101145678", contactPhone: "0123456789", acceptTerms: true, bank });
    const b = (await currentBankAccount(db, s.workspaceId))!;
    expect(b).toMatchObject({ accountLast4: "8901", status: "PENDING_VERIFICATION" });
    expect(b.accountNumberCiphertext).not.toContain("512345678901");
    await expect(reviewBankAccount(db, s.userId, b.id, "verify")).rejects.toMatchObject({ code: "admin.makerChecker" });
    await expect(changeBankAccount(db, s, { password: "wrong-pass", bank: { ...bank, accountNumber: "112233445566" } })).rejects.toMatchObject({ code: "auth.stepUpFailed" });
    await changeBankAccount(db, s, { password: "password123", bank: { ...bank, accountNumber: "112233445566" } });
    const now = (await currentBankAccount(db, s.workspaceId))!;
    expect(now.accountLast4).toBe("5566");
    expect(now.id).not.toBe(b.id); // history kept, old row superseded
  });
});

describe("Selltro Pay payments → ledger → settlement", () => {
  it("paid order posts a balanced ledger entry with fees; COD/manual never enter the payout ledger", async () => {
    await setConfig(db, finance, "processingFee", { fixedSen: 100, bps: 150 });
    const s = await selltroSeller();
    const o = await paidOrder(s);
    expect(o).toMatchObject({ provider: "selltro_pay", paymentStatus: "PAID", orderStatus: "CONFIRMED", settlementStatus: "PENDING", fulfillmentStatus: "READY_TO_SHIP" });
    const total = o.totalSen; // 1990 + 800 shipping
    const proc = 100 + Math.round((total * 150) / 10000);
    expect(-(await accountBalance(db, "seller_payable", s.workspaceId))).toBe(total - proc);
    expect((await ledgerIntegrity(db)).total).toBe(0);
    // Replaying the callback posts nothing twice.
    const { body, signature } = TestGateway.signEvent(o.id, "paid", o.totalSen);
    await applyPaymentEvent(db, s.workspaceId, TestGateway.verifyWebhook(body, signature, "selltro_pay"));
    expect(-(await accountBalance(db, "seller_payable", s.workspaceId))).toBe(total - proc);
  });

  it("daily cycle: not due on T, due on T+1, idempotent, approval → simulated payout → settled", async () => {
    const s = await selltroSeller();
    const T = new Date("2026-12-05T10:00:00+08:00"); // Saturday
    const o = await paidOrder(s, T);
    const net = -(await accountBalance(db, "seller_payable", s.workspaceId));

    const day0 = await st.runSettlementCycle(db, { now: new Date("2026-12-05T20:00:00+08:00"), environment: "test" });
    // Not due yet: nothing for this seller on day T (other tenants in the shared test DB may be due).
    expect((await db.query.settlements.findMany({ where: eq(settlements.batchId, day0.batch.id) })).some((x) => x.workspaceId === s.workspaceId)).toBe(false);
    const r1 = await st.runSettlementCycle(db, { now: new Date("2026-12-06T09:00:00+08:00"), environment: "test" }); // Sunday
    const r2 = await st.runSettlementCycle(db, { now: new Date("2026-12-06T10:00:00+08:00"), environment: "test" });
    expect(r2.created).toBe(false);
    expect(r2.batch.id).toBe(r1.batch.id);
    const mine = (await db.query.settlements.findMany({ where: eq(settlements.batchId, r1.batch.id) })).find((x) => x.workspaceId === s.workspaceId)!;
    expect(mine).toMatchObject({ status: "AWAITING_APPROVAL", netSen: net, scheduledFor: "2026-12-06" });
    expect((await db.query.orders.findFirst({ where: eq(orders.id, o.id) }))!.settlementStatus).toBe("SCHEDULED");

    await expect(st.executeBatch(db, finance, r1.batch.id)).rejects.toMatchObject({ code: "settlement.notQueued" });
    await expect(st.approveBatch(db, finance, r1.batch.id, "nope")).rejects.toMatchObject({ code: "auth.stepUpFailed" });
    expect(await st.approveBatch(db, finance, r1.batch.id, "password123")).toMatchObject({ approved: true });
    await st.executeBatch(db, finance, r1.batch.id);
    const done = (await db.query.settlements.findFirst({ where: eq(settlements.id, mine.id) }))!;
    expect(done.status).toBe("COMPLETED");
    const att = await db.query.disbursementAttempts.findMany({ where: eq(disbursementAttempts.settlementId, mine.id) });
    expect(att).toHaveLength(1);
    expect(att[0]).toMatchObject({ provider: "simulated", status: "completed" });
    expect(await accountBalance(db, "seller_payable", s.workspaceId)).toBe(0);
    expect((await db.query.orders.findFirst({ where: eq(orders.id, o.id) }))!.settlementStatus).toBe("SETTLED");
    // A transaction can never land in two settlements.
    expect(await db.query.settlementItems.findMany({ where: eq(settlementItems.workspaceId, s.workspaceId) })).toHaveLength(1);
    await expect(st.disburseSettlement(db, mine.id, finance)).rejects.toMatchObject({ code: "settlement.notQueued" });
    expect((await ledgerIntegrity(db)).total).toBe(0);
  });

  it("concurrent workers create one batch; holds, suspension and unverified banks keep money on hold", async () => {
    const a = await selltroSeller();
    const b = await selltroSeller();
    const T = new Date("2026-12-10T10:00:00+08:00");
    await paidOrder(a, T);
    await paidOrder(b, T);
    await db.update(workspaces).set({ suspendedAt: new Date() }).where(eq(workspaces.id, b.workspaceId));
    const now = new Date("2026-12-11T09:00:00+08:00");
    const [x, y] = await Promise.all([st.runSettlementCycle(db, { now, environment: "test" }), st.runSettlementCycle(db, { now, environment: "test" })]);
    expect(x.batch.id).toBe(y.batch.id);
    expect(await db.query.settlementBatches.findMany({ where: eq(settlementBatches.settlementDate, "2026-12-11") })).toHaveLength(1);
    const rows = await db.query.settlements.findMany({ where: eq(settlements.batchId, x.batch.id) });
    expect(rows.find((r) => r.workspaceId === b.workspaceId)).toMatchObject({ status: "ON_HOLD", holdReason: "tenant_suspended" });
    // Seller A changes bank after calculation → payout refused and held.
    await st.approveBatch(db, finance, x.batch.id, "password123");
    await changeBankAccount(db, a, { password: "password123", bank: { ...bank, accountNumber: "998877665544" } });
    await st.executeBatch(db, finance, x.batch.id);
    expect((await db.query.settlements.findMany({ where: eq(settlements.batchId, x.batch.id) })).find((r) => r.workspaceId === a.workspaceId)).toMatchObject({ status: "ON_HOLD", holdReason: "bank_not_verified" });
    await expect(st.releaseSettlementHold(db, finance, rows.find((r) => r.workspaceId === b.workspaceId)!.id, "password123")).rejects.toMatchObject({ code: "settlement.stillIneligible" });
  });

  it("refund after settlement is recovered from the next cycle; negative balances are never paid", async () => {
    const s = await selltroSeller();
    const o = await paidOrder(s, new Date("2026-12-14T10:00:00+08:00"));
    const r = await st.runSettlementCycle(db, { now: new Date("2026-12-15T09:00:00+08:00"), environment: "test" });
    await st.approveBatch(db, finance, r.batch.id, "password123");
    await st.executeBatch(db, finance, r.batch.id);
    await refundOrder(db, s, o.id, 1000);
    expect(await accountBalance(db, "seller_payable", s.workspaceId)).toBe(1000); // seller owes RM10
    const next = await st.runSettlementCycle(db, { now: new Date("2026-12-16T09:00:00+08:00"), environment: "test" });
    expect((await db.query.settlements.findMany({ where: eq(settlements.batchId, next.batch.id) })).some((x) => x.workspaceId === s.workspaceId)).toBe(false);
    // Next sale nets against the debt.
    const o2 = await paidOrder(s, new Date("2026-12-16T10:00:00+08:00"));
    const third = await st.runSettlementCycle(db, { now: new Date("2026-12-17T09:00:00+08:00"), environment: "test" });
    const mine = (await db.query.settlements.findMany({ where: eq(settlements.batchId, third.batch.id) })).find((x) => x.workspaceId === s.workspaceId)!;
    expect(mine.netSen).toBe(o2.totalSen - 1000);
    expect(mine.refundsSen).toBe(1000);
  });

  it("adjustments need a different approver", async () => {
    const s = await selltroSeller();
    const id = await st.createAdjustment(db, finance, s.workspaceId, 500, "Goodwill credit for courier delay");
    await expect(st.decideAdjustment(db, finance, id, true, "password123")).rejects.toMatchObject({ code: "admin.makerChecker" });
    await st.decideAdjustment(db, finance2, id, true, "password123");
    expect(-(await accountBalance(db, "seller_payable", s.workspaceId))).toBe(500);
  });

  it("dual approval at the threshold: same person can't approve twice", async () => {
    await setConfig(db, finance, "settlement", { ...DEFAULT_CONFIG.settlement, dualApprovalThresholdSen: 100 });
    const s = await selltroSeller();
    await paidOrder(s, new Date("2026-12-20T10:00:00+08:00"));
    const r = await st.runSettlementCycle(db, { now: new Date("2026-12-21T09:00:00+08:00"), environment: "test" });
    expect(await st.approveBatch(db, finance, r.batch.id, "password123")).toMatchObject({ approved: false, needsSecond: true });
    await expect(st.approveBatch(db, finance, r.batch.id, "password123")).rejects.toMatchObject({ code: "admin.makerChecker" });
    expect(await st.approveBatch(db, finance2, r.batch.id, "password123")).toMatchObject({ approved: true });
  });
});

describe("Billplz Payment Order disbursement (sandbox, mocked HTTP)", () => {
  let day = 4;
  async function queuedSandboxSettlement() {
    day += 2; // one settlement date per scenario (a date's batch is calculated once)
    process.env.SELLTRO_PAY_MODE = "sandbox";
    process.env.BILLPLZ_API_KEY = "k";
    process.env.BILLPLZ_X_SIGNATURE_KEY = "S-test-key";
    process.env.BILLPLZ_COLLECTION_ID = "col";
    process.env.BILLPLZ_PAYMENT_ORDER_COLLECTION_ID = "poc";
    const s = await selltroSeller(); // created in test env (order); we reconcile manually below
    delete process.env.SELLTRO_PAY_MODE;
    const d = String(day).padStart(2, "0");
    const o = await paidOrder(s, new Date(`2027-01-${d}T10:00:00+08:00`));
    await db.update(paymentTransactions).set({ environment: "sandbox", reconcileStatus: "matched" }).where(eq(paymentTransactions.orderId, o.id));
    process.env.SELLTRO_PAY_MODE = "sandbox";
    await setConfig(db, finance, "settlement", { ...DEFAULT_CONFIG.settlement, requireApproval: false });
    const r = await st.runSettlementCycle(db, { now: new Date(`2027-01-${String(day + 1).padStart(2, "0")}T09:00:00+08:00`), environment: "sandbox" });
    const mine = (await db.query.settlements.findMany({ where: eq(settlements.batchId, r.batch.id) })).find((x) => x.workspaceId === s.workspaceId)!;
    return { s, r, mine };
  }

  it("refuses to pay out while the kill switch is off", async () => {
    const { mine } = await queuedSandboxSettlement();
    expect(mine.status).toBe("QUEUED");
    await expect(st.disburseSettlement(db, mine.id, finance)).rejects.toMatchObject({ code: "settlement.payoutsDisabled" });
  });

  it("unknown provider state freezes the payout until reconciled; no blind retry", async () => {
    const { mine } = await queuedSandboxSettlement();
    await setConfig(db, finance, "payoutsEnabled", true);
    let calls = 0;
    __setPayoutFetchForTests(async () => {
      calls++;
      throw new Error("socket hang up");
    });
    expect(await st.disburseSettlement(db, mine.id, finance)).toMatchObject({ status: "UNKNOWN" });
    await expect(st.disburseSettlement(db, mine.id, finance)).rejects.toMatchObject({ code: "settlement.notQueued" });
    expect(calls).toBe(1);
    await st.reconcileUnknownPayout(db, finance, mine.id, "failed", "Checked Billplz dashboard: no payment order exists", "password123");
    // Now a fresh attempt with a new reference_id is allowed.
    let sent: URLSearchParams | null = null;
    __setPayoutFetchForTests(async (_u, init) => {
      sent = new URLSearchParams(String(init?.body));
      return new Response(JSON.stringify({ id: "po_1", status: "processing", total: mine.netSen, reference_id: sent.get("reference_id") }), { status: 200 });
    });
    expect(await st.disburseSettlement(db, mine.id, finance)).toMatchObject({ status: "PROCESSING" });
    expect(sent!.get("reference_id")).toBe(`${mine.reference}-2`);
    expect(sent!.get("checksum")).toBe(poChecksum(["poc", "512345678901", mine.netSen, sent!.get("epoch")!], "S-test-key"));
    expect(await st.applyPayoutStatus(db, "po_1", "completed")).toBe("completed");
    expect(await st.applyPayoutStatus(db, "po_1", "completed")).toBe("completed"); // duplicate callback
    expect((await db.query.settlements.findFirst({ where: eq(settlements.id, mine.id) }))!.status).toBe("COMPLETED");
    const payouts = await db.query.ledgerEntries.findMany({ where: and(eq(ledgerEntries.sourceType, "payout"), eq(ledgerEntries.sourceId, mine.id)) });
    expect(payouts).toHaveLength(2); // posted once
  });

  it("insufficient Payment Order Limit → awaiting funding, nothing sent", async () => {
    const { r } = await queuedSandboxSettlement();
    await setConfig(db, finance, "payoutsEnabled", true);
    __setPayoutFetchForTests(async (u) => (String(u).includes("payment_order_limit") ? new Response(JSON.stringify({ total: "100" }), { status: 200 }) : new Response("unexpected", { status: 500 })));
    const out = await st.executeBatch(db, finance, r.batch.id);
    expect(out.shortfallSen).toBeGreaterThan(0);
    expect((await db.query.settlementBatches.findFirst({ where: eq(settlementBatches.id, r.batch.id) }))!.status).toBe("AWAITING_FUNDING");
  });
});

describe("tenant isolation", () => {
  it("statements are scoped to the tenant", async () => {
    const s = await selltroSeller();
    const other = await makeSeller(db);
    await paidOrder(s, new Date("2027-02-01T10:00:00+08:00"));
    const r = await st.runSettlementCycle(db, { now: new Date("2027-02-02T09:00:00+08:00"), environment: "test" });
    const mine = (await db.query.settlements.findMany({ where: eq(settlements.batchId, r.batch.id) })).find((x) => x.workspaceId === s.workspaceId)!;
    expect(await st.settlementStatementCsv(db, s.workspaceId, mine.id)).toContain(mine.reference);
    await expect(st.settlementStatementCsv(db, other.workspaceId, mine.id)).rejects.toMatchObject({ code: "errors.notFound" });
  });
});
