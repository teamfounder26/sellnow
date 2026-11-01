"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, LayoutDashboard, Volume2, VolumeX } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { goToStageAction } from "@/app/actions/onboarding";
import { LinkButton } from "@/components/ui";
import { Sticker } from "@/components/achievements/Sticker";
import { Celebrate } from "@/components/achievements/Celebrate";
import type { WizardProps } from "./OnboardingWizard";
import { AIOrb, JobFailed, StageList, useJob } from "./JobProgress";

const MESSAGES = ["m1", "m2", "m3"];

export function LaunchStep(props: WizardProps) {
  const job = props.jobs.generation;
  if (props.session.stage === "done" || job?.status === "COMPLETED") return <Ready />;
  if (job && job.status === "FAILED") return <Failed {...props} />;
  if (job) return <Generating job={job} />;
  return null;
}

function Generating({ job: initial }: { job: NonNullable<WizardProps["jobs"]["generation"]> }) {
  const t = useT();
  const job = useJob(initial);
  const [m, setM] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setM((x) => (x + 1) % MESSAGES.length), 4000);
    return () => clearInterval(h);
  }, []);
  const done = job.stages.filter((s) => s.status === "done").length;
  return (
    <div className="flex flex-col items-center gap-7 pt-2 text-center">
      <AIOrb size={150} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("wizard.launch.title")}</h1>
        <p key={m} className="mt-2 animate-rise text-muted" aria-live="polite">
          {t(`wizard.launch.messages.${MESSAGES[m]}`)}
        </p>
      </div>
      <p className="text-sm font-semibold text-primary-strong">{t("wizard.launch.stageCount", { n: done, total: job.stages.length })}</p>
      <StageList stages={job.stages} ns="wizard.launch.stages" />
      <p className="text-xs text-muted">{t("wizard.launch.safeToLeave")}</p>
    </div>
  );
}

function Failed(props: WizardProps) {
  const t = useT();
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-6 pt-2 text-center">
      <AIOrb active={false} />
      <h1 className="text-3xl font-extrabold tracking-tight">{t("wizard.launch.failedTitle")}</h1>
      <StageList stages={props.jobs.generation!.stages} ns="wizard.launch.stages" />
      <JobFailed
        job={props.jobs.generation!}
        backLabel={t("wizard.launch.chooseOther")}
        onBack={async () => {
          await goToStageAction(props.session.id, "store");
          router.refresh();
        }}
      />
    </div>
  );
}

function Ready() {
  const t = useT();
  const [sound, setSound] = useState(false);
  useEffect(() => {
    try {
      setSound(localStorage.getItem("sn_sound") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = () => {
    setSound((s) => {
      try {
        localStorage.setItem("sn_sound", s ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !s;
    });
  };
  return (
    <div className="relative flex flex-col items-center pt-2 text-center">
      <Celebrate intensity="big" sound={sound} />
      <button type="button" onClick={toggle} className="absolute right-0 top-0 grid size-9 place-items-center rounded-full text-muted hover:bg-white" aria-pressed={sound} aria-label={t("wizard.launch.sound")}>
        {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </button>
      <div className="relative">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-[radial-gradient(circle,rgba(31,131,216,.25),transparent_65%)] blur-2xl" />
        <div className="animate-pop">
          <Sticker achievement="website_creator" level={1} size={150} />
        </div>
      </div>
      <p className="mt-3 rounded-pill bg-white/80 px-3 py-1 text-xs font-bold text-primary-strong ring-1 ring-primary/15">{t("wizard.launch.stickerUnlocked")}</p>
      <h1 className="mt-5 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
        <span className="text-gradient">{t("wizard.launch.readyTitle")}</span>
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-pretty text-[17px] text-ink/80">{t("wizard.launch.readyBody")}</p>
      <p className="mx-auto mt-2 max-w-lg text-pretty text-[15px] text-muted">{t("wizard.launch.readyNext")}</p>
      <div className="mt-8 flex w-full max-w-md flex-col gap-3">
        <LinkButton href="/preview" size="lg" className="w-full">
          <Eye className="size-5" /> {t("wizard.launch.view")} <ArrowRight className="size-5" />
        </LinkButton>
        <LinkButton href="/dashboard" variant="secondary" size="lg" className="w-full">
          <LayoutDashboard className="size-5" /> {t("wizard.launch.dashboard")}
        </LinkButton>
      </div>
      <p className="mt-4 text-xs text-muted">{t("wizard.launch.draftNote")}</p>
    </div>
  );
}
