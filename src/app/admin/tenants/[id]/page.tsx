import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { tenantActivity, tenantDetail } from "@/lib/admin/platform";
import { listPlans } from "@/lib/admin/packages";
import { settlementHolds } from "@/lib/db/schema";
import { Kpi, Panel, Status, Table, dt, rm } from "@/components/admin/ui";
import { AdminAction } from "@/components/admin/AdminAction";
import { TenantPlanForm } from "@/components/admin/TenantPlanForm";
import { releaseSellerHoldAction, reviewBankAction, reviewSellerAction, sellerHoldAction, suspendTenantAction, tenantNoteAction, unsuspendTenantAction } from "@/app/actions/admin";

export const metadata = { title: "Tenant" };

export default async function TenantDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireAdmin("tenants.view");
  const d = await tenantDetail(a.db, id);
  if (!d) notFound();
  const [activity, plans, holds] = await Promise.all([tenantActivity(a.db, id), listPlans(a.db), a.db.query.settlementHolds.findMany({ where: and(eq(settlementHolds.workspaceId, id), isNull(settlementHolds.releasedAt)) })]);
  const sensitive = a.can("tenants.viewSensitive");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/tenants" className="text-xs font-semibold text-muted">← Tenants</Link>
          <h1 className="text-2xl font-extrabold tracking-tight">{d.w.name} {d.w.suspendedAt && <Status v="suspended" />}</h1>
          <p className="font-mono text-xs text-muted">{d.w.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.can("tenants.suspend") && (d.w.suspendedAt ? <AdminAction label="Unsuspend" needsPassword action={unsuspendTenantAction.bind(null, id)} /> : <AdminAction label="Suspend tenant" tone="danger" needsText needsPassword action={suspendTenantAction.bind(null, id)} />)}
          {a.can("settlements.hold") && <AdminAction label="Hold payouts" tone="ghost" needsText action={sellerHoldAction.bind(null, id)} />}
        </div>
      </div>
      {d.w.suspendedReason && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">Suspended: {d.w.suspendedReason}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="A · Business & subscription">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Owner</dt><dd>{d.owner?.name} · {sensitive || a.can("tenants.notes") ? d.owner?.email : "hidden"} {d.owner?.verified ? <Status v="VERIFIED" /> : <Status v="PENDING" />}</dd>
            <dt className="text-muted">Members</dt><dd>{d.members.map((m) => `${m.name} (${m.role})`).join(", ")}</dd>
            <dt className="text-muted">Category</dt><dd>{d.w.category ?? "—"}</dd>
            <dt className="text-muted">Plan</dt><dd>{d.plan?.name ?? d.w.plan} {d.sub && <><Status v={d.sub.status} /> · {rm(d.sub.priceSen)}/{d.sub.billingCycle}</>}</dd>
            <dt className="text-muted">Overrides</dt><dd>{d.overrides.length ? d.overrides.map((o) => `${o.key}=${JSON.stringify(o.value)}`).join(", ") : "—"}</dd>
          </dl>
          {a.can("tenants.planOverride") && <TenantPlanForm workspaceId={id} plans={plans.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }))} />}
        </Panel>
        <Panel title="B · Website">
          {d.website ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Store</dt><dd><a className="text-primary" href={`/s/${d.website.slug}`} target="_blank" rel="noreferrer">/s/{d.website.slug}</a></dd>
              <dt className="text-muted">Status</dt><dd><Status v={d.website.published ? "published" : d.website.status} /></dd>
              <dt className="text-muted">Domain</dt><dd>{d.website.domain ?? "—"}</dd>
              <dt className="text-muted">Last published</dt><dd>{dt(d.website.publishedAt)}</dd>
              <dt className="text-muted">Last visited</dt><dd>{dt(d.website.viewedAt)}</dd>
            </dl>
          ) : <p className="text-sm text-muted">No website.</p>}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="C · Orders" value={d.sales.orders} />
        <Kpi label="Paid orders" value={d.sales.paid} />
        <Kpi label="Paid sales" value={rm(d.sales.paidSen)} />
        <Kpi label="Refunds" value={rm(d.sales.refundsSen)} />
        <Kpi label="COD orders" value={d.sales.cod} />
        <Kpi label="AOV" value={rm(d.sales.aovSen)} />
      </div>

      <Panel title="D · Financial (Selltro Pay)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Collected" value={rm(d.finance.collectedSen)} />
          <Kpi label="Processing fees" value={rm(d.finance.processingFeesSen)} />
          <Kpi label="Platform fees" value={rm(d.finance.platformFeesSen)} />
          <Kpi label="Owed to seller" value={rm(d.finance.liabilitySen)} />
          <Kpi label="Open holds" value={holds.length} tone={holds.length ? "warning" : undefined} />
        </div>
        {holds.map((h) => <p key={h.id} className="mt-2 flex items-center gap-2 text-sm">Hold: {h.reason} · {dt(h.createdAt)} {a.can("settlements.hold") && <AdminAction label="Release" needsPassword action={releaseSellerHoldAction.bind(null, h.id)} />}</p>)}
        {d.finance.account && (
          <div className="mt-3 rounded-2xl bg-canvas p-3 text-sm">
            <p className="font-bold">Seller account <Status v={d.finance.account.status} /></p>
            <p>{d.finance.account.legalName} · {d.finance.account.businessType} · SSM {d.finance.account.registrationNumber ?? "—"} · ID ••{d.finance.account.idLast4}</p>
            {a.can("payments.reviewSellers") && (
              <div className="mt-2 flex flex-wrap gap-2">
                <AdminAction label="Approve account" needsText textLabel="Review note" action={reviewSellerAction.bind(null, id, "approve")} />
                <AdminAction label="Restrict" tone="ghost" needsText textLabel="Review note" action={reviewSellerAction.bind(null, id, "restrict")} />
                <AdminAction label="Suspend" tone="danger" needsText textLabel="Review note" action={reviewSellerAction.bind(null, id, "suspend")} />
              </div>
            )}
          </div>
        )}
        <div className="mt-3">
          <Table
            head={["Bank", "Holder", "Status", "Current", "Added", ""]}
            rows={d.finance.banks.map((b) => [`${b.bankName} •••• ${b.last4}`, b.holderName, <Status key="s" v={b.status} />, b.current ? "yes" : "no", dt(b.createdAt), a.can("payments.reviewSellers") && b.current && b.status !== "VERIFIED" ? <span key="a" className="flex gap-1"><AdminAction label="Verify" needsText textLabel="How verified" needsPassword action={reviewBankAction.bind(null, b.id, "verify")} /><AdminAction label="Reject" tone="ghost" needsText needsPassword action={reviewBankAction.bind(null, b.id, "reject")} /></span> : null])}
            empty="No bank accounts."
          />
        </div>
        <div className="mt-3">
          <Table head={["Reference", "Date", "Net", "Status", "Completed"]} rows={d.finance.settlements.map((s) => [<span key="r" className="font-mono text-xs">{s.reference}</span>, s.scheduledFor, rm(s.netSen), <Status key="s" v={s.status} />, dt(s.completedAt)])} empty="No settlements." />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="E · Courier">
          <p className="text-sm">{d.courier.connections.map((c) => `${c.provider}: ${c.status}${c.isDefault ? " (default)" : ""}`).join(" · ") || "No connections"}</p>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="Shipments" value={d.courier.total} /><Kpi label="Failed" value={d.courier.failed} /><Kpi label="Courier cost" value={rm(d.courier.costSen)} /><Kpi label="ParcelDaily" value={d.courier.parceldaily} /><Kpi label="COD" value={d.courier.cod} /></div>
        </Panel>
        <Panel title="F · AI">
          <Table head={["Task", "Model", "Runs", "Failed", "Credits", "Tokens", "Est. US$"]} rows={d.ai.map((r) => [r.task, r.model, r.c, r.failed, r.credits, Number(r.tokens).toLocaleString(), (Number(r.micros) / 1e6).toFixed(3)])} empty="No AI usage." minWidth={560} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="G · Activity">
          <ul className="max-h-96 space-y-1 overflow-auto text-xs">{activity.map((e) => <li key={e.id} className="flex justify-between gap-2 rounded-lg bg-canvas px-2 py-1"><code>{e.type}</code><span className="text-muted">{dt(e.at)}</span></li>)}</ul>
        </Panel>
        <Panel title="H · Support & administration">
          {a.can("tenants.notes") && <div className="mb-2 flex flex-wrap gap-2"><AdminAction label="Add note" tone="ghost" needsText textLabel="Note" action={tenantNoteAction.bind(null, id, "note")} /><AdminAction label="Flag risk" tone="danger" needsText textLabel="Risk details" action={tenantNoteAction.bind(null, id, "risk_flag")} /><AdminAction label="Support issue" tone="ghost" needsText textLabel="Issue" action={tenantNoteAction.bind(null, id, "support")} /></div>}
          <ul className="space-y-1 text-sm">{d.notes.map((n) => <li key={n.id} className="rounded-lg bg-canvas px-2 py-1"><Status v={n.kind === "risk_flag" ? "flagged" : n.kind} /> {n.body} <span className="text-[11px] text-muted">{dt(n.createdAt)}</span></li>)}</ul>
          <p className="mt-3 text-xs font-bold">Billing history</p>
          <ul className="text-xs text-muted">{d.bills.map((b) => <li key={b.id}>{dt(b.createdAt)} · {b.type} · {JSON.stringify(b.data)}</li>)}</ul>
        </Panel>
      </div>
    </>
  );
}
