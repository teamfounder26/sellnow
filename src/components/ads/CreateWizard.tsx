"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Download, Image as ImageIcon, Info, Loader2, Package, RefreshCw, Rocket, Save, Sparkles, X, XCircle } from "lucide-react";
import type { AdAudience, AdCreative, AdObjective, AdStrategy } from "@/lib/db/schema";
import type { CppPlan } from "@/lib/ads/playbook";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR, parseRinggitToSen } from "@/lib/money";
import { chooseCreativeAction, createAdDraftAction, generateAdCopyAction, publishAdAction, recommendStrategyAction, updateAdDraftAction } from "@/app/actions/ads";
import { Badge, Button, Input, Notice, Textarea, cx } from "@/components/ui";
import { AdPreview } from "./AdPreview";

type Product = { id: string; name: string; priceSen: number; description: string; type: string; imageAssetId: string | null; costSen: number | null; status: string };
type Draft = { id: string; name: string; step: string; status: string; productId: string | null; objective: AdObjective | null; strategy: AdStrategy | null; audience: AdAudience | null; dailyBudgetSen: number | null; targetCppSen: number | null; creative: AdCreative | null; destinationUrl: string | null; lastError: string | null; metaAdId: string | null };
type Proj = { dailySen: number; monthlySen: number; purchasesLow: number; purchasesHigh: number };

const STEPS = ["product", "strategy", "audience", "budget", "creative", "review"] as const;
const CTAS = ["shop_now", "order_now", "learn_more", "sign_up", "send_message", "contact_us", "get_quote", "subscribe", "download"] as const;

export function CreateWizard(props: {
  ai: { configured: boolean; credits: number; costs: { strategy: number; creative: number } };
  products: Product[];
  draft: Draft | null;
  available: { sales: boolean; leads: boolean; messages: boolean; traffic: boolean; live: boolean } | null;
  plan: CppPlan | null;
  projections: Record<string, Proj> | null;
  budgetPresets: number[];
  approaches: { id: string; disabled: boolean }[];
  imageProvider: boolean;
  readiness: { ready: boolean; checks: { id: string; ok: boolean; blocking: boolean; params?: Record<string, string> }[] } | null;
  quota: { plan: "free" | "paid"; remaining: number; trialRemaining: number; monthlyRemaining: number; trialUsed: number };
  price: number;
  canPublish: boolean;
  page: { name: string | null };
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const d = props.draft;
  const product = props.products.find((p) => p.id === d?.productId) ?? null;
  const [step, setStep] = useState<(typeof STEPS)[number]>(d ? ((STEPS as readonly string[]).includes(d.step) ? (d.step as (typeof STEPS)[number]) : "strategy") : "product");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = (sen: number | null | undefined) => (sen == null ? t("ads.na") : formatMYR(sen, locale));
  const live = Boolean(d?.metaAdId);

  // Local editable state, persisted per step.
  const [objective, setObjective] = useState<AdObjective | null>(d?.objective ?? null);
  const [audience, setAudience] = useState<AdAudience>(d?.audience ?? { country: "MY", ageMin: 18, ageMax: 65, gender: "all", mode: "broad", interests: [], placements: "advantage" });
  const [budget, setBudget] = useState<number>(d?.dailyBudgetSen ?? 5000);
  const [customBudget, setCustomBudget] = useState("");
  const [target, setTarget] = useState(d?.targetCppSen ? (d.targetCppSen / 100).toFixed(2) : "");
  const [cost, setCost] = useState(product?.costSen != null ? (product.costSen / 100).toFixed(2) : "");
  const [approach, setApproach] = useState(d?.creative?.approach ?? "problem_solution");
  const [variants, setVariants] = useState<AdCreative[]>(d?.creative ? [d.creative] : []);
  const [creativeId, setCreativeId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<AdCreative | null>(d?.creative ?? null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [published, setPublished] = useState(false);
  useEffect(() => {
    if (d) {
      setObjective(d.objective);
      if (d.audience) setAudience(d.audience);
    }
  }, [d?.objective, d?.audience]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (fn: () => Promise<{ ok: boolean; error?: string; params?: Record<string, string | number> } | void>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r && !r.ok) setError(t(r.error!, r.params));
      else {
        after?.();
        router.refresh();
      }
    });
  const save = (patch: Record<string, unknown>, next?: (typeof STEPS)[number]) => run(() => updateAdDraftAction(d!.id, { ...patch, ...(next ? { step: next } : {}) }), () => next && setStep(next));

  const idx = STEPS.indexOf(step);
  const plan = props.plan;
  const proj = (b: number) => props.projections?.[String(b)] ?? (plan ? { dailySen: b, monthlySen: b * 30, purchasesLow: Math.floor((b * 30) / plan.preferred.highSen), purchasesHigh: Math.floor((b * 30) / plan.preferred.lowSen) } : null);

  if (published || (live && d?.status !== "failed")) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <h2 className="mt-4 text-2xl font-extrabold">{t("ads.wizard.publishedTitle")}</h2>
        <p className="mt-2 text-muted">{t("ads.wizard.publishedBody")}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => router.push(`/dashboard/creative/ads/${d!.id}`)}>{t("ads.actions.details")}</Button>
          <Button variant="secondary" onClick={() => router.push("/dashboard/creative?tab=overview")}>{t("ads.tabs.overview")}</Button>
        </div>
      </div>
    );
  }

  const exportText = d && chosen ? [`${t("ads.wizard.primaryText")}:\n${chosen.primaryText}`, `${t("ads.wizard.headline")}: ${chosen.headline}`, `${t("ads.wizard.description")}: ${chosen.description}`, `CTA: ${t(`ads.cta.${chosen.cta}`)}`, `URL: ${d.destinationUrl ?? ""}`, `${t("ads.wizard.audience")}: MY, ${audience.ageMin}–${audience.ageMax}, ${t(`ads.gender.${audience.gender}`)}`, `${t("ads.wizard.dailyBudget")}: ${m(budget)}`].join("\n\n") : "";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <ol className="mb-6 flex flex-wrap items-center gap-1" aria-label={t("ads.wizard.progress")}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <button
                type="button"
                disabled={!d || i > Math.max(idx, STEPS.indexOf((d?.step as (typeof STEPS)[number]) ?? "product"))}
                onClick={() => setStep(s)}
                className={cx("flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-bold transition disabled:cursor-default", i === idx ? "bg-primary text-white shadow-glow" : i < idx ? "bg-primary-soft text-primary-strong" : "text-muted")}
                aria-current={i === idx ? "step" : undefined}
              >
                {i < idx ? <Check className="size-3.5" /> : <span className="tabular-nums">{i + 1}</span>} {t(`ads.wizard.steps.${s}`)}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-3 bg-line" />}
            </li>
          ))}
        </ol>

        <div key={step} className="animate-rise rounded-[26px] bg-white p-5 shadow-soft ring-1 ring-line sm:p-7">
          {/* ---------------- Step 1: Product */}
          {step === "product" && (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight">{t("ads.wizard.productTitle")}</h2>
              <p className="mt-1 text-muted">{t("ads.wizard.productSub")}</p>
              {props.products.length === 0 ? (
                <Notice tone="warning" className="mt-5">{t("ads.wizard.noProducts")}</Notice>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {props.products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setError(null);
                          const r = await createAdDraftAction(p.id);
                          if (!r.ok) setError(t(r.error, r.params));
                          else router.push(`/dashboard/creative?tab=create&ad=${r.data.id}`);
                        })
                      }
                      className={cx("flex gap-3 rounded-2xl p-3 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-lift", d?.productId === p.id ? "ring-2 ring-primary" : "ring-line")}
                    >
                      <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-soft">{p.imageAssetId ? <img src={`/api/assets/${p.imageAssetId}`} alt="" className="h-full w-full object-cover" /> : <Package className="size-6 text-primary/50" />}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{p.name}</span>
                        <span className="block text-sm font-extrabold text-primary-strong">{m(p.priceSen)}</span>
                        <span className="line-clamp-2 text-xs text-muted">{p.description || t(`categories.${p.type}`)}</span>
                        {p.status === "draft" && <Badge tone="warning" className="mt-1">{t("ads.wizard.productDraft")}</Badge>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ---------------- Step 2: Strategy */}
          {step === "strategy" && d && product && (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight">{t("ads.wizard.strategyTitle")}</h2>
              <p className="mt-1 text-muted">{t("ads.wizard.strategySub", { product: product.name })}</p>
              {!d.strategy ? (
                <div className="mt-6 flex flex-col items-start gap-3">
                  <Button onClick={() => run(() => recommendStrategyAction(d.id))} disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t(props.ai.configured ? "ads.wizard.analyze" : "ads.wizard.recommend")}
                    {props.ai.configured && <span className="text-xs opacity-80">· {t("common.credits", { n: props.ai.costs.strategy })}</span>}
                  </Button>
                  {!props.ai.configured && <p className="text-xs text-muted">{t("ads.wizard.rulesNote")}</p>}
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {d.strategy.byAI && (
                    <dl className="grid gap-2 sm:grid-cols-2">
                      {[
                        ["customerProblem", d.strategy.customerProblem],
                        ["targetBuyer", d.strategy.targetBuyer],
                        ["purchaseIntent", d.strategy.purchaseIntent],
                        ["benefits", (d.strategy.benefits ?? []).join(" · ")],
                      ].filter(([, v]) => v).map(([k, v]) => (
                        <div key={k} className="rounded-2xl bg-canvas p-3"><dt className="text-xs font-semibold text-muted">{t(`ads.wizard.${k}`)}</dt><dd className="mt-0.5 text-sm">{v}</dd></div>
                      ))}
                    </dl>
                  )}
                  <div className="rounded-2xl bg-primary-soft/60 p-4 text-sm ring-1 ring-primary/15">
                    <p className="flex items-center gap-1.5 font-bold text-primary-strong"><Sparkles className="size-4" /> {t(d.strategy.byAI ? "ads.wizard.aiRecommends" : "ads.wizard.weRecommend", { objective: t(`ads.objective.${d.strategy.objective}`) })}</p>
                    <p className="mt-1 text-ink/85">{d.strategy.byAI ? d.strategy.reason : t(`ads.wizard.reason.${d.strategy.objective}`)}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["sales", "leads", "messages", "traffic"] as const).map((o) => {
                      const ok = props.available?.[o] ?? false;
                      return (
                        <button key={o} type="button" disabled={!ok} onClick={() => setObjective(o)} className={cx("rounded-2xl p-3 text-left ring-1 transition disabled:opacity-50", objective === o ? "bg-primary-soft ring-2 ring-primary" : "ring-line hover:ring-primary/40")}>
                          <span className="block font-bold">{t(`ads.objective.${o}`)}</span>
                          <span className="block text-xs text-muted">{ok ? t(`ads.objectiveDesc.${o}`) : t(`ads.objectiveNA.${o}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------------- Step 3: Audience */}
          {step === "audience" && d && (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight">{t("ads.wizard.audienceTitle")}</h2>
              <p className="mt-1 text-muted">{t("ads.wizard.audienceSub")}</p>
              {audience.reason && <p className="mt-4 rounded-2xl bg-primary-soft/60 p-3 text-sm"><Sparkles className="mr-1 inline size-4 text-primary" />{audience.reason.startsWith("rule.") ? t("ads.wizard.broadReason") : audience.reason}</p>}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">{t("ads.wizard.country")}<Input value="Malaysia" disabled className="mt-1" /></label>
                <div className="text-sm font-semibold">
                  {t("ads.wizard.age")}
                  <div className="mt-1 flex items-center gap-2">
                    <Input type="number" min={18} max={65} value={audience.ageMin} onChange={(e) => setAudience((a) => ({ ...a, ageMin: Number(e.target.value) }))} aria-label={t("ads.wizard.ageMin")} />
                    <span>–</span>
                    <Input type="number" min={18} max={65} value={audience.ageMax} onChange={(e) => setAudience((a) => ({ ...a, ageMax: Number(e.target.value) }))} aria-label={t("ads.wizard.ageMax")} />
                  </div>
                </div>
                <div className="text-sm font-semibold">
                  {t("ads.wizard.gender")}
                  <div className="mt-1 flex gap-1.5">{(["all", "female", "male"] as const).map((g) => <button key={g} type="button" onClick={() => setAudience((a) => ({ ...a, gender: g }))} className={cx("flex-1 rounded-xl px-3 py-2 text-sm ring-1", audience.gender === g ? "bg-primary text-white ring-primary" : "ring-line")}>{t(`ads.gender.${g}`)}</button>)}</div>
                </div>
                <div className="text-sm font-semibold">
                  {t("ads.wizard.targeting")}
                  <div className="mt-1 flex gap-1.5">{(["broad", "detailed"] as const).map((g) => <button key={g} type="button" onClick={() => setAudience((a) => ({ ...a, mode: g }))} className={cx("flex-1 rounded-xl px-3 py-2 text-sm ring-1", audience.mode === g ? "bg-primary text-white ring-primary" : "ring-line")}>{t(`ads.targeting.${g}`)}</button>)}</div>
                </div>
                {audience.mode === "detailed" && (
                  <label className="text-sm font-semibold sm:col-span-2">{t("ads.wizard.interests")}<Input value={audience.interests.join(", ")} onChange={(e) => setAudience((a) => ({ ...a, interests: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10) }))} placeholder={t("ads.wizard.interestsPh")} className="mt-1" /></label>
                )}
                <div className="text-sm font-semibold sm:col-span-2">
                  {t("ads.wizard.placements")}
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-3">{(["advantage", "feeds", "stories_reels"] as const).map((g) => <button key={g} type="button" onClick={() => setAudience((a) => ({ ...a, placements: g }))} className={cx("rounded-xl px-3 py-2 text-left text-sm ring-1", audience.placements === g ? "bg-primary-soft ring-2 ring-primary" : "ring-line")}><span className="block font-bold">{t(`ads.placements.${g}`)}</span><span className="block text-xs font-normal text-muted">{t(`ads.placementsDesc.${g}`)}</span></button>)}</div>
                </div>
              </div>
            </>
          )}

          {/* ---------------- Step 4: Budget & CPP */}
          {step === "budget" && d && plan && (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight">{t("ads.wizard.budgetTitle")}</h2>
              <p className="mt-1 text-muted">{t("ads.wizard.budgetSub", { price: m(plan.priceSen) })}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["benchmark", `${m(plan.benchmark.lowSen)} – ${m(plan.benchmark.highSen)}`],
                  ["preferred", `${m(plan.preferred.lowSen)} – ${m(plan.preferred.highSen)}`],
                  ["reference", m(plan.referenceSen)],
                  ["breakEven", plan.maxProfitableSen == null ? t("ads.wizard.needCost") : m(plan.maxProfitableSen)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold text-muted">{t(`ads.cppKind.${k}`)}</p><p className="mt-1 text-lg font-extrabold tabular-nums">{v}</p><p className="mt-0.5 text-xs text-muted">{t(`ads.cppKindDesc.${k}`)}</p></div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">{t("ads.wizard.productCost")}<Input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder={t("ads.wizard.optional")} className="mt-1" /><span className="mt-1 block text-xs font-normal text-muted">{t("ads.wizard.productCostHint")}</span></label>
                <label className="text-sm font-semibold">{t("ads.wizard.targetCpp")}<Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder={(plan.referenceSen / 100).toFixed(2)} className="mt-1" /><span className="mt-1 block text-xs font-normal text-muted">{t("ads.wizard.targetHint")}</span></label>
              </div>
              <p className="mt-6 text-sm font-bold">{t("ads.wizard.dailyBudget")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {props.budgetPresets.map((b) => <button key={b} type="button" onClick={() => (setBudget(b), setCustomBudget(""))} className={cx("rounded-2xl py-3 font-extrabold ring-1", !customBudget && budget === b ? "bg-primary text-white ring-primary" : "ring-line")}>{m(b)}</button>)}
                <Input value={customBudget} onChange={(e) => { setCustomBudget(e.target.value); const s = parseRinggitToSen(e.target.value); if (s) setBudget(s); }} placeholder={t("ads.wizard.custom")} inputMode="decimal" className="h-full min-h-12" aria-label={t("ads.wizard.custom")} />
              </div>
              {proj(budget) && (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl bg-canvas p-3"><p className="text-xs text-muted">{t("ads.wizard.daily")}</p><p className="font-extrabold">{m(budget)}</p></div>
                  <div className="rounded-2xl bg-canvas p-3"><p className="text-xs text-muted">{t("ads.wizard.monthly")}</p><p className="font-extrabold">{m(proj(budget)!.monthlySen)}</p></div>
                  <div className="rounded-2xl bg-canvas p-3"><p className="text-xs text-muted">{t("ads.wizard.potential")}</p><p className="font-extrabold">{proj(budget)!.purchasesLow}–{proj(budget)!.purchasesHigh}</p></div>
                </div>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" /> {t("ads.wizard.illustrative")}</p>
            </>
          )}

          {/* ---------------- Step 5: Creative */}
          {step === "creative" && d && product && (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight">{t("ads.wizard.creativeTitle")}</h2>
              <p className="mt-1 text-muted">{t("ads.wizard.creativeSub")}</p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {props.approaches.map((a) => <button key={a.id} type="button" disabled={a.disabled} title={a.disabled ? t("ads.wizard.testimonialNeeded") : undefined} onClick={() => setApproach(a.id)} className={cx("rounded-pill px-3 py-1.5 text-sm font-semibold ring-1 disabled:opacity-40", approach === a.id ? "bg-primary text-white ring-primary" : "ring-line hover:ring-primary/40")}>{t(`ads.approach.${a.id}`)}</button>)}
              </div>
              <Button className="mt-4" disabled={pending} onClick={() => start(async () => { setError(null); const r = await generateAdCopyAction(d.id, approach); if (!r.ok) setError(t(r.error, r.params)); else { setVariants(r.data.variants); setCreativeId(r.data.creativeId); setChosen(r.data.variants[0] ?? null); } })}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : variants.length ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />} {t(props.ai.configured ? (variants.length ? "ads.wizard.regenerate" : "ads.wizard.generate") : "ads.wizard.startTemplate")}
                {props.ai.configured && <span className="text-xs opacity-80">· {t("common.credits", { n: props.ai.costs.creative })}</span>}
              </Button>
              {!props.ai.configured && <p className="mt-2 text-xs text-muted">{t("ads.wizard.templateNote")}</p>}
              {variants.length > 1 && (
                <div className="mt-4 flex gap-2">{variants.map((v, i) => <button key={i} type="button" onClick={() => setChosen(v)} className={cx("rounded-xl px-3 py-1.5 text-sm font-semibold ring-1", chosen === v ? "bg-primary-soft ring-2 ring-primary" : "ring-line")}>{t("ads.wizard.variant", { n: i + 1 })}</button>)}</div>
              )}
              {chosen && (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-semibold">{t("ads.wizard.primaryText")}<Textarea value={chosen.primaryText} onChange={(e) => setChosen({ ...chosen, primaryText: e.target.value })} rows={6} className="mt-1" /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">{t("ads.wizard.headline")}<Input value={chosen.headline} onChange={(e) => setChosen({ ...chosen, headline: e.target.value })} maxLength={255} className="mt-1" /></label>
                    <label className="text-sm font-semibold">{t("ads.wizard.description")}<Input value={chosen.description} onChange={(e) => setChosen({ ...chosen, description: e.target.value })} maxLength={255} className="mt-1" /></label>
                  </div>
                  <label className="block text-sm font-semibold">CTA
                    <select value={chosen.cta} onChange={(e) => setChosen({ ...chosen, cta: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3">{CTAS.map((c) => <option key={c} value={c}>{t(`ads.cta.${c}`)}</option>)}</select>
                  </label>
                </div>
              )}
              <div className="mt-5 rounded-2xl bg-canvas p-4 text-sm">
                <p className="flex items-center gap-1.5 font-bold"><ImageIcon className="size-4 text-primary" /> {t("ads.wizard.imageTitle")}</p>
                {d?.creative?.imageAssetId ? (
                  <div className="mt-2 flex items-center gap-3">
                    <img src={`/api/assets/${d.creative.imageAssetId}`} alt="" className="h-20 rounded-lg bg-white ring-1 ring-line" />
                    <p className="text-muted">{t("ads.wizard.posterImage")}</p>
                  </div>
                ) : (
                  <p className="mt-1 text-muted">{product.imageAssetId ? t("ads.wizard.imageUsesProduct") : t("ads.wizard.imageNone")}</p>
                )}
                <a href="/dashboard/creative?tab=posters" className="mt-2 inline-block font-semibold text-primary hover:underline">{t("ads.wizard.openPosterStudio")}</a>
              </div>
            </>
          )}

          {/* ---------------- Step 6: Review */}
          {step === "review" && d && (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight">{t("ads.wizard.reviewTitle")}</h2>
              <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
                {[
                  ["product", product?.name],
                  ["objective", d.objective ? t(`ads.objective.${d.objective}`) : t("ads.na")],
                  ["audience", d.audience ? `MY · ${d.audience.ageMin}–${d.audience.ageMax} · ${t(`ads.gender.${d.audience.gender}`)} · ${t(`ads.targeting.${d.audience.mode}`)}` : t("ads.na")],
                  ["dailyBudget", m(d.dailyBudgetSen)],
                  ["targetCpp", m(d.targetCppSen ?? plan?.referenceSen)],
                  ["destination", d.destinationUrl ?? t("ads.na")],
                ].map(([k, v]) => <div key={k} className="rounded-2xl bg-canvas p-3"><dt className="text-xs font-semibold text-muted">{k === "targetCpp" ? t("ads.metric.targetCpp") : t(`ads.wizard.${k}`)}</dt><dd className="mt-0.5 break-all font-semibold">{v}</dd></div>)}
              </dl>
              {props.readiness && (
                <div className="mt-5">
                  <p className="text-sm font-bold">{t("ads.wizard.readiness")}</p>
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {props.readiness.checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 text-sm">
                        {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : c.blocking ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
                        <span className={cx(!c.ok && c.blocking && "text-danger")}>{t(`ads.check.${c.id}${c.ok ? "" : "Missing"}`, c.params)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.lastError && <Notice tone="danger" className="mt-4">{t("ads.wizard.lastError")}: {d.lastError.split(":")[0] ? t(d.lastError.split(":")[0]!) : ""}{d.lastError.includes(":") ? ` — ${d.lastError.split(":").slice(1).join(":").trim()}` : ""}</Notice>}
              {props.readiness && !props.readiness.ready && <Notice tone="blue" className="mt-4">{t("ads.wizard.exportMode")}</Notice>}
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => router.push("/dashboard/creative?tab=ads")}><Save className="size-4" /> {t("ads.wizard.saveDraft")}</Button>
                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(exportText)} disabled={!exportText}><Copy className="size-4" /> {t("ads.wizard.copyAll")}</Button>
                <a className="inline-flex h-11 items-center gap-2 rounded-pill border border-line px-5 text-[15px] font-semibold" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ name: d.name, objective: d.objective, audience: d.audience, dailyBudgetMYR: d.dailyBudgetSen != null ? d.dailyBudgetSen / 100 : null, creative: d.creative, destinationUrl: d.destinationUrl }, null, 2))}`} download={`${d.name.replace(/[^\w-]+/g, "_")}.json`}><Download className="size-4" /> {t("ads.wizard.export")}</a>
                {props.canPublish ? (
                  <Button
                    disabled={!props.readiness?.ready || pending}
                    onClick={() => (props.quota.remaining > 0 ? setConfirmOpen(true) : setUpgradeOpen(true))}
                  >
                    <Rocket className="size-4" /> {t("ads.wizard.publish")}
                  </Button>
                ) : <p className="self-center text-xs text-muted">{t("ads.wizard.publishNeedsAdmin")}</p>}
              </div>
              <p className="mt-3 text-xs text-muted">{t("ads.wizard.slotNote", { n: props.quota.plan === "paid" ? props.quota.monthlyRemaining : props.quota.trialRemaining })} {t("ads.feesNote")}</p>
            </>
          )}

          {error && <Notice tone="danger" className="mt-5">{error}</Notice>}

          {/* ---------------- Footer nav (persists each step) */}
          {d && step !== "product" && (
            <div className="mt-7 flex items-center justify-between border-t border-line pt-5">
              <Button variant="ghost" onClick={() => setStep(STEPS[idx - 1]!)} disabled={pending}><ArrowLeft className="size-4" /> {t("common.back")}</Button>
              {step === "strategy" && d.strategy && <Button disabled={!objective || pending} onClick={() => save({ objective }, "audience")}>{t("common.continue")} <ArrowRight className="size-4" /></Button>}
              {step === "audience" && <Button disabled={pending || audience.ageMin > audience.ageMax} onClick={() => save({ audience }, "budget")}>{t("common.continue")} <ArrowRight className="size-4" /></Button>}
              {step === "budget" && (
                <Button
                  disabled={pending || budget < 500}
                  onClick={() => {
                    const targetSen = target.trim() ? parseRinggitToSen(target) : null;
                    const costSen = cost.trim() ? parseRinggitToSen(cost) : null;
                    if (target.trim() && !targetSen) return setError(t("errors.validation"));
                    save({ dailyBudgetSen: budget, targetCppSen: targetSen, productCostSen: costSen }, "creative");
                  }}
                >
                  {t("common.continue")} <ArrowRight className="size-4" />
                </Button>
              )}
              {step === "creative" && <Button disabled={!chosen || pending} onClick={() => run(() => chooseCreativeAction(d.id, chosen!, creativeId), () => setStep("review"))}>{t("common.continue")} <ArrowRight className="size-4" /></Button>}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Right panel: live preview + context */}
      <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("ads.wizard.livePreview")}</p>
        <AdPreview pageName={props.page.name} creative={step === "creative" || step === "review" ? chosen : d?.creative ?? null} imageAssetId={d?.creative?.imageAssetId ?? product?.imageAssetId ?? null} url={d?.destinationUrl ?? null} />
        <p className="text-[11px] text-muted">{t("ads.preview.note")}</p>
        {plan && step === "budget" && <div className="rounded-2xl bg-white p-4 text-sm shadow-soft ring-1 ring-line"><p className="font-bold">{t("ads.wizard.cppTip")}</p><p className="mt-1 text-muted">{t("ads.wizard.cppTipBody", { ref: m(plan.referenceSen), scale: `${m(plan.scaleBand.lowSen)}–${m(plan.scaleBand.highSen)}` })}</p></div>}
      </aside>

      {/* ---------------- Publish confirmation */}
      {confirmOpen && d && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pub-title">
          <div className="relative w-full max-w-md rounded-[26px] bg-white p-6 shadow-lift">
            <button type="button" onClick={() => setConfirmOpen(false)} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full hover:bg-canvas" aria-label={t("common.close")}><X className="size-5" /></button>
            <h2 id="pub-title" className="text-xl font-extrabold">{t("ads.confirm.title")}</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li>{t("ads.confirm.budget", { amount: m(d.dailyBudgetSen) })}</li>
              <li>{t("ads.confirm.billing")}</li>
              <li>{t("ads.confirm.slot", { n: (props.quota.plan === "paid" ? props.quota.monthlyRemaining : props.quota.trialRemaining) - 1 })}</li>
              <li>{t("ads.confirm.review")}</li>
            </ul>
            <Button
              size="lg"
              className="mt-5 w-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await publishAdAction(d.id, true);
                  setConfirmOpen(false);
                  if (!r.ok) {
                    if (r.error === "ads.trialUsed" || r.error === "ads.monthlyQuotaUsed") setUpgradeOpen(true);
                    else setError(t(r.error, r.params));
                    router.refresh();
                  } else setPublished(true);
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} {t("ads.confirm.cta")}
            </Button>
          </div>
        </div>
      )}

      {upgradeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="up-title">
          <div className="relative w-full max-w-md rounded-[26px] bg-white p-7 text-center shadow-lift">
            <button type="button" onClick={() => setUpgradeOpen(false)} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full hover:bg-canvas" aria-label={t("common.close")}><X className="size-5" /></button>
            <Sparkles className="mx-auto size-10 text-primary" />
            <h2 id="up-title" className="mt-3 text-2xl font-extrabold">{t(props.quota.plan === "paid" ? "ads.upgrade.monthlyTitle" : "ads.upgrade.title")}</h2>
            <p className="mt-2 text-muted">{t(props.quota.plan === "paid" ? "ads.upgrade.monthlyBody" : "ads.upgrade.body")}</p>
            {props.quota.plan === "free" && (
              <>
                <p className="mt-5 text-4xl font-extrabold text-primary-strong">{formatMYR(props.price, locale)}<span className="text-base font-semibold text-muted">/{t("ads.month")}</span></p>
                <p className="mt-1 text-xs text-muted">{t("ads.upgrade.separate")}</p>
                <Button size="lg" className="mt-5 w-full" onClick={() => router.push("/dashboard/creative?tab=settings#subscription")}>{t("ads.upgrade.cta")}</Button>
              </>
            )}
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setUpgradeOpen(false)}>{t("ads.upgrade.later")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
