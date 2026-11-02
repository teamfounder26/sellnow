"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, ImageIcon, LayoutTemplate, Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
import type { PosterBrief, PosterIntel, PosterSettings, PosterStyle } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/posters/options";
import { formatMYR } from "@/lib/money";
import { useT } from "@/lib/i18n/client";
import { Button, Card, LinkButton, Notice, cx } from "@/components/ui";
import { approvePosterBriefAction, createPosterProjectAction, generatePosterAction, regeneratePosterBriefAction, updatePosterBriefAction } from "@/app/actions/posters";
import { SetupPanel } from "./SetupPanel";
import { BriefEditor } from "./BriefEditor";
import { PosterCard, PromptCard, requestKey } from "./PosterCard";
import type { ProductOpt, ProjectData, StudioEnv } from "./types";

function Stepper({ step, t }: { step: number; t: (k: string) => string }) {
  return (
    <ol className="flex gap-1 overflow-x-auto rounded-2xl bg-white/70 p-1.5 ring-1 ring-line" aria-label={t("posters.workflow")}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <li key={n} aria-current={n === step ? "step" : undefined} className={cx("flex min-w-fit flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold", n === step ? "bg-primary text-white" : n < step ? "text-success" : "text-muted")}>
          <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]", n === step ? "bg-white/25" : n < step ? "bg-success-soft" : "bg-canvas")}>{n < step ? <Check className="size-3" /> : n}</span>
          <span className="whitespace-nowrap">{t(`posters.step.${n}`)}</span>
        </li>
      ))}
    </ol>
  );
}

type BriefJob = { id: string; projectId: string; mode: "create" | "regenerate" };

/** Polls a brief job until it finishes. The job keeps running server-side if this page closes. */
function useBriefJob(initial: BriefJob | null, onDone: (j: BriefJob) => void, onFail: (code: string) => void) {
  const [job, setJob] = useState<BriefJob | null>(initial);
  useEffect(() => {
    if (!job) return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" }).then((x) => (x.ok ? (x.json() as Promise<{ status: string; error: string | null }>) : null)).catch(() => null);
      if (stop) return;
      if (r?.status === "COMPLETED") return (setJob(null), onDone(job));
      if (r?.status === "FAILED" || r?.status === "CANCELLED") return (setJob(null), onFail(r.error ?? "errors.unexpected"));
      setTimeout(() => void tick(), 2000);
    };
    void tick();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);
  return [job, setJob] as const;
}

export function PosterStudio({ env, products, project, activeJob }: { env: StudioEnv; products: ProductOpt[]; project: ProjectData | null; activeJob: BriefJob | null }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState(project?.productId ?? products[0]?.id ?? "");
  const [settings, setSettings] = useState<PosterSettings>(project?.settings ?? { ...DEFAULT_SETTINGS, language: env.locale });
  const [showPrompts, setShowPrompts] = useState(false);
  const [textMode, setTextMode] = useState<"overlay" | "in_image">("overlay");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (project) setSettings(project.settings);
  }, [project]);

  const product = products.find((p) => p.id === productId);
  const priceLabel = product ? formatMYR(product.priceSen, env.locale) : "";
  const fail = (code: string, params?: Record<string, string | number>) => setError(t(code, params));
  const [job, setJob] = useBriefJob(
    activeJob,
    (j) => (j.mode === "create" ? router.push(`/dashboard/creative?tab=posters&project=${j.projectId}`) : router.refresh()),
    (code) => (fail(code), router.refresh()),
  );
  const queue = (fn: () => Promise<{ ok: true; data: { jobId: string; projectId: string } } | { ok: false; error: string; params?: Record<string, string | number> }>, mode: BriefJob["mode"]) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return fail(r.error, r.params);
      setJob({ id: r.data.jobId, projectId: r.data.projectId, mode });
    });
  const working = pending || Boolean(job);
  const act = (fn: () => Promise<{ ok: boolean; error?: string; params?: Record<string, string | number> } | void>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r && !r.ok) fail(r.error!, r.params);
      router.refresh();
    });

  if (!products.length) {
    return (
      <Card className="p-8 text-center">
        <p className="font-bold">{t("posters.needProduct")}</p>
        <LinkButton href="/dashboard/products/new" className="mt-4"><Plus className="size-4" /> {t("posters.addProduct")}</LinkButton>
      </Card>
    );
  }

  const posters = project?.posters ?? [];
  const anyImage = posters.some((p) => p.versions.some((v) => v.status === "succeeded"));
  const step = !project ? 2 : project.status === "brief" ? 3 : anyImage ? 6 : 5;

  const generate = async (posterId: string, kind: "ai_image" | "layout", opts?: { textMode?: "overlay" | "in_image"; style?: PosterStyle }) => {
    setBusy((b) => ({ ...b, [posterId]: true }));
    const r = await generatePosterAction(posterId, { kind, textMode: opts?.textMode ?? textMode, style: opts?.style, requestKey: requestKey() });
    setBusy((b) => ({ ...b, [posterId]: false }));
    if (!r.ok) fail(r.error, r.params);
    router.refresh();
    return r.ok;
  };
  const generateAll = async (kind: "ai_image" | "layout") => {
    setError(null);
    // Sequential: one provider call at a time keeps the per-user rate limit and credits predictable.
    for (const p of posters) if (!(await generate(p.id, kind))) break;
  };
  const totalImageCost = posters.length * env.costs.image;

  return (
    <div className="@container space-y-5">
      <Stepper step={step} t={t} />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid gap-5 @4xl:grid-cols-[340px_minmax(0,1fr)]">
        <SetupPanel
          t={t}
          env={env}
          products={products}
          productId={productId}
          onProduct={project ? undefined : setProductId}
          settings={settings}
          onChange={setSettings}
          locked={false}
          pending={working}
          mode={project ? "regenerate" : "create"}
          onSubmit={() => (project ? queue(() => regeneratePosterBriefAction(project.id, { settings }), "regenerate") : queue(() => createPosterProjectAction({ productId, settings }), "create"))}
        />

        <div className="@container min-w-0 space-y-5">
          {!project ? (
            <Card className="p-6 sm:p-8">
              {working ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="font-bold">{t("posters.empty.working")}</p>
                  <p className="text-sm text-muted">{t("posters.empty.workingHint")}</p>
                </div>
              ) : (
                <>
                  <Wand2 className="size-8 text-primary" />
                  <h2 className="mt-3 text-xl font-extrabold tracking-tight">{t("posters.empty.title")}</h2>
                  <p className="mt-1 text-muted">{t("posters.empty.body")}</p>
                  <ol className="mt-5 grid gap-3 @xl:grid-cols-3">
                    {[1, 2, 3].map((n) => (
                      <li key={n} className="rounded-2xl bg-canvas p-4 text-sm">
                        <p className="font-bold">{t(`posters.empty.s${n}`)}</p>
                        <p className="mt-1 text-muted">{t(`posters.empty.s${n}b`)}</p>
                      </li>
                    ))}
                  </ol>
                  {!env.imageConfigured && <Notice tone="blue" className="mt-5">{t("posters.imageProviderNote")}</Notice>}
                </>
              )}
            </Card>
          ) : (
            <>
              {job && (
                <Notice tone="blue" className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> {t("posters.empty.working")} {t("posters.empty.workingHint")}</Notice>
              )}
              <BriefEditor
                t={t}
                env={env}
                project={project}
                allowed={product?.allowed ?? []}
                pending={working}
                onSaveIntel={(intel: PosterIntel) => queue(() => regeneratePosterBriefAction(project.id, { intel }), "regenerate")}
                onSaveBrief={async (brief: PosterBrief) => {
                  setError(null);
                  const r = await updatePosterBriefAction(project.id, brief);
                  if (!r.ok) fail(r.error, r.params);
                  router.refresh();
                  return r.ok;
                }}
                onRegenerate={() => queue(() => regeneratePosterBriefAction(project.id, { settings }), "regenerate")}
                onApprove={() => act(() => approvePosterBriefAction(project.id))}
              />

              {project.status === "approved" && (
                <Card className="p-5 sm:p-6">
                  <h2 className="text-lg font-extrabold tracking-tight">{t("posters.gen.title")}</h2>
                  <p className="mt-1 text-sm text-muted">{t("posters.gen.sub")}</p>
                  <div className="mt-4 grid gap-3 @2xl:grid-cols-3">
                    <div className="flex flex-col rounded-2xl p-4 ring-1 ring-line">
                      <FileText className="size-6 text-primary" />
                      <p className="mt-2 font-bold">{t("posters.gen.promptsTitle")}</p>
                      <p className="mt-1 flex-1 text-sm text-muted">{t("posters.gen.promptsBody")}</p>
                      <Button variant="secondary" className="mt-3" onClick={() => setShowPrompts(!showPrompts)}>{t(showPrompts ? "posters.gen.hidePrompts" : "posters.gen.prompts")} · {t("posters.free")}</Button>
                    </div>
                    <div className="flex flex-col rounded-2xl p-4 ring-1 ring-line">
                      <Sparkles className="size-6 text-primary" />
                      <p className="mt-2 font-bold">{t("posters.gen.imagesTitle")}</p>
                      <p className="mt-1 flex-1 text-sm text-muted">{t("posters.gen.imagesBody")}</p>
                      {env.imageConfigured ? (
                        <>
                          <div className="mt-3 space-y-1 text-xs">
                            {(["overlay", "in_image"] as const).map((m) => (
                              <label key={m} className="flex items-start gap-2"><input type="radio" name="textMode" checked={textMode === m} onChange={() => setTextMode(m)} className="mt-0.5" /> <span><b>{t(`posters.gen.mode.${m}`)}</b> — {t(`posters.gen.mode.${m}Hint`)}</span></label>
                            ))}
                          </div>
                          <Button className="mt-3" disabled={Object.values(busy).some(Boolean) || env.credits < totalImageCost || !env.canEdit} onClick={() => void generateAll("ai_image")}>
                            {Object.values(busy).some(Boolean) ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />} {t("posters.gen.images", { n: posters.length })}
                          </Button>
                          <p className={cx("mt-1 text-center text-xs", env.credits < totalImageCost ? "text-danger" : "text-muted")}>{t("posters.gen.cost", { n: totalImageCost, each: env.costs.image, balance: env.credits })}</p>
                        </>
                      ) : (
                        <Notice tone="blue" className="mt-3 text-xs">{t("posters.imageProviderNote")}</Notice>
                      )}
                    </div>
                    <div className="flex flex-col rounded-2xl p-4 ring-1 ring-line">
                      <LayoutTemplate className="size-6 text-primary" />
                      <p className="mt-2 font-bold">{t("posters.gen.layoutTitle")}</p>
                      <p className="mt-1 flex-1 text-sm text-muted">{t(product?.imageAssetId ? "posters.gen.layoutBody" : "posters.gen.layoutNoPhoto")}</p>
                      <Button variant="secondary" className="mt-3" disabled={!product?.imageAssetId || Object.values(busy).some(Boolean) || !env.canEdit} onClick={() => void generateAll("layout")}>{t("posters.gen.layout")} · {t("posters.free")}</Button>
                    </div>
                  </div>
                </Card>
              )}

              {project.status === "approved" && showPrompts && (
                <div className="grid gap-4 @3xl:grid-cols-2">
                  {posters.map((p) => <PromptCard key={p.id} t={t} env={env} poster={p} busy={Boolean(busy[p.id])} onGenerate={() => void generate(p.id, "ai_image", { textMode: "in_image" })} />)}
                </div>
              )}

              {project.status === "approved" && (
                <div className="space-y-4">
                  {posters.map((p) => (
                    <PosterCard key={p.id} t={t} env={env} project={project} poster={p} priceLabel={priceLabel} productName={product?.name ?? ""} busy={Boolean(busy[p.id])} productHasImage={Boolean(product?.imageAssetId)} onGenerate={(kind, opts) => void generate(p.id, kind, opts)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
