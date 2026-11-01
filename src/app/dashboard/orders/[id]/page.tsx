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

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const data = await getOrder(db, workspace.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { order: o, items, customer, events, entitlements } = data;
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
          <OrderActions
            orderId={o.id}
            provider={o.provider}
            isTest={o.isTest}
            canFulfill={o.paymentStatus === "PAID" && o.fulfillmentStatus === "UNFULFILLED" && role !== "viewer"}
            canRefund={(o.paymentStatus === "PAID" || o.paymentStatus === "PARTIALLY_REFUNDED") && (role === "owner" || role === "admin")}
            remainingSen={o.totalSen - o.refundedSen}
          />
        </div>
      </div>
    </div>
  );
}
