import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getKpis, rangeFromDays, revenueSeries } from "@/lib/analytics/kpis";
import { formatMYR } from "@/lib/money";
import { Card, SectionHeader } from "@/components/ui";
import { KPIStatCard } from "@/components/app/KPIStatCard";

const RANGES = [7, 30, 90] as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: d } = await searchParams;
  const days = RANGES.includes(Number(d) as 7) ? Number(d) : 30;
  const { db, workspace } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const range = rangeFromDays(days);
  const [k, series] = await Promise.all([getKpis(db, workspace.id, range), revenueSeries(db, workspace.id, range, workspace.timezone)]);
  const pct = (x: number | null) => (x === null ? null : `${(x * 100).toFixed(1)}%`);
  const max = Math.max(1, ...series.map((s) => s.sen));

  return (
    <>
      <SectionHeader
        title={t("analytics.title")}
        sub={t("analytics.sub")}
        action={
          <div className="inline-flex rounded-pill border border-line bg-surface p-0.5" role="group" aria-label={t("analytics.range")}>
            {RANGES.map((r) => (
              <Link key={r} href={`/dashboard/analytics?days=${r}`} className={`rounded-pill px-3.5 py-1.5 text-sm font-semibold ${days === r ? "bg-ink text-white" : "text-muted"}`}>
                {t(`analytics.days${r}`)}
              </Link>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPIStatCard label={t("analytics.revenue")} value={formatMYR(k.revenue, locale)} hint={k.refundedSen ? t("analytics.refunds", { amount: formatMYR(k.refundedSen, locale) }) : t("analytics.def.revenue")} />
        <KPIStatCard label={t("analytics.paidOrders")} value={k.paidOrders} hint={t("analytics.def.paidOrders")} tone="bg-mint" />
        <KPIStatCard label={t("analytics.aov")} value={k.aov !== null ? formatMYR(k.aov, locale) : "—"} hint={t("analytics.def.aov")} missing={k.aov === null ? t("analytics.missing.noOrders") : undefined} />
        <KPIStatCard label={t("analytics.customers")} value={k.customers} hint={t("analytics.def.customers")} />
        <KPIStatCard label={t("analytics.leads")} value={k.leads} hint={t("analytics.def.leads")} />
        <KPIStatCard label={t("analytics.visitors")} value={k.visitors} hint={t("analytics.def.visitors")} missing={k.visitors === 0 ? t("analytics.missing.visitors") : undefined} />
        <KPIStatCard label={t("analytics.conversion")} value={pct(k.conversionRate)} hint={t("analytics.def.conversion")} missing={k.conversionRate === null ? t("analytics.missing.visitors") : undefined} />
        <KPIStatCard label={t("analytics.repeat")} value={k.repeatCustomers} hint={t("analytics.def.repeat")} />
        <KPIStatCard label={t("analytics.adSpend")} value="" missing={t("analytics.missing.adSpend")} />
        <KPIStatCard label={t("analytics.roas")} value="" missing={t("analytics.missing.roas")} />
        <KPIStatCard label={t("analytics.cac")} value="" missing={t("analytics.missing.cac")} />
        <KPIStatCard label={t("analytics.profit")} value="" missing={t("analytics.missing.profit")} />
      </div>
      <Card className="mt-6 p-5">
        <p className="font-bold">{t("analytics.chartTitle")}</p>
        {series.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t("analytics.noData")}</p>
        ) : (
          <div className="mt-4 flex h-48 items-end gap-1.5 overflow-x-auto" role="img" aria-label={t("analytics.chartTitle")}>
            {series.map((s) => (
              <div key={s.day} className="group flex min-w-6 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold text-muted opacity-0 group-hover:opacity-100">{formatMYR(s.sen, locale)}</span>
                <div className="w-full rounded-t-lg bg-primary" style={{ height: `${Math.max(4, (s.sen / max) * 160)}px` }} title={`${s.day}: ${formatMYR(s.sen, locale)} (${s.orders})`} />
                <span className="text-[10px] text-muted">{s.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      {k.testOrders.count > 0 && <p className="mt-3 text-xs text-muted">{t("dashboard.testOrders", { n: k.testOrders.count })}</p>}
    </>
  );
}
