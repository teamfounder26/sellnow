import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  aiGenerations,
  aiJobs,
  analyticsEvents,
  auditLogs,
  courierConnections,
  orders,
  paymentEvents,
  paymentTransactions,
  sellerBankAccounts,
  sellerPaymentAccounts,
  settlementBatches,
  settlementHolds,
  settlements,
  shipments,
  storefronts,
  tenantNotes,
  tenantSubscriptions,
  users,
  workspaceMembers,
  workspaces,
  fundingSnapshots,
  courierWebhookEvents,
  subscriptionPlans,
  billingEvents,
  tenantFeatureOverrides,
} from "@/lib/db/schema";
import { accountBalance, ledgerIntegrity } from "@/lib/finance/ledger";
import { selltroEnvironment } from "@/lib/finance/selltro-pay";
import { payoutConfigured } from "@/lib/finance/payment-orders";
import { parcelDailyConfigured } from "@/lib/couriers/parceldaily";
import { configuredProviderName } from "@/lib/ai/provider";
import { imageGenerationConfigured } from "@/lib/ai/image";
import { getConfig } from "@/lib/finance/settings";
import { openAlerts } from "./alerts";
import { ensurePlansSeeded } from "./packages";

const n = (v: unknown) => Number(v ?? 0);
const DAY = 86400_000;
/** Paid, non-test orders: the basis of GMV. GMV is merchant sales — NOT SellNow revenue. */
const realPaid = and(inArray(orders.paymentStatus, ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]), eq(orders.isTest, false));

function monthKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).format(d);
}
function lastMonths(k: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = k - 1; i >= 0; i--) out.push(monthKey(new Date(d.getFullYear(), d.getMonth() - i, 15)));
  return out;
}

/** Executive overview. Every number is computed from source tables; revenue streams are kept apart. */
export async function overview(db: DB) {
  await ensurePlansSeeded(db);
  const since30 = new Date(Date.now() - 30 * DAY);
  const [tenants] = await db.select({ total: sql<number>`count(*)::int`, recent: sql<number>`count(*) filter (where ${workspaces.createdAt} >= ${since30})::int`, suspended: sql<number>`count(*) filter (where ${workspaces.suspendedAt} is not null)::int` }).from(workspaces);
  const active = await db.select({ ws: analyticsEvents.workspaceId }).from(analyticsEvents).where(and(gte(analyticsEvents.createdAt, since30), isNotNull(analyticsEvents.workspaceId))).groupBy(analyticsEvents.workspaceId);
  const subs = await db.select({ status: tenantSubscriptions.status, priceSen: tenantSubscriptions.priceSen, cycle: tenantSubscriptions.billingCycle }).from(tenantSubscriptions);
  const paidSubs = subs.filter((s) => s.status === "active" && s.priceSen > 0);
  const mrr = paidSubs.reduce((a, s) => a + (s.cycle === "annual" ? Math.round(s.priceSen / 12) : s.priceSen), 0);
  const [gmv] = await db.select({ s: sql<number>`coalesce(sum(${orders.totalSen} - ${orders.refundedSen}),0)::bigint`, c: sql<number>`count(*)::int` }).from(orders).where(realPaid);
  const [allOrders] = await db.select({ c: sql<number>`count(*)::int` }).from(orders).where(eq(orders.isTest, false));
  const [pay] = await db.select({ ok: sql<number>`count(*) filter (where ${paymentTransactions.status} in ('PAID','PARTIALLY_REFUNDED','REFUNDED'))::int`, all: sql<number>`count(*) filter (where ${paymentTransactions.status} <> 'PENDING')::int` }).from(paymentTransactions).where(eq(paymentTransactions.environment, "live"));
  const [sets] = await db.select({ done: sql<number>`coalesce(sum(${settlements.netSen}) filter (where ${settlements.status} = 'COMPLETED'),0)::bigint` }).from(settlements);
  const [sites] = await db.select({ c: sql<number>`count(*) filter (where ${storefronts.publishedVersionId} is not null)::int` }).from(storefronts);
  const [ai] = await db.select({ micros: sql<number>`coalesce(sum(${aiGenerations.estimatedCostMicros}),0)::bigint`, credits: sql<number>`coalesce(sum(${aiGenerations.credits}) filter (where ${aiGenerations.status} = 'succeeded'),0)::int` }).from(aiGenerations);
  const [ship] = await db.select({ c: sql<number>`count(*) filter (where ${shipments.status} not in ('CANCELLED','FAILED'))::int` }).from(shipments);

  const months = lastMonths(12);
  const series = async (q: Promise<{ m: string; v: number }[]>) => {
    const rows = await q;
    return months.map((m) => ({ m, v: n(rows.find((r) => r.m === m)?.v) }));
  };
  const mExpr = (col: import("drizzle-orm").AnyColumn) => sql<string>`to_char(${col} at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM')`;
  const [tenantGrowth, gmvTrend, orderTrend, aiTrend, platformFees] = await Promise.all([
    series(db.select({ m: mExpr(workspaces.createdAt), v: sql<number>`count(*)::int` }).from(workspaces).groupBy(sql`1`) as never),
    series(db.select({ m: mExpr(orders.createdAt), v: sql<number>`coalesce(sum(${orders.totalSen}),0)::bigint` }).from(orders).where(realPaid).groupBy(sql`1`) as never),
    series(db.select({ m: mExpr(orders.createdAt), v: sql<number>`count(*)::int` }).from(orders).where(eq(orders.isTest, false)).groupBy(sql`1`) as never),
    series(db.select({ m: mExpr(aiGenerations.createdAt), v: sql<number>`coalesce(sum(${aiGenerations.estimatedCostMicros}),0)::bigint` }).from(aiGenerations).groupBy(sql`1`) as never),
    series(db.select({ m: mExpr(paymentTransactions.paidAt as never), v: sql<number>`coalesce(sum(${paymentTransactions.platformFeeSen}),0)::int` }).from(paymentTransactions).where(and(eq(paymentTransactions.environment, "live"), isNotNull(paymentTransactions.paidAt))).groupBy(sql`1`) as never),
  ]);
  return {
    kpi: {
      totalTenants: n(tenants?.total),
      activeTenants: active.length,
      newTenants: n(tenants?.recent),
      trialTenants: subs.filter((s) => s.status === "trial").length,
      paidTenants: paidSubs.length,
      suspendedTenants: n(tenants?.suspended),
      mrrSen: mrr,
      arrSen: mrr * 12,
      gmvSen: n(gmv?.s),
      transactionRevenueSen: -(await accountBalance(db, "platform_fee_revenue")),
      settlementLiabilitySen: -(await accountBalance(db, "seller_payable")),
      settlementsCompletedSen: n(sets?.done),
      totalOrders: n(allOrders?.c),
      paidOrders: n(gmv?.c),
      websitesPublished: n(sites?.c),
      aiCostUsd: n(ai?.micros) / 1_000_000,
      aiCreditsUsed: n(ai?.credits),
      shipments: n(ship?.c),
      paymentSuccessRate: n(pay?.all) ? n(pay?.ok) / n(pay?.all) : null,
    },
    charts: { tenantGrowth, gmvTrend, orderTrend, aiTrend, platformFees },
    alerts: await openAlerts(db, 12),
  };
}

export type TenantFilters = { q?: string; plan?: string; status?: string; limit?: number };

/** Tenant directory with the operational columns (computed per page; capped). */
export async function tenantDirectory(db: DB, f: TenantFilters = {}) {
  const conds = [];
  if (f.q?.trim()) conds.push(sql`(${workspaces.name} ilike ${`%${f.q.trim()}%`} or ${workspaces.id} = ${f.q.trim()} or exists (select 1 from users u where u.id = ${workspaces.createdBy} and u.email ilike ${`%${f.q.trim()}%`}))`);
  if (f.plan) conds.push(eq(workspaces.plan, f.plan));
  if (f.status === "suspended") conds.push(isNotNull(workspaces.suspendedAt));
  const ws = await db
    .select({ ws: workspaces, owner: { name: users.name, email: users.email } })
    .from(workspaces)
    .innerJoin(users, eq(users.id, workspaces.createdBy))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(workspaces.createdAt))
    .limit(Math.min(f.limit ?? 100, 500));
  const ids = ws.map((r) => r.ws.id);
  if (!ids.length) return [];
  const g = <T extends { ws: string | null }>(rows: T[]) => new Map(rows.map((r) => [r.ws, r]));
  const [ordersAgg, feeAgg, aiAgg, lastAct, sfs, pays, couriers, subs, risks] = await Promise.all([
    db.select({ ws: orders.workspaceId, c: sql<number>`count(*)::int`, gmv: sql<number>`coalesce(sum(${orders.totalSen}) filter (where ${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and not ${orders.isTest}),0)::bigint` }).from(orders).where(inArray(orders.workspaceId, ids)).groupBy(orders.workspaceId),
    db.select({ ws: paymentTransactions.workspaceId, fee: sql<number>`coalesce(sum(${paymentTransactions.platformFeeSen}),0)::int` }).from(paymentTransactions).where(inArray(paymentTransactions.workspaceId, ids)).groupBy(paymentTransactions.workspaceId),
    db.select({ ws: aiGenerations.workspaceId, credits: sql<number>`coalesce(sum(${aiGenerations.credits}) filter (where ${aiGenerations.status} = 'succeeded'),0)::int` }).from(aiGenerations).where(inArray(aiGenerations.workspaceId, ids)).groupBy(aiGenerations.workspaceId),
    db.select({ ws: analyticsEvents.workspaceId, at: sql<Date>`max(${analyticsEvents.createdAt})` }).from(analyticsEvents).where(inArray(analyticsEvents.workspaceId, ids)).groupBy(analyticsEvents.workspaceId),
    db.select({ ws: storefronts.workspaceId, published: storefronts.publishedVersionId, status: storefronts.status }).from(storefronts).where(inArray(storefronts.workspaceId, ids)),
    db.select({ ws: sellerPaymentAccounts.workspaceId, status: sellerPaymentAccounts.status }).from(sellerPaymentAccounts).where(inArray(sellerPaymentAccounts.workspaceId, ids)),
    db.select({ ws: courierConnections.workspaceId, c: sql<number>`count(*) filter (where ${courierConnections.status} = 'CONNECTED')::int` }).from(courierConnections).where(inArray(courierConnections.workspaceId, ids)).groupBy(courierConnections.workspaceId),
    db.select({ ws: tenantSubscriptions.workspaceId, status: tenantSubscriptions.status }).from(tenantSubscriptions).where(inArray(tenantSubscriptions.workspaceId, ids)),
    db.select({ ws: tenantNotes.workspaceId, c: sql<number>`count(*)::int` }).from(tenantNotes).where(and(inArray(tenantNotes.workspaceId, ids), eq(tenantNotes.kind, "risk_flag"))).groupBy(tenantNotes.workspaceId),
  ]);
  const [O, F, A, L, S, P, C, SB, R] = [g(ordersAgg), g(feeAgg), g(aiAgg), g(lastAct), g(sfs), g(pays), g(couriers), g(subs), g(risks)];
  const holds = await db.select({ ws: settlementHolds.workspaceId }).from(settlementHolds).where(and(inArray(settlementHolds.workspaceId, ids), isNull(settlementHolds.releasedAt)));
  return ws.map(({ ws: w, owner }) => ({
    id: w.id,
    name: w.name,
    owner,
    createdAt: w.createdAt,
    plan: w.plan,
    subscription: SB.get(w.id)?.status ?? "none",
    website: S.get(w.id)?.published ? "published" : S.get(w.id) ? "draft" : "none",
    payment: P.get(w.id)?.status ?? "NOT_ACTIVATED",
    couriers: n(C.get(w.id)?.c),
    lastActive: L.get(w.id)?.at ?? null,
    orders: n(O.get(w.id)?.c),
    gmvSen: n(O.get(w.id)?.gmv),
    platformFeesSen: n(F.get(w.id)?.fee),
    aiCredits: n(A.get(w.id)?.credits),
    risk: w.suspendedAt ? "suspended" : holds.some((h) => h.ws === w.id) ? "payout_hold" : n(R.get(w.id)?.c) ? "flagged" : "ok",
  }));
}

/** Tenant detail (sections A–H). Bank details are masked; ID numbers are never decrypted here. */
export async function tenantDetail(db: DB, workspaceId: string) {
  const w = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!w) return null;
  const owner = await db.query.users.findFirst({ where: eq(users.id, w.createdBy) });
  const members = await db.select({ role: workspaceMembers.role, name: users.name, email: users.email }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId));
  const [sf, acct, banks, sub, plan, overrides, notes, bills] = await Promise.all([
    db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, workspaceId) }),
    db.query.sellerPaymentAccounts.findFirst({ where: eq(sellerPaymentAccounts.workspaceId, workspaceId) }),
    db.query.sellerBankAccounts.findMany({ where: eq(sellerBankAccounts.workspaceId, workspaceId), orderBy: desc(sellerBankAccounts.createdAt) }),
    db.query.tenantSubscriptions.findFirst({ where: eq(tenantSubscriptions.workspaceId, workspaceId) }),
    db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, w.plan) }),
    db.query.tenantFeatureOverrides.findMany({ where: eq(tenantFeatureOverrides.workspaceId, workspaceId) }),
    db.query.tenantNotes.findMany({ where: eq(tenantNotes.workspaceId, workspaceId), orderBy: desc(tenantNotes.createdAt) }),
    db.query.billingEvents.findMany({ where: eq(billingEvents.workspaceId, workspaceId), orderBy: desc(billingEvents.createdAt), limit: 30 }),
  ]);
  const [sales] = await db
    .select({
      orders: sql<number>`count(*)::int`,
      paid: sql<number>`count(*) filter (where ${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and not ${orders.isTest})::int`,
      paidSen: sql<number>`coalesce(sum(${orders.totalSen}) filter (where ${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and not ${orders.isTest}),0)::bigint`,
      refundsSen: sql<number>`coalesce(sum(${orders.refundedSen}),0)::bigint`,
      cod: sql<number>`count(*) filter (where ${orders.paymentMethod} = 'cod')::int`,
    })
    .from(orders)
    .where(eq(orders.workspaceId, workspaceId));
  const [fin] = await db.select({ collected: sql<number>`coalesce(sum(${paymentTransactions.amountSen}) filter (where ${paymentTransactions.status} <> 'PENDING'),0)::bigint`, proc: sql<number>`coalesce(sum(${paymentTransactions.processingFeeSen}),0)::int`, plat: sql<number>`coalesce(sum(${paymentTransactions.platformFeeSen}),0)::int` }).from(paymentTransactions).where(eq(paymentTransactions.workspaceId, workspaceId));
  const setts = await db.query.settlements.findMany({ where: eq(settlements.workspaceId, workspaceId), orderBy: desc(settlements.createdAt), limit: 20 });
  const [ship] = await db.select({ total: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${shipments.status} = 'FAILED')::int`, cost: sql<number>`coalesce(sum(${shipments.courierCostSen}) filter (where ${shipments.status} not in ('CANCELLED','FAILED')),0)::int`, pd: sql<number>`count(*) filter (where ${shipments.provider} = 'parceldaily')::int`, cod: sql<number>`count(*) filter (where ${shipments.codAmountSen} > 0)::int` }).from(shipments).where(eq(shipments.workspaceId, workspaceId));
  const conns = await db.query.courierConnections.findMany({ where: eq(courierConnections.workspaceId, workspaceId) });
  const ai = await db.select({ model: aiGenerations.model, task: aiGenerations.task, c: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${aiGenerations.status} = 'failed')::int`, credits: sql<number>`coalesce(sum(${aiGenerations.credits}) filter (where ${aiGenerations.status} = 'succeeded'),0)::int`, tokens: sql<number>`coalesce(sum(coalesce(${aiGenerations.inputTokens},0) + coalesce(${aiGenerations.outputTokens},0)),0)::bigint`, micros: sql<number>`coalesce(sum(${aiGenerations.estimatedCostMicros}),0)::bigint` }).from(aiGenerations).where(eq(aiGenerations.workspaceId, workspaceId)).groupBy(aiGenerations.model, aiGenerations.task);
  return {
    w,
    owner: owner ? { id: owner.id, name: owner.name, email: owner.email, verified: Boolean(owner.emailVerifiedAt), createdAt: owner.createdAt } : null,
    members,
    plan,
    sub,
    overrides,
    bills,
    website: sf ? { slug: sf.slug, status: sf.status, published: Boolean(sf.publishedVersionId), publishedAt: sf.publishedAt, viewedAt: sf.viewedAt, domain: sf.customDomain } : null,
    sales: { orders: n(sales?.orders), paid: n(sales?.paid), paidSen: n(sales?.paidSen), refundsSen: n(sales?.refundsSen), cod: n(sales?.cod), aovSen: n(sales?.paid) ? Math.round(n(sales?.paidSen) / n(sales?.paid)) : null },
    finance: { account: acct ? { status: acct.status, businessType: acct.businessType, legalName: acct.legalName, registrationNumber: acct.registrationNumber, idLast4: acct.idNumberLast4, submittedAt: acct.submittedAt, reviewNote: acct.reviewNote } : null, banks: banks.map((b) => ({ id: b.id, bankName: b.bankName, last4: b.accountLast4, holderName: b.holderName, status: b.status, current: !b.supersededAt, createdAt: b.createdAt, createdBy: b.createdBy })), collectedSen: n(fin?.collected), processingFeesSen: n(fin?.proc), platformFeesSen: n(fin?.plat), liabilitySen: -(await accountBalance(db, "seller_payable", workspaceId)), settlements: setts },
    courier: { connections: conns.map((c) => ({ provider: c.provider, status: c.status, isDefault: c.isDefault })), total: n(ship?.total), failed: n(ship?.failed), costSen: n(ship?.cost), parceldaily: n(ship?.pd), cod: n(ship?.cod) },
    ai,
    notes,
  };
}

/** Tenant activity: audit trail + product events, newest first. Metadata only (no secrets). */
export async function tenantActivity(db: DB, workspaceId: string, limit = 80) {
  const [a, e] = await Promise.all([
    db.query.auditLogs.findMany({ where: eq(auditLogs.workspaceId, workspaceId), orderBy: desc(auditLogs.createdAt), limit }),
    db.query.analyticsEvents.findMany({ where: eq(analyticsEvents.workspaceId, workspaceId), orderBy: desc(analyticsEvents.createdAt), limit }),
  ]);
  return [...a.map((x) => ({ id: x.id, at: x.createdAt, type: x.action, actor: x.actorUserId, target: x.entity ? `${x.entity}:${x.entityId}` : null, source: "audit" as const })), ...e.map((x) => ({ id: x.id, at: x.createdAt, type: x.name, actor: x.userId, target: null, source: "event" as const }))]
    .sort((p, q) => q.at.getTime() - p.at.getTime())
    .slice(0, limit);
}

/** Usage analytics: DAU/WAU/MAU of tenants, activation funnel, time-to-first-website/sale. */
export async function usageAnalytics(db: DB) {
  const active = async (days: number) => (await db.select({ ws: analyticsEvents.workspaceId }).from(analyticsEvents).where(and(gte(analyticsEvents.createdAt, new Date(Date.now() - days * DAY)), isNotNull(analyticsEvents.workspaceId))).groupBy(analyticsEvents.workspaceId)).length;
  const [tot] = await db.select({ c: sql<number>`count(*)::int` }).from(workspaces);
  const funnel = await Promise.all(["onboarding_completed", "storefront_published", "payment_connected", "selltro_activation_submitted", "checkout_started", "first_paid_order"].map(async (name) => ({ name, tenants: n((await db.select({ c: sql<number>`count(distinct ${analyticsEvents.workspaceId})::int` }).from(analyticsEvents).where(eq(analyticsEvents.name, name)))[0]?.c) })));
  const ttf = async (name: string) => {
    const r = await db.execute(sql`select percentile_cont(0.5) within group (order by extract(epoch from (e.first - w.created_at))/3600) as h from (select workspace_id, min(created_at) as first from analytics_events where name = ${name} group by workspace_id) e join workspaces w on w.id = e.workspace_id`);
    const row = ((r as unknown as { rows?: { h: number | null }[] }).rows ?? (r as unknown as { h: number | null }[]))[0];
    return row?.h != null ? Number(row.h) : null;
  };
  const dormant = await db.execute(sql`select count(*)::int as c from workspaces w where not exists (select 1 from analytics_events e where e.workspace_id = w.id and e.created_at >= now() - interval '30 days')`);
  const dRow = ((dormant as unknown as { rows?: { c: number }[] }).rows ?? (dormant as unknown as { c: number }[]))[0];
  return { dau: await active(1), wau: await active(7), mau: await active(30), totalTenants: n(tot?.c), funnel, medianHoursToFirstWebsite: await ttf("storefront_published"), medianHoursToFirstSale: await ttf("first_paid_order"), dormantTenants: n(dRow?.c) };
}

/** Provider + job health with links to the place to act. */
export async function systemHealth(db: DB) {
  const t0 = Date.now();
  await db.execute(sql`select 1`);
  const dbMs = Date.now() - t0;
  const cfg = await getConfig(db);
  const lastEvent = async (provider: string) => (await db.query.paymentEvents.findFirst({ where: eq(paymentEvents.provider, provider), orderBy: desc(paymentEvents.createdAt) }))?.createdAt ?? null;
  const failedJobs = await db.query.aiJobs.findMany({ where: and(eq(aiJobs.status, "FAILED"), gte(aiJobs.createdAt, new Date(Date.now() - 7 * DAY))), orderBy: desc(aiJobs.createdAt), limit: 20 });
  const [gen] = await db.select({ all: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${aiGenerations.status} = 'failed')::int`, tokens: sql<number>`coalesce(sum(coalesce(${aiGenerations.inputTokens},0)+coalesce(${aiGenerations.outputTokens},0)),0)::bigint` }).from(aiGenerations).where(gte(aiGenerations.createdAt, new Date(Date.now() - 7 * DAY)));
  const lastBatch = await db.query.settlementBatches.findFirst({ orderBy: desc(settlementBatches.createdAt) });
  const lastFunding = await db.query.fundingSnapshots.findFirst({ where: eq(fundingSnapshots.source, "billplz_payment_order_limit"), orderBy: desc(fundingSnapshots.createdAt) });
  const lastCourierHook = await db.query.courierWebhookEvents.findFirst({ orderBy: desc(courierWebhookEvents.createdAt) });
  const [shipFails] = await db.select({ failed: sql<number>`count(*) filter (where ${shipments.status} = 'FAILED')::int`, pending: sql<number>`count(*) filter (where ${shipments.status} = 'BOOKING_PENDING' and ${shipments.lastError} is not null)::int`, ok: sql<number>`count(*) filter (where ${shipments.bookedAt} is not null)::int` }).from(shipments).where(gte(shipments.createdAt, new Date(Date.now() - 7 * DAY)));
  return {
    db: { ok: true, latencyMs: dbMs, ledger: await ledgerIntegrity(db) },
    selltro: { environment: selltroEnvironment(), liveApproved: cfg.selltroPayLiveApproved, billplzKeys: Boolean(process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_X_SIGNATURE_KEY && process.env.BILLPLZ_COLLECTION_ID), lastCallback: await lastEvent("selltro_pay"), payoutRail: payoutConfigured(), payoutsEnabled: cfg.payoutsEnabled, lastFunding },
    parceldaily: { configured: parcelDailyConfigured(), environment: process.env.PARCELDAILY_ENV === "live" ? "live" : "sandbox", webhookSecret: Boolean(process.env.PARCELDAILY_WEBHOOK_SECRET), lastWebhook: lastCourierHook?.createdAt ?? null, bookingsOk7d: n(shipFails?.ok), failed7d: n(shipFails?.failed), pendingUnknown: n(shipFails?.pending) },
    ai: { provider: configuredProviderName(), model: process.env.TOKENPORTAL_MODEL ?? null, imageProvider: imageGenerationConfigured(), requests7d: n(gen?.all), failed7d: n(gen?.failed), tokens7d: n(gen?.tokens) },
    jobs: { failed: failedJobs.map((j) => ({ id: j.id, kind: j.kind, error: j.error, at: j.createdAt, workspaceId: j.workspaceId })), lastSettlementRun: lastBatch?.createdAt ?? null },
    alerts: await openAlerts(db, 50),
  };
}

export async function adminUsers(db: DB) {
  return db.execute(sql`select a.user_id, a.role, a.status, a.created_at, u.email, u.name from platform_admins a join users u on u.id = a.user_id order by a.created_at`);
}
