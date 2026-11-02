import { desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { aiCreditLedger, aiGenerations, workspaces } from "@/lib/db/schema";
import { Kpi, Panel, Table } from "@/components/admin/ui";

export const metadata = { title: "AI Usage" };

export default async function AiAdmin() {
  const a = await requireAdmin("overview.view");
  const [k] = await a.db.select({ n: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${aiGenerations.status} = 'failed')::int`, credits: sql<number>`coalesce(sum(${aiGenerations.credits}) filter (where ${aiGenerations.status} = 'succeeded'),0)::int`, tokens: sql<number>`coalesce(sum(coalesce(${aiGenerations.inputTokens},0)+coalesce(${aiGenerations.outputTokens},0)),0)::bigint`, micros: sql<number>`coalesce(sum(${aiGenerations.estimatedCostMicros}),0)::bigint` }).from(aiGenerations);
  const byModel = await a.db.select({ model: aiGenerations.model, task: aiGenerations.task, n: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${aiGenerations.status} = 'failed')::int`, tokens: sql<number>`coalesce(sum(coalesce(${aiGenerations.inputTokens},0)+coalesce(${aiGenerations.outputTokens},0)),0)::bigint`, micros: sql<number>`coalesce(sum(${aiGenerations.estimatedCostMicros}),0)::bigint` }).from(aiGenerations).groupBy(aiGenerations.model, aiGenerations.task).orderBy(desc(sql`count(*)`));
  const byTenant = await a.db.select({ name: workspaces.name, n: sql<number>`count(*)::int`, credits: sql<number>`coalesce(sum(${aiGenerations.credits}) filter (where ${aiGenerations.status} = 'succeeded'),0)::int` }).from(aiGenerations).innerJoin(workspaces, eq(workspaces.id, aiGenerations.workspaceId)).groupBy(workspaces.name).orderBy(desc(sql`count(*)`)).limit(25);
  const [topups] = await a.db.select({ n: sql<number>`count(*) filter (where ${aiCreditLedger.reason} = 'topup')::int` }).from(aiCreditLedger);
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">AI usage & credits</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Generations" value={Number(k?.n ?? 0)} /><Kpi label="Failure rate" value={k?.n ? `${Math.round((Number(k.failed) / Number(k.n)) * 100)}%` : "—"} /><Kpi label="Credits used" value={Number(k?.credits ?? 0)} /><Kpi label="Tokens" value={Number(k?.tokens ?? 0).toLocaleString()} /><Kpi label="Est. provider cost" value={`US$${(Number(k?.micros ?? 0) / 1e6).toFixed(2)}`} hint="only when token prices are configured" /><Kpi label="Credit top-ups" value={Number(topups?.n ?? 0)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="By model & task"><Table head={["Model", "Task", "Runs", "Failed", "Tokens", "US$"]} rows={byModel.map((r) => [r.model, r.task, r.n, r.failed, Number(r.tokens).toLocaleString(), (Number(r.micros) / 1e6).toFixed(3)])} minWidth={560} /></Panel>
        <Panel title="By tenant"><Table head={["Tenant", "Runs", "Credits"]} rows={byTenant.map((r) => [r.name, r.n, r.credits])} minWidth={360} /></Panel>
      </div>
    </>
  );
}
