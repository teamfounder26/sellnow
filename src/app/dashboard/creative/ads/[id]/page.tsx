import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { formatMYR } from "@/lib/money";
import { auditLogs, products } from "@/lib/db/schema";
import * as svc from "@/lib/ads/service";
import { Badge, Card } from "@/components/ui";
import { DecisionCard, NoDecision } from "@/components/ads/DecisionCard";
import { AdActions } from "@/components/ads/AdActions";
import { AdPreview } from "@/components/ads/AdPreview";
import { DuplicateButton } from "@/components/ads/DuplicateButton";

export const metadata = { title: "Ad details" };

export default async function AdDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string }> }) {
  const { id } = await params;
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const ad = await svc.getAd(db, workspace.id, id).catch(() => null);
  if (!ad) notFound();
  const range = svc.rangeFor((await searchParams).range ?? "30d");
  const [conn, pb, series, store, logs] = await Promise.all([
    svc.getMetaConnection(db, workspace.id),
    svc.getPlaybook(db, workspace.id),
    svc.dailySeries(db, workspace.id, range, ad.id),
    svc.storeOrdersByAd(db, workspace.id, range),
    db.query.auditLogs.findMany({ where: and(eq(auditLogs.workspaceId, workspace.id), eq(auditLogs.entityId, ad.id), inArray(auditLogs.action, ["ads.published", "ads.budget_changed", "ads.paused", "ads.resumed", "ads.publish_failed"])), orderBy: desc(auditLogs.createdAt), limit: 20 }),
  ]);
  const product = ad.productId ? await db.query.products.findFirst({ where: eq(products.id, ad.productId) }) : null;
  const decision = await svc.adDecision(db, ad, pb, svc.trackingReadyFor(ad, conn));
  const m = (sen: number | null | undefined) => (sen == null ? t("ads.na") : formatMYR(sen, locale));
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: workspace.timezone });
  const tot = series.reduce((a, r) => ({ spend: a.spend + Number(r.spendSen), purchases: a.purchases + Number(r.purchases), revenue: a.revenue + Number(r.revenueSen) }), { spend: 0, purchases: 0, revenue: 0 });
  const so = store.get(ad.id) ?? { orders: 0, revenueSen: 0 };
  const maxSpend = Math.max(1, ...series.map((r) => Number(r.spendSen)));
  const canManage = role === "owner" || role === "admin";

  return (
    <div className="space-y-6">
      <Link href="/dashboard/creative?tab=ads" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" /> AI Ads Studio</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{ad.name}</h1>
        <Badge tone={ad.status === "active" ? "success" : ad.status === "rejected" || ad.status === "failed" ? "danger" : "warning"}>{t(`ads.status.${ad.status}`)}</Badge>
        {ad.objective && <Badge tone="blue">{t(`ads.objective.${ad.objective}`)}</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {decision ? <DecisionCard d={decision} t={t} locale={locale} /> : <NoDecision t={t} reason={ad.metaAdId ? "notPublished" : "draft"} />}
          {ad.status === "rejected" && <Card className="border-danger/30 p-4 text-sm text-danger">{t("ads.detail.rejected")} {ad.metaReview ? JSON.stringify(ad.metaReview) : ""}</Card>}
          <div className="flex flex-wrap items-center gap-2">
            <AdActions adId={ad.id} status={ad.status} budgetSen={ad.dailyBudgetSen ?? 0} originalSen={ad.originalBudgetSen ?? ad.dailyBudgetSen ?? 0} reviewTime={pb.scalingReviewTime} canManage={canManage} />
            {role !== "viewer" && <DuplicateButton adId={ad.id} />}
            {ad.metaAdId && conn.config.adAccountId && <a href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${conn.config.adAccountId.replace("act_", "")}&selected_ad_ids=${ad.metaAdId}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold text-muted hover:text-ink"><ExternalLink className="size-4" /> {t("ads.detail.adsManager")}</a>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["spend", m(tot.spend)], ["purchases", String(tot.purchases)], ["cpp", m(tot.purchases ? Math.round(tot.spend / tot.purchases) : null)], ["roas", tot.spend ? (tot.revenue / tot.spend).toFixed(2) : t("ads.na")]].map(([k, v]) => (
              <Card key={k} className="p-4"><p className="text-xs font-semibold text-muted">{t(`ads.metric.${k}`)}</p><p className="mt-1 text-xl font-extrabold tabular-nums">{v}</p></Card>
            ))}
          </div>
          <Card className="p-5">
            <p className="font-bold">{t("ads.detail.daily")}</p>
            {series.length === 0 ? <p className="mt-2 text-sm text-muted">{t("ads.detail.noData")}</p> : (
              <>
                <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label={t("ads.detail.daily")}>{series.map((r) => <div key={r.date} title={`${r.date}: ${m(Number(r.spendSen))} · ${r.purchases}`} className="flex-1 rounded-t bg-gradient-to-t from-primary to-sky" style={{ height: `${Math.max(3, (Number(r.spendSen) / maxSpend) * 120)}px` }} />)}</div>
                <table className="mt-4 w-full text-sm">
                  <thead className="text-xs text-muted"><tr><th className="py-1 text-left font-semibold">{t("ads.detail.date")}</th><th className="text-right font-semibold">{t("ads.metric.spend")}</th><th className="text-right font-semibold">{t("ads.metric.purchases")}</th><th className="text-right font-semibold">{t("ads.metric.cpp")}</th></tr></thead>
                  <tbody className="divide-y divide-line">{[...series].reverse().slice(0, 14).map((r) => <tr key={r.date}><td className="py-1.5">{r.date}</td><td className="text-right tabular-nums">{m(Number(r.spendSen))}</td><td className="text-right tabular-nums">{r.purchases}</td><td className="text-right tabular-nums">{m(Number(r.purchases) ? Math.round(Number(r.spendSen) / Number(r.purchases)) : null)}</td></tr>)}</tbody>
                </table>
              </>
            )}
            <p className="mt-3 text-xs text-muted">{ad.lastSyncedAt ? t("ads.freshness", { time: fmt.format(ad.lastSyncedAt) }) : t("ads.neverSynced")} · {t("ads.attribution")}</p>
          </Card>
          <Card className="p-5 text-sm">
            <p className="font-bold">{t("ads.detail.attributionTitle")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-canvas p-3"><p className="text-xs text-muted">{t("ads.detail.metaPurchases")}</p><p className="text-lg font-extrabold">{tot.purchases} · {m(tot.revenue)}</p></div>
              <div className="rounded-2xl bg-canvas p-3"><p className="text-xs text-muted">{t("ads.detail.storeOrders")}</p><p className="text-lg font-extrabold">{so.orders} · {m(so.revenueSen)}</p></div>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" /> {t("ads.howTo.attribution")}</p>
          </Card>
          <Card className="p-5">
            <p className="font-bold">{t("ads.detail.history")}</p>
            {logs.length === 0 ? <p className="mt-2 text-sm text-muted">—</p> : <ul className="mt-2 space-y-1.5 text-sm">{logs.map((l) => { const d = l.data as { fromSen?: number; toSen?: number; code?: string }; return <li key={l.id} className="flex justify-between gap-3"><span>{t(`ads.history.${l.action.replace("ads.", "")}`, { from: m(d.fromSen), to: m(d.toSen), code: d.code ?? "" })}</span><time className="shrink-0 text-xs text-muted">{fmt.format(l.createdAt)}</time></li>; })}</ul>}
          </Card>
        </div>
        <aside className="space-y-3">
          <AdPreview pageName={conn.config.pageName ?? null} creative={ad.creative} imageAssetId={ad.creative?.imageAssetId ?? product?.imageAssetId ?? null} url={ad.destinationUrl} />
          <Card className="p-4 text-sm">
            <dl className="space-y-2">
              <div><dt className="text-xs text-muted">{t("ads.wizard.product")}</dt><dd className="font-semibold">{product?.name ?? t("ads.na")} · {m(product?.priceSen)}</dd></div>
              <div><dt className="text-xs text-muted">{t("ads.wizard.audience")}</dt><dd className="font-semibold">{ad.audience ? `MY · ${ad.audience.ageMin}–${ad.audience.ageMax} · ${t(`ads.gender.${ad.audience.gender}`)}` : t("ads.na")}</dd></div>
              <div><dt className="text-xs text-muted">{t("ads.wizard.dailyBudget")}</dt><dd className="font-semibold">{m(ad.dailyBudgetSen)} ({t("ads.detail.original")}: {m(ad.originalBudgetSen)})</dd></div>
              <div><dt className="text-xs text-muted">{t("ads.wizard.destination")}</dt><dd className="break-all text-xs">{ad.destinationUrl ?? t("ads.na")}</dd></div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
