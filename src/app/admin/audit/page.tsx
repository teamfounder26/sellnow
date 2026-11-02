import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { auditLogs } from "@/lib/db/schema";
import { Panel, Table, dt } from "@/components/admin/ui";

export const metadata = { title: "Audit" };

export default async function AuditAdmin({ searchParams }: { searchParams: Promise<{ q?: string; ws?: string; platform?: string }> }) {
  const sp = await searchParams;
  const a = await requireAdmin("audit.view");
  const rows = await a.db.query.auditLogs.findMany({ where: and(sp.q ? ilike(auditLogs.action, `%${sp.q}%`) : undefined, sp.ws ? eq(auditLogs.workspaceId, sp.ws) : undefined, sp.platform ? isNull(auditLogs.workspaceId) : undefined), orderBy: desc(auditLogs.createdAt), limit: 300 });
  return (
    <Panel title="Audit trail (immutable)">
      <form className="mb-3 flex flex-wrap gap-2 text-sm" action="/admin/audit">
        <input name="q" defaultValue={sp.q} placeholder="action contains… (e.g. admin.settlement)" className="h-9 w-72 rounded-xl border border-line bg-white px-3" />
        <input name="ws" defaultValue={sp.ws} placeholder="tenant id" className="h-9 w-40 rounded-xl border border-line bg-white px-3" />
        <label className="flex items-center gap-1"><input type="checkbox" name="platform" value="1" defaultChecked={Boolean(sp.platform)} /> platform-level only</label>
        <button className="h-9 rounded-xl bg-ink px-4 font-semibold text-white">Filter</button>
      </form>
      <Table minWidth={1000} head={["When", "Action", "Tenant", "Actor", "Target", "Data"]} rows={rows.map((r) => [dt(r.createdAt), <code key="a" className="text-xs">{r.action}</code>, <span key="w" className="font-mono text-[10px]">{r.workspaceId ?? "platform"}</span>, <span key="u" className="font-mono text-[10px]">{r.actorUserId ?? "system"}</span>, r.entity ? `${r.entity}:${r.entityId}` : "—", <code key="d" className="block max-w-md truncate text-[10px]">{JSON.stringify(r.data)}</code>])} />
    </Panel>
  );
}
