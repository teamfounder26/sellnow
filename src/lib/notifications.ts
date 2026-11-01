import { formatMYR } from "@/lib/money";
import type { notifications } from "@/lib/db/schema";

type T = (k: string, p?: Record<string, string | number>) => string;
type N = typeof notifications.$inferSelect;

export function describeNotification(t: T, n: N, locale: "ms" | "en"): { text: string; href?: string; tone: "success" | "warning" | "ai" | "neutral" } {
  const d = n.data as Record<string, unknown>;
  const amount = typeof d.totalSen === "number" ? formatMYR(d.totalSen, locale) : "";
  switch (n.type) {
    case "order.paid":
      return { text: t(d.isTest ? "notifications.orderPaidTest" : "notifications.orderPaid", { n: Number(d.orderNumber), amount }), href: `/dashboard/orders/${d.orderId}`, tone: "success" };
    case "milestone.first_sale":
      return { text: t("notifications.firstSale", { amount }), href: `/dashboard/orders/${d.orderId}`, tone: "success" };
    case "milestone.store_live":
      return { text: t("notifications.storeLive"), href: "/dashboard/storefront", tone: "success" };
    case "lead.new":
      return { text: t("notifications.leadNew"), href: "/dashboard/customers?tab=leads", tone: "ai" };
    case "payment.amount_mismatch":
      return { text: t("notifications.amountMismatch", { n: Number(d.orderNumber) }), href: `/dashboard/orders/${d.orderId}`, tone: "warning" };
    case "payment.after_cancel":
      return { text: t("notifications.afterCancel", { n: Number(d.orderNumber) }), href: `/dashboard/orders/${d.orderId}`, tone: "warning" };
    case "stock.oversold":
      return { text: t("notifications.oversold", { n: Number(d.orderNumber) }), href: `/dashboard/orders/${d.orderId}`, tone: "warning" };
    case "context.price_changed":
      return { text: t("notifications.priceChanged"), href: "/dashboard", tone: "ai" };
    default:
      return { text: n.type, tone: "neutral" };
  }
}
