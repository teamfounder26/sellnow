import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Download, Receipt } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { formatMYR } from "@/lib/money";
import { shipments, orders } from "@/lib/db/schema";
import { ORDER_TABS, searchOrders, tabCounts, type OrderTab } from "@/lib/orders/service";
import { Badge, Card, EmptyState, Input, Select, SectionHeader, cx } from "@/components/ui";
import { OrdersBoard } from "@/components/commerce/OrdersBoard";

export const metadata = { title: "Orders" };
const SERVICES = [
  { service: "jnt", courierName: "J&T Express" },
  { service: "poslaju", courierName: "Pos Laju" },
  { service: "ninjavan", courierName: "Ninja Van" },
  { service: "dhl", courierName: "DHL eCommerce" },
  { service: "citylink", courierName: "City-Link" },
  { service: "spx", courierName: "SPX Express" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // V2 links used ?status=PAID etc. — keep them working as payment filters.
  const tab: OrderTab = (ORDER_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as OrderTab) : "all";
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const f = { tab, q: sp.q, from: sp.from, to: sp.to, payment: sp.payment ?? sp.status, method: sp.method, courier: sp.courier };
  const [rows, counts] = await Promise.all([searchOrders(db, workspace.id, f), tabCounts(db, workspace.id)]);
  const qs = new URLSearchParams(Object.entries({ ...f, tab }).filter(([, v]) => v) as [string, string][]).toString();
  const canEdit = role !== "viewer";
  const pdConnected = Boolean(await db.query.courierConnections.findFirst({ where: (c, { and: a, eq: e }) => a(e(c.workspaceId, workspace.id), e(c.provider, "parceldaily"), e(c.status, "CONNECTED")) }));

  const tabsBar = (
    <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1" aria-label={t("orders.title")}>
      {ORDER_TABS.map((k) => (
        <Link key={k} href={k === "all" ? "/dashboard/orders" : `/dashboard/orders?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cx("whitespace-nowrap rounded-pill px-3.5 py-1.5 text-sm font-semibold", tab === k ? "bg-primary text-white" : "bg-white/80 text-muted ring-1 ring-line")}>
          {t(`orders.tabs.${k}`)}
          {k !== "shipments" && counts[k] ? <span className="ml-1.5 opacity-70">{counts[k]}</span> : null}
        </Link>
      ))}
    </nav>
  );

  if (tab === "shipments") {
    const list = await db.select({ s: shipments, number: orders.number }).from(shipments).innerJoin(orders, eq(orders.id, shipments.orderId)).where(and(eq(shipments.workspaceId, workspace.id))).orderBy(desc(shipments.createdAt)).limit(200);
    return (
      <>
        <SectionHeader title={t("orders.title")} sub={t("orders.sub")} />
        {tabsBar}
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wider text-muted"><tr><th className="px-3 py-3">{t("orders.number")}</th><th className="px-3 py-3">{t("orders.col.courier")}</th><th className="px-3 py-3">{t("orders.col.tracking")}</th><th className="px-3 py-3">{t("common.status")}</th><th className="px-3 py-3 text-right">{t("orders.courierActual")}</th><th className="px-3 py-3">{t("orders.awb")}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map(({ s, number }) => (
                <tr key={s.id}>
                  <td className="px-3 py-3 font-bold"><Link className="hover:underline" href={`/dashboard/orders/${s.orderId}`}>#{number}</Link></td>
                  <td className="px-3 py-3">{s.courierName ?? s.provider}{s.providerStatus === "manual" && <Badge className="ml-1">manual</Badge>}</td>
                  <td className="px-3 py-3 font-mono text-xs">{s.trackingNumber ?? "—"}</td>
                  <td className="px-3 py-3"><Badge tone={s.status === "FAILED" ? "danger" : s.status === "DELIVERED" ? "success" : "neutral"}>{t(`orders.shipStatus.${s.status}`)}</Badge>{s.lastError && <p className="text-xs text-danger">{s.lastError}</p>}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{s.courierCostSen != null ? formatMYR(s.courierCostSen, locale) : "—"}</td>
                  <td className="px-3 py-3">{s.awbAssetId && <a className="text-primary hover:underline" href={`/api/shipments/awb?ids=${s.id}`} target="_blank" rel="noreferrer">PDF</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title={t("orders.title")}
        sub={t("orders.sub")}
        action={canEdit && rows.length > 0 ? <a href={`/api/orders/export?${qs}`} className="inline-flex h-10 items-center gap-2 rounded-pill bg-white px-4 text-sm font-semibold ring-1 ring-line"><Download className="size-4" /> {t("orders.export")}</a> : undefined}
      />
      {tabsBar}
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6" action="/dashboard/orders">
        <input type="hidden" name="tab" value={tab} />
        <Input name="q" defaultValue={sp.q} placeholder={t("orders.search")} className="lg:col-span-2" aria-label={t("orders.search")} />
        <Input type="date" name="from" defaultValue={sp.from} aria-label={t("orders.from")} />
        <Input type="date" name="to" defaultValue={sp.to} aria-label={t("orders.to")} />
        <Select name="method" defaultValue={sp.method ?? ""} aria-label={t("orders.anyMethod")}>
          <option value="">{t("orders.anyMethod")}</option>
          {(["online", "cod", "manual_transfer"] as const).map((m) => <option key={m} value={m}>{t(`orders.method.${m}`)}</option>)}
        </Select>
        <div className="flex gap-2">
          <Select name="payment" defaultValue={f.payment ?? ""} aria-label={t("orders.anyPayment")}>
            <option value="">{t("orders.anyPayment")}</option>
            {["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"].map((s) => <option key={s} value={s}>{t(`orders.status.${s}`)}</option>)}
          </Select>
          <button className="rounded-pill bg-ink px-4 text-sm font-semibold text-white">{t("orders.filter")}</button>
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={<Receipt className="size-6" />} title={t("orders.empty")} body={t("orders.emptyBody")} />
      ) : (
        <OrdersBoard
          canEdit={canEdit}
          services={pdConnected ? SERVICES : []}
          rows={rows.map((r) => ({
            id: r.order.id,
            number: r.order.number,
            createdAt: r.order.createdAt.toISOString(),
            customer: r.customer.name,
            phone: r.customer.phone,
            product: r.items.map((i) => i.name).join(", "),
            quantity: r.quantity,
            totalSen: r.order.totalSen,
            shippingSen: r.order.shippingSen,
            method: r.order.paymentMethod,
            paymentStatus: r.order.paymentStatus,
            fulfillment: r.order.fulfillmentStatus,
            courier: r.shipment ? (r.shipment.courierName ?? r.shipment.provider) : null,
            tracking: r.shipment?.trackingNumber ?? null,
            shipmentId: r.shipment?.id ?? null,
            hasAwb: Boolean(r.shipment?.awbAssetId),
            isTest: r.order.isTest,
          }))}
        />
      )}
    </>
  );
}
