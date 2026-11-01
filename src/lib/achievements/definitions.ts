/**
 * Achievement (sticker) definitions — pure, deterministic, no I/O.
 *
 * ORDER TRACK: thresholds 1, 10, 50, 100, then every additional 100 orders, with no maximum.
 *   level(n) = 0 (n<1) · 1 (1–9) · 2 (10–49) · 3 (50–99) · 4 + ⌊(n−100)/100⌋ (n≥100)
 *
 * ELIGIBLE ORDER: payment verified (PAID or PARTIALLY_REFUNDED), not a test/sandbox order,
 * not cancelled and not fully refunded at evaluation time. Duplicate webhooks cannot create
 * duplicate orders (idempotent payment events), so each order counts once.
 *
 * REFUND POLICY: an unlocked sticker is permanent — a later refund never revokes it. Refunds do
 * lower the live eligible count, so the NEXT milestone needs genuinely new paid orders.
 */
export type AchievementKey = "website_creator" | "creative_star" | "marketing_starter" | "orders";
export type Tier = "blue" | "silver" | "gold" | "purple" | "platinum" | "diamond";

export const SETUP_ACHIEVEMENTS: { key: Exclude<AchievementKey, "orders">; icon: "globe" | "palette" | "megaphone" }[] = [
  { key: "website_creator", icon: "globe" },
  { key: "creative_star", icon: "palette" },
  { key: "marketing_starter", icon: "megaphone" },
];

const FIXED: number[] = [1, 10, 50, 100];

export function orderThreshold(level: number): number {
  if (level < 1) return 0;
  if (level <= FIXED.length) return FIXED[level - 1]!;
  return 100 * (level - 3); // L5=200, L6=300, …
}

export function orderLevel(count: number): number {
  if (count < 1) return 0;
  if (count < 10) return 1;
  if (count < 50) return 2;
  if (count < 100) return 3;
  return 4 + Math.floor((count - 100) / 100);
}

export function nextOrderMilestone(count: number) {
  const level = orderLevel(count);
  const target = orderThreshold(level + 1);
  const prev = orderThreshold(level);
  return { level, nextLevel: level + 1, target, remaining: Math.max(0, target - count), progress: target > prev ? (count - prev) / (target - prev) : 0 };
}

/** Named levels 1–8, then a coherent open-ended series. Returned as i18n key + params. */
const ORDER_NAMES = ["firstSale", "risingSeller", "salesAchiever", "centurySeller", "growthChampion", "salesMaster", "eliteSeller", "commerceHero"];
const LEGEND_NAMES = ["commerceLegend", "salesTitan", "marketIcon", "diamondMerchant"];

export function orderLevelName(level: number): { key: string; params: Record<string, number> } {
  if (level >= 1 && level <= ORDER_NAMES.length) return { key: `achievements.orderNames.${ORDER_NAMES[level - 1]}`, params: {} };
  const i = level - ORDER_NAMES.length - 1; // 0 for level 9
  return { key: `achievements.orderNames.${LEGEND_NAMES[i % LEGEND_NAMES.length]}`, params: { n: orderThreshold(level) } };
}

/** Visual tier scales with level so new levels need no new UI. */
export function tierFor(key: AchievementKey, level: number): Tier {
  if (key !== "orders") return "blue";
  if (level <= 1) return "blue";
  if (level === 2) return "silver";
  if (level <= 4) return "gold";
  if (level === 5) return "purple";
  if (level <= 8) return "platinum";
  return "diamond";
}
