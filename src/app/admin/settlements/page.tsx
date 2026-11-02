import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { disbursementAttempts, fundingSnapshots, paymentAdjustments, paymentTransactions, settlementBatches, settlements, workspaces } from "@/lib/db/schema";
import { accountBalance } from "@/lib/finance/ledger";
import { getConfig } from "@/lib/finance/settings";
import { selltroEnvironment } from "@/lib/finance/selltro-pay";
import { payoutConfigured } from "@/lib/finance/payment-orders";
import { Kpi, Panel, Status, Table, dt, rm } from "@/components/admin/ui";
import { AdminAction } from "@/components/admin/AdminAction";
import { AdjustmentForm } from "@/components/admin/AdjustmentForm";
import { approveBatchAction, decideAdjustmentAction, executeBatchAction, holdSettlementAction, reconcileUnknownAction, releaseSettlementAction, retrySettlementAction, runCycleAction } from "@/app/actions/admin";

export const metadata = { title: "Settlements" };

export default async function SettlementsAdmin({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const sp = await searchParams;
  const a = await requireAdmin("settlements.view");
  const db = a.db;
  const cfg = await getConfig(db);
  const env = selltroEnvironment();
  const batches = await db.query.settlementBatches.findMany({ orderBy: desc(settlementBatches.createdAt), limit: 30 });
  const [agg] = await db.select({
    pendingFunding: sql<number>`coalesce(sum(${settlements.netSen}) filter (where ${settlements.status} = 'AWAITING_FUNDING'),0)::bigint`,
    ready: sql<number>`coalesce(sum(${settlements.netSen}) filter (where ${settlements.status} = 'QUEUED'),0)::bigint`,
    processing: sql<number>`coalesce(sum(${settlements.netSen}) filter (where ${settlements.status} in ('PROCESSING','UNKNOWN')),0)::bigint`,
    completed: sql<number>`coalesce(sum(${settlements.netSen}) filter (where ${settlements.status} = 'COMPLETED'),0)::bigint`,
    failed: sql<number>`count(*) filter (where ${settlements.status} = 'FAILED')::int`,
    hold: sql<number>`coalesce(sum(${settlements.netSen}) filter (where ${settlements.status} = 'ON_HOLD'),0)::bigint`,
    approval: sql<number>`coalesce(sum(${settlements.netSen}) filter (where ${settlements.status} = 'AWAITING_APPROVAL'),0)::bigint`,
  }).from(settlements);
  const [unrec] = await db.select({ s: sql<number>`coalesce(sum(${paymentTransactions.amountSen}) filter (where ${paymentTransactions.reconcileStatus} <> 'matched' and ${paymentTransactions.status} = 'PAID'),0)::bigint`, mis: sql<number>`count(*) filter (where ${paymentTransactions.reconcileStatus} = 'mismatch')::int` }).from(paymentTransactions);
  const limit = await db.query.fundingSnapshots.findFirst({ where: eq(fundingSnapshots.source, "billplz_payment_order_limit"), orderBy: desc(fundingSnapshots.createdAt) });
  const liability = -(await accountBalance(db, "seller_payable"));
  const next = Number(agg?.approval ?? 0) + Number(agg?.ready ?? 0) + Number(agg?.pendingFunding ?? 0);
  const shortfall = limit?.amountSen != null ? Math.max(0, next - limit.amountSen) : null;
  const sel = sp.batch ? batches.find((b) => b.id === sp.batch) ?? (await db.query.settlementBatches.findFirst({ where: eq(settlementBatches.id, sp.batch) })) : batches[0];
  const rows = sel ? await db.select({ s: settlements, name: workspaces.name }).from(settlements).innerJoin(workspaces, eq(workspaces.id, settlements.workspaceId)).where(eq(settlements.batchId, sel.id)) : [];
  const attempts = rows.length ? await db.query.disbursementAttempts.findMany({ where: inArray(disbursementAttempts.settlementId, rows.map((r) => r.s.id)), orderBy: desc(disbursementAttempts.attemptNo) }) : [];
  const adjustments = await db.select({ a: paymentAdjustments, name: workspaces.name }).from(paymentAdjustments).innerJoin(workspaces, eq(workspaces.id, paymentAdjustments.workspaceId)).orderBy(desc(paymentAdjustments.createdAt)).limit(30);
  const canApprove = a.can("settlements.approve");
  const canExec = a.can("settlements.execute");
  const canHold = a.can("settlements.hold");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Settlements</h1>
          <p className="text-sm text-muted">T+1 calendar-day cycle (Asia/Kuala_Lumpur) · cutoff {cfg.settlement.cutoffTime} · environment <b>{env ?? "unavailable"}</b> · payouts <b className={cfg.payoutsEnabled ? "text-success" : "text-danger"}>{cfg.payoutsEnabled ? "ENABLED" : "DISABLED"}</b>{env === "test" && " (test mode: simulated payouts only)"}</p>
        </div>
        {canExec && <AdminAction label="Run today's cycle" action={runCycleAction} />}
      </div>
      {!payoutConfigured() && env !== "test" && <p className="rounded-2xl bg-warning-soft p-3 text-sm text-warning">Billplz Payment Order is not configured (BILLPLZ_PAYMENT_ORDER_COLLECTION_ID). Batches can be calculated and approved but nothing can be disbursed.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-10">
        <Kpi label="Total liability" value={rm(liability)} hint="ledger: owed to sellers" />
        <Kpi label="Awaiting approval" value={rm(Number(agg?.approval ?? 0))} />
        <Kpi label="Pending funding" value={rm(Number(agg?.pendingFunding ?? 0))} tone={Number(agg?.pendingFunding) ? "warning" : undefined} />
        <Kpi label="Ready" value={rm(Number(agg?.ready ?? 0))} />
        <Kpi label="Processing" value={rm(Number(agg?.processing ?? 0))} />
        <Kpi label="Completed" value={rm(Number(agg?.completed ?? 0))} tone="success" />
        <Kpi label="Failed" value={Number(agg?.failed ?? 0)} tone={Number(agg?.failed) ? "danger" : undefined} />
        <Kpi label="On hold" value={rm(Number(agg?.hold ?? 0))} />
        <Kpi label="Payment Order Limit" value={limit?.amountSen != null ? rm(limit.amountSen) : env === "test" ? "simulated" : "unknown"} hint={limit ? dt(limit.createdAt) : undefined} tone={shortfall ? "danger" : undefined} />
        <Kpi label="Unreconciled" value={rm(Number(unrec?.s ?? 0))} hint={`${unrec?.mis ?? 0} mismatches`} tone={Number(unrec?.mis) ? "danger" : undefined} />
      </div>
      {shortfall ? <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">Funding shortfall {rm(shortfall)} for the next settlement liability. Nothing is moved automatically — top up the Payment Order Limit through the approved process.</p> : null}

      <Panel title="Batches">
        <Table
          minWidth={1100}
          head={["Date", "Env", "Status", "Tenants", "Items", "Gross", "Fees", "Adj.", "Net", "Approval", ""]}
          rows={batches.map((b) => [
            <Link key="d" href={`/admin/settlements?batch=${b.id}`} className="font-bold text-primary">{b.settlementDate}</Link>,
            b.environment,
            <Status key="s" v={b.status} />,
            b.tenantCount,
            b.itemCount,
            rm(b.grossSen),
            rm(b.feesSen),
            rm(b.adjustmentsSen),
            <b key="n">{rm(b.netSen)}</b>,
            b.approvedAt ? `${dt(b.approvedAt)}${b.secondApprovedAt ? " + 2nd" : b.netSen >= cfg.settlement.dualApprovalThresholdSen ? " (needs 2nd)" : ""}` : "—",
            <span key="a" className="flex flex-wrap gap-1">
              {canApprove && b.status === "AWAITING_APPROVAL" && <AdminAction label="Approve" needsPassword action={approveBatchAction.bind(null, b.id)} />}
              {canExec && ["QUEUED", "AWAITING_FUNDING", "PARTIALLY_COMPLETED"].includes(b.status) && <AdminAction label="Execute payouts" needsPassword action={executeBatchAction.bind(null, b.id)} />}
              <a className="text-xs font-semibold text-primary" href={`/api/admin/reports?kind=settlements&from=${b.settlementDate}&to=${b.settlementDate}`}>CSV</a>
            </span>,
          ])}
          empty="No batches yet. The daily worker (POST /api/cron/settlements) or “Run today's cycle” creates them."
        />
      </Panel>

      {sel && (
        <Panel title={`Batch ${sel.settlementDate} · ${sel.environment}`}>
          <Table
            minWidth={1200}
            head={["Reference", "Seller", "Status", "Gross", "Proc.", "Platform", "Refunds", "Adj.", "Net", "Bank", "Attempts", ""]}
            rows={rows.map(({ s, name }) => {
              const att = attempts.filter((x) => x.settlementId === s.id);
              return [
                <span key="r" className="font-mono text-[11px]">{s.reference}</span>,
                <Link key="n" href={`/admin/tenants/${s.workspaceId}`} className="text-primary">{name}</Link>,
                <span key="s"><Status v={s.status} />{s.holdReason && <span className="block text-[11px] text-muted">{s.holdReason}</span>}{s.lastError && <span className="block text-[11px] text-danger">{s.lastError}</span>}</span>,
                rm(s.grossSen), rm(s.processingFeeSen), rm(s.platformFeeSen), rm(s.refundsSen), rm(s.adjustmentsSen), <b key="n2">{rm(s.netSen)}</b>,
                s.bankSnapshot ? `${s.bankSnapshot.bankName} ••${s.bankSnapshot.last4}` : "—",
                <span key="t" className="text-[11px]">{att.map((x) => `#${x.attemptNo} ${x.provider} ${x.status}${x.providerId ? ` (${x.providerId})` : ""}`).join(" · ") || "—"}</span>,
                <span key="a" className="flex flex-wrap gap-1">
                  {canHold && ["AWAITING_APPROVAL", "AWAITING_FUNDING", "QUEUED"].includes(s.status) && <AdminAction label="Hold" tone="ghost" needsText action={holdSettlementAction.bind(null, s.id)} />}
                  {canHold && s.status === "ON_HOLD" && <AdminAction label="Release" needsPassword action={releaseSettlementAction.bind(null, s.id)} />}
                  {canExec && s.status === "FAILED" && <AdminAction label="Retry" needsPassword action={retrySettlementAction.bind(null, s.id)} />}
                  {canExec && s.status === "UNKNOWN" && <><AdminAction label="Confirmed paid" needsText textLabel="Evidence (Billplz ref)" needsPassword action={reconcileUnknownAction.bind(null, s.id, "completed")} /><AdminAction label="Confirmed not paid" tone="ghost" needsText textLabel="Evidence" needsPassword action={reconcileUnknownAction.bind(null, s.id, "failed")} /></>}
                </span>,
              ];
            })}
            empty="No sellers in this batch."
          />
        </Panel>
      )}

      <Panel title="Adjustments (maker ≠ checker)" action={a.can("settlements.adjust") ? <AdjustmentForm /> : undefined}>
        <Table
          head={["Seller", "Amount", "Reason", "Status", "Created", ""]}
          rows={adjustments.map(({ a: x, name }) => [name, rm(x.amountSen), x.reason, <Status key="s" v={x.status} />, dt(x.createdAt), a.can("settlements.adjust") && x.status === "pending_approval" && x.createdBy !== a.user.id ? <span key="b" className="flex gap-1"><AdminAction label="Approve" needsPassword action={decideAdjustmentAction.bind(null, x.id, true)} /><AdminAction label="Reject" tone="ghost" needsPassword action={decideAdjustmentAction.bind(null, x.id, false)} /></span> : null])}
          empty="No adjustments."
        />
      </Panel>
    </>
  );
}
