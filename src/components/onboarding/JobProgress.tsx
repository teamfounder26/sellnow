"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import type { JobStage } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { retryJobAction } from "@/app/actions/onboarding";
import { Button, cx } from "@/components/ui";
import type { JobView } from "./OnboardingWizard";

const ACTIVE = ["QUEUED", "PROCESSING", "VALIDATING", "RETRYING"];

/** Polls the durable job and refreshes the page when it finishes. Progress is stage-based (no fake percentages). */
export function useJob(initial: NonNullable<JobView>) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const done = useRef(false);
  useEffect(() => {
    setJob(initial);
    done.current = !ACTIVE.includes(initial.status);
  }, [initial]);
  useEffect(() => {
    if (!ACTIVE.includes(job.status)) return;
    const h = setInterval(async () => {
      const r = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const next = (await r.json()) as NonNullable<JobView>;
      setJob(next);
      if (!ACTIVE.includes(next.status) && !done.current) {
        done.current = true;
        router.refresh();
      }
    }, 1200);
    return () => clearInterval(h);
  }, [job.id, job.status, router]);
  return job;
}

export function AIOrb({ size = 132, active = true }: { size?: number; active?: boolean }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      <div className={cx("absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#1F83D8,#8B5CF6,#8FD0FF,#1F83D8)] opacity-70 blur-xl", active && "animate-spin-slow")} />
      <div className={cx("absolute inset-3 rounded-full bg-[radial-gradient(circle_at_30%_25%,#ffffff_0%,#BFE5FF_35%,#1F83D8_75%,#5B48D9_100%)] shadow-glow", active && "animate-float")} />
      <div className="absolute inset-3 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.85),transparent_45%)]" />
    </div>
  );
}

export function StageList({ stages, ns }: { stages: JobStage[]; ns: string }) {
  const t = useT();
  return (
    <ol className="mx-auto w-full max-w-md space-y-2.5">
      {stages.map((s) => (
        <li
          key={s.key}
          className={cx(
            "flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] transition-all duration-500",
            s.status === "running" ? "glass font-semibold text-ink" : s.status === "done" ? "text-ink/80" : s.status === "failed" ? "bg-danger-soft text-danger" : "text-muted/80",
          )}
        >
          <span className={cx("grid size-7 shrink-0 place-items-center rounded-full", s.status === "done" ? "bg-success text-white" : s.status === "running" ? "bg-primary text-white" : s.status === "failed" ? "bg-danger text-white" : "bg-line/70")}>
            {s.status === "done" ? <Check className="size-4" /> : s.status === "running" ? <Loader2 className="size-4 animate-spin" /> : s.status === "failed" ? <AlertTriangle className="size-3.5" /> : null}
          </span>
          {t(`${ns}.${s.key}`)}
        </li>
      ))}
    </ol>
  );
}

export function JobFailed({ job, onBack, backLabel }: { job: NonNullable<JobView>; onBack?: () => void; backLabel?: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-6 flex flex-col items-center gap-3 text-center">
      <p className="max-w-md text-[15px] text-danger">{t(job.error ?? "errors.unexpected")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            {backLabel}
          </Button>
        )}
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await retryJobAction(job.id);
            router.refresh();
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} {t("common.retry")}
        </Button>
      </div>
    </div>
  );
}
