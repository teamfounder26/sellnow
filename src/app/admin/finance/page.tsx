import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { aiGenerations, orders, paymentTransactions, tenantSubscriptions } from "@/lib/db/schema";
import { accountBalance, ledgerIntegrity } from "@/lib/finance/ledger";
import { Kpi, Panel, Table, rm } from "@/components/admin/ui";

export const metadata = { title: "Revenue & Finance" };

/**
 * Revenue recognition used here (explicit):
 *  - Subscription revenue: contracted price of ACTIVE tenant subscriptions (billing not yet collected → shown as contracted MRR).
 *  - Platform transaction fee: Selltro Pay platform fee posted to the ledger at payment time (live environment).
 *  - Processing fees: recovered from sellers and passed to Billplz — neither revenue nor expense for SellNow net.
 *  - Courier margin: customer shipping − actual courier cost on booked orders (the SELLER's margin unless SellNow resells ParcelDaily).
 *  - Seller GMV and settlement liability are NOT revenue.
 */
export default async function FinanceAdmin() {
  const a = await requireAdmin("reports.view");
  const db = a.db;
  const subs = await db.select({ price: tenantSubscriptions.priceSen, cycle: tenantSubscriptions.billingCycle }).from(tenantSubscriptions).where(sql`${tenantSubscriptions.status} = 'active'`);
  const mrr = subs.reduce((s, r) => s + (r.cycle === "annual" ? Math.round(r.price / 12) : r.price), 0);
  const [fees] = await db.select({ plat: sql<number>`coalesce(sum(${paymentTransactions.platformFeeSen}),0)::bigint`, proc: sql<number>`coalesce(sum(${paymentTransactions.processingFeeSen}),0)::bigint`, refunds: sql<number>`coalesce(sum(${paymentTransactions.refundedSen}),0)::bigint` }).from(paymentTransactions).where(sql`${paymentTransactions.environment} = 'live'`);
  const [ship] = await db.select({ charged: sql<number>`coalesce(sum(${orders.shippingSen}),0)::bigint`, cost: sql<number>`coalesce(sum(${orders.courierCostSen}),0)::bigint` }).from(orders).where(sql`${orders.courierCostSen} is not null and not ${orders.isTest}`);
  const [ai] = await db.select({ micros: sql<number>`coalesce(sum(${aiGenerations.estimatedCostMicros}),0)::bigint` }).from(aiGenerations);
  const [gmv] = await db.select({ s: sql<number>`coalesce(sum(${orders.totalSen}) filter (where ${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and not ${orders.isTest}),0)::bigint` }).from(orders);
  const ledger = await ledgerIntegrity(db);
  const platformRevenue = mrr + Number(fees?.plat ?? 0);
  const arpu = subs.length ? Math.round(mrr / subs.length) : null;
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Revenue & finance</h1>
      <p className="text-sm text-muted">Merchant GMV ({rm(Number(gmv?.s ?? 0))}) is shown for context only — it is never SellNow revenue.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Subscription MRR" value={rm(mrr)} hint="contracted" />
        <Kpi label="ARR" value={rm(mrr * 12)} />
        <Kpi label="ARPU" value={rm(arpu)} />
        <Kpi label="Platform fee revenue" value={rm(Number(fees?.plat ?? 0))} hint="live Selltro Pay" />
        <Kpi label="Processing fees (pass-through)" value={rm(Number(fees?.proc ?? 0))} />
        <Kpi label="AI provider cost" value={`US$${(Number(ai?.micros ?? 0) / 1e6).toFixed(2)}`} hint="estimated" />
        <Kpi label="Gross platform revenue (MRR + fees)" value={rm(platformRevenue)} />
        <Kpi label="Seller liability (not revenue)" value={rm(-(await accountBalance(db, "seller_payable")))} />
      </div>
      <Panel title="Revenue categories">
        <Table minWidth={560} head={["Category", "Amount", "Source / definition"]} rows={[
          ["Subscription revenue (MRR)", rm(mrr), "tenant_subscriptions.price_sen, status active"],
          ["Payment processing fee revenue", rm(0), "processing fees are recovered for Billplz (pass-through)"],
          ["Platform transaction fee revenue", rm(Number(fees?.plat ?? 0)), "ledger platform_fee_revenue / payment_transactions.platform_fee_sen (live)"],
          ["Courier margin", rm(Number(ship?.charged ?? 0) - Number(ship?.cost ?? 0)), "orders.shipping − orders.courier_cost (seller-side unless ParcelDaily margin configured)"],
          ["AI credit top-ups", rm(0), "no top-up billing connected yet"],
        ]} />
      </Panel>
      <Panel title="Expense categories (available data)">
        <Table minWidth={560} head={["Category", "Amount", "Note"]} rows={[
          ["Payment provider charges", rm(Number(fees?.proc ?? 0)), "recovered from sellers"],
          ["Courier provider costs", rm(Number(ship?.cost ?? 0)), "booked shipments"],
          ["AI provider costs", `US$${(Number(ai?.micros ?? 0) / 1e6).toFixed(2)}`, "estimate from token prices"],
          ["Refunds", rm(Number(fees?.refunds ?? 0)), "deducted from seller balances"],
          ["Infrastructure / other", "—", "not tracked in-app"],
        ]} />
      </Panel>
      <Panel title="Reconciliation trail">
        <p className="text-sm">Ledger entries: {ledger.entries} · sum of all entries: <b className={ledger.total === 0 ? "text-success" : "text-danger"}>{ledger.total}</b> (must be 0) · unbalanced transactions: <b className={ledger.unbalancedTxns ? "text-danger" : "text-success"}>{ledger.unbalancedTxns}</b></p>
      </Panel>
    </>
  );
}
