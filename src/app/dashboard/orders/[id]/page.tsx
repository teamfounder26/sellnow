import { notFound } from "next/navigation";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getOrder } from "@/lib/commerce/orders";
import { formatMYR } from "@/lib/money";
import { Badge, Card } from "@/components/ui";
import { PaymentStatus } from "@/components/orders/PaymentStatus";
import { OrderActions } from "@/components/orders/OrderActions";
import { AppError } from "@/lib/errors";
import { OrderOps } from "@/components/commerce/OrderOps";
import { orderFinance, orderTimeline } from "@/lib/orders/service";
import { pushBlocker, shipmentsForOrder } from "@/lib/couriers/service";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const data = await getOrder(db, workspace.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { order: o, items, customer, events, entitlements } = data;
  const [fin, timeline, ships, blocker, pd] = await Promise.all([
    orderFinance(db, workspace.id, o.id),
    orderTimeline(db, workspace.id, o.id),
    shipmentsForOrder(db, workspace.id, o.id),
    pushBlocker(db, o),
    db.query.courierConnections.findFirst({ where: (c, { and: a, eq: e }) => a(e(c.workspaceId, workspace.id), e(c.provider, "parceldaily"), e(c.status, "CONNECTED")) }),
  ]);
  const live = ships.find((s) => s.status !== "CANCELLED" && s.status !== "FAILED") ?? null;
  const rule = o.shippingRuleSnapshot as { name?: string } | null;
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "medium", timeZone: workspace.timezone });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/orders" className="text-sm font-semibold text-muted hover:text-ink">← {t("orders.title")}</Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">#{o.number}</h1>
        <PaymentStatus status={o.paymentStatus} label={t(`orders.status.${o.paymentStatus}`)} />
        <Badge>{t(`orders.fstatus.${o.fulfillmentStatus}`)}</Badge>
        <Badge tone="blue">{t(`orders.ostatus.${o.orderStatus}`)}</Badge>
        <Badge>{t(`orders.method.${o.paymentMethod}`)}</Badge>
        {o.isTest && <Badge tone="warning">{t("orders.testBadge")}</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="p-5">
            <p className="font-bold">{t("orders.items")}</p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <span>{i.quantity}× {i.name}</span>
                  <span className="font-semibold">{formatMYR(i.totalSen, locale)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{t("checkout.subtotal")}</dt><dd>{formatMYR(o.subtotalSen, locale)}</dd></div>
              {o.discountSen > 0 && <div className="flex justify-between"><dt className="text-muted">{t("checkout.discount")}</dt><dd>−{formatMYR(o.discountSen, locale)}</dd></div>}
              {o.deliveryMethod && <div className="flex justify-between"><dt className="text-muted">{t("checkout.shippingFee")}</dt><dd>{formatMYR(o.shippingSen, locale)}</dd></div>}
              <div className="flex justify-between text-base font-extrabold"><dt>{t("common.total")}</dt><dd>{formatMYR(o.totalSen, locale)}</dd></div>
              {o.refundedSen > 0 && <div className="flex justify-between text-danger"><dt>{t("orders.refund")}</dt><dd>−{formatMYR(o.refundedSen, locale)}</dd></div>}
            </dl>
          </Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="space-y-2 p-5 text-sm">
              <p className="font-bold">{t("orders.paymentTitle")}</p>
              <dl className="space-y-1">
                <div className="flex justify-between"><dt className="text-muted">{t("orders.col.method")}</dt><dd>{t(`orders.method.${o.paymentMethod}`)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{t("orders.col.payment")}</dt><dd>{t(`orders.status.${o.paymentStatus}`)}</dd></div>
                {(fin.ptx?.billId ?? o.providerRef) && <div className="flex justify-between gap-2"><dt className="text-muted">{t("orders.ref")}</dt><dd className="truncate font-mono text-xs">{fin.ptx?.billId ?? o.providerRef}</dd></div>}
                <div className="flex justify-between"><dt className="text-muted">{t("common.total")}</dt><dd>{formatMYR(fin.paidSen, locale)} / {formatMYR(o.totalSen, locale)}</dd></div>
                {o.paymentMethod === "cod" && <div className="flex justify-between"><dt className="text-muted">{t("orders.codTitle")}</dt><dd>{t(`orders.cstatus.${o.codStatus}`)}</dd></div>}
                {o.provider === "selltro_pay" && <div className="flex justify-between"><dt className="text-muted">{t("orders.settlement")}</dt><dd>{t(`orders.sstatus.${o.settlementStatus}`)}</dd></div>}
              </dl>
            </Card>
            <Card className="space-y-2 p-5 text-sm">
              <p className="font-bold">{t("orders.shippingTitle")}</p>
              <dl className="space-y-1">
                {live && <div className="flex justify-between"><dt className="text-muted">{t("orders.col.courier")}</dt><dd>{live.courierName ?? live.provider}{live.serviceCode ? ` · ${live.serviceCode}` : ""}</dd></div>}
                {o.weightGrams != null && <div className="flex justify-between"><dt className="text-muted">{t("orders.weight")}</dt><dd>{o.weightGrams} g</dd></div>}
                {rule?.name && <div className="flex justify-between"><dt className="text-muted">{t("orders.rule")}</dt><dd>{rule.name}</dd></div>}
                {live?.trackingNumber && <div className="flex justify-between"><dt className="text-muted">{t("orders.col.tracking")}</dt><dd className="font-mono text-xs">{live.trackingNumber}</dd></div>}
                {live && <div className="flex justify-between"><dt className="text-muted">{t("common.status")}</dt><dd>{t(`orders.shipStatus.${live.status}`)}</dd></div>}
              </dl>
              {live && live.events.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-muted">
                  {live.events.slice(0, 6).map((e) => <li key={e.id}>{fmt.format(e.occurredAt)} · {t(`orders.shipStatus.${e.status}`)}{e.providerStatus && e.providerStatus !== e.status ? ` (${e.providerStatus})` : ""}</li>)}
                </ul>
              )}
            </Card>
          </div>
          <Card className="p-5 text-sm">
            <p className="font-bold">{t("orders.financeTitle")}</p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <div className="flex justify-between"><dt className="text-muted">{t("orders.subtotal")}</dt><dd>{formatMYR(o.subtotalSen, locale)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("orders.discount")}</dt><dd>−{formatMYR(o.discountSen, locale)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("orders.customerShipping")}</dt><dd>{formatMYR(o.shippingSen, locale)}</dd></div>
              {o.codFeeSen > 0 && <div className="flex justify-between"><dt className="text-muted">{t("orders.codFee")}</dt><dd>{formatMYR(o.codFeeSen, locale)}</dd></div>}
              <div className="flex justify-between font-bold"><dt>{t("orders.total")}</dt><dd>{formatMYR(o.totalSen, locale)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("orders.refunded")}</dt><dd>{formatMYR(o.refundedSen, locale)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("orders.courierActual")}</dt><dd>{o.courierCostSen != null ? formatMYR(o.courierCostSen, locale) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("orders.shippingDiff")}</dt><dd className={fin.shippingDifferenceSen != null && fin.shippingDifferenceSen < 0 ? "text-danger" : ""}>{fin.shippingDifferenceSen != null ? formatMYR(fin.shippingDifferenceSen, locale) : "—"}</dd></div>
              {fin.ptx && <div className="flex justify-between"><dt className="text-muted">{t("earn.procFee")} / {t("earn.platFee")}</dt><dd>{formatMYR(fin.ptx.processingFeeSen, locale)} / {formatMYR(fin.ptx.platformFeeSen, locale)}</dd></div>}
            </dl>
          </Card>
          {timeline.length > 0 && (
            <Card className="p-5">
              <p className="font-bold">{t("orders.timeline")}</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {timeline.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-canvas px-3 py-2"><code className="text-xs">{e.type}</code><time className="text-xs text-muted">{fmt.format(e.createdAt)}</time></li>)}
              </ul>
            </Card>
          )}
          <Card className="p-5">
            <p className="font-bold">{t("orders.timeline")}</p>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("common.none")}</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2">
                    <code className="text-xs">{e.provider} · {e.type}</code>
                    <span className="flex items-center gap-2">
                      {e.resultingStatus && <PaymentStatus status={e.resultingStatus} label={t(`orders.status.${e.resultingStatus}`)} />}
                      <time className="text-xs text-muted">{fmt.format(e.createdAt)}</time>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {entitlements.length > 0 && (
            <Card className="p-5">
              <p className="font-bold">{t("orders.entitlements")}</p>
              {entitlements.map((e) => (
                <p key={e.id} className="mt-2 text-sm text-muted">
                  {t("orders.downloadsUsed", { used: e.downloadCount, max: e.maxDownloads })} {e.revokedAt && <Badge tone="danger">revoked</Badge>}
                </p>
              ))}
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card className="p-5 text-sm">
            <p className="font-bold">{t("orders.customer")}</p>
            <Link href={`/dashboard/customers/${customer.id}`} className="mt-2 block font-semibold underline-offset-4 hover:underline">{customer.name}</Link>
            <p className="text-muted">{customer.email}</p>
            {customer.phone && <p className="text-muted">{customer.phone}</p>}
            <div className="mt-4 border-t border-line pt-3">
              {o.shippingAddress ? (
                <>
                  <p className="font-semibold">{t("orders.shippingTo")}</p>
                  <p className="text-muted">
                    {o.shippingAddress.line1}
                    {o.shippingAddress.line2 ? `, ${o.shippingAddress.line2}` : ""}
                    <br />
                    {o.shippingAddress.postcode} {o.shippingAddress.city}, {o.shippingAddress.state}
                  </p>
                </>
              ) : o.deliveryMethod === "pickup" ? (
                <p className="text-muted">{t("orders.pickupNote")}</p>
              ) : null}
            </div>
          </Card>
          <OrderOps
            orderId={o.id}
            canEdit={role !== "viewer"}
            canManage={role === "owner" || role === "admin"}
            blocker={live ? null : blocker}
            pdConnected={Boolean(pd)}
            shipment={live ? { id: live.id, provider: live.provider, status: live.status, trackingNumber: live.trackingNumber, courierName: live.courierName, awbAssetId: live.awbAssetId, providerStatus: live.providerStatus } : null}
            method={o.paymentMethod}
            paymentStatus={o.paymentStatus}
            codStatus={o.codStatus}
            totalSen={o.totalSen}
            transferPending={fin.transfers.some((x) => x.status === "submitted")}
            cancellable={o.orderStatus !== "CANCELLED" && !["SHIPPED", "DELIVERED", "BOOKING_PENDING", "FULFILLED"].includes(o.fulfillmentStatus) && !(o.paymentStatus === "PAID" && o.paymentMethod !== "cod")}
          />
          <OrderActions
            orderId={o.id}
            provider={o.provider}
            isTest={o.isTest}
            canFulfill={o.paymentStatus === "PAID" && o.fulfillmentStatus === "UNFULFILLED" && o.deliveryMethod !== "shipping" && role !== "viewer"}
            canRefund={(o.paymentStatus === "PAID" || o.paymentStatus === "PARTIALLY_REFUNDED") && (role === "owner" || role === "admin")}
            remainingSen={o.totalSen - o.refundedSen}
          />
        </div>
      </div>
    </div>
  );
}
