import { and, eq, gte, lt, sql, isNotNull, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { orders, leads, analyticsEvents, customers } from "@/lib/db/schema";

export type Range = { from: Date; to: Date };

export function rangeFromDays(days: number, now = new Date()): Range {
  const to = new Date(now);
  const from = new Date(now.getTime() - days * 86400_000);
  return { from, to };
}

/**
 * KPI definitions (all exclude test-mode orders):
 *  revenue        = Σ(total − refunded) of orders verified PAID (incl. partially/fully refunded) with paid_at in range
 *  paidOrders     = count of orders with paid_at in range and status PAID or PARTIALLY_REFUNDED
 *  aov            = revenue / paidOrders
 *  customers      = distinct customers with ≥1 paid order (all time)
 *  leads          = leads created in range
 *  visitors       = distinct anonymous visitor ids on published storefront pages in range
 *  conversionRate = paidOrders / visitors
 *  repeatCustomers= customers with ≥2 paid orders (all time)
 *  adSpend / roas / cac / grossProfit → null until the required data source exists
 */
export async function getKpis(db: DB, workspaceId: string, range: Range) {
  const paidStatuses = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;
  const inRange = and(eq(orders.workspaceId, workspaceId), eq(orders.isTest, false), isNotNull(orders.paidAt), gte(orders.paidAt, range.from), lt(orders.paidAt, range.to));
  const [rev] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${orders.totalSen} - ${orders.refundedSen}), 0)::int`,
      paidOrders: sql<number>`count(*) filter (where ${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED'))::int`,
      refundedSen: sql<number>`coalesce(sum(${orders.refundedSen}), 0)::int`,
    })
    .from(orders)
    .where(and(inRange, inArray(orders.paymentStatus, [...paidStatuses])));
  const [cust] = await db
    .select({
      customers: sql<number>`count(distinct ${orders.customerId})::int`,
    })
    .from(orders)
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.isTest, false), inArray(orders.paymentStatus, ["PAID", "PARTIALLY_REFUNDED"])));
  const repeat = await db.execute(
    sql`select count(*)::int as n from (select customer_id from ${orders} where workspace_id = ${workspaceId} and is_test = false and payment_status in ('PAID','PARTIALLY_REFUNDED') group by customer_id having count(*) >= 2) t`,
  );
  const [ld] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), gte(leads.createdAt, range.from), lt(leads.createdAt, range.to)));
  const [vis] = await db
    .select({ n: sql<number>`count(distinct ${analyticsEvents.props}->>'visitor')::int` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.workspaceId, workspaceId), eq(analyticsEvents.name, "storefront_view"), gte(analyticsEvents.createdAt, range.from), lt(analyticsEvents.createdAt, range.to)));
  const [test] = await db
    .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${orders.totalSen}),0)::int` })
    .from(orders)
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.isTest, true), eq(orders.paymentStatus, "PAID")));
  const [allCustomers] = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(eq(customers.workspaceId, workspaceId));

  const revenue = Number(rev?.revenue ?? 0);
  const paidOrders = Number(rev?.paidOrders ?? 0);
  const visitors = Number(vis?.n ?? 0);
  const repeatRows = (repeat as unknown as { rows?: { n: number }[] }).rows ?? (repeat as unknown as { n: number }[]);
  return {
    revenue,
    refundedSen: Number(rev?.refundedSen ?? 0),
    paidOrders,
    aov: paidOrders ? Math.round(revenue / paidOrders) : null,
    customers: Number(cust?.customers ?? 0),
    contacts: Number(allCustomers?.n ?? 0),
    repeatCustomers: Number(repeatRows[0]?.n ?? 0),
    leads: Number(ld?.n ?? 0),
    visitors,
    conversionRate: visitors ? paidOrders / visitors : null,
    adSpend: null as number | null,
    roas: null as number | null,
    cac: null as number | null,
    grossProfit: null as number | null,
    testOrders: { count: Number(test?.n ?? 0), totalSen: Number(test?.sum ?? 0) },
  };
}

export type Kpis = Awaited<ReturnType<typeof getKpis>>;

/** Daily net revenue series (non-test) for charts. */
export async function revenueSeries(db: DB, workspaceId: string, range: Range, tz = "Asia/Kuala_Lumpur") {
  const res = await db.execute(sql`
    select to_char(date_trunc('day', paid_at at time zone ${tz}), 'YYYY-MM-DD') as day,
           coalesce(sum(total_sen - refunded_sen),0)::int as sen, count(*)::int as n
    from ${orders}
    where workspace_id = ${workspaceId} and is_test = false and paid_at is not null
      and paid_at >= ${range.from.toISOString()} and paid_at < ${range.to.toISOString()}
      and payment_status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')
    group by 1 order by 1`);
  const rows = (res as unknown as { rows?: { day: string; sen: number; n: number }[] }).rows ?? (res as unknown as { day: string; sen: number; n: number }[]);
  return rows.map((r) => ({ day: r.day, sen: Number(r.sen), orders: Number(r.n) }));
}
