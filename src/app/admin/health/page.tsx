import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { systemHealth } from "@/lib/admin/platform";
import { Kpi, Panel, Status, Table, dt, rm } from "@/components/admin/ui";
import { AdminAction } from "@/components/admin/AdminAction";
import { resolveAlertAction } from "@/app/actions/admin";

export const metadata = { title: "System Health" };

export default async function HealthAdmin() {
  const a = await requireAdmin("health.view");
  const h = await systemHealth(a.db);
  const ok = (b: boolean) => <Status v={b ? "ok" : "warning"} />;
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">System health</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Database" value={`${h.db.latencyMs} ms`} tone="success" />
        <Kpi label="Ledger balance" value={h.db.ledger.total === 0 && h.db.ledger.unbalancedTxns === 0 ? "balanced" : "UNBALANCED"} tone={h.db.ledger.total === 0 ? "success" : "danger"} />
        <Kpi label="Selltro Pay" value={h.selltro.environment ?? "unavailable"} hint={h.selltro.liveApproved ? "live approved" : "live not approved"} />
        <Kpi label="Payouts" value={h.selltro.payoutsEnabled ? "enabled" : "disabled"} tone={h.selltro.payoutsEnabled ? "warning" : undefined} />
        <Kpi label="ParcelDaily" value={h.parceldaily.configured ? h.parceldaily.environment : "not configured"} />
        <Kpi label="AI provider" value={h.ai.provider ?? "manual mode"} hint={h.ai.model ?? undefined} />
        <Kpi label="AI errors (7d)" value={h.ai.requests7d ? `${Math.round((h.ai.failed7d / h.ai.requests7d) * 100)}%` : "—"} hint={`${h.ai.requests7d} requests`} />
        <Kpi label="Failed jobs (7d)" value={h.jobs.failed.length} tone={h.jobs.failed.length ? "warning" : undefined} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Billplz / Selltro Pay">
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt>Keys configured</dt><dd>{ok(h.selltro.billplzKeys)}</dd>
            <dt>Last verified callback</dt><dd>{dt(h.selltro.lastCallback)}</dd>
            <dt>Payment Order rail</dt><dd>{ok(h.selltro.payoutRail)}</dd>
            <dt>Last limit check</dt><dd>{h.selltro.lastFunding ? `${h.selltro.lastFunding.ok ? rm(h.selltro.lastFunding.amountSen) : "failed"} · ${dt(h.selltro.lastFunding.createdAt)}` : "—"}</dd>
          </dl>
        </Panel>
        <Panel title="ParcelDaily">
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt>Credentials</dt><dd>{ok(h.parceldaily.configured)}</dd>
            <dt>Webhook secret</dt><dd>{ok(h.parceldaily.webhookSecret)}</dd>
            <dt>Last webhook</dt><dd>{dt(h.parceldaily.lastWebhook)}</dd>
            <dt>Bookings OK (7d)</dt><dd>{h.parceldaily.bookingsOk7d}</dd>
            <dt>Failed (7d)</dt><dd>{h.parceldaily.failed7d}</dd>
            <dt>Unconfirmed</dt><dd>{h.parceldaily.pendingUnknown}</dd>
          </dl>
        </Panel>
        <Panel title="AI & jobs">
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt>Image provider</dt><dd>{ok(h.ai.imageProvider)}</dd>
            <dt>Tokens (7d)</dt><dd>{Number(h.ai.tokens7d).toLocaleString()}</dd>
            <dt>Last settlement run</dt><dd>{dt(h.jobs.lastSettlementRun)}</dd>
          </dl>
          <Table head={["Job", "Kind", "Error", "At"]} rows={h.jobs.failed.map((j) => [<span key="i" className="font-mono text-[10px]">{j.id}</span>, j.kind, j.error, dt(j.at)])} empty="No failed jobs." minWidth={360} />
        </Panel>
      </div>
      <Panel title={`Open alerts (${h.alerts.length})`}>
        <Table minWidth={800} head={["Severity", "Kind", "Message", "Count", "Updated", ""]} rows={h.alerts.map((al) => [<Status key="s" v={al.severity} />, al.kind, al.message, al.count, dt(al.updatedAt), <span key="a" className="flex gap-2">{al.link && <Link className="text-xs font-bold text-primary" href={al.link}>Open</Link>}<AdminAction label="Resolve" tone="ghost" action={resolveAlertAction.bind(null, al.id)} /></span>])} empty="All clear." />
      </Panel>
    </>
  );
}
