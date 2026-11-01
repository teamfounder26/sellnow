import { AlertTriangle, ArrowUpRight, Info, PauseCircle, Scissors, ShieldCheck } from "lucide-react";
import type { DecisionResult } from "@/lib/ads/decision";
import type { CppPlan } from "@/lib/ads/playbook";
import { formatMYR } from "@/lib/money";
import { cx } from "@/components/ui";

type T = (k: string, p?: Record<string, string | number>) => string;

export const DECISION_STYLE = {
  scale: { tone: "bg-mint/70 ring-success/20 text-success", icon: ArrowUpRight },
  maintain: { tone: "bg-primary-soft/70 ring-primary/20 text-primary-strong", icon: ShieldCheck },
  cut: { tone: "bg-danger-soft/70 ring-danger/20 text-danger", icon: Scissors },
} as const;

/** One actionable recommendation per ad, explained with the ad's real numbers. */
export function DecisionCard({ d, t, locale, compact }: { d: DecisionResult & { plan: CppPlan }; t: T; locale: "ms" | "en"; compact?: boolean }) {
  const m = (sen: number | null) => (sen == null ? t("ads.na") : formatMYR(sen, locale));
  const s = DECISION_STYLE[d.decision];
  const Icon = s.icon;
  const params = {
    spend: m(d.spendSen),
    cpp: m(d.cppSen),
    target: m(d.plan.referenceSen),
    low: m(d.plan.preferred.lowSen),
    high: m(d.plan.preferred.highSen),
    pct: Math.abs(d.diffPct ?? 0),
    purchases: d.purchases,
    breakEven: m(d.plan.maxProfitableSen),
  };
  return (
    <div className={cx("rounded-2xl p-4 ring-1", s.tone)}>
      <p className="flex items-center gap-2 text-sm font-extrabold">
        <Icon className="size-4" /> {t(`ads.decision.${d.decision}`)}
        {d.confidence === "low" && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-pill bg-white/70 px-2 py-0.5 text-[11px] font-bold text-warning">
            <AlertTriangle className="size-3" /> {t("ads.lowConfidence")}
          </span>
        )}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-ink/85">{t(`ads.reason.${d.reason}`, params)}</p>
      {!compact && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {[
            ["actualCpp", m(d.cppSen)],
            ["targetCpp", m(d.plan.referenceSen)],
            ["difference", d.diffPct == null ? t("ads.na") : `${d.diffPct > 0 ? "−" : "+"}${Math.abs(d.diffPct)}%`],
            ["purchases", String(d.purchases)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/70 px-2.5 py-2">
              <dt className="text-muted">{t(`ads.metric.${k}`)}</dt>
              <dd className="mt-0.5 font-bold tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {!compact && <p className="mt-2 flex items-start gap-1.5 text-xs text-ink/70"><Info className="mt-0.5 size-3.5 shrink-0" /> {t(`ads.next.${d.reason}`)}</p>}
    </div>
  );
}

export function NoDecision({ t, reason }: { t: T; reason: "draft" | "notPublished" }) {
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-canvas px-4 py-3 text-sm text-muted ring-1 ring-line">
      <PauseCircle className="size-4" /> {t(`ads.noDecision.${reason}`)}
    </p>
  );
}
