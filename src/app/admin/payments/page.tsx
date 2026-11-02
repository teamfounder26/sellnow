import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { orders, paymentEvents, paymentTransactions, sellerPaymentAccounts, workspaces } from "@/lib/db/schema";
import { Kpi, Panel, Status, Table, dt, rm } from "@/components/admin/ui";
import { AdminAction } from "@/components/admin/AdminAction";
import { reconcilePaymentAction } from "@/app/actions/admin";

export const metadata = { title: "Payments" };

export default async function PaymentsAdmin({ searchParams }: { searchParams: Promise<{ tx?: string; status?: string }> }) {
  const sp = await searchParams;
  const a = await requireAdmin("payments.view");
  const db = a.db;
  const [k] = await db.select({
    total: sql<number>`count(*)::int`,
    ok: sql<number>`count(*) filter (where ${paymentTransactions.status} in ('PAID','PARTIALLY_REFUNDED','REFUNDED'))::int`,
    failed: sql<number>`count(*) filter (where ${paymentTransactions.status} in ('FAILED','CANCELLED'))::int`,
    refunded: sql<number>`count(*) filter (where ${paymentTransactions.refundedSen} > 0)::int`,
    gross: sql<number>`coalesce(sum(${paymentTransactions.amountSen}) filter (where ${paymentTransactions.status} <> 'PENDING' and ${paymentTransactions.status} <> 'FAILED' and ${paymentTransactions.status} <> 'CANCELLED'),0)::bigint`,
    proc: sql<number>`coalesce(sum(${paymentTransactions.processingFeeSen}),0)::bigint`,
    plat: sql<number>`coalesce(sum(${paymentTransactions.platformFeeSen}),0)::bigint`,
    unrec: sql<number>`coalesce(sum(${paymentTransactions.amountSen}) filter (where ${paymentTransactions.reconcileStatus} <> 'matched' and ${paymentTransactions.status} = 'PAID'),0)::bigint`,
  }).from(paymentTransactions);
  const done = Number(k?.ok ?? 0) + Number(k?.failed ?? 0);
  const list = await db.select({ p: paymentTransactions, name: workspaces.name, number: orders.number }).from(paymentTransactions).innerJoin(workspaces, eq(workspaces.id, paymentTransactions.workspaceId)).innerJoin(orders, eq(orders.id, paymentTransactions.orderId)).where(sp.status ? eq(paymentTransactions.status, sp.status as "PAID") : undefined).orderBy(desc(paymentTransactions.createdAt)).limit(100);
  const queue = await db.select({ s: sellerPaymentAccounts, name: workspaces.name }).from(sellerPaymentAccounts).innerJoin(workspaces, eq(workspaces.id, sellerPaymentAccounts.workspaceId)).where(eq(sellerPaymentAccounts.status, "PENDING_VERIFICATION")).limit(50);
  const tx = sp.tx ? list.find((r) => r.p.id === sp.tx) ?? null : null;
  const hooks = tx ? await db.query.paymentEvents.findMany({ where: eq(paymentEvents.orderId, tx.p.orderId), orderBy: desc(paymentEvents.createdAt) }) : [];
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Selltro Pay</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Collections" value={Number(k?.total ?? 0)} />
        <Kpi label="Successful" value={Number(k?.ok ?? 0)} tone="success" />
        <Kpi label="Failed / cancelled" value={Number(k?.failed ?? 0)} />
        <Kpi label="Refunded" value={Number(k?.refunded ?? 0)} />
        <Kpi label="Success rate" value={done ? `${Math.round((Number(k?.ok) / done) * 100)}%` : "—"} />
        <Kpi label="Gross payment volume" value={rm(Number(k?.gross ?? 0))} hint="merchant money" />
        <Kpi label="Fees (proc. / platform)" value={`${rm(Number(k?.proc ?? 0))} / ${rm(Number(k?.plat ?? 0))}`} />
        <Kpi label="Unreconciled" value={rm(Number(k?.unrec ?? 0))} tone={Number(k?.unrec) ? "warning" : undefined} />
      </div>
      {a.can("payments.reviewSellers") && (
        <Panel title={`Seller verification queue (${queue.length})`}>
          <Table head={["Seller", "Legal name", "Type", "Submitted", ""]} rows={queue.map(({ s, name }) => [name, s.legalName, s.businessType, dt(s.submittedAt), <Link key="l" href={`/admin/tenants/${s.workspaceId}`} className="text-xs font-bold text-primary">Review →</Link>])} empty="Nobody waiting." />
        </Panel>
      )}
      {tx && (
        <Panel title={`Investigation · bill ${tx.p.billId ?? "—"}`}>
          <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <dt className="text-muted">Local status</dt><dd><Status v={tx.p.status} /></dd>
            <dt className="text-muted">Provider status</dt><dd>{tx.p.providerStatus ?? "—"}</dd>
            <dt className="text-muted">Reconcile</dt><dd><Status v={tx.p.reconcileStatus} /> {tx.p.reconcileNote}</dd>
            <dt className="text-muted">Settlement</dt><dd>{(await db.query.orders.findFirst({ where: eq(orders.id, tx.p.orderId) }))?.settlementStatus}</dd>
          </dl>
          {a.can("payments.refresh") && <div className="mt-2"><AdminAction label="Refresh from Billplz (read-only)" action={reconcilePaymentAction.bind(null, tx.p.id)} /></div>}
          <p className="mt-3 text-xs font-bold">Verified callback history</p>
          <ul className="text-xs">{hooks.map((h) => <li key={h.id} className="font-mono">{dt(h.createdAt)} · {h.provider} · {h.type} → {h.resultingStatus ?? "—"}</li>)}</ul>
          <p className="mt-2 text-xs text-muted">Payment status can't be overridden here. Corrections go through refunds or approved adjustments.</p>
        </Panel>
      )}
      <Panel title="Transactions">
        <Table
          minWidth={1150}
          head={["Bill", "Order", "Tenant", "Env", "Amount", "Status", "Provider", "Proc. fee", "Platform fee", "Reconcile", "Paid", ""]}
          rows={list.map(({ p, name, number }) => [<span key="b" className="font-mono text-[11px]">{p.billId ?? "—"}</span>, `#${number}`, name, p.environment, rm(p.amountSen), <Status key="s" v={p.status} />, p.providerStatus ?? "—", rm(p.processingFeeSen), rm(p.platformFeeSen), <Status key="r" v={p.reconcileStatus} />, dt(p.paidAt), <Link key="i" href={`/admin/payments?tx=${p.id}`} className="text-xs font-bold text-primary">Investigate</Link>])}
          empty="No Selltro Pay transactions yet."
        />
      </Panel>
    </>
  );
}
