import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { aiGenerations, customers, orders, paymentTransactions, settlementBatches, settlements, shipments, workspaces } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { tenantDirectory } from "./platform";

export const REPORTS = {
  tenants: { personal: true, source: "workspaces + users + orders + payment_transactions + ai_generations" },
  payments: { personal: false, source: "payment_transactions (Selltro Pay) — GMV is merchant money, fees are SellNow revenue" },
  settlements: { personal: false, source: "settlement_batches + settlements (net = gross − processing − platform − refunds + adjustments)" },
  orders: { personal: true, source: "orders + customers (is_test orders excluded)" },
  couriers: { personal: false, source: "shipments (courier_cost = provider charge; customer shipping = orders.shipping_sen)" },
  ai: { personal: false, source: "ai_generations (estimated cost only when token prices are configured)" },
} as const;
export type ReportKind = keyof typeof REPORTS;

const cell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const rm = (sen: number | null | undefined) => (sen == null ? "" : (Number(sen) / 100).toFixed(2));
const mask = (email: string | null | undefined) => (email ? email.replace(/^(.).*(@.*)$/, "$1***$2") : "");

/**
 * Builds a CSV report. Personal data (names, emails, phones) is included only for admins with
 * reports.exportPersonal; otherwise masked. Every export is audited and carries its own metadata.
 */
export async function buildReport(db: DB, admin: { userId: string; email: string; canPersonal: boolean }, kind: ReportKind, f: { from?: string; to?: string; status?: string }) {
  if (!(kind in REPORTS)) throw new AppError("errors.validation");
  const from = f.from ? new Date(`${f.from}T00:00:00+08:00`) : new Date(Date.now() - 30 * 86400_000);
  const to = f.to ? new Date(`${f.to}T23:59:59+08:00`) : new Date();
  const personal = REPORTS[kind].personal && admin.canPersonal;
  let head: string[] = [];
  let rows: unknown[][] = [];
  if (kind === "tenants") {
    const t = await tenantDirectory(db, { limit: 500 });
    head = ["tenant_id", "business", "owner", "email", "registered", "plan", "subscription", "website", "selltro_pay", "couriers", "last_active", "orders", "gmv_rm", "platform_fees_rm", "ai_credits", "risk"];
    rows = t.filter((x) => x.createdAt >= from && x.createdAt <= to).map((x) => [x.id, x.name, personal ? x.owner.name : "", personal ? x.owner.email : mask(x.owner.email), x.createdAt, x.plan, x.subscription, x.website, x.payment, x.couriers, x.lastActive, x.orders, rm(x.gmvSen), rm(x.platformFeesSen), x.aiCredits, x.risk]);
  } else if (kind === "payments") {
    const r = await db.select({ p: paymentTransactions, tenant: workspaces.name, number: orders.number }).from(paymentTransactions).innerJoin(workspaces, eq(workspaces.id, paymentTransactions.workspaceId)).innerJoin(orders, eq(orders.id, paymentTransactions.orderId)).where(and(gte(paymentTransactions.createdAt, from), lte(paymentTransactions.createdAt, to), f.status ? eq(paymentTransactions.status, f.status as "PAID") : undefined)).orderBy(desc(paymentTransactions.createdAt)).limit(10_000);
    head = ["bill_id", "order", "tenant", "environment", "amount_rm", "status", "provider_status", "processing_fee_rm", "platform_fee_rm", "refunded_rm", "reconcile", "paid_at"];
    rows = r.map(({ p, tenant, number }) => [p.billId, `#${number}`, tenant, p.environment, rm(p.amountSen), p.status, p.providerStatus, rm(p.processingFeeSen), rm(p.platformFeeSen), rm(p.refundedSen), p.reconcileStatus, p.paidAt]);
  } else if (kind === "settlements") {
    const r = await db.select({ s: settlements, b: settlementBatches, tenant: workspaces.name }).from(settlements).innerJoin(settlementBatches, eq(settlementBatches.id, settlements.batchId)).innerJoin(workspaces, eq(workspaces.id, settlements.workspaceId)).where(and(gte(settlements.createdAt, from), lte(settlements.createdAt, to), f.status ? eq(settlements.status, f.status as "COMPLETED") : undefined)).orderBy(desc(settlements.createdAt)).limit(10_000);
    head = ["reference", "batch_date", "environment", "tenant", "status", "gross_rm", "processing_rm", "platform_rm", "refunds_rm", "adjustments_rm", "net_rm", "bank", "provider_ref", "completed_at"];
    rows = r.map(({ s, b, tenant }) => [s.reference, b.settlementDate, b.environment, tenant, s.status, rm(s.grossSen), rm(s.processingFeeSen), rm(s.platformFeeSen), rm(s.refundsSen), rm(s.adjustmentsSen), rm(s.netSen), s.bankSnapshot ? `${s.bankSnapshot.bankName} ****${s.bankSnapshot.last4}` : "", s.providerRef, s.completedAt]);
  } else if (kind === "orders") {
    const st = f.status;
    const where = and(eq(orders.isTest, false), gte(orders.createdAt, from), lte(orders.createdAt, to), st === "paid" ? sql`${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED','REFUNDED')` : st === "cod" ? eq(orders.paymentMethod, "cod") : st === "cancelled" ? eq(orders.orderStatus, "CANCELLED") : st === "refunded" ? sql`${orders.refundedSen} > 0` : undefined);
    const r = await db.select({ o: orders, tenant: workspaces.name, cust: { name: customers.name, email: customers.email } }).from(orders).innerJoin(workspaces, eq(workspaces.id, orders.workspaceId)).innerJoin(customers, eq(customers.id, orders.customerId)).where(where).orderBy(desc(orders.createdAt)).limit(20_000);
    head = ["order", "tenant", "date", "customer", "email", "method", "payment", "fulfillment", "order_status", "subtotal_rm", "shipping_rm", "total_rm", "refunded_rm"];
    rows = r.map(({ o, tenant, cust }) => [`${o.workspaceId}#${o.number}`, tenant, o.createdAt, personal ? cust.name : "", personal ? cust.email : mask(cust.email), o.paymentMethod, o.paymentStatus, o.fulfillmentStatus, o.orderStatus, rm(o.subtotalSen), rm(o.shippingSen), rm(o.totalSen), rm(o.refundedSen)]);
  } else if (kind === "couriers") {
    const r = await db.select({ s: shipments, tenant: workspaces.name, charged: orders.shippingSen }).from(shipments).innerJoin(workspaces, eq(workspaces.id, shipments.workspaceId)).innerJoin(orders, eq(orders.id, shipments.orderId)).where(and(gte(shipments.createdAt, from), lte(shipments.createdAt, to))).orderBy(desc(shipments.createdAt)).limit(20_000);
    head = ["shipment", "tenant", "provider", "service", "status", "tracking", "customer_shipping_rm", "courier_cost_rm", "shipping_difference_rm", "cod_rm", "awb", "booked_at", "error"];
    rows = r.map(({ s, tenant, charged }) => [s.id, tenant, s.provider, s.serviceCode, s.status, s.trackingNumber, rm(charged), rm(s.courierCostSen), s.courierCostSen != null ? rm(charged - s.courierCostSen) : "", rm(s.codAmountSen), s.awbAssetId ? "yes" : "no", s.bookedAt, s.lastError]);
  } else {
    const r = await db.select({ ws: workspaces.name, task: aiGenerations.task, model: aiGenerations.model, c: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${aiGenerations.status} = 'failed')::int`, credits: sql<number>`coalesce(sum(${aiGenerations.credits}) filter (where ${aiGenerations.status} = 'succeeded'),0)::int`, tokens: sql<number>`coalesce(sum(coalesce(${aiGenerations.inputTokens},0)+coalesce(${aiGenerations.outputTokens},0)),0)::bigint`, micros: sql<number>`coalesce(sum(${aiGenerations.estimatedCostMicros}),0)::bigint` }).from(aiGenerations).innerJoin(workspaces, eq(workspaces.id, aiGenerations.workspaceId)).where(and(gte(aiGenerations.createdAt, from), lte(aiGenerations.createdAt, to))).groupBy(workspaces.name, aiGenerations.task, aiGenerations.model);
    head = ["tenant", "task", "model", "generations", "failed", "credits_used", "tokens", "estimated_cost_usd"];
    rows = r.map((x) => [x.ws, x.task, x.model, x.c, x.failed, x.credits, x.tokens, (Number(x.micros) / 1_000_000).toFixed(4)]);
  }
  const meta = [`# SellNow report: ${kind}`, `# Date range: ${from.toISOString()} → ${to.toISOString()}`, `# Filters: ${f.status ?? "none"}`, `# Generated: ${new Date().toISOString()}`, `# Report owner: ${admin.email}`, `# Source: ${REPORTS[kind].source}`, `# Personal data: ${personal ? "included" : "masked"}`, ""];
  await audit(db, { workspaceId: null, actorUserId: admin.userId, action: "admin.report.exported", data: { kind, from: from.toISOString(), to: to.toISOString(), rows: rows.length, personal } });
  return [...meta, head.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}
