/**
 * Proposed commercial packages (NOT final pricing). Prices and entitlements are configuration,
 * so they can change without code changes elsewhere. Subscription checkout for SellNow plans
 * is not yet connected to a billing provider — see docs/STATUS.md.
 */
export type PlanId = "free" | "launch" | "growth";

export type Plan = {
  id: PlanId;
  priceSen: number; // per month
  monthlyCredits: number;
  entitlements: {
    publishStorefront: boolean;
    checkout: boolean;
    maxProducts: number;
    maxWorkspaces: number;
    creativeStudio: boolean;
    marketing: boolean;
    salesAssistant: boolean;
    advancedAnalytics: boolean;
  };
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    priceSen: 0,
    monthlyCredits: 50,
    entitlements: {
      // During the pre-launch period publishing is permitted on Free so the core path can be tested end-to-end.
      // Flip to false once SellNow subscription billing is live.
      publishStorefront: true,
      checkout: true,
      maxProducts: 3,
      maxWorkspaces: 1,
      creativeStudio: true,
      marketing: false,
      salesAssistant: false,
      advancedAnalytics: false,
    },
  },
  launch: {
    id: "launch",
    priceSen: 9900,
    monthlyCredits: 300,
    entitlements: {
      publishStorefront: true,
      checkout: true,
      maxProducts: 50,
      maxWorkspaces: 2,
      creativeStudio: true,
      marketing: false,
      salesAssistant: false,
      advancedAnalytics: false,
    },
  },
  growth: {
    id: "growth",
    priceSen: 29900,
    monthlyCredits: 1500,
    entitlements: {
      publishStorefront: true,
      checkout: true,
      maxProducts: 500,
      maxWorkspaces: 5,
      creativeStudio: true,
      marketing: true,
      salesAssistant: true,
      advancedAnalytics: true,
    },
  },
};

export function getPlan(id: string): Plan {
  return PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "free"];
}

/** Credit cost per AI task. */
export const CREDIT_COSTS = {
  "onboarding.analyze": 1,
  "onboarding.profile": 3,
  "storefront.generate": 4,
  "creative.text": 2,
  "onboarding.identify": 1,
  "onboarding.profileGen": 3,
  "ads.strategy": 2,
  "ads.creative": 3,
} as const;

export type AITask = keyof typeof CREDIT_COSTS;
