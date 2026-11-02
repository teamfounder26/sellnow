import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { ads, integrations, adsSubscriptions } from "@/lib/db/schema";
import { metaAppConfigured } from "@/lib/ads/meta";
import { Kpi, Panel, Table } from "@/components/admin/ui";

export const metadata = { title: "Marketing & Integrations" };

export default async function IntegrationsAdmin() {
  const a = await requireAdmin("overview.view");
  const byKind = await a.db.select({ kind: integrations.kind, provider: integrations.provider, status: integrations.status, n: sql<number>`count(*)::int` }).from(integrations).groupBy(integrations.kind, integrations.provider, integrations.status);
  const adStats = await a.db.select({ status: ads.status, n: sql<number>`count(*)::int` }).from(ads).groupBy(ads.status);
  const subs = await a.db.select({ status: adsSubscriptions.status, n: sql<number>`count(*)::int` }).from(adsSubscriptions).groupBy(adsSubscriptions.status);
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Marketing & integrations</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Meta app" value={metaAppConfigured() ? "configured" : "not configured"} />
        <Kpi label="Ads (all)" value={adStats.reduce((s, r) => s + r.n, 0)} />
        <Kpi label="Ads live" value={adStats.filter((r) => r.status === "active").reduce((s, r) => s + r.n, 0)} />
        <Kpi label="Ads Studio subscriptions" value={subs.map((s) => `${s.status}: ${s.n}`).join(" · ") || "0"} />
      </div>
      <Panel title="Tenant integrations"><Table head={["Kind", "Provider", "Status", "Tenants"]} rows={byKind.map((r) => [r.kind, r.provider, r.status, r.n])} minWidth={420} empty="No integrations." /></Panel>
    </>
  );
}
