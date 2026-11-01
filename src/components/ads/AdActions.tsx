"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Pause, Play, TrendingUp, X } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { changeBudgetAction, setAdPausedAction } from "@/app/actions/ads";
import { Button, Input, Notice, cx } from "@/components/ui";

const OPTIONS = [25, 100, 150, 200];

/**
 * Scale budget & pause/resume for a LIVE ad. Every change shows the exact new budget and needs
 * an explicit confirmation; nothing is automatic.
 */
export function AdActions({ adId, status, budgetSen, originalSen, reviewTime, canManage }: { adId: string; status: string; budgetSen: number; originalSen: number; reviewTime: string; canManage: boolean }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState<number>(100);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!canManage) return null;
  const live = ["active", "pending_review", "paused"].includes(status);
  if (!live) return null;
  const effectivePct = custom ? Number(custom) : pct;
  const newSen = Number.isFinite(effectivePct) && effectivePct > 0 ? Math.round(originalSen * (1 + effectivePct / 100)) : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status !== "paused" && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <TrendingUp className="size-4" /> {t("ads.actions.scale")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setAdPausedAction(adId, status !== "paused");
              if (!r.ok) setError(t(r.error, r.params));
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />} {t(status === "paused" ? "ads.actions.resume" : "ads.actions.pause")}
        </Button>
      </div>
      {error && !open && <p className="mt-2 text-xs text-danger">{error}</p>}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby={`scale-${adId}`}>
          <div className="relative w-full max-w-md rounded-[26px] bg-white p-6 shadow-lift">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full hover:bg-canvas" aria-label={t("common.close")}>
              <X className="size-5" />
            </button>
            <h2 id={`scale-${adId}`} className="text-xl font-extrabold tracking-tight">{t("ads.scale.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("ads.scale.sub", { original: formatMYR(originalSen, locale), current: formatMYR(budgetSen, locale) })}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {OPTIONS.map((o) => (
                <button key={o} type="button" onClick={() => (setPct(o), setCustom(""))} className={cx("rounded-2xl p-3 text-left ring-1 transition", !custom && pct === o ? "bg-primary-soft ring-2 ring-primary" : "ring-line hover:ring-primary/40")}>
                  <span className="block text-sm font-bold">+{o}%{o === 25 ? ` · ${t("ads.scale.gentle")}` : ""}</span>
                  <span className="block text-lg font-extrabold tabular-nums">{formatMYR(Math.round(originalSen * (1 + o / 100)), locale)}<span className="text-xs font-semibold text-muted">/{t("ads.day")}</span></span>
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              {t("ads.scale.custom")}
              <Input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="%" className="h-10 w-24" />
            </label>
            <Notice tone="warning" className="mt-4 flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{t("ads.scale.warning", { time: reviewTime })}</span>
            </Notice>
            {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
            <Button
              size="lg"
              className="mt-4 w-full"
              disabled={!newSen || pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await changeBudgetAction(adId, newSen!, newSen!);
                  if (!r.ok) setError(t(r.error, r.params));
                  else {
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />} {newSen ? t("ads.scale.confirm", { amount: formatMYR(newSen, locale) }) : t("ads.scale.pick")}
            </Button>
            <p className="mt-2 text-center text-xs text-muted">{t("ads.scale.metaNote")}</p>
          </div>
        </div>
      )}
    </>
  );
}
