import { requireAdmin } from "@/lib/admin/guard";
import { adminUsers, usageAnalytics } from "@/lib/admin/platform";
import { ADMIN_ROLES } from "@/lib/admin/permissions";
import { Kpi, Panel, Status, Table, dt } from "@/components/admin/ui";
import { AdminRoleForm } from "@/components/admin/AdminRoleForm";

export const metadata = { title: "Users & Access" };

export default async function UsersAdmin() {
  const a = await requireAdmin("overview.view");
  const [admins, u] = await Promise.all([adminUsers(a.db), usageAnalytics(a.db)]);
  const rows = ((admins as unknown as { rows?: Record<string, unknown>[] }).rows ?? (admins as unknown as Record<string, unknown>[])) as { user_id: string; role: string; status: string; created_at: string; email: string; name: string }[];
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Users & access</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Daily active tenants" value={u.dau} />
        <Kpi label="Weekly active" value={u.wau} />
        <Kpi label="Monthly active" value={u.mau} />
        <Kpi label="Dormant (30d)" value={u.dormantTenants} />
        <Kpi label="Tenants" value={u.totalTenants} />
        <Kpi label="Median h → website" value={u.medianHoursToFirstWebsite == null ? "—" : u.medianHoursToFirstWebsite.toFixed(1)} />
        <Kpi label="Median h → first sale" value={u.medianHoursToFirstSale == null ? "—" : u.medianHoursToFirstSale.toFixed(1)} />
      </div>
      <Panel title="Activation funnel (tenants that reached each step)">
        <Table head={["Step", "Tenants", "% of all"]} rows={u.funnel.map((f) => [f.name, f.tenants, u.totalTenants ? `${Math.round((f.tenants / u.totalTenants) * 100)}%` : "—"])} minWidth={420} />
      </Panel>
      <Panel title="Platform admins" action={a.can("admins.manage") ? <AdminRoleForm roles={ADMIN_ROLES} /> : undefined}>
        <Table head={["Name", "Email", "Role", "Status", "Since"]} rows={rows.map((r) => [r.name, r.email, <b key="r">{r.role}</b>, <Status key="s" v={r.status} />, dt(r.created_at)])} minWidth={560} />
        <p className="mt-2 text-xs text-muted">Roles: owner (full) · finance (payments, settlements, adjustments) · operations (tenants, couriers) · support (read + notes) · analyst (read-only reports) · technical (integrations & health). MFA is not yet available — require it at the identity provider before production.</p>
      </Panel>
    </>
  );
}
