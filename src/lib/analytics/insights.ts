import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { orders, leads } from "@/lib/db/schema";
import { getKpis, rangeFromDays } from "./kpis";

export type Insight = { id: string; severity: "info" | "warn"; params: Record<string, string | number>; action: string };

/**
 * Rule-based recommendations computed from persisted data. Each insight carries the metrics
 * that justify it; rules require a minimum sample size to avoid unsupported conclusions.
 */
export async function getInsights(db: DB, workspaceId: string, now = new Date()): Promise<Insight[]> {
  const out: Insight[] = [];
  const cur = await getKpis(db, workspaceId, rangeFromDays(14, now));
  const prevRange = { from: new Date(now.getTime() - 28 * 86400_000), to: new Date(now.getTime() - 14 * 86400_000) };
  const prev = await getKpis(db, workspaceId, prevRange);

  if (cur.visitors >= 50 && (cur.conversionRate ?? 0) < 0.01) {
    out.push({ id: "low_conversion", severity: "warn", params: { visitors: cur.visitors, orders: cur.paidOrders }, action: "/dashboard/storefront" });
  }
  if (cur.visitors >= 50 && prev.visitors >= 50 && prev.conversionRate && cur.conversionRate !== null && cur.conversionRate < prev.conversionRate * 0.7) {
    out.push({
      id: "conversion_declined",
      severity: "warn",
      params: { now: (cur.conversionRate * 100).toFixed(1), before: (prev.conversionRate * 100).toFixed(1) },
      action: "/dashboard/analytics",
    });
  }
  const [abandoned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.isTest, false), sql`${orders.paymentStatus} in ('CANCELLED','FAILED')`, gte(orders.createdAt, new Date(now.getTime() - 7 * 86400_000))));
  if ((abandoned?.n ?? 0) >= 3) out.push({ id: "unpaid_checkouts", severity: "info", params: { count: abandoned!.n }, action: "/dashboard/orders" });
  const [uncontacted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.status, "new"), lt(leads.createdAt, new Date(now.getTime() - 86400_000))));
  if ((uncontacted?.n ?? 0) > 0) out.push({ id: "leads_waiting", severity: "warn", params: { count: uncontacted!.n }, action: "/dashboard/customers?tab=leads" });
  if (cur.customers >= 5 && cur.repeatCustomers === 0) out.push({ id: "repeat_opportunity", severity: "info", params: { customers: cur.customers }, action: "/dashboard/marketing" });
  return out.slice(0, 3);
}
