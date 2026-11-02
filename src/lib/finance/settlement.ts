import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import type { DB, Tx } from "@/lib/db";
import {
  disbursementAttempts,
  fundingSnapshots,
  ledgerEntries,
  orders,
  paymentAdjustments,
  paymentTransactions,
  sellerBankAccounts,
  sellerPaymentAccounts,
  settlementBatches,
  settlementHolds,
  settlementItems,
  settlements,
  workspaces,
  type SettlementStatus,
} from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit, notify } from "@/lib/audit";
import { confirmIdentity } from "@/lib/auth/stepup";
import { raiseAlert } from "@/lib/admin/alerts";
import { getConfig } from "./settings";
import { post, unallocatedSellerPostings } from "./ledger";
import { selltroEnvironment, type SelltroEnv } from "./selltro-pay";
import { PayoutError, createPaymentOrder, getPaymentOrderLimit, mapPoStatus, payoutConfigured } from "./payment-orders";

const TZ = "Asia/Kuala_Lumpur";

/** YYYY-MM-DD of an instant in Malaysia time. */
export function mytDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function mytTime(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * T+1 CALENDAR day: a payment on day T (MYT) belongs to the cycle on T+1 — every day of the
 * week, public holidays included. Payments at or after the cutoff time roll to T+2.
 */
export function settlementDateFor(paidAt: Date, cutoffTime: string) {
  const day = mytDate(paidAt);
  return addDays(day, mytTime(paidAt) >= cutoffTime ? 2 : 1);
}

const ACTIVE_FOR_PAYOUT: SettlementStatus[] = ["AWAITING_APPROVAL", "AWAITING_FUNDING", "QUEUED", "PROCESSING", "UNKNOWN", "ON_HOLD"];
type Candidate = typeof ledgerEntries.$inferSelect;

/** Why a seller can't be paid right now (null = payable). */
async function holdReason(db: Tx, workspaceId: string) {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (ws?.suspendedAt) return "tenant_suspended";
  const acct = await db.query.sellerPaymentAccounts.findFirst({ where: eq(sellerPaymentAccounts.workspaceId, workspaceId) });
  if (acct?.status !== "ACTIVE") return "account_not_active";
  const bank = await db.query.sellerBankAccounts.findFirst({ where: and(eq(sellerBankAccounts.workspaceId, workspaceId), isNull(sellerBankAccounts.supersededAt)) });
  if (bank?.status !== "VERIFIED") return "bank_not_verified";
  const hold = await db.query.settlementHolds.findFirst({ where: and(eq(settlementHolds.workspaceId, workspaceId), isNull(settlementHolds.releasedAt)) });
  if (hold) return `hold:${hold.reason}`;
  return null;
}

/**
 * The daily settlement CALCULATION (no money moves here). Idempotent per (date, environment):
 * a second run returns the existing batch. A transaction-scoped advisory lock serialises
 * concurrent workers, and settlement_items' unique source key makes double allocation impossible.
 */
export async function runSettlementCycle(db: DB, opts: { now?: Date; environment?: SelltroEnv } = {}) {
  const env = opts.environment ?? selltroEnvironment();
  if (!env) throw new AppError("selltro.unavailable");
  const now = opts.now ?? new Date();
  const date = mytDate(now);
  const cfg = await getConfig(db);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`settlement:${env}`}))`);
    const existing = await tx.query.settlementBatches.findFirst({ where: and(eq(settlementBatches.settlementDate, date), eq(settlementBatches.environment, env)) });
    if (existing) return { batch: existing, created: false };

    const postings = await unallocatedSellerPostings(tx);
    const payIds = postings.filter((p) => p.sourceType === "payment").map((p) => p.sourceId);
    const refundIds = postings.filter((p) => p.sourceType === "refund").map((p) => p.sourceId.split("#")[0]!);
    const ptxs = payIds.length || refundIds.length ? await tx.query.paymentTransactions.findMany({ where: inArray(paymentTransactions.id, [...payIds, ...refundIds]) }) : [];
    const ptxById = new Map(ptxs.map((p) => [p.id, p]));

    const eligible: Candidate[] = [];
    for (const p of postings) {
      if (p.sourceType === "payment") {
        const t = ptxById.get(p.sourceId);
        if (!t || t.environment !== env || !t.paidAt) continue;
        if (settlementDateFor(t.paidAt, cfg.settlement.cutoffTime) > date) continue; // not due yet
        // Only money Billplz has confirmed, unless an approved advance arrangement is switched on.
        if (env !== "test" && t.reconcileStatus !== "matched" && !cfg.settlement.advanceSettlement) continue;
        eligible.push(p);
      } else if (p.sourceType === "refund") {
        const t = ptxById.get(p.sourceId.split("#")[0]!);
        if (t && t.environment === env) eligible.push(p);
      } else eligible.push(p); // approved adjustments / payout reversals are due immediately
    }

    const byWs = new Map<string, Candidate[]>();
    for (const p of eligible) byWs.set(p.workspaceId!, [...(byWs.get(p.workspaceId!) ?? []), p]);

    const batchId = newId("stb");
    await tx.insert(settlementBatches).values({ id: batchId, settlementDate: date, environment: env, periodStart: new Date(`${addDays(date, -1)}T00:00:00+08:00`), periodEnd: new Date(`${date}T00:00:00+08:00`), status: "CALCULATED" });
    const totals = { tenants: 0, items: 0, gross: 0, fees: 0, adj: 0, net: 0 };
    let needsApproval = false;

    for (const [workspaceId, items] of byWs) {
      const net = -items.reduce((a, p) => a + p.amountSen, 0);
      // A zero/negative balance (e.g. refunds after payout) is carried forward, never paid out.
      if (net <= 0) continue;
      let gross = 0, proc = 0, plat = 0, refunds = 0, adj = 0;
      const rows = items.map((p) => {
        let g = 0, pf = 0, pl = 0;
        if (p.sourceType === "payment") {
          const t = ptxById.get(p.sourceId)!;
          g = t.amountSen;
          pf = t.processingFeeSen;
          pl = t.platformFeeSen;
          gross += g; proc += pf; plat += pl;
        } else if (p.sourceType === "refund") refunds += p.amountSen;
        else adj += -p.amountSen;
        return { id: newId("sti"), workspaceId, sourceType: p.sourceType as "payment", sourceId: p.sourceId, grossSen: g, processingFeeSen: pf, platformFeeSen: pl, netSen: -p.amountSen };
      });
      const reason = await holdReason(tx, workspaceId);
      const bank = await tx.query.sellerBankAccounts.findFirst({ where: and(eq(sellerBankAccounts.workspaceId, workspaceId), isNull(sellerBankAccounts.supersededAt)) });
      const status: SettlementStatus = reason ? "ON_HOLD" : cfg.settlement.requireApproval ? "AWAITING_APPROVAL" : "QUEUED";
      if (status === "AWAITING_APPROVAL") needsApproval = true;
      const sid = newId("stl");
      await tx.insert(settlements).values({
        id: sid,
        batchId,
        workspaceId,
        reference: `SN${date.replace(/-/g, "")}${sid.slice(-10).toUpperCase()}`,
        status,
        holdReason: reason,
        grossSen: gross,
        processingFeeSen: proc,
        platformFeeSen: plat,
        refundsSen: refunds,
        adjustmentsSen: adj,
        netSen: net,
        bankAccountId: bank?.id ?? null,
        bankSnapshot: bank ? { bankCode: bank.bankCode, bankName: bank.bankName, last4: bank.accountLast4, holderName: bank.holderName } : null,
        scheduledFor: date,
      });
      await tx.insert(settlementItems).values(rows.map((r) => ({ ...r, settlementId: sid })));
      const orderIds = items.filter((p) => p.sourceType === "payment").map((p) => ptxById.get(p.sourceId)!.orderId);
      if (orderIds.length) await tx.update(orders).set({ settlementStatus: reason ? "ON_HOLD" : "SCHEDULED" }).where(inArray(orders.id, orderIds));
      totals.tenants++; totals.items += rows.length; totals.gross += gross; totals.fees += proc + plat; totals.adj += adj - refunds; totals.net += net;
    }

    const status = totals.tenants === 0 ? "COMPLETED" : needsApproval ? "AWAITING_APPROVAL" : "QUEUED";
    const [batch] = await tx
      .update(settlementBatches)
      .set({ status, tenantCount: totals.tenants, itemCount: totals.items, grossSen: totals.gross, feesSen: totals.fees, adjustmentsSen: totals.adj, netSen: totals.net, updatedAt: new Date() })
      .where(eq(settlementBatches.id, batchId))
      .returning();
    await audit(tx, { workspaceId: null, action: "settlement.batch_calculated", entity: "settlement_batch", entityId: batchId, data: { date, env, ...totals } });
    return { batch: batch!, created: true };
  });
}

/**
 * Approval (finance). Batches at/above the dual-approval threshold need two different approvers.
 * Password re-check every time. Approval queues settlements; it does not send money.
 */
export async function approveBatch(db: DB, adminId: string, batchId: string, password: string) {
  await confirmIdentity(db, adminId, password);
  const cfg = await getConfig(db);
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(settlementBatches).where(eq(settlementBatches.id, batchId)).for("update");
    if (!b) throw new AppError("errors.notFound");
    if (b.status !== "AWAITING_APPROVAL") throw new AppError("settlement.notAwaitingApproval");
    const dual = b.netSen >= cfg.settlement.dualApprovalThresholdSen;
    if (!b.approvedBy) {
      await tx.update(settlementBatches).set({ approvedBy: adminId, approvedAt: new Date(), updatedAt: new Date() }).where(eq(settlementBatches.id, b.id));
      await audit(tx, { workspaceId: null, actorUserId: adminId, action: "admin.settlement.approved", entity: "settlement_batch", entityId: b.id, data: { stage: dual ? "first_of_two" : "final", netSen: b.netSen } });
      if (dual) return { approved: false, needsSecond: true };
    } else {
      if (!dual) throw new AppError("settlement.alreadyApproved");
      if (b.approvedBy === adminId) throw new AppError("admin.makerChecker");
      await tx.update(settlementBatches).set({ secondApprovedBy: adminId, secondApprovedAt: new Date(), updatedAt: new Date() }).where(eq(settlementBatches.id, b.id));
      await audit(tx, { workspaceId: null, actorUserId: adminId, action: "admin.settlement.approved", entity: "settlement_batch", entityId: b.id, data: { stage: "second", netSen: b.netSen } });
    }
    await tx.update(settlements).set({ status: "QUEUED", updatedAt: new Date() }).where(and(eq(settlements.batchId, b.id), eq(settlements.status, "AWAITING_APPROVAL")));
    await tx.update(settlementBatches).set({ status: "QUEUED", updatedAt: new Date() }).where(eq(settlementBatches.id, b.id));
    return { approved: true, needsSecond: false };
  });
}

/** Reads the payout funding available (never moves money). Test mode reports simulated unlimited funding. */
export async function checkFunding(db: DB, env: SelltroEnv) {
  if (env === "test") return { availableSen: Number.MAX_SAFE_INTEGER, simulated: true as const, ok: true };
  if (!payoutConfigured()) return { availableSen: 0, simulated: false as const, ok: false, error: "payout_not_configured" };
  try {
    const sen = await getPaymentOrderLimit(env === "live");
    await db.insert(fundingSnapshots).values({ id: newId("fnd"), source: "billplz_payment_order_limit", amountSen: sen, ok: true });
    return { availableSen: sen, simulated: false as const, ok: true };
  } catch (e) {
    await db.insert(fundingSnapshots).values({ id: newId("fnd"), source: "billplz_payment_order_limit", amountSen: null, ok: false, error: String(e).slice(0, 300) });
    return { availableSen: 0, simulated: false as const, ok: false, error: "limit_unavailable" };
  }
}

async function completeSettlement(tx: Tx, s: typeof settlements.$inferSelect, attemptId: string, providerStatus: string) {
  const posted = await post(tx, { sourceType: "payout", sourceId: s.id, memo: `Settlement ${s.reference}` }, [
    { account: "seller_payable", amountSen: s.netSen, workspaceId: s.workspaceId },
    { account: "payout_funding", amountSen: -s.netSen, workspaceId: null },
  ]);
  await tx.update(disbursementAttempts).set({ status: "completed", providerStatus, updatedAt: new Date() }).where(eq(disbursementAttempts.id, attemptId));
  await tx.update(settlements).set({ status: "COMPLETED", completedAt: new Date(), providerStatus, updatedAt: new Date() }).where(eq(settlements.id, s.id));
  const items = await tx.query.settlementItems.findMany({ where: and(eq(settlementItems.settlementId, s.id), eq(settlementItems.sourceType, "payment")) });
  if (items.length) {
    const ptxs = await tx.query.paymentTransactions.findMany({ where: inArray(paymentTransactions.id, items.map((i) => i.sourceId)) });
    await tx.update(orders).set({ settlementStatus: "SETTLED" }).where(inArray(orders.id, ptxs.map((p) => p.orderId)));
  }
  if (posted) await notify(tx, s.workspaceId, "settlement.completed", { reference: s.reference, netSen: s.netSen });
}

async function setOrders(tx: Tx, settlementId: string, status: "PROCESSING" | "FAILED" | "ON_HOLD" | "SCHEDULED") {
  const items = await tx.query.settlementItems.findMany({ where: and(eq(settlementItems.settlementId, settlementId), eq(settlementItems.sourceType, "payment")) });
  if (!items.length) return;
  const ptxs = await tx.query.paymentTransactions.findMany({ where: inArray(paymentTransactions.id, items.map((i) => i.sourceId)) });
  await tx.update(orders).set({ settlementStatus: status }).where(inArray(orders.id, ptxs.map((p) => p.orderId)));
}

/**
 * Sends ONE settlement through the payout rail. Safety:
 *  - payouts kill switch + environment rules (simulated only in test mode);
 *  - bank re-checked (a change after calculation puts the settlement on hold);
 *  - an attempt row is committed BEFORE calling the provider; a previous attempt that is
 *    submitting/processing/unknown/completed blocks any new attempt (no blind retries);
 *  - provider-side idempotency through `reference_id`.
 */
export async function disburseSettlement(db: DB, settlementId: string, actorId: string | null) {
  const cfg = await getConfig(db);
  const env = selltroEnvironment();
  const s0 = await db.query.settlements.findFirst({ where: eq(settlements.id, settlementId) });
  if (!s0) throw new AppError("errors.notFound");
  const batch = await db.query.settlementBatches.findFirst({ where: eq(settlementBatches.id, s0.batchId) });
  if (!batch || batch.environment !== env) throw new AppError("settlement.wrongEnvironment");
  if (env !== "test" && !cfg.payoutsEnabled) throw new AppError("settlement.payoutsDisabled");
  if (env === "live" && !cfg.selltroPayLiveApproved) throw new AppError("selltro.liveNotApproved");

  const claim = await db.transaction(async (tx) => {
    const [s] = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).for("update");
    if (!s || s.status !== "QUEUED") throw new AppError("settlement.notQueued");
    if (s.netSen <= 0) throw new AppError("settlement.invalidAmount");
    const prev = await tx.query.disbursementAttempts.findMany({ where: eq(disbursementAttempts.settlementId, s.id), orderBy: desc(disbursementAttempts.attemptNo) });
    if (prev[0] && prev[0].status !== "failed") throw new AppError("settlement.attemptOutstanding");
    const reason = await holdReason(tx, s.workspaceId);
    const bank = await tx.query.sellerBankAccounts.findFirst({ where: and(eq(sellerBankAccounts.workspaceId, s.workspaceId), isNull(sellerBankAccounts.supersededAt)) });
    if (reason || !bank || bank.id !== s.bankAccountId) {
      await tx.update(settlements).set({ status: "ON_HOLD", holdReason: reason ?? "bank_changed", updatedAt: new Date() }).where(eq(settlements.id, s.id));
      await setOrders(tx, s.id, "ON_HOLD");
      return null;
    }
    const attemptNo = (prev[0]?.attemptNo ?? 0) + 1;
    const attemptId = newId("dsb");
    await tx.insert(disbursementAttempts).values({ id: attemptId, settlementId: s.id, attemptNo, provider: env === "test" ? "simulated" : "billplz_payment_order", status: "submitting", initiatedBy: actorId });
    await tx.update(settlements).set({ status: "PROCESSING", updatedAt: new Date() }).where(eq(settlements.id, s.id));
    await setOrders(tx, s.id, "PROCESSING");
    return { s, bank, attemptId, attemptNo };
  });
  if (!claim) return { status: "ON_HOLD" as const };
  const { s, bank, attemptId, attemptNo } = claim;

  if (env === "test") {
    // Test mode: SIMULATED payout (no money). Clearly labelled in the attempt and the UI.
    await db.transaction((tx) => completeSettlement(tx, s, attemptId, "simulated_completed"));
    return { status: "COMPLETED" as const, simulated: true };
  }
  try {
    const po = await createPaymentOrder({ live: env === "live", bankCode: bank.bankCode, accountNumber: decryptSecret(bank.accountNumberCiphertext), name: bank.holderName, description: `SellNow settlement ${s.reference}`, totalSen: s.netSen, referenceId: `${s.reference}-${attemptNo}` });
    const st = mapPoStatus(po.status);
    await db.transaction(async (tx) => {
      await tx.update(disbursementAttempts).set({ providerId: po.id, providerStatus: po.status, response: po as unknown as Record<string, unknown>, status: st === "completed" ? "submitting" : st === "refunded" ? "failed" : "processing", updatedAt: new Date() }).where(eq(disbursementAttempts.id, attemptId));
      await tx.update(settlements).set({ providerRef: po.id, providerStatus: po.status, updatedAt: new Date() }).where(eq(settlements.id, s.id));
      if (st === "completed") await completeSettlement(tx, s, attemptId, po.status);
    });
    return { status: st === "completed" ? ("COMPLETED" as const) : ("PROCESSING" as const) };
  } catch (e) {
    const kind = e instanceof PayoutError ? e.kind : "unknown";
    await db.transaction(async (tx) => {
      if (kind === "unknown") {
        // We don't know if money left. Freeze until a person reconciles with Billplz.
        await tx.update(disbursementAttempts).set({ status: "unknown", error: String(e).slice(0, 500), updatedAt: new Date() }).where(eq(disbursementAttempts.id, attemptId));
        await tx.update(settlements).set({ status: "UNKNOWN", lastError: "provider_state_unknown", updatedAt: new Date() }).where(eq(settlements.id, s.id));
      } else {
        await tx.update(disbursementAttempts).set({ status: "failed", error: String(e).slice(0, 500), updatedAt: new Date() }).where(eq(disbursementAttempts.id, attemptId));
        await tx.update(settlements).set({ status: kind === "insufficient_limit" ? "AWAITING_FUNDING" : "FAILED", lastError: kind, updatedAt: new Date() }).where(eq(settlements.id, s.id));
        await setOrders(tx, s.id, "FAILED");
      }
    });
    await raiseAlert(db, { kind: kind === "unknown" ? "settlement.unknown" : kind === "insufficient_limit" ? "settlement.funding" : "settlement.failed", severity: "critical", message: kind === "unknown" ? `Payout ${s.reference} status unknown — reconcile with Billplz before any retry.` : kind === "insufficient_limit" ? `Payment Order Limit too low for ${s.reference}.` : `Payout ${s.reference} rejected by Billplz.`, dedupeKey: `settlement:${s.id}`, link: `/admin/settlements?batch=${s.batchId}`, workspaceId: s.workspaceId });
    return { status: kind === "unknown" ? ("UNKNOWN" as const) : ("FAILED" as const) };
  }
}

/** Executes a queued batch after a funding check. Shortfall → AWAITING_FUNDING + alert, nothing sent. */
export async function executeBatch(db: DB, adminId: string | null, batchId: string) {
  const b = await db.query.settlementBatches.findFirst({ where: eq(settlementBatches.id, batchId) });
  if (!b) throw new AppError("errors.notFound");
  if (b.status !== "QUEUED" && b.status !== "AWAITING_FUNDING" && b.status !== "PARTIALLY_COMPLETED" && b.status !== "PROCESSING") throw new AppError("settlement.notQueued");
  const queued = await db.query.settlements.findMany({ where: and(eq(settlements.batchId, b.id), inArray(settlements.status, ["QUEUED", "AWAITING_FUNDING"])) });
  const need = queued.reduce((a, s) => a + s.netSen, 0);
  const funding = await checkFunding(db, b.environment);
  if (!funding.ok || funding.availableSen < need) {
    await db.update(settlements).set({ status: "AWAITING_FUNDING", updatedAt: new Date() }).where(and(eq(settlements.batchId, b.id), eq(settlements.status, "QUEUED")));
    await db.update(settlementBatches).set({ status: "AWAITING_FUNDING", updatedAt: new Date() }).where(eq(settlementBatches.id, b.id));
    await raiseAlert(db, { kind: "settlement.funding", severity: "critical", message: `Settlement ${b.settlementDate} needs ${need} sen; available ${funding.availableSen} sen.`, dedupeKey: `funding:${b.id}`, link: `/admin/settlements?batch=${b.id}`, data: { needSen: need, availableSen: funding.availableSen } });
    return { executed: 0, shortfallSen: need - funding.availableSen };
  }
  await db.update(settlements).set({ status: "QUEUED", updatedAt: new Date() }).where(and(eq(settlements.batchId, b.id), eq(settlements.status, "AWAITING_FUNDING")));
  await db.update(settlementBatches).set({ status: "PROCESSING", updatedAt: new Date() }).where(eq(settlementBatches.id, b.id));
  let executed = 0;
  for (const s of queued) {
    await disburseSettlement(db, s.id, adminId).catch((e) => raiseAlert(db, { kind: "settlement.failed", severity: "warning", message: `Settlement ${s.reference}: ${e instanceof AppError ? e.code : String(e)}`, dedupeKey: `settlement:err:${s.id}`, link: `/admin/settlements?batch=${b.id}` }));
    executed++;
  }
  await refreshBatchStatus(db, b.id);
  if (adminId) await audit(db, { workspaceId: null, actorUserId: adminId, action: "admin.settlement.executed", entity: "settlement_batch", entityId: b.id, data: { count: executed, needSen: need } });
  return { executed, shortfallSen: 0 };
}

export async function refreshBatchStatus(db: DB | Tx, batchId: string) {
  const all = await db.query.settlements.findMany({ where: eq(settlements.batchId, batchId) });
  const st = new Set(all.map((s) => s.status));
  const status = !all.length || [...st].every((x) => x === "COMPLETED" || x === "REVERSED") ? "COMPLETED" : st.has("PROCESSING") || st.has("UNKNOWN") ? "PROCESSING" : st.has("COMPLETED") ? "PARTIALLY_COMPLETED" : st.has("AWAITING_FUNDING") ? "AWAITING_FUNDING" : st.has("AWAITING_APPROVAL") ? "AWAITING_APPROVAL" : st.has("QUEUED") ? "QUEUED" : "FAILED";
  await db.update(settlementBatches).set({ status, updatedAt: new Date() }).where(eq(settlementBatches.id, batchId));
}

/** Verified payout callback (or a status refresh): apply the provider's state exactly once. */
export async function applyPayoutStatus(db: DB, providerId: string, providerStatus: string) {
  const a = await db.query.disbursementAttempts.findFirst({ where: eq(disbursementAttempts.providerId, providerId) });
  if (!a) return "unmatched";
  const st = mapPoStatus(providerStatus);
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(settlements).where(eq(settlements.id, a.settlementId)).for("update");
    if (!s) return;
    if (st === "completed" && s.status !== "COMPLETED" && s.status !== "REVERSED") await completeSettlement(tx, s, a.id, providerStatus);
    else if (st === "refunded") {
      // Money came back after a completed payout → reverse and owe the seller again.
      if (s.status === "COMPLETED")
        await post(tx, { sourceType: "reversal", sourceId: s.id, memo: `Payout reversed ${s.reference}` }, [
          { account: "seller_payable", amountSen: -s.netSen, workspaceId: s.workspaceId },
          { account: "payout_funding", amountSen: s.netSen, workspaceId: null },
        ]);
      await tx.update(disbursementAttempts).set({ status: "refunded", providerStatus, updatedAt: new Date() }).where(eq(disbursementAttempts.id, a.id));
      await tx.update(settlements).set({ status: s.status === "COMPLETED" ? "REVERSED" : "FAILED", providerStatus, updatedAt: new Date() }).where(eq(settlements.id, s.id));
      await setOrders(tx, s.id, "FAILED");
    } else if (st === "failed") {
      await tx.update(disbursementAttempts).set({ status: "failed", providerStatus, updatedAt: new Date() }).where(eq(disbursementAttempts.id, a.id));
      if (s.status !== "COMPLETED") await tx.update(settlements).set({ status: "FAILED", providerStatus, updatedAt: new Date() }).where(eq(settlements.id, s.id));
    } else await tx.update(disbursementAttempts).set({ providerStatus, updatedAt: new Date() }).where(eq(disbursementAttempts.id, a.id));
    await refreshBatchStatus(tx, s.batchId);
  });
  return st;
}

/**
 * Resolves an UNKNOWN payout after a person has checked Billplz (dashboard / Payment Order lookup).
 * "failed" re-queues it (a fresh attempt is then allowed); "completed" books it as paid.
 */
export async function reconcileUnknownPayout(db: DB, adminId: string, settlementId: string, outcome: "completed" | "failed", note: string, password: string) {
  await confirmIdentity(db, adminId, password);
  if (note.trim().length < 5) throw new AppError("settlement.noteRequired");
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).for("update");
    if (!s || s.status !== "UNKNOWN") throw new AppError("settlement.notUnknown");
    const [a] = await tx.select().from(disbursementAttempts).where(eq(disbursementAttempts.settlementId, s.id)).orderBy(desc(disbursementAttempts.attemptNo)).limit(1);
    if (outcome === "completed") await completeSettlement(tx, s, a!.id, "reconciled_completed");
    else {
      await tx.update(disbursementAttempts).set({ status: "failed", error: `reconciled: ${note}`, updatedAt: new Date() }).where(eq(disbursementAttempts.id, a!.id));
      await tx.update(settlements).set({ status: "QUEUED", lastError: null, updatedAt: new Date() }).where(eq(settlements.id, s.id));
    }
    await audit(tx, { workspaceId: s.workspaceId, actorUserId: adminId, action: "admin.settlement.reconciled", entity: "settlement", entityId: s.id, data: { outcome, note } });
    await refreshBatchStatus(tx, s.batchId);
  });
}

/** Retry after a CONFIRMED failure only (FAILED, not UNKNOWN). */
export async function retryFailedSettlement(db: DB, adminId: string, settlementId: string) {
  const s = await db.query.settlements.findFirst({ where: eq(settlements.id, settlementId) });
  if (!s || s.status !== "FAILED") throw new AppError("settlement.notRetryable");
  await db.update(settlements).set({ status: "QUEUED", lastError: null, updatedAt: new Date() }).where(eq(settlements.id, s.id));
  await audit(db, { workspaceId: s.workspaceId, actorUserId: adminId, action: "admin.settlement.retry", entity: "settlement", entityId: s.id });
  return disburseSettlement(db, s.id, adminId);
}

export async function holdSettlement(db: DB, adminId: string, settlementId: string, reason: string) {
  const s = await db.query.settlements.findFirst({ where: eq(settlements.id, settlementId) });
  if (!s || !["AWAITING_APPROVAL", "AWAITING_FUNDING", "QUEUED"].includes(s.status)) throw new AppError("settlement.notHoldable");
  await db.transaction(async (tx) => {
    await tx.update(settlements).set({ status: "ON_HOLD", holdReason: `admin:${reason}`, updatedAt: new Date() }).where(eq(settlements.id, s.id));
    await setOrders(tx, s.id, "ON_HOLD");
    await audit(tx, { workspaceId: s.workspaceId, actorUserId: adminId, action: "admin.settlement.hold", entity: "settlement", entityId: s.id, data: { reason } });
    await refreshBatchStatus(tx, s.batchId);
  });
}

/** Releasing a hold re-checks eligibility; still-ineligible settlements stay on hold with the new reason. */
export async function releaseSettlementHold(db: DB, adminId: string, settlementId: string, password: string) {
  await confirmIdentity(db, adminId, password);
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).for("update");
    if (!s || s.status !== "ON_HOLD") throw new AppError("settlement.notOnHold");
    const reason = await holdReason(tx, s.workspaceId);
    const bank = await tx.query.sellerBankAccounts.findFirst({ where: and(eq(sellerBankAccounts.workspaceId, s.workspaceId), isNull(sellerBankAccounts.supersededAt)) });
    if (reason) {
      await tx.update(settlements).set({ holdReason: reason, updatedAt: new Date() }).where(eq(settlements.id, s.id));
      throw new AppError("settlement.stillIneligible", { reason });
    }
    const batch = await tx.query.settlementBatches.findFirst({ where: eq(settlementBatches.id, s.batchId) });
    const approved = Boolean(batch?.approvedBy) || !(await getConfig(tx)).settlement.requireApproval;
    await tx
      .update(settlements)
      .set({ status: approved ? "QUEUED" : "AWAITING_APPROVAL", holdReason: null, bankAccountId: bank!.id, bankSnapshot: { bankCode: bank!.bankCode, bankName: bank!.bankName, last4: bank!.accountLast4, holderName: bank!.holderName }, updatedAt: new Date() })
      .where(eq(settlements.id, s.id));
    await setOrders(tx, s.id, "SCHEDULED");
    await audit(tx, { workspaceId: s.workspaceId, actorUserId: adminId, action: "admin.settlement.release", entity: "settlement", entityId: s.id });
    await refreshBatchStatus(tx, s.batchId);
  });
}

// ------------------------------------------------------------------ seller holds & adjustments

export async function placeSellerHold(db: DB, adminId: string, workspaceId: string, reason: string) {
  await db.insert(settlementHolds).values({ id: newId("shd"), workspaceId, reason: reason.slice(0, 200), createdBy: adminId });
  await audit(db, { workspaceId, actorUserId: adminId, action: "admin.seller_hold.placed", data: { reason } });
}
export async function releaseSellerHold(db: DB, adminId: string, holdId: string, password: string) {
  await confirmIdentity(db, adminId, password);
  const h = await db.query.settlementHolds.findFirst({ where: eq(settlementHolds.id, holdId) });
  if (!h || h.releasedAt) throw new AppError("errors.notFound");
  await db.update(settlementHolds).set({ releasedAt: new Date(), releasedBy: adminId }).where(eq(settlementHolds.id, h.id));
  await audit(db, { workspaceId: h.workspaceId, actorUserId: adminId, action: "admin.seller_hold.released", entity: "settlement_hold", entityId: h.id });
}

export async function createAdjustment(db: DB, adminId: string, workspaceId: string, amountSen: number, reason: string) {
  if (!Number.isInteger(amountSen) || amountSen === 0 || Math.abs(amountSen) > 10_000_000) throw new AppError("settlement.invalidAmount");
  if (reason.trim().length < 5) throw new AppError("settlement.noteRequired");
  const id = newId("adj");
  await db.insert(paymentAdjustments).values({ id, workspaceId, amountSen, reason: reason.trim(), createdBy: adminId });
  await audit(db, { workspaceId, actorUserId: adminId, action: "admin.adjustment.created", entity: "adjustment", entityId: id, data: { amountSen, reason } });
  return id;
}

/** Maker ≠ checker. Approval posts the ledger entry; it is then picked up by the next settlement cycle. */
export async function decideAdjustment(db: DB, adminId: string, id: string, approve: boolean, password: string) {
  await confirmIdentity(db, adminId, password);
  await db.transaction(async (tx) => {
    const [a] = await tx.select().from(paymentAdjustments).where(eq(paymentAdjustments.id, id)).for("update");
    if (!a || a.status !== "pending_approval") throw new AppError("errors.notFound");
    if (a.createdBy === adminId) throw new AppError("admin.makerChecker");
    await tx.update(paymentAdjustments).set({ status: approve ? "approved" : "rejected", approvedBy: adminId, approvedAt: new Date() }).where(eq(paymentAdjustments.id, a.id));
    if (approve)
      await post(tx, { sourceType: "adjustment", sourceId: a.id, memo: a.reason }, [
        { account: "seller_payable", amountSen: -a.amountSen, workspaceId: a.workspaceId },
        { account: "platform_adjustments", amountSen: a.amountSen, workspaceId: null },
      ]);
    await audit(tx, { workspaceId: a.workspaceId, actorUserId: adminId, action: `admin.adjustment.${approve ? "approved" : "rejected"}`, entity: "adjustment", entityId: a.id, data: { amountSen: a.amountSen } });
  });
}

// ------------------------------------------------------------------ seller view

/** Seller earnings dashboard. Everything derives from the ledger + settlements (nothing estimated). */
export async function sellerEarnings(db: DB, workspaceId: string) {
  const cfg = await getConfig(db);
  const env = selltroEnvironment();
  const today = mytDate(new Date());
  const [paid] = await db
    .select({ s: sql<number>`coalesce(sum(${paymentTransactions.amountSen}),0)::int`, n: sql<number>`count(*)::int` })
    .from(paymentTransactions)
    .where(and(eq(paymentTransactions.workspaceId, workspaceId), inArray(paymentTransactions.status, ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"])));
  const open = await unallocatedSellerPostings(db, [workspaceId]);
  const ptxs = open.length ? await db.query.paymentTransactions.findMany({ where: inArray(paymentTransactions.id, open.filter((p) => p.sourceType === "payment").map((p) => p.sourceId).concat("__")) }) : [];
  let pending = 0, available = 0;
  let next: string | null = null;
  for (const p of open) {
    const t = p.sourceType === "payment" ? ptxs.find((x) => x.id === p.sourceId) : null;
    const due = t?.paidAt ? settlementDateFor(t.paidAt, cfg.settlement.cutoffTime) : today;
    const reconciled = !t || t.environment === "test" || t.reconcileStatus === "matched" || cfg.settlement.advanceSettlement;
    if (due <= today && reconciled) available -= p.amountSen;
    else pending -= p.amountSen;
    const d = due <= today ? addDays(today, 1) : due;
    if (!next || d < next) next = d;
  }
  const list = await db.query.settlements.findMany({ where: eq(settlements.workspaceId, workspaceId), orderBy: desc(settlements.createdAt), limit: 60 });
  const sum = (st: SettlementStatus[]) => list.filter((s) => st.includes(s.status)).reduce((a, s) => a + s.netSen, 0);
  const holds = await db.query.settlementHolds.findMany({ where: and(eq(settlementHolds.workspaceId, workspaceId), isNull(settlementHolds.releasedAt)) });
  return {
    environment: env,
    totalPaidSen: Number(paid?.s ?? 0),
    paidCount: Number(paid?.n ?? 0),
    pendingSen: pending,
    availableSen: available,
    onHoldSen: sum(["ON_HOLD"]),
    inProgressSen: sum(ACTIVE_FOR_PAYOUT.filter((x) => x !== "ON_HOLD")),
    nextSettlementDate: next,
    lastCompleted: list.find((s) => s.status === "COMPLETED") ?? null,
    settlements: list,
    holds: holds.length,
  };
}

export async function settlementStatementCsv(db: DB, workspaceId: string, settlementId: string) {
  const s = await db.query.settlements.findFirst({ where: and(eq(settlements.id, settlementId), eq(settlements.workspaceId, workspaceId)) });
  if (!s) throw new AppError("errors.notFound");
  const items = await db.query.settlementItems.findMany({ where: eq(settlementItems.settlementId, s.id) });
  const ptxs = items.length ? await db.query.paymentTransactions.findMany({ where: inArray(paymentTransactions.id, items.map((i) => i.sourceId.split("#")[0]!)) }) : [];
  const ords = ptxs.length ? await db.query.orders.findMany({ where: inArray(orders.id, ptxs.map((p) => p.orderId)) }) : [];
  const rm = (n: number) => (n / 100).toFixed(2);
  const head = [
    `Settlement,${s.reference}`,
    `Status,${s.status}`,
    `Scheduled,${s.scheduledFor}`,
    `Completed,${s.completedAt?.toISOString() ?? ""}`,
    `Bank,${s.bankSnapshot ? `${s.bankSnapshot.bankName} ****${s.bankSnapshot.last4}` : ""}`,
    `Gross (RM),${rm(s.grossSen)}`,
    `Processing fees (RM),${rm(s.processingFeeSen)}`,
    `Platform fees (RM),${rm(s.platformFeeSen)}`,
    `Refunds (RM),${rm(s.refundsSen)}`,
    `Adjustments (RM),${rm(s.adjustmentsSen)}`,
    `Net (RM),${rm(s.netSen)}`,
    "",
    "type,order,gross_rm,processing_fee_rm,platform_fee_rm,net_rm",
  ];
  const rows = items.map((i) => {
    const t = ptxs.find((p) => p.id === i.sourceId.split("#")[0]);
    const o = t ? ords.find((x) => x.id === t.orderId) : null;
    return [i.sourceType, o ? `#${o.number}` : "", rm(i.grossSen), rm(i.processingFeeSen), rm(i.platformFeeSen), rm(i.netSen)].join(",");
  });
  return [...head, ...rows].join("\n");
}
