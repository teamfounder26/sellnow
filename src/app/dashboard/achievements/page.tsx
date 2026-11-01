import Link from "next/link";
import { Lock, Trophy } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { eligibleOrderCount, listUnlocks } from "@/lib/achievements/service";
import { SETUP_ACHIEVEMENTS, orderLevel, orderThreshold, type AchievementKey } from "@/lib/achievements/definitions";
import { nextProgress, unlockTitle } from "@/lib/achievements/view";
import { Sticker } from "@/components/achievements/Sticker";
import { Card, ProgressBar, cx } from "@/components/ui";

export const metadata = { title: "Achievements" };

const SETUP_HREF: Record<string, string> = { website_creator: "/onboarding", creative_star: "/dashboard/creative", marketing_starter: "/dashboard/marketing" };

export default async function AchievementsPage() {
  const { db, workspace } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const [unlocks, count] = await Promise.all([listUnlocks(db, workspace.id), eligibleOrderCount(db, workspace.id)]);
  const has = (k: string, l: number) => unlocks.find((u) => u.key === k && u.level === l);
  const orderLvl = orderLevel(count);
  const earnedOrderLvl = Math.max(0, ...unlocks.filter((u) => u.key === "orders").map((u) => u.level));
  const next = nextProgress(t, count);
  // Show every earned level plus the next three — the track has no maximum.
  const showUpTo = Math.max(8, earnedOrderLvl + 3, orderLvl + 3);
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeZone: workspace.timezone });

  const tile = (key: AchievementKey, level: number, requirement: string, href?: string) => {
    const u = has(key, level);
    return (
      <li key={`${key}-${level}`} className={cx("flex flex-col items-center rounded-[24px] p-4 text-center ring-1 transition", u ? "bg-white shadow-soft ring-line" : "bg-white/50 ring-line/70")}>
        <Sticker achievement={key} level={level} size={96} locked={!u} />
        <p className="mt-2 text-sm font-bold leading-tight">{unlockTitle(t, key, level)}</p>
        {u ? (
          <p className="mt-1 text-xs text-success">{t("achievements.unlockedOn", { date: fmt.format(u.unlockedAt) })}</p>
        ) : (
          <>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted">
              <Lock className="size-3" /> {requirement}
            </p>
            {href && (
              <Link href={href} className="mt-2 text-xs font-bold text-primary-strong hover:underline">
                {t("achievements.nextAction")}
              </Link>
            )}
          </>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("achievements.title")}</h1>
        <p className="mt-1 text-muted">{t("achievements.sub")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "collected", v: String(unlocks.length) },
          { k: "sellerLevel", v: earnedOrderLvl ? t("achievements.levelN", { n: earnedOrderLvl }) : "—" },
          { k: "eligibleOrders", v: String(count) },
          { k: "nextMilestone", v: t("achievements.ordersN", { n: next.target }) },
        ].map((s) => (
          <Card key={s.k} className="p-5">
            <p className="text-sm font-semibold text-muted">{t(`achievements.stats.${s.k}`)}</p>
            <p className="mt-2 text-2xl font-extrabold tracking-tight">{s.v}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-bold">{next.label}</span>
          <span className="font-bold tabular-nums">
            {count} / {next.target}
          </span>
        </div>
        <ProgressBar value={count - orderThreshold(next.level)} max={next.target - orderThreshold(next.level)} className="mt-3 h-3" label={next.label} />
        <p className="mt-2 text-sm text-muted">{t(count === 0 ? "dash.journey.firstHint" : "dash.journey.remaining", { n: next.remaining })}</p>
        <p className="mt-3 text-xs text-muted">{t("achievements.policy")}</p>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-extrabold tracking-tight">{t("achievements.setupTrack")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{SETUP_ACHIEVEMENTS.map((a) => tile(a.key, 1, t(`achievements.requirements.${a.key}`), SETUP_HREF[a.key]))}</ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold tracking-tight">{t("achievements.ordersTrack")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: showUpTo }).map((_, i) => tile("orders", i + 1, t("achievements.requirements.orders", { n: orderThreshold(i + 1) })))}
        </ul>
      </section>

      <Card className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <Trophy className="size-5 text-warning" /> {t("achievements.timeline")}
        </h2>
        {unlocks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("achievements.timelineEmpty")}</p>
        ) : (
          <ol className="mt-4 space-y-3 border-l-2 border-primary-soft pl-5">
            {[...unlocks].reverse().map((u) => (
              <li key={u.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-white bg-primary" />
                <p className="text-sm font-bold">{unlockTitle(t, u.key as AchievementKey, u.level)}</p>
                <p className="text-xs text-muted">{fmt.format(u.unlockedAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
