import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { CheckCircle2, Clock, XCircle, Download } from "lucide-react";
import { getDb } from "@/lib/db";
import { orders, orderItems, downloadEntitlements, storefronts, workspaces } from "@/lib/db/schema";
import { verifyOrderViewToken } from "@/lib/commerce/checkout";
import { entitlementToken } from "@/lib/commerce/events";
import { getT } from "@/lib/i18n/server";
import { formatMYR } from "@/lib/money";
import { AutoRefresh } from "@/components/AutoRefresh";
import { storefrontPixelId } from "@/lib/ads/pixel";
import { MetaPixel } from "@/components/storefront/MetaPixel";

export const metadata = { title: "Pesanan", robots: { index: false } };

export default async function OrderStatusPage({ params, searchParams }: { params: Promise<{ slug: string; orderId: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug, orderId } = await params;
  const { k } = await searchParams;
  const { t, locale } = await getT();
  const db = await getDb();
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.slug, slug) });
  const order = sf && verifyOrderViewToken(orderId, k) ? await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.workspaceId, sf.workspaceId)) }) : null;
  if (!sf || !order) return <p className="mx-auto max-w-lg px-5 py-24 text-center font-semibold">{t("order.invalidLink")}</p>;
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, sf.workspaceId) });
  const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, order.id) });
  const ents = order.paymentStatus === "PAID" ? await db.query.downloadEntitlements.findMany({ where: and(eq(downloadEntitlements.orderId, order.id), eq(downloadEntitlements.workspaceId, order.workspaceId)) }) : [];
  const waiting = order.paymentStatus === "PENDING" || order.paymentStatus === "PROCESSING";
  const fmtDate = (d: Date) => new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeZone: "Asia/Kuala_Lumpur" }).format(d);

  const pixelId = await storefrontPixelId(db, sf.workspaceId);
  return (
    <div className="mx-auto max-w-lg px-5 py-14">
      {waiting && <AutoRefresh everyMs={3000} />}
      {/* Purchase fires only after the gateway VERIFIED payment, never for test orders; eventID dedupes reloads. */}
      {pixelId && order.paymentStatus === "PAID" && !order.isTest && <MetaPixel pixelId={pixelId} event={{ name: "Purchase", value: order.totalSen / 100, currency: "MYR", eventId: order.id }} />}
      <div className="rounded-[28px] border border-line bg-surface p-7 text-center shadow-lift">
        {order.paymentStatus === "PAID" ? (
          <CheckCircle2 className="mx-auto size-14 text-success" />
        ) : waiting ? (
          <Clock className="mx-auto size-14 animate-pulse-soft text-warning" />
        ) : (
          <XCircle className="mx-auto size-14 text-danger" />
        )}
        <h1 className="mt-4 text-2xl font-extrabold">
          {order.paymentStatus === "PAID" ? t("order.thanksPaid") : waiting ? t("order.thanksPending") : order.paymentStatus === "CANCELLED" ? t("order.thanksCancelled") : t("order.thanksFailed")}
        </h1>
        {waiting && <p className="mt-2 text-sm text-muted">{t("order.thanksPendingBody")}</p>}
        {order.paymentStatus === "FAILED" && <p className="mt-2 text-sm text-muted">{t("order.thanksFailedBody")}</p>}
        <p className="mt-5 text-sm font-semibold text-muted">{t("order.number", { n: order.number })} · {ws?.name}</p>
        <ul className="mt-4 space-y-1 text-left text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>{i.quantity}× {i.name}</span>
              <span>{formatMYR(i.totalSen, locale)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-line pt-2 font-extrabold">
            <span>{t("checkout.total")}</span>
            <span>{formatMYR(order.totalSen, locale)}</span>
          </li>
        </ul>
        {ents.length > 0 && (
          <div className="mt-6 rounded-2xl bg-mint/60 p-4 text-left">
            <p className="font-bold">{t("order.downloads")}</p>
            {ents.map((e) => (
              <div key={e.id} className="mt-2">
                <a href={`/api/download/${entitlementToken(e.id)}`} className="inline-flex items-center gap-2 rounded-pill bg-ink px-4 py-2 text-sm font-semibold text-white">
                  <Download className="size-4" /> {t("order.download")}
                </a>
                <p className="mt-1 text-xs text-muted">{t("order.downloadNote", { date: fmtDate(e.expiresAt), n: e.maxDownloads })}</p>
              </div>
            ))}
          </div>
        )}
        <Link href={`/s/${slug}`} className="mt-6 inline-block text-sm font-semibold underline underline-offset-4">{t("order.backToStore")}</Link>
      </div>
    </div>
  );
}
