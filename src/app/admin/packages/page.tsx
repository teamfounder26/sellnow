import { requireAdmin } from "@/lib/admin/guard";
import { listPlans } from "@/lib/admin/packages";
import { Panel } from "@/components/admin/ui";
import { PlanEditor } from "@/components/admin/PlanEditor";
import { sql } from "drizzle-orm";
import { tenantSubscriptions, workspaces } from "@/lib/db/schema";

export const metadata = { title: "Packages" };

export default async function PackagesAdmin() {
  const a = await requireAdmin("packages.view");
  const plans = await listPlans(a.db);
  const counts = await a.db.select({ plan: workspaces.plan, n: sql<number>`count(*)::int` }).from(workspaces).groupBy(workspaces.plan);
  const subs = await a.db.select({ status: tenantSubscriptions.status, n: sql<number>`count(*)::int` }).from(tenantSubscriptions).groupBy(tenantSubscriptions.status);
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Subscriptions & packages</h1>
      <p className="text-sm text-muted">Limits are enforced on the server from these records. Price changes apply to new subscriptions — existing tenants keep their locked price. Subscription billing collection isn&apos;t connected yet.</p>
      <Panel title="Subscriptions by status"><p className="text-sm">{subs.map((s) => `${s.status}: ${s.n}`).join(" · ") || "No subscription records yet (all tenants on their workspace plan)."}</p></Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((p) => (
          <Panel key={p.id} title={`${p.name} · ${counts.find((c) => c.plan === p.id)?.n ?? 0} tenants`}>
            <PlanEditor plan={{ id: p.id, name: p.name, status: p.status, monthlySen: p.monthlySen, annualSen: p.annualSen, trialDays: p.trialDays, monthlyCredits: p.monthlyCredits, transactionFeeBps: p.transactionFeeBps, entitlements: p.entitlements, sortOrder: p.sortOrder }} canEdit={a.can("packages.edit")} />
          </Panel>
        ))}
        {a.can("packages.edit") && <Panel title="New package"><PlanEditor plan={null} canEdit /></Panel>}
      </div>
    </>
  );
}
