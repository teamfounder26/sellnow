import Link from "next/link";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { Wallet, Receipt, Users, Eye, ArrowRight, Sparkles, Check, Lightbulb, Globe, Loader2, AlertTriangle, PartyPopper, Trophy } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getKpis, rangeFromDays, revenueSeries } from "@/lib/analytics/kpis";
import { getInsights } from "@/lib/analytics/insights";
import { getStorefront } from "@/lib/storefront/service";
import { getPaymentIntegration } from "@/lib/payments/integrations";
import { aiJobs, auditLogs, campaigns, creatives, notifications } from "@/lib/db/schema";
import { formatMYR } from "@/lib/money";
import { appUrl } from "@/lib/http";
import { Card, GlassIcon, LinkButton, ProgressBar, cx } from "@/components/ui";
import { Sticker } from "@/components/achievements/Sticker";
import { eligibleOrderCount, latestUnlock, listUnlocks } from "@/lib/achievements/service";
import { nextProgress, unlockTitle } from "@/lib/achievements/view";
import type { AchievementKey } from "@/lib/achievements/definitions";
import { businessStage, greetingKey, setupProgress, stateRecommendations, websiteBanner } from "@/lib/dashboard/state";
import type { ImpactItem } from "@/lib/context/engine";

const RANGES = [
  { k: "today", days: 1 },
  { k: "7d", days: 7 },
  { k: "30d", days: 30 },
] as const;

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { db, workspace, user } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const { range: r } = await searchParams;
  const range = RANGES.find((x) => x.k === r) ?? RANGES[2];

  const [kpis, series, insights, storefront, payment, creativeCount, campaignLive, activity, alerts, lastGen, unlocks, latest, orderCount, base] = await Promise.all([
    getKpis(db, workspace.id, rangeFromDays(range.days)),
    revenueSeries(db, workspace.id, rangeFromDays(range.days), workspace.timezone),
    getInsights(db, workspace.id),
    getStorefront(db, workspace.id),
    getPaymentIntegration(db, workspace.id),
    db.select({ n: count() }).from(creatives).where(and(eq(creatives.workspaceId, workspace.id), eq(creatives.status, "approved"), isNotNull(creatives.generationId))),
    db.select({ n: count() }).from(campaigns).where(and(eq(campaigns.workspaceId, workspace.id), eq(campaigns.status, "active"), isNotNull(campaigns.externalId))),
    db.query.auditLogs.findMany({ where: eq(auditLogs.workspaceId, workspace.id), orderBy: desc(auditLogs.createdAt), limit: 6 }),
    db.query.notifications.findMany({ where: and(eq(notifications.workspaceId, workspace.id), eq(notifications.type, "context.price_changed")), orderBy: desc(notifications.createdAt), limit: 2 }),
    db.query.aiJobs.findFirst({ where: and(eq(aiJobs.workspaceId, workspace.id), eq(aiJobs.kind, "website.generate")), orderBy: desc(aiJobs.createdAt) }),
    listUnlocks(db, workspace.id),
    latestUnlock(db, workspace.id),
    eligibleOrderCount(db, workspace.id),
    appUrl(),
  ]);
  const activeAlerts = alerts.filter((a) => !a.readAt);

  const generation = !lastGen ? "none" : ["QUEUED", "PROCESSING", "VALIDATING", "RETRYING"].includes(lastGen.status) ? "active" : lastGen.status === "FAILED" ? "failed" : "completed";
  const banner = websiteBanner({ status: storefront?.status ?? null, viewedAt: storefront?.viewedAt ?? null, publishedAt: storefront?.publishedAt ?? null, hasLive: Boolean(storefront?.publishedVersionId), generation });
  const facts = {
    websiteDraft: Boolean(storefront && !["GENERATING", "FAILED"].includes(storefront.status)),
    websiteLive: Boolean(storefront?.publishedVersionId),
    creativeSaved: (creativeCount[0]?.n ?? 0) > 0,
    campaignLaunched: (campaignLive[0]?.n ?? 0) > 0,
    paymentConnected: Boolean(payment),
    paidOrders: orderCount,
  };
  const setup = setupProgress(facts);
  const recs = stateRecommendations(facts);
  const stage = businessStage(orderCount);
  const greet = greetingKey(new Date(), workspace.timezone);
  const liveUrl = storefront ? `${base}/s/${storefront.slug}` : "";
  const next = nextProgress(t, orderCount);
  const maxSen = Math.max(1, ...series.map((s) => s.sen));

  const kpiCards = [
    { k: "sales", icon: Wallet, value: formatMYR(kpis.revenue, locale), href: "/dashboard/finances", tone: "bg-primary-soft" },
    { k: "orders", icon: Receipt, value: String(kpis.paidOrders), href: "/dashboard/orders?status=PAID", tone: "bg-mint" },
    { k: "visitors", icon: Eye, value: String(kpis.visitors), href: "/dashboard/analytics", tone: "bg-lavender" },
    { k: "customers", icon: Users, value: String(kpis.customers), href: "/dashboard/customers", tone: "bg-peach" },
  ];

  const bannerView = banner && (
    <div
      className={cx(
        "relative overflow-hidden rounded-[26px] p-5 ring-1 sm:p-6",
        banner.kind === "failed" ? "bg-danger-soft ring-danger/15" : banner.kind === "live" ? "bg-gradient-to-r from-mint via-white to-primary-soft ring-success/15" : "bg-gradient-to-r from-primary-soft via-white to-lavender ring-primary/15",
      )}
    >
      <span className="pointer-events-none absolute right-24 top-3 size-2 animate-pulse-soft rounded-full bg-ai" aria-hidden />
      <span className="pointer-events-none absolute right-40 top-10 size-1.5 animate-pulse-soft rounded-full bg-primary [animation-delay:600ms]" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <GlassIcon size="lg">{banner.kind === "generating" ? <Loader2 className="animate-spin" /> : banner.kind === "failed" ? <AlertTriangle /> : banner.kind === "live" ? <PartyPopper /> : <Sparkles />}</GlassIcon>
        <div className="flex-1">
          <p className="text-lg font-extrabold tracking-tight">{t(`dash.banner.${banner.kind}.title`)}</p>
          <p className="mt-0.5 text-[15px] text-ink/70">{t(`dash.banner.${banner.kind}.body`)}</p>
        </div>
        {(banner.kind === "ready" || banner.kind === "draft") && storefront && (
          <div className="hidden h-20 w-32 shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5 md:block" aria-hidden style={{ background: storefront.draftTheme.background }}>
            <div className="m-2 h-2 w-12 rounded-full" style={{ background: storefront.draftTheme.text, opacity: 0.2 }} />
            <div className="mx-2 h-6 rounded-md" style={{ background: `linear-gradient(120deg, ${storefront.draftTheme.primary}66, ${storefront.draftTheme.accent}99)` }} />
            <div className="m-2 h-3 w-10 rounded-full" style={{ background: storefront.draftTheme.primary }} />
          </div>
        )}
        {banner.cta === "visit" ? (
          <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-pill bg-primary px-5 font-semibold text-white shadow-glow hover:bg-primary-strong">
            {t("dash.banner.live.cta")} <ArrowRight className="size-4" />
          </a>
        ) : (
          <LinkButton href={banner.cta}>
            {t(`dash.banner.${banner.kind}.cta`)} <ArrowRight className="size-4" />
          </LinkButton>
        )}
      </div>
    </div>
  );

  const setupCard = (
    <Card id="progress" className="scroll-mt-24 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold tracking-tight">{t("dash.setup.title")}</p>
          <p className="text-sm text-muted">{t("dash.setup.sub")}</p>
        </div>
        <span className="text-sm font-bold tabular-nums text-primary-strong">
          {setup.filter((s) => s.done).length}/{setup.length}
        </span>
      </div>
      <ProgressBar value={setup.filter((s) => s.done).length} max={setup.length} className="mt-4" label={t("dash.setup.title")} />
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        {setup.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={cx("group flex h-full flex-col rounded-2xl p-3.5 ring-1 transition hover:-translate-y-0.5", s.done ? "bg-mint/60 ring-success/15" : "bg-canvas ring-line hover:ring-primary/30")}>
              <div className="flex items-center justify-between">
                <span className={cx("grid size-7 place-items-center rounded-full", s.done ? "bg-success text-white" : "bg-white text-muted ring-1 ring-line")}>{s.done ? <Check className="size-4" /> : null}</span>
                {s.sticker && <Sticker achievement={s.sticker} level={1} size={30} locked={!s.done} />}
              </div>
              <p className="mt-3 text-sm font-bold">{t(`dash.setup.items.${s.key}`)}</p>
              <p className="mt-0.5 text-xs text-muted">{t(s.done ? "dash.setup.done" : `dash.setup.next.${s.key}`)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );

  const kpiGrid = (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted">{t(`dash.range.${range.k}`)}</p>
        <div className="inline-flex rounded-pill bg-white/80 p-1 ring-1 ring-line">
          {RANGES.map((x) => (
            <Link key={x.k} href={`/dashboard?range=${x.k}`} scroll={false} className={cx("rounded-pill px-3 py-1 text-xs font-semibold", x.k === range.k ? "bg-primary text-white" : "text-muted hover:text-ink")}>
              {t(`dash.rangeShort.${x.k}`)}
            </Link>
          ))}
          <Link href="/dashboard/analytics" className="rounded-pill px-3 py-1 text-xs font-semibold text-muted hover:text-ink">
            {t("dash.rangeShort.custom")}
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <Link key={c.k} href={c.href} className="group rounded-[22px] bg-white p-4 shadow-soft ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">{t(`dash.kpi.${c.k}`)}</span>
              <GlassIcon size="sm">
                <c.icon />
              </GlassIcon>
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl">{c.value}</p>
            <p className="mt-1 text-xs text-muted">{t(`dash.kpi.${c.k}Hint`)}</p>
          </Link>
        ))}
      </div>
      {kpis.testOrders.count > 0 && <p className="mt-2 text-xs text-muted">{t("dashboard.testOrders", { n: kpis.testOrders.count })}</p>}
      <Card className="mt-4 p-5">
        <p className="font-bold">{t("dash.growth")}</p>
        {series.length === 0 || series.every((s) => s.sen === 0) ? (
          <p className="mt-3 rounded-2xl bg-canvas px-4 py-6 text-center text-sm text-muted">{t("dash.growthEmpty")}</p>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label={t("dash.growth")}>
            {series.map((s) => (
              <div key={s.day} className="flex flex-1 flex-col items-center justify-end" title={`${s.day}: ${formatMYR(s.sen, locale)} · ${s.orders}`}>
                <div className="w-full max-w-8 rounded-t-lg bg-gradient-to-t from-primary to-sky" style={{ height: `${Math.max(4, (s.sen / maxSen) * 150)}px` }} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {bannerView}

      <div className="flex flex-col gap-1">
        <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">{t(`dash.greeting.${greet}`, { name: user.name.split(" ")[0] ?? user.name })}</h1>
        <p className="text-[15px] text-muted">
          {t(`dash.stageLine.${stage}`)} · <span className="font-semibold text-ink">{workspace.name}</span>
        </p>
      </div>

      {activeAlerts.map((a) => {
        const d = a.data as { productName: string; oldSen: number; newSen: number; items: ImpactItem[] };
        return (
          <Card key={a.id} className="border-ai/30 bg-lavender/40 p-4 text-sm">
            <p className="font-semibold">{t("context.priceChanged", { name: d.productName, from: formatMYR(d.oldSen, locale), to: formatMYR(d.newSen, locale) })}</p>
            <ul className="mt-1.5 list-inside list-disc text-muted">
              {d.items.map((it, i) => (
                <li key={i}>{t(`context.${it.kind}`, { label: it.kind === "creative" ? t(`creative.types.${it.label}`) : it.label })}</li>
              ))}
            </ul>
          </Card>
        );
      })}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-6">
          {stage === "new" ? (
            <>
              {setupCard}
              {kpiGrid}
            </>
          ) : (
            <>
              {kpiGrid}
              {setupCard}
            </>
          )}

          <Card id="recommendations" className="scroll-mt-24 p-5 sm:p-6">
            <p className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <Lightbulb className="size-5 text-warning" /> {t("dash.recs.title")}
            </p>
            {recs.length + insights.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("insights.none")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recs.map((r) => (
                  <li key={r.id}>
                    <Link href={r.href} className="flex items-center gap-3 rounded-2xl bg-canvas p-3.5 text-[15px] ring-1 ring-line transition hover:ring-primary/30">
                      <span className="size-2 shrink-0 rounded-full bg-primary" />
                      <span className="flex-1">
                        <span className="block font-semibold">{t(`dash.recs.${r.id}.title`)}</span>
                        <span className="block text-sm text-muted">{t(`dash.recs.${r.id}.body`)}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
                {insights.map((i) => (
                  <li key={i.id}>
                    <Link href={i.action} className="flex items-center gap-3 rounded-2xl bg-canvas p-3.5 text-[15px] ring-1 ring-line transition hover:ring-primary/30">
                      <span className={cx("size-2 shrink-0 rounded-full", i.severity === "warn" ? "bg-warning" : "bg-ai")} />
                      <span className="flex-1">{t(`insights.${i.id}`, i.params)}</span>
                      <ArrowRight className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">{t("dash.recs.basis")}</p>
          </Card>

          <Card id="activity" className="scroll-mt-24 p-5 sm:p-6">
            <p className="text-lg font-extrabold tracking-tight">{t("dashboard.recentActivity")}</p>
            {activity.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("dashboard.noActivity")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate font-medium">{t(`activity.${a.action.replace(/\./g, "_")}`) === `activity.${a.action.replace(/\./g, "_")}` ? a.action : t(`activity.${a.action.replace(/\./g, "_")}`)}</span>
                    <time className="shrink-0 text-xs text-muted">{new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: workspace.timezone }).format(a.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* Business journey widget */}
          <Card className="overflow-hidden p-0">
            <div className="bg-gradient-to-br from-primary-soft via-white to-lavender p-5">
              <p className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
                <Trophy className="size-5 text-warning" /> {t("dash.journey.title")}
              </p>
              <div className="mt-4 flex items-center gap-4">
                {latest ? <Sticker achievement={latest.key as AchievementKey} level={latest.level} size={78} /> : <Sticker achievement="website_creator" level={1} size={78} locked />}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted">{t("dash.journey.latest")}</p>
                  <p className="font-bold leading-tight">{latest ? unlockTitle(t, latest.key as AchievementKey, latest.level) : t("dash.journey.none")}</p>
                  <p className="mt-1 text-xs text-muted">{t("dash.journey.collected", { n: unlocks.length })}</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{t("dash.journey.orders")}</span>
                <span className="font-bold tabular-nums">
                  {orderCount} / {next.target}
                </span>
              </div>
              <ProgressBar value={orderCount} max={next.target} className="mt-2" label={next.label} />
              <p className="mt-2 text-xs text-muted">{t(orderCount === 0 ? "dash.journey.firstHint" : "dash.journey.remaining", { n: next.remaining })}</p>
              <LinkButton href="/dashboard/achievements" variant="secondary" size="sm" className="mt-4 w-full">
                {t("dash.journey.view")}
              </LinkButton>
            </div>
          </Card>

          <Card className="p-5">
            <p className="flex items-center gap-2 font-bold">
              <Globe className="size-4 text-primary" /> {t("dash.website.title")}
            </p>
            {storefront ? (
              <>
                <p className="mt-2 text-sm text-muted">{t(`website.status.${storefront.status}`)}</p>
                {storefront.publishedVersionId && <p className="mt-1 truncate font-mono text-xs">{liveUrl}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <LinkButton href="/preview" variant="secondary" size="sm">
                    {t("dash.website.preview")}
                  </LinkButton>
                  <LinkButton href="/dashboard/storefront" variant="ghost" size="sm">
                    {t("common.edit")}
                  </LinkButton>
                </div>
              </>
            ) : (
              <LinkButton href="/onboarding" size="sm" className="mt-3 w-full">
                {t("dash.website.create")}
              </LinkButton>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
