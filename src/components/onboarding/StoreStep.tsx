"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Info, Loader2, Monitor, Smartphone, Sparkles, X } from "lucide-react";
import type { WebsiteTypeId } from "@/lib/website/types";
import { DESIGN_PRESETS, type DesignPresetId } from "@/lib/website/design";
import { useT } from "@/lib/i18n/client";
import { chooseWebsiteTypeAction } from "@/app/actions/onboarding";
import { Badge, Button, Notice, cx } from "@/components/ui";
import { StepHeading, type WizardProps } from "./OnboardingWizard";

/** Lightweight visual thumbnail of a format (layout + niche palette). Real interactive previews open in the modal. */
function WebsiteThumb({ layout, preset }: { layout: "single" | "catalog"; preset: DesignPresetId }) {
  const p = DESIGN_PRESETS[preset].palette;
  const dark = preset === "fitness";
  const block = dark ? "bg-white/15" : "bg-black/[0.07]";
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-2xl ring-1 ring-black/5" style={{ background: p.background }} aria-hidden>
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className={cx("h-2 w-12 rounded-full", block)} />
        <span className="h-3.5 w-10 rounded-full" style={{ background: p.primary }} />
      </div>
      {layout === "single" ? (
        <div className="grid grid-cols-2 gap-3 px-3 pt-4">
          <div className="space-y-1.5">
            <span className={cx("block h-3 w-full rounded", block)} />
            <span className={cx("block h-3 w-4/5 rounded", block)} />
            <span className={cx("block h-1.5 w-3/5 rounded", block)} />
            <span className="mt-2 block h-4 w-14 rounded-full" style={{ background: p.primary }} />
          </div>
          <div className="aspect-square rounded-xl" style={{ background: `linear-gradient(135deg, ${p.primary}55, ${p.accent}88)` }} />
          <div className="col-span-2 grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className={cx("h-6 rounded-lg", block)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="px-3 pt-3">
          <span className="block h-10 rounded-xl" style={{ background: `linear-gradient(120deg, ${p.primary}44, ${p.accent}77)` }} />
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="space-y-1">
                <span className="block aspect-square rounded-lg" style={{ background: i % 2 ? `${p.accent}66` : `${p.primary}33` }} />
                <span className={cx("block h-1 w-3/4 rounded", block)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function StoreStep({ session, store, ai }: WizardProps) {
  const t = useT();
  const router = useRouter();
  const [preview, setPreview] = useState<WebsiteTypeId | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!store) return <Notice tone="warning">{t("onboarding.categoryRequired")}</Notice>;
  const preset = store.preset as DesignPresetId;
  const types = [...store.types].sort((a, b) => Number(b.id === store.recommended.id) - Number(a.id === store.recommended.id));

  const choose = (id: string) =>
    start(async () => {
      setSelected(id);
      setError(null);
      const r = await chooseWebsiteTypeAction(session.id, id);
      if (!r.ok) {
        setError(t(r.error, r.params));
        setSelected(null);
      } else router.refresh();
    });

  return (
    <div>
      <StepHeading title={t("wizard.store.title")} sub={t("wizard.store.sub")} />
      <div className={cx("grid gap-5", types.length > 2 ? "md:grid-cols-3" : "sm:grid-cols-2")}>
        {types.map((wt) => {
          const rec = wt.id === store.recommended.id;
          return (
            <article
              key={wt.id}
              className={cx(
                "group relative flex flex-col rounded-[26px] bg-white p-3 ring-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift",
                rec ? "shadow-glow ring-2 ring-primary" : "shadow-soft ring-line",
              )}
            >
              {rec && (
                <span className="absolute -top-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-pill bg-gradient-to-r from-primary to-ai px-3 py-1 text-xs font-bold text-white shadow-glow">
                  <Sparkles className="size-3.5" /> {t(store.recommended.byAI ? "wizard.store.recommendedAI" : "wizard.store.recommended")}
                </span>
              )}
              <WebsiteThumb layout={wt.layout} preset={preset} />
              <div className="flex flex-1 flex-col px-2 pb-1 pt-4">
                <h3 className="text-lg font-extrabold tracking-tight">{t(`website.types.${wt.id}.name`)}</h3>
                <p className="mt-1 text-sm text-muted">{t(`website.types.${wt.id}.desc`)}</p>
                <p className="mt-3 text-xs font-semibold text-ink/70">
                  <span className="text-primary-strong">{t("wizard.store.bestFor")}</span> {t(`website.types.${wt.id}.bestFor`)}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {wt.modules.map((m) => (
                    <Badge key={m} tone={m === "interest" ? "warning" : "neutral"}>
                      {t(`website.modules.${m}`)}
                    </Badge>
                  ))}
                </div>
                {wt.availability === "interest" && <p className="mt-2 flex gap-1.5 text-xs text-warning"><Info className="mt-0.5 size-3.5 shrink-0" /> {t("website.interestNote")}</p>}
                {rec && <p className="mt-3 rounded-xl bg-primary-soft/70 px-3 py-2 text-[13px] leading-snug text-primary-strong">{store.recommended.reason ?? t(`website.reasons.${store.recommended.reasonKey}`)}</p>}
                <div className="mt-auto flex gap-2 pt-4">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setPreview(wt.id)}>
                    <Eye className="size-4" /> {t("wizard.store.preview")}
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => choose(wt.id)} disabled={pending}>
                    {pending && selected === wt.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("wizard.store.select")}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {error && (
        <Notice tone="danger" className="mt-5">
          {error}
        </Notice>
      )}
      {ai.configured && <p className="mt-6 text-center text-xs text-muted">{t("wizard.creditsNote", { n: ai.costs.website, balance: ai.credits })}</p>}

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/40 p-2 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={t("wizard.store.previewTitle")}>
          <div className="glass-strong mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-[24px] shadow-lift">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <Badge tone="warning">{t("wizard.store.exampleBadge")}</Badge>
              <p className="font-bold">{t(`website.types.${preview}.name`)}</p>
              <div className="mx-auto inline-flex rounded-pill bg-canvas p-1 ring-1 ring-line">
                {(["desktop", "mobile"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d} className={cx("inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold", device === d ? "bg-white text-primary-strong shadow-soft" : "text-muted")}>
                    {d === "desktop" ? <Monitor className="size-4" /> : <Smartphone className="size-4" />} {t(`preview.${d}`)}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={() => choose(preview)} disabled={pending}>
                {t("wizard.store.useThis")}
              </Button>
              <button type="button" onClick={() => setPreview(null)} className="grid size-9 place-items-center rounded-full hover:bg-canvas" aria-label={t("common.close")}>
                <X className="size-5" />
              </button>
            </div>
            <div className="flex flex-1 justify-center overflow-hidden bg-canvas p-3">
              <iframe
                key={`${preview}-${device}`}
                src={`/preview/template/${preview}?preset=${preset}`}
                title={t("wizard.store.previewTitle")}
                className={cx("h-full rounded-xl bg-white shadow-soft ring-1 ring-line transition-all", device === "mobile" ? "w-[390px] max-w-full" : "w-full")}
              />
            </div>
            <p className="border-t border-line px-4 py-2 text-center text-xs text-muted">{t("wizard.store.exampleNote")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
