import Link from "next/link";
import { eq } from "drizzle-orm";
import { AlertTriangle, BarChart3, Info, Megaphone, Package, Plus, RefreshCw, Sparkles } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { formatMYR } from "@/lib/money";
import { products } from "@/lib/db/schema";
import { isAIConfigured } from "@/lib/ai/provider";
import { creditBalance } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { listCreatives, TEXT_CREATIVE_TYPES, OBJECTIVES as COPY_OBJECTIVES, RATIOS, CREATIVE_TYPES } from "@/lib/marketing/service";
import { rangeFor, publishReadiness, getAd } from "@/lib/ads/service";
import { studioData, type AdRow } from "@/lib/ads/view";
import { availableObjectives, testimonialAvailable, APPROACHES } from "@/lib/ads/strategy";
import { cppPlan, budgetProjection, BUDGET_PRESETS_SEN } from "@/lib/ads/playbook";
import { ADS_STUDIO } from "@/lib/ads/quota";
import { imageProviderConfigured } from "@/lib/marketing/service";
import { testGatewayAllowed } from "@/lib/payments/integrations";
import { Badge, Card, EmptyState, GlassIcon, LinkButton, cx } from "@/components/ui";
import { DecisionCard, NoDecision, DECISION_STYLE } from "@/components/ads/DecisionCard";
import { QuotaPill } from "@/components/ads/QuotaPill";
import { AdActions } from "@/components/ads/AdActions";
import { CreateWizard } from "@/components/ads/CreateWizard";
import { AdsSettings } from "@/components/ads/AdsSettings";
import { SyncButton } from "@/components/ads/SyncButton";
import { CreativeStudio } from "@/components/marketing/CreativeStudio";

export const metadata = { title: "AI Ads Studio" };

const TABS = ["overview", "create", "ads", "performance", "settings"] as const;
type Tab = (typeof TABS)[number];
const RANGES = ["today", "yesterday", "7d", "30d", "custom"] as const;

export default async function AdsStudioPage({ searchParams }: { searchParams: Promise<{ tab?: string; ad?: string; range?: string; from?: string; to?: string; error?: string; connected?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const range = rangeFor(sp.range ?? "30d", new Date(), { from: sp.from, to: sp.to });
  const data = await studioData(db, workspace.id, range);
  const canEdit = role !== "viewer";
  const canManage = role === "owner" || role === "admin";
  const m = (sen: number | null) => (sen == null ? t("ads.na") : formatMYR(sen, locale));
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: workspace.timezone });
  const q = `range=${range.key}${range.key === "custom" ? `&from=${range.since}&to=${range.until}` : ""}`;

  const header = (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            <Sparkles className="size-7 text-primary" /> AI Ads Studio
          </h1>
          <p className="mt-1 text-muted">{t("ads.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuotaPill t={t} quota={data.quota} />
          {canEdit && (
            <LinkButton href="/dashboard/creative?tab=create" size="sm">
              <Plus className="size-4" /> {t("ads.newAd")}
            </LinkButton>
          )}
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto rounded-pill bg-white/70 p-1 ring-1 ring-line" aria-label="AI Ads Studio">
        {TABS.map((k) => (
          <Link key={k} href={`/dashboard/creative?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cx("whitespace-nowrap rounded-pill px-4 py-2 text-sm font-semibold transition", tab === k ? "bg-primary text-white shadow-glow" : "text-muted hover:text-ink")}>
            {t(`ads.tabs.${k}`)}
          </Link>
        ))}
      </nav>
      {sp.error && <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{t(sp.error)}</p>}
      {sp.connected && <p className="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">{t("ads.meta.connectedOk")}</p>}
    </div>
  );

  const rangeBar = (base: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-pill bg-white/80 p-1 ring-1 ring-line">
        {RANGES.filter((r) => r !== "custom").map((r) => (
          <Link key={r} href={`/dashboard/creative?tab=${base}&range=${r}`} className={cx("rounded-pill px-3 py-1 text-xs font-semibold", range.key === r ? "bg-primary text-white" : "text-muted hover:text-ink")}>
            {t(`ads.range.${r}`)}
          </Link>
        ))}
      </div>
      <form className="flex items-center gap-1 text-xs" action="/dashboard/creative">
        <input type="hidden" name="tab" value={base} />
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" defaultValue={range.since} className="h-8 rounded-lg border border-line bg-white px-2" aria-label={t("ads.range.from")} />
        <span>–</span>
        <input type="date" name="to" defaultValue={range.until} className="h-8 rounded-lg border border-line bg-white px-2" aria-label={t("ads.range.to")} />
        <button className={cx("h-8 rounded-lg px-2.5 font-semibold ring-1 ring-line", range.key === "custom" ? "bg-primary text-white ring-primary" : "bg-white")}>{t("ads.range.custom")}</button>
      </form>
      <SyncButton disabled={!data.conn.token} />
      <span className="text-xs text-muted">{data.lastSynced ? t("ads.freshness", { time: fmt.format(data.lastSynced) }) : t("ads.neverSynced")} · {t("ads.attribution")}</span>
    </div>
  );

  const adCard = (r: AdRow) => (
    <Card key={r.ad.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary-soft">
        {r.product?.imageAssetId ? <img src={`/api/assets/${r.product.imageAssetId}`} alt="" className="h-full w-full object-cover" /> : <Package className="size-7 text-primary/50" />}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/creative/ads/${r.ad.id}`} className="truncate font-bold hover:underline">{r.ad.name}</Link>
          <Badge tone={r.ad.status === "active" ? "success" : r.ad.status === "rejected" || r.ad.status === "failed" ? "danger" : r.ad.status === "draft" ? "neutral" : "warning"}>{t(`ads.status.${r.ad.status}`)}</Badge>
          {r.ad.objective && <Badge tone="blue">{t(`ads.objective.${r.ad.objective}`)}</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          {[
            ["budget", r.ad.dailyBudgetSen != null ? `${m(r.ad.dailyBudgetSen)}/${t("ads.day")}` : t("ads.na")],
            ["spend", m(r.totals.spendSen)],
            ["cpp", m(r.totals.purchases ? Math.round(r.totals.spendSen / r.totals.purchases) : null)],
            ["purchases", String(r.totals.purchases)],
            ["roas", r.totals.spendSen ? (r.totals.revenueSen / r.totals.spendSen).toFixed(2) : t("ads.na")],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{t(`ads.metric.${k}`)}</dt>
              <dd className="font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {r.decision ? <DecisionCard d={r.decision} t={t} locale={locale} compact /> : <NoDecision t={t} reason={r.ad.status === "draft" || r.ad.status === "failed" ? "draft" : "notPublished"} />}
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href={r.ad.metaAdId ? `/dashboard/creative/ads/${r.ad.id}` : `/dashboard/creative?tab=create&ad=${r.ad.id}`} size="sm" variant="secondary">
            {t(r.ad.metaAdId ? "ads.actions.details" : "ads.actions.continue")}
          </LinkButton>
          <AdActions adId={r.ad.id} status={r.ad.status} budgetSen={r.ad.dailyBudgetSen ?? 0} originalSen={r.ad.originalBudgetSen ?? r.ad.dailyBudgetSen ?? 0} reviewTime={data.pb.scalingReviewTime} canManage={canManage} />
        </div>
      </div>
    </Card>
  );

  // ------------------------------------------------------------ Overview
  if (tab === "overview") {
    const tt = data.totals;
    const groups = { scale: data.rows.filter((r) => r.decision?.decision === "scale"), maintain: data.rows.filter((r) => r.decision?.decision === "maintain"), cut: data.rows.filter((r) => r.decision?.decision === "cut") };
    return (
      <>
        {header}
        <div className="space-y-6">
          {rangeBar("overview")}
          {!data.conn.appConfigured || !data.conn.token ? (
            <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <GlassIcon size="lg"><Megaphone /></GlassIcon>
              <div className="flex-1">
                <p className="font-bold">{t(data.conn.appConfigured ? "ads.connectPrompt.title" : "ads.connectPrompt.appTitle")}</p>
                <p className="text-sm text-muted">{t(data.conn.appConfigured ? "ads.connectPrompt.body" : "ads.connectPrompt.appBody")}</p>
              </div>
              <LinkButton href="/dashboard/creative?tab=settings" variant="secondary" size="sm">{t("ads.connectPrompt.cta")}</LinkButton>
            </Card>
          ) : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["spend", m(tt.spendSen), t("ads.card.spendHint")],
              ["purchases", String(tt.purchases), t("ads.card.purchasesHint", { n: tt.storeOrders })],
              ["avgCpp", m(tt.cppSen), t("ads.card.cppHint")],
              ["revenueRoas", m(tt.revenueSen), tt.roas == null ? t("ads.card.roasNa") : t("ads.card.roas", { roas: tt.roas.toFixed(2) })],
            ].map(([k, v, hint]) => (
              <Card key={k} className="p-4 sm:p-5">
                <p className="text-sm font-semibold text-muted">{t(`ads.card.${k}`)}</p>
                <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl">{v}</p>
                <p className="mt-1 text-xs text-muted">{hint}</p>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-semibold text-muted">{t("ads.card.profit")}</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{m(tt.profitSen)}</p>
              {tt.profitSen == null && <p className="mt-1 text-xs text-warning">{tt.missingCosts.length ? t("ads.card.profitMissing", { products: tt.missingCosts.join(", ") }) : t("ads.card.profitNoData")}</p>}
            </Card>
            <Card className="p-4"><p className="text-xs font-semibold text-muted">{t("ads.card.active")}</p><p className="mt-1 text-xl font-extrabold">{tt.active}</p></Card>
            <Card className="p-4"><p className="text-xs font-semibold text-muted">{t("ads.card.attention")}</p><p className={cx("mt-1 text-xl font-extrabold", tt.attention && "text-danger")}>{tt.attention}</p></Card>
            <Card className="p-4"><p className="text-xs font-semibold text-muted">{t("ads.card.slots")}</p><p className="mt-1 text-xl font-extrabold">{data.quota.plan === "paid" ? data.quota.monthlyRemaining : data.quota.trialRemaining} / 3</p><p className="text-xs text-muted">{t(data.quota.plan === "paid" ? "ads.card.slotsPaid" : "ads.card.slotsFree")}</p></Card>
          </div>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold tracking-tight"><Sparkles className="size-5 text-primary" /> {t("ads.recs.title")}</h2>
            <div className="grid gap-3 lg:grid-cols-3">
              {(["scale", "maintain", "cut"] as const).map((k) => {
                const S = DECISION_STYLE[k];
                return (
                  <Card key={k} className="p-4">
                    <p className={cx("flex items-center gap-2 text-sm font-extrabold", S.tone.split(" ").find((c) => c.startsWith("text-")))}><S.icon className="size-4" /> {t(`ads.recs.${k}`)} · {groups[k].length}</p>
                    {groups[k].length === 0 ? <p className="mt-2 text-sm text-muted">{t(`ads.recs.${k}Empty`)}</p> : (
                      <ul className="mt-2 space-y-2">
                        {groups[k].slice(0, 4).map((r) => (
                          <li key={r.ad.id}><Link href={`/dashboard/creative/ads/${r.ad.id}`} className="block rounded-xl bg-canvas px-3 py-2 text-sm hover:ring-1 hover:ring-primary/30"><span className="font-semibold">{r.ad.name}</span><span className="block text-xs text-muted">{t("ads.metric.cpp")}: {m(r.decision!.cppSen)} · {t("ads.metric.targetCpp")}: {m(r.decision!.plan.referenceSen)}</span></Link></li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">{t("ads.recs.basis")}</p>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold tracking-tight">{t("ads.tabs.ads")}</h2><Link href="/dashboard/creative?tab=ads" className="text-sm font-semibold text-primary-strong">{t("ads.viewAll")}</Link></div>
            {data.rows.length === 0 ? <EmptyState icon={<Megaphone className="size-5" />} title={t("ads.empty.title")} body={t("ads.empty.body")} action={canEdit ? <LinkButton href="/dashboard/creative?tab=create">{t("ads.newAd")}</LinkButton> : undefined} /> : <div className="space-y-3">{data.rows.slice(0, 5).map(adCard)}</div>}
          </section>
          <p className="text-xs text-muted">{t("ads.feesNote")}</p>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------ My Ads
  if (tab === "ads") {
    const groups: [string, AdRow[]][] = [
      ["live", data.rows.filter((r) => ["active", "pending_review", "publishing"].includes(r.ad.status))],
      ["paused", data.rows.filter((r) => r.ad.status === "paused")],
      ["drafts", data.rows.filter((r) => r.ad.status === "draft")],
      ["problems", data.rows.filter((r) => r.ad.status === "failed" || r.ad.status === "rejected")],
      ["ended", data.rows.filter((r) => r.ad.status === "completed" || r.ad.status === "archived")],
    ];
    return (
      <>
        {header}
        {data.rows.length === 0 ? <EmptyState icon={<Megaphone className="size-5" />} title={t("ads.empty.title")} body={t("ads.empty.body")} action={canEdit ? <LinkButton href="/dashboard/creative?tab=create">{t("ads.newAd")}</LinkButton> : undefined} /> : (
          <div className="space-y-8">
            {groups.filter(([, rows]) => rows.length).map(([k, rows]) => (
              <section key={k}>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{t(`ads.groups.${k}`)} · {rows.length}</h2>
                <div className="space-y-3">{rows.map(adCard)}</div>
              </section>
            ))}
          </div>
        )}
      </>
    );
  }

  // ------------------------------------------------------------ Performance
  if (tab === "performance") {
    const tt = data.totals;
    const change = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / prev) * 100));
    const prevCpp = tt.prev.purchases ? Math.round(tt.prev.spendSen / tt.prev.purchases) : null;
    const deltas = [
      ["spend", change(tt.spendSen, tt.prev.spendSen)],
      ["purchases", change(tt.purchases, tt.prev.purchases)],
      ["cpp", tt.cppSen != null && prevCpp ? change(tt.cppSen, prevCpp) : null],
    ] as const;
    return (
      <>
        {header}
        <div className="space-y-6">
          {rangeBar("performance")}
          <div className="grid gap-3 sm:grid-cols-3">
            {deltas.map(([k, d]) => (
              <Card key={k} className="p-4">
                <p className="text-xs font-semibold text-muted">{t("ads.perf.change", { metric: t(`ads.metric.${k}`) })}</p>
                <p className={cx("mt-1 text-xl font-extrabold tabular-nums", d == null ? "text-muted" : (k === "cpp" ? d > 0 : d < 0) ? "text-danger" : "text-success")}>{d == null ? t("ads.na") : `${d > 0 ? "+" : ""}${d}%`}</p>
                <p className="text-xs text-muted">{t("ads.perf.vsPrevious")}</p>
              </Card>
            ))}
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-canvas text-xs text-muted">
                <tr>{["ad", "spend", "purchases", "cpp", "revenue", "roas", "profit", "storeOrders", "decision"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{t(`ads.metric.${h}`)}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.filter((r) => r.ad.metaAdId).map((r) => {
                  const cpp = r.totals.purchases ? Math.round(r.totals.spendSen / r.totals.purchases) : null;
                  const unit = r.product?.costSen != null ? r.product.costSen + Math.round((r.product.priceSen * data.pb.feePct) / 100) + data.pb.shippingSubsidySen + data.pb.otherVariableSen : null;
                  return (
                    <tr key={r.ad.id}>
                      <td className="px-4 py-3"><Link href={`/dashboard/creative/ads/${r.ad.id}`} className="font-semibold hover:underline">{r.ad.name}</Link></td>
                      <td className="px-4 py-3 tabular-nums">{m(r.totals.spendSen)}</td>
                      <td className="px-4 py-3 tabular-nums">{r.totals.purchases}</td>
                      <td className="px-4 py-3 tabular-nums">{m(cpp)}</td>
                      <td className="px-4 py-3 tabular-nums">{m(r.totals.revenueSen)}</td>
                      <td className="px-4 py-3 tabular-nums">{r.totals.spendSen ? (r.totals.revenueSen / r.totals.spendSen).toFixed(2) : t("ads.na")}</td>
                      <td className="px-4 py-3 tabular-nums">{unit == null ? <span className="text-warning">{t("ads.perf.addCost")}</span> : m(r.totals.revenueSen - r.totals.spendSen - unit * r.totals.purchases)}</td>
                      <td className="px-4 py-3 tabular-nums">{r.storeOrders.orders}</td>
                      <td className="px-4 py-3">{r.decision ? <Badge tone={r.decision.decision === "scale" ? "success" : r.decision.decision === "cut" ? "danger" : "blue"}>{t(`ads.decision.${r.decision.decision}`)}</Badge> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.rows.every((r) => !r.ad.metaAdId) && <p className="px-4 py-8 text-center text-sm text-muted">{t("ads.perf.empty")}</p>}
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight"><BarChart3 className="size-5 text-primary" /> {t("ads.howTo.title")}</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {["spend", "purchases", "cpp", "revenue", "roas", "profit"].map((k) => (
                <div key={k} className="rounded-2xl bg-canvas p-4">
                  <dt className="font-bold">{t(`ads.metric.${k}`)}</dt>
                  <dd className="mt-1 text-sm text-ink/80">{t(`ads.howTo.${k}`)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-primary-soft/60 p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-primary" /> {t("ads.howTo.attribution")}</p>
          </Card>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------ Create
  if (tab === "create") {
    const [prods, ai, credits, testimonials] = await Promise.all([db.query.products.findMany({ where: eq(products.workspaceId, workspace.id) }), isAIConfigured(), creditBalance(db, workspace.id), testimonialAvailable(db, workspace.id)]);
    const draft = sp.ad ? await getAd(db, workspace.id, sp.ad).catch(() => null) : null;
    const prod = draft?.productId ? prods.find((p) => p.id === draft.productId) : null;
    const avail = prod ? await availableObjectives(db, workspace.id, prod) : null;
    const plan = prod ? cppPlan(prod.priceSen, data.pb, prod.costSen, draft?.targetCppSen) : null;
    const readiness = draft ? await publishReadiness(db, workspace.id, draft) : null;
    return (
      <>
        {header}
        {!canEdit ? <p className="text-muted">{t("errors.permissionDenied")}</p> : (
          <CreateWizard
            key={draft?.id ?? "new"}
            ai={{ configured: ai, credits, costs: { strategy: CREDIT_COSTS["ads.strategy"], creative: CREDIT_COSTS["ads.creative"] } }}
            products={prods.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name, priceSen: p.priceSen, description: p.description, type: p.type, imageAssetId: p.imageAssetId, costSen: p.costSen, status: p.status }))}
            draft={draft ? { id: draft.id, name: draft.name, step: draft.step, status: draft.status, productId: draft.productId, objective: draft.objective, strategy: draft.strategy, audience: draft.audience, dailyBudgetSen: draft.dailyBudgetSen, targetCppSen: draft.targetCppSen, creative: draft.creative, destinationUrl: draft.destinationUrl, lastError: draft.lastError, metaAdId: draft.metaAdId } : null}
            available={avail}
            plan={plan}
            projections={plan ? Object.fromEntries(BUDGET_PRESETS_SEN.map((b) => [b, budgetProjection(b, plan)])) : null}
            budgetPresets={BUDGET_PRESETS_SEN}
            approaches={APPROACHES.map((a) => ({ id: a, disabled: a === "testimonial" && !testimonials }))}
            imageProvider={imageProviderConfigured()}
            readiness={readiness ? { ready: readiness.ready, checks: readiness.checks } : null}
            quota={{ plan: data.quota.plan, remaining: data.quota.remaining, trialRemaining: data.quota.trialRemaining, monthlyRemaining: data.quota.monthlyRemaining, trialUsed: data.quota.trialUsed }}
            price={ADS_STUDIO.priceSen()}
            canPublish={canManage}
            page={{ name: data.conn.config.pageName ?? null }}
          />
        )}
      </>
    );
  }

  // ------------------------------------------------------------ Settings
  const [prods, list, ai, credits] = await Promise.all([db.query.products.findMany({ where: eq(products.workspaceId, workspace.id) }), listCreatives(db, workspace.id), isAIConfigured(), creditBalance(db, workspace.id)]);
  const sub = data.quota.subscription;
  return (
    <>
      {header}
      <AdsSettings
        canManage={canManage}
        isOwner={role === "owner"}
        meta={{ appConfigured: data.conn.appConfigured, connected: Boolean(data.conn.token), expired: data.conn.expired, config: data.conn.config }}
        playbook={data.pb}
        quota={{ plan: data.quota.plan, trialUsed: data.quota.trialUsed, trialRemaining: data.quota.trialRemaining, monthlyUsed: data.quota.monthlyUsed, monthlyRemaining: data.quota.monthlyRemaining, periodEnd: data.quota.periodEnd?.toISOString() ?? null }}
        subscription={sub ? { status: sub.status, provider: sub.provider, periodEnd: sub.currentPeriodEnd.toISOString(), priceSen: sub.priceSen } : null}
        price={ADS_STUDIO.priceSen()}
        testActivationAllowed={testGatewayAllowed()}
      />
      <section className="mt-10">
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">{t("ads.library.title")}</h2>
        <p className="mb-4 text-sm text-muted">{t("ads.library.sub")}</p>
        <CreativeStudio
          canEdit={canEdit}
          aiConfigured={ai}
          credits={credits}
          cost={CREDIT_COSTS["creative.text"]}
          products={prods.map((p) => ({ id: p.id, name: p.name, priceSen: p.priceSen }))}
          textTypes={[...TEXT_CREATIVE_TYPES]}
          visualTypes={CREATIVE_TYPES.filter((x) => !(TEXT_CREATIVE_TYPES as readonly string[]).includes(x))}
          objectives={[...COPY_OBJECTIVES]}
          ratios={[...RATIOS]}
          creatives={list.filter((c) => c.type !== "meta_ad").map((c) => ({ id: c.id, type: c.type, objective: c.objective, ratio: c.ratio, status: c.status, productId: c.productId, priceSnapshotSen: c.priceSnapshotSen, content: c.content as never, createdAt: c.createdAt.toISOString() }))}
        />
      </section>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted"><AlertTriangle className="size-3.5" /> {t("ads.feesNote")}</p>
      <span className="hidden"><RefreshCw /></span>
    </>
  );
}
