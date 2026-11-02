import { desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { courierConnections, fundingSnapshots, orders, shipments, workspaces, courierWebhookEvents } from "@/lib/db/schema";
import { parcelDailyConfigured } from "@/lib/couriers/parceldaily";
import { COURIER_NAMES } from "@/lib/couriers/types";
import { Kpi, Panel, Status, Table, dt, rm } from "@/components/admin/ui";

export const metadata = { title: "Courier Management" };

export default async function CouriersAdmin() {
  const a = await requireAdmin("couriers.view");
  const db = a.db;
  const prov = await db.select({ p: shipments.provider, total: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${shipments.bookedAt} is not null)::int`, failed: sql<number>`count(*) filter (where ${shipments.status} = 'FAILED')::int`, returned: sql<number>`count(*) filter (where ${shipments.status} = 'RETURNED')::int`, cost: sql<number>`coalesce(sum(${shipments.courierCostSen}) filter (where ${shipments.status} not in ('CANCELLED','FAILED')),0)::bigint`, cod: sql<number>`count(*) filter (where ${shipments.codAmountSen} > 0)::int`, avgSec: sql<number>`coalesce(avg(extract(epoch from (${shipments.bookedAt} - ${shipments.createdAt}))),0)::float` }).from(shipments).groupBy(shipments.provider);
  const conns = await db.select({ p: courierConnections.provider, st: courierConnections.status, n: sql<number>`count(*)::int` }).from(courierConnections).groupBy(courierConnections.provider, courierConnections.status);
  const [fin] = await db.select({ charged: sql<number>`coalesce(sum(${orders.shippingSen}),0)::bigint`, cost: sql<number>`coalesce(sum(${orders.courierCostSen}),0)::bigint`, codFees: sql<number>`coalesce(sum(${orders.codFeeSen}),0)::bigint` }).from(orders).where(sql`${orders.courierCostSen} is not null`);
  const credit = await db.query.fundingSnapshots.findFirst({ where: eq(fundingSnapshots.source, "parceldaily_credit"), orderBy: desc(fundingSnapshots.createdAt) });
  const failed = await db.select({ s: shipments, name: workspaces.name }).from(shipments).innerJoin(workspaces, eq(workspaces.id, shipments.workspaceId)).where(sql`${shipments.status} = 'FAILED' or (${shipments.status} = 'BOOKING_PENDING' and ${shipments.lastError} is not null)`).orderBy(desc(shipments.createdAt)).limit(30);
  const hooks = await db.query.courierWebhookEvents.findMany({ orderBy: desc(courierWebhookEvents.createdAt), limit: 15 });
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Courier management</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="ParcelDaily" value={parcelDailyConfigured() ? `configured (${process.env.PARCELDAILY_ENV === "live" ? "live" : "sandbox"})` : "not configured"} tone={parcelDailyConfigured() ? "success" : "warning"} />
        <Kpi label="ParcelDaily credit" value={credit?.amountSen != null ? rm(credit.amountSen) : "unknown"} hint={credit ? dt(credit.createdAt) : "hourly cron reads it"} />
        <Kpi label="Customer shipping charged" value={rm(Number(fin?.charged ?? 0))} />
        <Kpi label="Actual courier cost" value={rm(Number(fin?.cost ?? 0))} />
        <Kpi label="Shipping margin" value={rm(Number(fin?.charged ?? 0) - Number(fin?.cost ?? 0))} hint="charged − cost (booked orders)" />
        <Kpi label="COD fees" value={rm(Number(fin?.codFees ?? 0))} />
      </div>
      <Panel title="Providers">
        <Table
          minWidth={1000}
          head={["Provider", "API", "Enabled tenants", "Shipments", "Success", "Failed", "Returned", "Avg booking", "Courier cost", "COD"]}
          rows={(["parceldaily", "jnt", "poslaju", "ninjavan", "spx", "dhl"] as const).map((p) => {
            const r = prov.find((x) => x.p === p);
            const enabled = conns.filter((c) => c.p === p && c.st !== "DISABLED").reduce((s, c) => s + c.n, 0);
            return [COURIER_NAMES[p], <Status key="a" v={p === "parceldaily" ? (parcelDailyConfigured() ? "CONNECTED" : "AWAITING_ACCESS") : "AWAITING_ACCESS"} />, enabled, r?.total ?? 0, r?.total ? `${Math.round((r.ok / r.total) * 100)}%` : "—", r?.failed ?? 0, r?.returned ?? 0, r?.avgSec ? `${r.avgSec.toFixed(1)} s` : "—", rm(Number(r?.cost ?? 0)), r?.cod ?? 0];
          })}
        />
        <p className="mt-2 text-xs text-muted">Direct courier APIs (J&T, Pos, Ninja Van, SPX, DHL) are awaiting partner credentials and documentation; sellers record those shipments manually.</p>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Failed / unconfirmed bookings"><Table head={["Tenant", "Shipment", "Status", "Error", "Created"]} rows={failed.map(({ s, name }) => [name, <span key="i" className="font-mono text-[11px]">{s.id}</span>, <Status key="s" v={s.status} />, <span key="e" className="text-xs">{s.lastError}</span>, dt(s.createdAt)])} empty="None." minWidth={560} /></Panel>
        <Panel title="Tracking webhooks (latest)"><Table head={["Received", "Provider", "Result"]} rows={hooks.map((h) => [dt(h.createdAt), h.provider, h.result ?? "—"])} empty="No webhooks received yet." minWidth={360} /></Panel>
      </div>
    </>
  );
}
