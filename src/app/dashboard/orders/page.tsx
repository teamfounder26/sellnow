import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { listOrders } from "@/lib/commerce/orders";
import { formatMYR } from "@/lib/money";
import { Badge, Card, EmptyState, SectionHeader } from "@/components/ui";
import { PaymentStatus } from "@/components/orders/PaymentStatus";
import type { PaymentStatus as PS } from "@/lib/commerce/payment-state";

const FILTERS: (PS | "ALL")[] = ["ALL", "PAID", "PENDING", "FAILED", "CANCELLED", "REFUNDED"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { db, workspace } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const filter = FILTERS.includes(status as PS) && status !== "ALL" ? (status as PS) : undefined;
  const rows = await listOrders(db, workspace.id, { status: filter });
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: workspace.timezone });
  return (
    <>
      <SectionHeader title={t("orders.title")} sub={t("orders.sub")} />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link key={f} href={f === "ALL" ? "/dashboard/orders" : `/dashboard/orders?status=${f}`} className={`whitespace-nowrap rounded-pill px-3.5 py-1.5 text-sm font-semibold ${(filter ?? "ALL") === f ? "bg-ink text-white" : "border border-line bg-surface text-muted"}`}>
            {f === "ALL" ? t("orders.filterAll") : t(`orders.status.${f}`)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Receipt className="size-6" />} title={t("orders.empty")} body={t("orders.emptyBody")} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-cream text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">{t("orders.number")}</th>
                  <th className="px-4 py-3">{t("orders.customer")}</th>
                  <th className="px-4 py-3">{t("common.date")}</th>
                  <th className="px-4 py-3">{t("orders.payment")}</th>
                  <th className="px-4 py-3">{t("orders.fulfillment")}</th>
                  <th className="px-4 py-3 text-right">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ order: o, customer }) => (
                  <tr key={o.id} className="hover:bg-cream/60">
                    <td className="px-4 py-3 font-bold">
                      <Link href={`/dashboard/orders/${o.id}`} className="underline-offset-4 hover:underline">#{o.number}</Link>
                      {o.isTest && <Badge tone="warning" className="ml-2">{t("orders.testBadge")}</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-xs text-muted">{customer.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{fmt.format(o.createdAt)}</td>
                    <td className="px-4 py-3"><PaymentStatus status={o.paymentStatus} label={t(`orders.status.${o.paymentStatus}`)} /></td>
                    <td className="px-4 py-3 text-muted">{t(`orders.fstatus.${o.fulfillmentStatus}`)}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatMYR(o.totalSen, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
