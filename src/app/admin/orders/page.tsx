import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { orders, workspaces } from "@/lib/db/schema";
import { Kpi, Panel, Status, Table, dt, rm } from "@/components/admin/ui";

export const metadata = { title: "Orders" };

export default async function OrdersAdmin() {
  const a = await requireAdmin("tenants.view");
  const real = eq(orders.isTest, false);
  const [k] = await a.db.select({
    all: sql<number>`count(*)::int`,
    paid: sql<number>`count(*) filter (where ${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED','REFUNDED'))::int`,
    cod: sql<number>`count(*) filter (where ${orders.paymentMethod} = 'cod')::int`,
    manual: sql<number>`count(*) filter (where ${orders.paymentMethod} = 'manual_transfer')::int`,
    cancelled: sql<number>`count(*) filter (where ${orders.orderStatus} = 'CANCELLED' or ${orders.paymentStatus} = 'CANCELLED')::int`,
    refunded: sql<number>`count(*) filter (where ${orders.refundedSen} > 0)::int`,
  }).from(orders).where(real);
  const byTenant = await a.db.select({ name: workspaces.name, id: workspaces.id, n: sql<number>`count(*)::int`, gmv: sql<number>`coalesce(sum(${orders.totalSen}) filter (where ${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED','REFUNDED')),0)::bigint` }).from(orders).innerJoin(workspaces, eq(workspaces.id, orders.workspaceId)).where(real).groupBy(workspaces.id, workspaces.name).orderBy(desc(sql`count(*)`)).limit(25);
  const byDate = await a.db.select({ d: sql<string>`to_char(${orders.createdAt} at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD')`, n: sql<number>`count(*)::int` }).from(orders).where(real).groupBy(sql`1`).orderBy(desc(sql`1`)).limit(14);
  const recent = await a.db.select({ o: orders, name: workspaces.name }).from(orders).innerJoin(workspaces, eq(workspaces.id, orders.workspaceId)).where(real).orderBy(desc(orders.createdAt)).limit(50);
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Orders (all tenants)</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Orders" value={Number(k?.all ?? 0)} /><Kpi label="Paid" value={Number(k?.paid ?? 0)} /><Kpi label="COD" value={Number(k?.cod ?? 0)} /><Kpi label="Manual transfer" value={Number(k?.manual ?? 0)} /><Kpi label="Cancelled" value={Number(k?.cancelled ?? 0)} /><Kpi label="Refunded" value={Number(k?.refunded ?? 0)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Volume by tenant"><Table head={["Tenant", "Orders", "Paid GMV"]} rows={byTenant.map((r) => [<Link key="t" className="text-primary" href={`/admin/tenants/${r.id}`}>{r.name}</Link>, r.n, rm(Number(r.gmv))])} minWidth={420} /></Panel>
        <Panel title="Volume by date (14 days)"><Table head={["Date", "Orders"]} rows={byDate.map((r) => [r.d, r.n])} minWidth={300} /></Panel>
      </div>
      <Panel title="Recent orders" action={<a className="text-xs font-bold text-primary" href="/api/admin/reports?kind=orders">Export CSV</a>}>
        <Table minWidth={1000} head={["Tenant", "Order", "Created", "Method", "Payment", "Fulfilment", "Order", "Total"]} rows={recent.map(({ o, name }) => [name, `#${o.number}`, dt(o.createdAt), o.paymentMethod, <Status key="p" v={o.paymentStatus} />, o.fulfillmentStatus, o.orderStatus, rm(o.totalSen)])} />
      </Panel>
    </>
  );
}
