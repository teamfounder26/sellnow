"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeft, Check, LogOut } from "lucide-react";
import type { JobStage, OnboardingStage, ProfileField } from "@/lib/db/schema";
import type { Category } from "@/lib/categories";
import type { WebsiteModule, WebsiteTypeId } from "@/lib/website/types";
import { useT } from "@/lib/i18n/client";
import { goToStageAction } from "@/app/actions/onboarding";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cx } from "@/components/ui";
import { IdeaStep } from "./IdeaStep";
import { DetailsStep } from "./DetailsStep";
import { ProfileStep } from "./ProfileStep";
import { StoreStep } from "./StoreStep";
import { LaunchStep } from "./LaunchStep";

export type InputItem = { id: string; kind: "image" | "document" | "voice"; status: string; name: string; text: string | null; error: string | null; assetId: string | null; durationSec?: number };
export type JobView = { id: string; status: string; stage: string | null; stages: JobStage[]; error: string | null } | null;

export type WizardProps = {
  session: { id: string; stage: OnboardingStage; ideaText: string; links: string[]; noLinks: boolean; websiteType: string | null; lastError: string | null; suggestedCategory: string | null; question: string | null };
  inputs: InputItem[];
  sources: { url: string; platform: string; status: string; title: string | null }[];
  profile: { fields: Record<string, ProfileField>; faq: { q: string; a: string }[]; confirmed: boolean } | null;
  critical: string[];
  /** Products the AI identified (verified prices only), the plan's product limit, and products that already exist. */
  found: { products: { name: string; description: string; priceSen: number | null }[]; maxProducts: number; existing: string[] };
  store: {
    category: Category;
    recommended: { id: string; reason?: string; reasonKey?: string; byAI: boolean };
    types: { id: WebsiteTypeId; layout: "single" | "catalog"; modules: WebsiteModule[]; availability: "full" | "interest" }[];
    preset: string;
  } | null;
  storefront: { slug: string; status: string } | null;
  jobs: { research: JobView; generation: JobView };
  ai: { configured: boolean; stt: boolean; credits: number; costs: { research: number; website: number } };
  userName: string;
};

const STEPS = ["idea", "details", "profile", "store", "launch"] as const;

/** Centered single-column wizard: IDEA → DETAILS → PROFILE → STORE → LAUNCH. All progress is saved server-side. */
export function OnboardingWizard(props: WizardProps) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const stage = props.session.stage === "done" ? "launch" : props.session.stage;
  const idx = STEPS.indexOf(stage);
  const busyJob = (j: JobView) => j && ["QUEUED", "PROCESSING", "VALIDATING", "RETRYING"].includes(j.status);
  const canGoBack = idx > 0 && props.session.stage !== "done" && !busyJob(props.jobs.generation) && !(stage === "profile" && busyJob(props.jobs.research));

  const back = () =>
    start(async () => {
      await goToStageAction(props.session.id, STEPS[idx - 1]!);
      router.refresh();
    });

  return (
    <div className="ambient flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Logo href="/dashboard" compact className="sm:hidden" />
          <Logo href="/dashboard" className="hidden sm:inline-flex" />
          <ol className="mx-auto hidden items-center gap-1 md:flex" aria-label={t("wizard.progress")}>
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-1">
                <span
                  className={cx(
                    "flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-bold tracking-wide transition",
                    i === idx ? "bg-primary text-white shadow-glow" : i < idx ? "bg-primary-soft text-primary-strong" : "text-muted",
                  )}
                  aria-current={i === idx ? "step" : undefined}
                >
                  {i < idx ? <Check className="size-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
                  {t(`wizard.steps.${s}`)}
                </span>
                {i < STEPS.length - 1 && <span className={cx("h-px w-4", i < idx ? "bg-primary/50" : "bg-line")} />}
              </li>
            ))}
          </ol>
          <p className="mx-auto text-sm font-bold md:hidden">
            {t("wizard.stepOf", { n: idx + 1, total: STEPS.length })} · {t(`wizard.steps.${stage}`)}
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <Link href="/dashboard" className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line bg-white/80 px-3 text-sm font-semibold hover:border-primary/40" title={t("wizard.saveExitHint")}>
              <LogOut className="size-4" /> <span className="hidden sm:inline">{t("wizard.saveExit")}</span>
            </Link>
          </div>
        </div>
        <div className="h-0.5 bg-primary-soft md:hidden">
          <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        {canGoBack && (
          <button type="button" onClick={back} disabled={pending} className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> {t("common.back")}
          </button>
        )}
        <div key={stage} className="animate-rise">
          {stage === "idea" && <IdeaStep {...props} />}
          {stage === "details" && <DetailsStep {...props} />}
          {stage === "profile" && <ProfileStep {...props} />}
          {stage === "store" && <StoreStep {...props} />}
          {stage === "launch" && <LaunchStep {...props} />}
        </div>
      </main>
    </div>
  );
}

export function StepHeading({ title, sub, eyebrow }: { title: string; sub?: string; eyebrow?: string }) {
  return (
    <div className="mb-8 text-center">
      {eyebrow && <p className="mb-3 inline-flex items-center gap-1.5 rounded-pill bg-white/80 px-3 py-1 text-xs font-bold text-primary-strong ring-1 ring-primary/15">{eyebrow}</p>}
      <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-[42px] sm:leading-[1.1]">{title}</h1>
      {sub && <p className="mx-auto mt-3 max-w-xl text-pretty text-[16px] text-muted">{sub}</p>}
    </div>
  );
}
