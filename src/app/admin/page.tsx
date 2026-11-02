import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { overview } from "@/lib/admin/platform";
import { Bars, Kpi, Panel, Status, dt, rm } from "@/components/admin/ui";
import { AdminAction } from "@/components/admin/AdminAction";
import { resolveAlertAction } from "@/app/actions/admin";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const a = await requireAdmin("overview.view");
  const o = await overview(a.db);
  const k = o.kpi;
  return (
    <>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted">GMV is merchant sales — it is not SellNow revenue. Subscription, payment-fee and courier revenue are reported separately.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Tenants" value={k.totalTenants} hint={`${k.newTenants} new (30d)`} />
        <Kpi label="Active (30d)" value={k.activeTenants} />
        <Kpi label="Trial" value={k.trialTenants} />
        <Kpi label="Paid" value={k.paidTenants} />
        <Kpi label="Suspended" value={k.suspendedTenants} tone={k.suspendedTenants ? "warning" : undefined} />
        <Kpi label="MRR" value={rm(k.mrrSen)} hint="contracted; billing not yet collected" />
        <Kpi label="ARR" value={rm(k.arrSen)} />
        <Kpi label="Websites live" value={k.websitesPublished} />
        <Kpi label="Platform GMV" value={rm(k.gmvSen)} hint={`${k.paidOrders} paid orders`} />
        <Kpi label="Transaction revenue" value={rm(k.transactionRevenueSen)} hint="Selltro Pay platform fees" />
        <Kpi label="Settlement liability" value={rm(k.settlementLiabilitySen)} hint="owed to sellers" tone={k.settlementLiabilitySen > 0 ? "warning" : undefined} />
        <Kpi label="Settled to sellers" value={rm(k.settlementsCompletedSen)} />
        <Kpi label="Orders" value={k.totalOrders} />
        <Kpi label="Payment success" value={k.paymentSuccessRate == null ? "—" : `${Math.round(k.paymentSuccessRate * 100)}%`} hint="live Selltro Pay" />
        <Kpi label="AI cost" value={`US$${k.aiCostUsd.toFixed(2)}`} hint={`${k.aiCreditsUsed} credits`} />
        <Kpi label="Shipments" value={k.shipments} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Tenant growth"><Bars data={o.charts.tenantGrowth} /></Panel>
        <Panel title="GMV trend (merchant sales)"><Bars data={o.charts.gmvTrend} format={rm} /></Panel>
        <Panel title="Platform fee revenue"><Bars data={o.charts.platformFees} format={rm} /></Panel>
        <Panel title="Order volume"><Bars data={o.charts.orderTrend} /></Panel>
        <Panel title="AI cost (US$, estimated)"><Bars data={o.charts.aiTrend.map((d) => ({ m: d.m, v: d.v / 1_000_000 }))} format={(v) => `$${v.toFixed(2)}`} /></Panel>
        <Panel title="System alerts" action={<Link className="text-xs font-semibold text-primary" href="/admin/health">All →</Link>}>
          {o.alerts.length === 0 ? (
            <p className="text-sm text-muted">No open alerts.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {o.alerts.map((al) => (
                <li key={al.id} className="rounded-xl bg-canvas p-2.5">
                  <div className="flex items-center justify-between gap-2"><Status v={al.severity} /><span className="text-[11px] text-muted">{dt(al.updatedAt)}{al.count > 1 ? ` · ×${al.count}` : ""}</span></div>
                  <p className="mt-1">{al.message}</p>
                  <div className="mt-1 flex gap-2">{al.link && <Link className="text-xs font-semibold text-primary" href={al.link}>Open →</Link>}<AdminAction label="Resolve" tone="ghost" action={resolveAlertAction.bind(null, al.id)} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
