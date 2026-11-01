"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trophy, X } from "lucide-react";
import type { AchievementKey } from "@/lib/achievements/definitions";
import { useT } from "@/lib/i18n/client";
import { rewardAction } from "@/app/actions/workspace";
import { Button, ProgressBar } from "@/components/ui";
import { Sticker } from "./Sticker";
import { Celebrate } from "./Celebrate";

export type Reward = {
  notificationId: string;
  key: AchievementKey;
  level: number;
  title: string;
  message: string;
  next?: { label: string; current: number; target: number } | null;
};

/**
 * Sticker success modal for unlocks the owner has not collected yet (also covers unlocks that
 * happened while they were away). Closing never removes the achievement.
 */
export function RewardModal({ rewards }: { rewards: Reward[] }) {
  const t = useT();
  const router = useRouter();
  const [i, setI] = useState(0);
  const [pending, start] = useTransition();
  const r = rewards[i];
  // Escape dismisses (the sticker stays collected-able later from presentation state; the unlock is permanent).
  useEffect(() => {
    if (!r) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void rewardAction(r.notificationId, "dismiss");
        setI((x) => x + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [r]);
  if (!r) return null;
  const big = r.key === "orders";

  const act = (a: "collect" | "dismiss", href?: string) =>
    start(async () => {
      await rewardAction(r.notificationId, a);
      if (href) router.push(href);
      setI((x) => x + 1);
    });

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <Celebrate key={r.notificationId} intensity={big ? "big" : "normal"} />
      <div className="relative w-full max-w-md overflow-hidden rounded-[30px] bg-white p-7 text-center shadow-lift animate-rise">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(191,229,255,.9),transparent)]" />
        <button type="button" onClick={() => act("dismiss")} disabled={pending} className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full text-muted hover:bg-canvas" aria-label={t("achievements.modal.continue")}>
          <X className="size-5" />
        </button>
        <p className="relative inline-flex items-center gap-1.5 rounded-pill bg-white px-3 py-1 text-xs font-bold text-primary-strong ring-1 ring-primary/15">
          <Trophy className="size-3.5" /> {t("achievements.modal.unlocked")}
        </p>
        <div className="relative mx-auto mt-4 w-fit animate-pop">
          <Sticker achievement={r.key} level={r.level} size={big ? 170 : 150} />
        </div>
        <h2 id="reward-title" className="relative mt-4 text-2xl font-extrabold tracking-tight">
          {r.title}
        </h2>
        <p className="relative mt-2 text-[15px] text-muted">{r.message}</p>
        {r.next && (
          <div className="relative mt-5 rounded-2xl bg-canvas p-4 text-left">
            <div className="flex justify-between text-xs font-semibold text-muted">
              <span>{r.next.label}</span>
              <span className="tabular-nums">
                {r.next.current} / {r.next.target}
              </span>
            </div>
            <ProgressBar value={r.next.current} max={r.next.target} className="mt-2" label={r.next.label} />
          </div>
        )}
        <div className="relative mt-6 grid gap-2">
          <Button size="lg" onClick={() => act("collect")} disabled={pending}>
            {t("achievements.modal.collect")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => act("collect", "/dashboard/achievements")} disabled={pending}>
              {t("achievements.modal.view")}
            </Button>
            <Button variant="ghost" onClick={() => act("dismiss")} disabled={pending}>
              {t("achievements.modal.continue")}
            </Button>
          </div>
        </div>
        {rewards.length > 1 && <p className="relative mt-3 text-xs text-muted">{t("achievements.modal.more", { n: rewards.length - i - 1 })}</p>}
      </div>
    </div>
  );
}
