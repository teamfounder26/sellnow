import type { AdsPlaybook } from "@/lib/db/schema";
import type { CppPlan } from "./playbook";

export type Decision = "cut" | "maintain" | "scale";
export type DecisionResult = {
  decision: Decision;
  reason: "tracking" | "tooEarly" | "collecting" | "noPurchases" | "unprofitable" | "tooExpensive" | "fewPurchases" | "scale" | "aboveTarget" | "onTarget";
  /** Low = not enough data; the card shows an insufficient-data warning. */
  confidence: "high" | "low";
  cppSen: number | null;
  /** + = cheaper than the reference CPP, − = more expensive. Null without purchases. */
  diffPct: number | null;
  spendSen: number;
  purchases: number;
  revenueSen: number;
  roas: number | null;
  /** Null when product cost is unknown — revenue performance is shown instead of profit. */
  profitSen: number | null;
};

export type PerformanceInput = {
  spendSen: number;
  purchases: number;
  revenueSen: number;
  hoursLive: number;
  trackingReady: boolean;
  /** Product cost + variable costs per order; null if unknown. */
  unitCostSen: number | null;
};

/**
 * Cut Loss / Maintain / Scale from REAL metrics only. Never recommends cutting on zero sales
 * alone: it needs working tracking, a minimum observation period and enough spend.
 * Recommendations are advisory — nothing is paused or scaled automatically.
 */
export function decide(input: PerformanceInput, plan: CppPlan, pb: AdsPlaybook): DecisionResult {
  const cppSen = input.purchases > 0 ? Math.round(input.spendSen / input.purchases) : null;
  const diffPct = cppSen == null || plan.referenceSen <= 0 ? null : Math.round(((plan.referenceSen - cppSen) / plan.referenceSen) * 100);
  const roas = input.spendSen > 0 ? Math.round((input.revenueSen / input.spendSen) * 100) / 100 : null;
  const profitSen = input.unitCostSen == null ? null : input.revenueSen - input.spendSen - input.unitCostSen * input.purchases;
  const base = { cppSen, diffPct, spendSen: input.spendSen, purchases: input.purchases, revenueSen: input.revenueSen, roas, profitSen };
  const r = (decision: Decision, reason: DecisionResult["reason"], confidence: "high" | "low" = "high"): DecisionResult => ({ decision, reason, confidence, ...base });

  if (!input.trackingReady) return r("maintain", "tracking", "low");
  if (input.purchases === 0) {
    const enoughSpend = input.spendSen >= plan.referenceSen * pb.cutLossSpendMultiple;
    if (enoughSpend && input.hoursLive >= pb.minObservationHours) return r("cut", "noPurchases");
    return r("maintain", input.hoursLive < pb.minObservationHours ? "tooEarly" : "collecting", "low");
  }
  if (plan.maxProfitableSen != null && cppSen! > plan.maxProfitableSen && input.hoursLive >= pb.minObservationHours) return r("cut", "unprofitable");
  if (cppSen! > plan.preferred.highSen * pb.cutLossCppMultiple && input.hoursLive >= pb.minObservationHours) return r("cut", "tooExpensive");
  if (cppSen! <= plan.referenceSen * (1 - pb.scaleBelowPct / 100)) {
    const profitable = profitSen == null || profitSen > 0;
    if (input.purchases >= pb.minPurchasesForScale && input.hoursLive >= pb.minObservationHours && profitable) return r("scale", "scale");
    return r("maintain", "fewPurchases", "low");
  }
  if (cppSen! > plan.preferred.highSen) return r("maintain", "aboveTarget");
  return r("maintain", "onTarget");
}
