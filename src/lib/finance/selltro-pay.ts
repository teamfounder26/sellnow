import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "@/lib/db";
import { orders, paymentTransactions, sellerBankAccounts, sellerPaymentAccounts, tenantSubscriptions, subscriptionPlans, workspaceMembers, workspaces, type SellerPayStatus } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit, notify, track } from "@/lib/audit";
import { confirmIdentity } from "@/lib/auth/stepup";
import { BillplzGateway } from "@/lib/payments/billplz";
import { TestGateway } from "@/lib/payments/test-gateway";
import { testGatewayAllowed } from "@/lib/payments/integrations";
import type { BillplzSecrets, CreatePaymentInput, CreatePaymentResult, PaymentGateway } from "@/lib/payments/types";
import { getConfig } from "./settings";
import { post } from "./ledger";
import { bankByCode, validAccountNumber } from "./banks";

/**
 * Selltro Pay — SellNow's only online payment method. Billplz runs underneath with ONE
 * platform-managed collection: sellers never see Billplz, collections, keys or callbacks.
 *
 *   SELLTRO_PAY_MODE = test | sandbox | live   (test: simulated, no money; default outside production)
 *   BILLPLZ_API_KEY, BILLPLZ_X_SIGNATURE_KEY, BILLPLZ_COLLECTION_ID   (sandbox/live)
 *
 * Live mode additionally needs the Superadmin "selltroPayLiveApproved" switch, set only after the
 * Billplz Enterprise agreement confirms the platform-collection / disbursement model and KYC rules.
 */
export type SelltroEnv = "test" | "sandbox" | "live";

export function selltroEnvironment(): SelltroEnv | null {
  const m = process.env.SELLTRO_PAY_MODE;
  if (m === "sandbox" || m === "live") return process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_X_SIGNATURE_KEY && process.env.BILLPLZ_COLLECTION_ID ? m : null;
  if (m === "test" || (!m && testGatewayAllowed())) return testGatewayAllowed() ? "test" : null;
  return null;
}

export function platformBillplzSecrets(): BillplzSecrets {
  return { apiKey: process.env.BILLPLZ_API_KEY ?? "", xSignatureKey: process.env.BILLPLZ_X_SIGNATURE_KEY ?? "", collectionId: process.env.BILLPLZ_COLLECTION_ID ?? "" };
}

class SelltroPayGateway implements PaymentGateway {
  readonly provider = "selltro_pay" as const;
  readonly isTest: boolean;
  constructor(readonly env: SelltroEnv) {
    this.isTest = env !== "live";
  }
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (this.env === "test") return new TestGateway().createPayment(input);
    return new BillplzGateway(platformBillplzSecrets(), this.env === "live" ? "live" : "test").createPayment(input);
  }
}

export async function selltroGateway(db: DB | Tx) {
  const env = selltroEnvironment();
  if (!env) throw new AppError("selltro.unavailable");
  if (env === "live" && !(await getConfig(db)).selltroPayLiveApproved) throw new AppError("selltro.liveNotApproved");
  return new SelltroPayGateway(env);
}

// ------------------------------------------------------------------ seller account & bank

export async function getSellerAccount(db: DB | Tx, workspaceId: string) {
  return (await db.query.sellerPaymentAccounts.findFirst({ where: eq(sellerPaymentAccounts.workspaceId, workspaceId) })) ?? null;
}

export async function currentBankAccount(db: DB | Tx, workspaceId: string) {
  return (await db.query.sellerBankAccounts.findFirst({ where: and(eq(sellerBankAccounts.workspaceId, workspaceId), isNull(sellerBankAccounts.supersededAt)) })) ?? null;
}

/** Can this store take Selltro Pay payments right now? */
export async function selltroReady(db: DB | Tx, workspaceId: string) {
  const acct = await getSellerAccount(db, workspaceId);
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  return Boolean(acct?.status === "ACTIVE" && !ws?.suspendedAt && selltroEnvironment());
}

const activationSchema = z.object({
  businessType: z.enum(["individual", "sole_prop", "company"]),
  legalName: z.string().trim().min(3).max(160),
  registrationNumber: z.string().trim().max(40).optional().or(z.literal("")),
  idNumber: z.string().trim().regex(/^[A-Za-z0-9-]{6,20}$/, "selltro.badId"),
  contactPhone: z.string().trim().regex(/^(\+?6?0)[0-9]{8,10}$/, "checkout.phoneInvalid"),
  acceptTerms: z.literal(true),
  bank: z.object({
    bankCode: z.string(),
    accountNumber: z.string().trim(),
    holderName: z.string().trim().min(3).max(120),
    accountType: z.enum(["personal", "business"]),
  }),
});

function bankRow(workspaceId: string, userId: string, b: z.infer<typeof activationSchema>["bank"]) {
  const bank = bankByCode(b.bankCode);
  if (!bank) throw new AppError("selltro.badBank");
  const digits = b.accountNumber.replace(/[\s-]/g, "");
  if (!validAccountNumber(digits)) throw new AppError("selltro.badAccountNumber");
  return { id: newId("bnk"), workspaceId, bankCode: bank.code, bankName: bank.name, accountNumberCiphertext: encryptSecret(digits), accountLast4: digits.slice(-4), holderName: b.holderName, accountType: b.accountType, status: "PENDING_VERIFICATION" as const, createdBy: userId };
}

/** "Set up your payouts": business identity + bank account, submitted for verification. Owner only. */
export async function submitActivation(db: DB, ctx: { workspaceId: string; userId: string }, raw: unknown) {
  const input = activationSchema.parse(raw);
  const existing = await getSellerAccount(db, ctx.workspaceId);
  if (existing && (existing.status === "ACTIVE" || existing.status === "SUSPENDED")) throw new AppError("selltro.alreadyActive");
  const id = input.idNumber.replace(/-/g, "");
  await db.transaction(async (tx) => {
    const values = {
      status: "PENDING_VERIFICATION" as SellerPayStatus,
      businessType: input.businessType,
      legalName: input.legalName,
      registrationNumber: input.registrationNumber || null,
      idNumberCiphertext: encryptSecret(id),
      idNumberLast4: id.slice(-4),
      contactPhone: input.contactPhone,
      termsAcceptedAt: new Date(),
      submittedAt: new Date(),
      reviewNote: null,
      updatedAt: new Date(),
    };
    if (existing) await tx.update(sellerPaymentAccounts).set(values).where(eq(sellerPaymentAccounts.workspaceId, ctx.workspaceId));
    else await tx.insert(sellerPaymentAccounts).values({ workspaceId: ctx.workspaceId, ...values });
    await tx.update(sellerBankAccounts).set({ supersededAt: new Date() }).where(and(eq(sellerBankAccounts.workspaceId, ctx.workspaceId), isNull(sellerBankAccounts.supersededAt)));
    await tx.insert(sellerBankAccounts).values(bankRow(ctx.workspaceId, ctx.userId, input.bank));
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "selltro.activation_submitted", data: { businessType: input.businessType, bank: input.bank.bankCode } });
  });
  await track(db, "selltro_activation_submitted", { workspaceId: ctx.workspaceId, userId: ctx.userId });
}

/**
 * Changing the payout account: password re-check, new row pending verification, the old one is
 * superseded (kept for history). Payouts pause until the new account is verified.
 */
export async function changeBankAccount(db: DB, ctx: { workspaceId: string; userId: string }, raw: { password: string; bank: unknown }) {
  await confirmIdentity(db, ctx.userId, raw.password);
  const bank = activationSchema.shape.bank.parse(raw.bank);
  const acct = await getSellerAccount(db, ctx.workspaceId);
  if (!acct || acct.status === "NOT_ACTIVATED") throw new AppError("selltro.notActivated");
  const prev = await currentBankAccount(db, ctx.workspaceId);
  await db.transaction(async (tx) => {
    await tx.update(sellerBankAccounts).set({ supersededAt: new Date() }).where(and(eq(sellerBankAccounts.workspaceId, ctx.workspaceId), isNull(sellerBankAccounts.supersededAt)));
    const row = bankRow(ctx.workspaceId, ctx.userId, bank);
    await tx.insert(sellerBankAccounts).values(row);
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "selltro.bank_changed", entity: "bank_account", entityId: row.id, data: { from: prev ? `${prev.bankCode} ••${prev.accountLast4}` : null, to: `${row.bankCode} ••${row.accountLast4}` } });
    await notify(tx, ctx.workspaceId, "selltro.bank_changed", { last4: row.accountLast4, bankName: row.bankName });
  });
}

export async function bankHistory(db: DB, workspaceId: string) {
  return db.query.sellerBankAccounts.findMany({ where: eq(sellerBankAccounts.workspaceId, workspaceId), orderBy: desc(sellerBankAccounts.createdAt) });
}

/** Reviewer decisions (Superadmin). Approval of the account and of the bank are separate checks. */
/** Platform staff never review their own business (conflict of interest). */
async function assertNotMember(db: DB, reviewerId: string, workspaceId: string) {
  const m = await db.query.workspaceMembers.findFirst({ where: and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, reviewerId)) });
  if (m) throw new AppError("admin.makerChecker");
}

export async function reviewSellerAccount(db: DB, reviewerId: string, workspaceId: string, decision: "approve" | "restrict" | "suspend" | "reject", note?: string) {
  const acct = await getSellerAccount(db, workspaceId);
  if (!acct) throw new AppError("errors.notFound");
  await assertNotMember(db, reviewerId, workspaceId);
  const status: SellerPayStatus = decision === "approve" ? "ACTIVE" : decision === "restrict" ? "RESTRICTED" : decision === "suspend" ? "SUSPENDED" : "NOT_ACTIVATED";
  await db.update(sellerPaymentAccounts).set({ status, reviewedBy: reviewerId, reviewedAt: new Date(), reviewNote: note ?? null, updatedAt: new Date() }).where(eq(sellerPaymentAccounts.workspaceId, workspaceId));
  await audit(db, { workspaceId, actorUserId: reviewerId, action: `admin.selltro.${decision}`, data: { from: acct.status, to: status, note: note ?? null } });
  await notify(db, workspaceId, "selltro.status_changed", { status });
}

export async function reviewBankAccount(db: DB, reviewerId: string, bankAccountId: string, decision: "verify" | "reject" | "suspend", note?: string) {
  const b = await db.query.sellerBankAccounts.findFirst({ where: eq(sellerBankAccounts.id, bankAccountId) });
  if (!b) throw new AppError("errors.notFound");
  if (b.createdBy === reviewerId) throw new AppError("admin.makerChecker"); // nobody verifies an account they added
  await assertNotMember(db, reviewerId, b.workspaceId);
  const status = decision === "verify" ? "VERIFIED" : decision === "reject" ? "REJECTED" : "SUSPENDED";
  await db.update(sellerBankAccounts).set({ status, reviewedBy: reviewerId, reviewedAt: new Date(), reviewNote: note ?? null }).where(eq(sellerBankAccounts.id, b.id));
  await audit(db, { workspaceId: b.workspaceId, actorUserId: reviewerId, action: `admin.bank.${decision}`, entity: "bank_account", entityId: b.id, data: { note: note ?? null } });
  await notify(db, b.workspaceId, "selltro.bank_status", { status, last4: b.accountLast4 });
}

// ------------------------------------------------------------------ payment hooks (called inside order transactions)

async function platformFeeBps(tx: Tx | DB, workspaceId: string) {
  const sub = await tx.query.tenantSubscriptions.findFirst({ where: eq(tenantSubscriptions.workspaceId, workspaceId) });
  const ws = sub ? null : await tx.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const plan = await tx.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, sub?.planId ?? ws?.plan ?? "free") });
  return plan?.transactionFeeBps ?? 0;
}

export function feeFor(amountSen: number, fee: { fixedSen: number; bps: number }) {
  return Math.min(amountSen, fee.fixedSen + Math.round((amountSen * fee.bps) / 10_000));
}

export async function recordBill(tx: Tx | DB, order: { id: string; workspaceId: string; totalSen: number }, env: SelltroEnv, billId: string | null) {
  await tx
    .insert(paymentTransactions)
    .values({ id: newId("ptx"), workspaceId: order.workspaceId, orderId: order.id, provider: "selltro_pay", environment: env, billId, amountSen: order.totalSen })
    .onConflictDoUpdate({ target: paymentTransactions.orderId, set: { billId, updatedAt: new Date() } });
}

/**
 * A Selltro Pay order became PAID (verified callback). Fees are fixed now (schedule snapshot) and
 * the ledger records what SellNow owes the seller. Idempotent through the ledger source key.
 */
export async function onSelltroPaid(tx: Tx, order: typeof orders.$inferSelect) {
  const ptx = await tx.query.paymentTransactions.findFirst({ where: eq(paymentTransactions.orderId, order.id) });
  if (!ptx) throw new AppError("selltro.txMissing");
  const cfg = await getConfig(tx);
  const processing = feeFor(order.totalSen, cfg.processingFee);
  const platform = Math.min(order.totalSen - processing, Math.round((order.totalSen * (await platformFeeBps(tx, order.workspaceId))) / 10_000));
  const net = order.totalSen - processing - platform;
  await tx
    .update(paymentTransactions)
    .set({ status: "PAID", providerStatus: "paid", processingFeeSen: processing, platformFeeSen: platform, paidAt: new Date(), updatedAt: new Date() })
    .where(eq(paymentTransactions.id, ptx.id));
  await post(tx, { sourceType: "payment", sourceId: ptx.id, memo: `Order #${order.number}` }, [
    { account: "provider_clearing", amountSen: order.totalSen, workspaceId: null },
    { account: "seller_payable", amountSen: -net, workspaceId: order.workspaceId },
    { account: "platform_fee_revenue", amountSen: -platform, workspaceId: null },
    { account: "processing_fee_payable", amountSen: -processing, workspaceId: null },
  ]);
  await tx.update(orders).set({ settlementStatus: "PENDING" }).where(eq(orders.id, order.id));
}

/** Refund of a Selltro Pay order: reduces what the seller is owed (recovered from future settlements if already paid out). */
export async function onSelltroRefund(tx: Tx, order: typeof orders.$inferSelect, refundId: string, amountSen: number) {
  const ptx = await tx.query.paymentTransactions.findFirst({ where: eq(paymentTransactions.orderId, order.id) });
  if (!ptx) return;
  const refunded = ptx.refundedSen + amountSen;
  await tx
    .update(paymentTransactions)
    .set({ refundedSen: refunded, status: refunded >= ptx.amountSen ? "REFUNDED" : "PARTIALLY_REFUNDED", updatedAt: new Date() })
    .where(eq(paymentTransactions.id, ptx.id));
  // Source id carries the payment id so the settlement engine can tell which environment it belongs to.
  await post(tx, { sourceType: "refund", sourceId: `${ptx.id}#${refundId}`, memo: `Refund order #${order.number}` }, [
    { account: "seller_payable", amountSen: amountSen, workspaceId: order.workspaceId },
    { account: "provider_clearing", amountSen: -amountSen, workspaceId: null },
  ]);
}

/** Comparison with Billplz's record of the bill (read-only). In test mode the simulated record is trusted. */
export async function reconcilePayment(db: DB, paymentTxId: string, fetchBill?: (billId: string) => Promise<{ paid: boolean; amountSen: number; state: string }>) {
  const p = await db.query.paymentTransactions.findFirst({ where: eq(paymentTransactions.id, paymentTxId) });
  if (!p) throw new AppError("errors.notFound");
  let status: "matched" | "mismatch";
  let note: string;
  if (p.environment === "test") {
    status = p.status === "PAID" || p.status === "PARTIALLY_REFUNDED" || p.status === "REFUNDED" ? "matched" : "mismatch";
    note = "simulated (test mode)";
  } else {
    if (!p.billId) throw new AppError("selltro.noBill");
    const bill = await (fetchBill ?? ((id) => getBill(id, p.environment === "live")))(p.billId);
    const localPaid = p.status !== "PENDING" && p.status !== "FAILED" && p.status !== "CANCELLED";
    status = bill.paid === localPaid && (!bill.paid || bill.amountSen === p.amountSen) ? "matched" : "mismatch";
    note = `provider paid=${bill.paid} amount=${bill.amountSen} state=${bill.state}`;
  }
  await db.update(paymentTransactions).set({ reconcileStatus: status, reconciledAt: new Date(), reconcileNote: note, updatedAt: new Date() }).where(eq(paymentTransactions.id, p.id));
  return { status, note };
}

/** Billplz v3 "Get a Bill" (read-only). */
export async function getBill(billId: string, live: boolean): Promise<{ paid: boolean; amountSen: number; state: string }> {
  const s = platformBillplzSecrets();
  const res = await fetch(`${live ? "https://www.billplz.com" : "https://www.billplz-sandbox.com"}/api/v3/bills/${encodeURIComponent(billId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${s.apiKey}:`).toString("base64")}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new AppError("selltro.providerError", { status: res.status });
  const b = (await res.json()) as { paid?: boolean; paid_amount?: number; amount?: number; state?: string };
  return { paid: Boolean(b.paid), amountSen: Number(b.paid_amount ?? b.amount ?? 0), state: String(b.state ?? "") };
}
