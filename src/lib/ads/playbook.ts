import type { AdsPlaybook } from "@/lib/db/schema";

/**
 * Advertising playbook — every number is configurable per workspace (Ads Studio → Settings).
 * Standard CPP benchmark 20–35% of price; preferred operating range 20–30% (RM10–RM15 on RM50).
 */
export const DEFAULT_PLAYBOOK: AdsPlaybook = {
  benchmarkLowPct: 20,
  benchmarkHighPct: 35,
  preferredLowPct: 20,
  preferredHighPct: 30,
  /** "Scale" when actual CPP is at least this much cheaper than the reference CPP. */
  scaleBelowPct: 50,
  /** "Cut loss" with zero purchases once spend ≥ this × target CPP. */
  cutLossSpendMultiple: 3,
  /** "Cut loss" when CPP exceeds the preferred maximum by this factor. */
  cutLossCppMultiple: 1.5,
  minObservationHours: 48,
  minPurchasesForScale: 3,
  /** Payment gateway / platform fee as % of selling price. */
  feePct: 0,
  shippingSubsidySen: 0,
  otherVariableSen: 0,
  minProfitSen: 0,
  scalingReviewTime: "10:00",
};

export function resolvePlaybook(saved?: Partial<AdsPlaybook> | null): AdsPlaybook {
  return { ...DEFAULT_PLAYBOOK, ...(saved ?? {}) };
}

export type CppPlan = {
  priceSen: number;
  benchmark: { lowSen: number; highSen: number };
  preferred: { lowSen: number; highSen: number };
  /** Reference ("target") CPP used for Maintain/Scale comparisons. */
  referenceSen: number;
  /** "50% cheaper than the preferred range" band. */
  scaleBand: { lowSen: number; highSen: number };
  /** Null when the seller hasn't entered product cost — never guessed. */
  breakEvenSen: number | null;
  maxProfitableSen: number | null;
};

const pct = (sen: number, p: number) => Math.round((sen * p) / 100);

export function cppPlan(priceSen: number, pb: AdsPlaybook, costSen: number | null | undefined, targetOverrideSen?: number | null): CppPlan {
  const preferred = { lowSen: pct(priceSen, pb.preferredLowPct), highSen: pct(priceSen, pb.preferredHighPct) };
  // Reference defaults to the preferred midpoint, rounded down to a whole ringgit (RM10–15 → RM12).
  const mid = (preferred.lowSen + preferred.highSen) / 2;
  const defaultRef = mid >= 100 ? Math.floor(mid / 100) * 100 : Math.round(mid);
  let breakEvenSen: number | null = null;
  if (costSen != null && costSen >= 0) {
    const net = priceSen - pct(priceSen, pb.feePct);
    breakEvenSen = net - costSen - pb.shippingSubsidySen - pb.otherVariableSen;
  }
  return {
    priceSen,
    benchmark: { lowSen: pct(priceSen, pb.benchmarkLowPct), highSen: pct(priceSen, pb.benchmarkHighPct) },
    preferred,
    referenceSen: targetOverrideSen && targetOverrideSen > 0 ? targetOverrideSen : defaultRef,
    scaleBand: { lowSen: pct(preferred.lowSen, 100 - pb.scaleBelowPct), highSen: pct(preferred.highSen, 100 - pb.scaleBelowPct) },
    breakEvenSen,
    maxProfitableSen: breakEvenSen == null ? null : breakEvenSen - pb.minProfitSen,
  };
}

export const BUDGET_PRESETS_SEN = [2000, 3000, 5000, 10000];

/** Illustrative projection only (never a promise): monthly budget ÷ preferred CPP range. */
export function budgetProjection(dailySen: number, plan: CppPlan) {
  const monthlySen = dailySen * 30;
  return {
    dailySen,
    monthlySen,
    purchasesLow: plan.preferred.highSen > 0 ? Math.floor(monthlySen / plan.preferred.highSen) : 0,
    purchasesHigh: plan.preferred.lowSen > 0 ? Math.floor(monthlySen / plan.preferred.lowSen) : 0,
  };
}

/** Scaling playbook: % increases computed from the ORIGINAL budget. */
export const SCALE_OPTIONS_PCT = [25, 100, 150, 200];
export function scaledBudget(originalSen: number, increasePct: number) {
  if (!Number.isFinite(increasePct) || increasePct <= 0 || increasePct > 1000) throw new Error("bad percentage");
  return Math.round(originalSen * (1 + increasePct / 100));
}
