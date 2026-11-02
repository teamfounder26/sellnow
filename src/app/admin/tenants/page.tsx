import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { tenantDirectory } from "@/lib/admin/platform";
import { Panel, Status, Table, dt, rm } from "@/components/admin/ui";

export const metadata = { title: "Tenants" };

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string; status?: string }> }) {
  const sp = await searchParams;
  const a = await requireAdmin("tenants.view");
  const rows = await tenantDirectory(a.db, { q: sp.q, plan: sp.plan, status: sp.status, limit: 200 });
  const showEmail = a.can("tenants.viewSensitive") || a.can("tenants.notes");
  return (
    <Panel title={`Tenants (${rows.length})`}>
      <form className="mb-3 flex flex-wrap gap-2" action="/admin/tenants">
        <input name="q" defaultValue={sp.q} placeholder="Search business, tenant id or owner email" className="h-9 w-72 rounded-xl border border-line bg-white px-3 text-sm" />
        <select name="plan" defaultValue={sp.plan ?? ""} className="h-9 rounded-xl border border-line bg-white px-2 text-sm"><option value="">All plans</option>{["free", "launch", "growth", "enterprise"].map((p) => <option key={p}>{p}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-xl border border-line bg-white px-2 text-sm"><option value="">Any status</option><option value="suspended">Suspended</option></select>
        <button className="h-9 rounded-xl bg-ink px-4 text-sm font-semibold text-white">Filter</button>
      </form>
      <Table
        minWidth={1400}
        head={["Tenant", "Owner", "Registered", "Plan", "Subscription", "Website", "Selltro Pay", "Couriers", "Last active", "Orders", "GMV", "Platform fees", "AI credits", "Risk"]}
        rows={rows.map((r) => [
          <Link key="n" href={`/admin/tenants/${r.id}`} className="font-bold text-primary hover:underline">{r.name}<span className="block font-mono text-[10px] text-muted">{r.id}</span></Link>,
          <span key="o">{r.owner.name}<span className="block text-xs text-muted">{showEmail ? r.owner.email : r.owner.email.replace(/^(.).*(@.*)$/, "$1***$2")}</span></span>,
          dt(r.createdAt),
          r.plan,
          <Status key="s" v={r.subscription} />,
          <Status key="w" v={r.website} />,
          <Status key="p" v={r.payment} />,
          r.couriers,
          dt(r.lastActive),
          r.orders,
          rm(r.gmvSen),
          rm(r.platformFeesSen),
          r.aiCredits,
          <Status key="r" v={r.risk} />,
        ])}
      />
    </Panel>
  );
}
