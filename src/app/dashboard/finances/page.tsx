import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getKpis, rangeFromDays } from "@/lib/analytics/kpis";
import { orders } from "@/lib/db/schema";
import { getPaymentIntegration } from "@/lib/payments/integrations";
import { formatMYR } from "@/lib/money";
import { Badge, Card, Notice } from "@/components/ui";

export const metadata = { title: "Finances" };

/** Revenue and payment transactions from verified payment records. Fees/payouts live in the merchant's own gateway account. */
export default async function FinancesPage() {
  const { db, workspace } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const [k30, k365, payment, txns] = await Promise.all([
    getKpis(db, workspace.id, rangeFromDays(30)),
    getKpis(db, workspace.id, rangeFromDays(365)),
    getPaymentIntegration(db, workspace.id),
    db.query.orders.findMany({
      where: and(eq(orders.workspaceId, workspace.id), inArray(orders.paymentStatus, ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"])),
      orderBy: desc(orders.createdAt),
      limit: 25,
    }),
  ]);
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeZone: workspace.timezone });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("finances.title")}</h1>
        <p className="mt-1 text-muted">{t("finances.sub")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { k: "net30", v: formatMYR(k30.revenue, locale) },
          { k: "net365", v: formatMYR(k365.revenue, locale) },
          { k: "refunded30", v: formatMYR(k30.refundedSen, locale) },
        ].map((s) => (
          <Card key={s.k} className="p-5">
            <p className="text-sm font-semibold text-muted">{t(`finances.${s.k}`)}</p>
            <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{s.v}</p>
          </Card>
        ))}
      </div>
      <Notice tone="blue">{payment ? t("finances.gatewayNote", { provider: payment.provider }) : t("finances.noGateway")}</Notice>
      <Card className="p-5 sm:p-6">
        <p className="font-bold">{t("finances.transactions")}</p>
        {txns.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("finances.empty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {txns.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Link href={`/dashboard/orders/${o.id}`} className="font-semibold hover:underline">
                  #{o.number}
                </Link>
                <span className="text-muted">{fmt.format(o.paidAt ?? o.createdAt)}</span>
                {o.isTest && <Badge tone="warning">TEST</Badge>}
                <Badge tone={o.paymentStatus === "PAID" ? "success" : "neutral"}>{t(`orders.status.${o.paymentStatus}`)}</Badge>
                <span className="ml-auto font-bold tabular-nums">{formatMYR(o.totalSen - o.refundedSen, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
