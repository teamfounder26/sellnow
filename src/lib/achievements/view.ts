import type { Unlock } from "./service";
import { nextOrderMilestone, orderLevelName, type AchievementKey } from "./definitions";

type T = (k: string, p?: Record<string, string | number>) => string;

/** Display title for an unlock: "Website Creator — Level 1", "Century Seller — Level 4", … */
export function unlockTitle(t: T, key: AchievementKey, level: number) {
  if (key === "orders") {
    const n = orderLevelName(level);
    return t("achievements.levelTitle", { name: t(n.key, n.params), level });
  }
  return t("achievements.levelTitle", { name: t(`achievements.names.${key}`), level });
}

export function unlockMessage(t: T, u: Pick<Unlock, "key" | "level">) {
  if (u.key === "orders") return t(u.level === 1 ? "achievements.messages.firstSale" : "achievements.messages.orders", { n: Number(u.level) });
  return t(`achievements.messages.${u.key}`);
}

export function nextProgress(t: T, count: number) {
  const m = nextOrderMilestone(count);
  return { label: t("achievements.nextLabel", { name: t(orderLevelName(m.nextLevel).key, orderLevelName(m.nextLevel).params) }), current: count, target: m.target, remaining: m.remaining, level: m.level };
}
