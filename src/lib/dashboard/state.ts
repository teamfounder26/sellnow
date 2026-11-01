/**
 * Pure dashboard logic (banner, setup progress, recommendations, personalization) so it can be
 * tested without rendering. Inputs are persisted facts only.
 */
export type WebsiteFacts = {
  status: string | null; // storefront status, null when none
  viewedAt: Date | null;
  publishedAt: Date | null;
  hasLive: boolean;
  generation: "none" | "active" | "failed" | "completed";
};

export type Banner =
  | { kind: "ready"; cta: "/preview" }
  | { kind: "draft"; cta: "/preview" }
  | { kind: "live"; cta: "visit" }
  | { kind: "generating"; cta: "/onboarding" }
  | { kind: "failed"; cta: "/onboarding" }
  | { kind: "start"; cta: "/onboarding" }
  | null;

/** Recently published sites get a short-lived celebratory banner (48h). */
export const LIVE_BANNER_MS = 48 * 60 * 60 * 1000;

export function websiteBanner(w: WebsiteFacts, now = new Date()): Banner {
  if (w.generation === "active" || w.status === "GENERATING") return { kind: "generating", cta: "/onboarding" };
  // Never claim "ready" when the latest generation failed and no usable draft exists.
  if (w.status === "FAILED" || (w.generation === "failed" && !w.status)) return { kind: "failed", cta: "/onboarding" };
  if (!w.status) return { kind: "start", cta: "/onboarding" };
  if (w.hasLive) return w.publishedAt && now.getTime() - w.publishedAt.getTime() < LIVE_BANNER_MS ? { kind: "live", cta: "visit" } : null;
  if (!w.viewedAt) return { kind: "ready", cta: "/preview" };
  return { kind: "draft", cta: "/preview" };
}

export type SetupFacts = { websiteDraft: boolean; websiteLive: boolean; creativeSaved: boolean; campaignLaunched: boolean; paymentConnected: boolean; paidOrders: number };
export type SetupItem = { key: "website" | "creative" | "marketing" | "payments" | "firstSale"; done: boolean; href: string; sticker: "website_creator" | "creative_star" | "marketing_starter" | "orders" | null };

export function setupProgress(f: SetupFacts): SetupItem[] {
  return [
    { key: "website", done: f.websiteDraft, href: f.websiteDraft ? "/preview" : "/onboarding", sticker: "website_creator" },
    { key: "creative", done: f.creativeSaved, href: "/dashboard/creative", sticker: "creative_star" },
    { key: "marketing", done: f.campaignLaunched, href: "/dashboard/marketing", sticker: "marketing_starter" },
    { key: "payments", done: f.paymentConnected, href: "/dashboard/settings?tab=payments", sticker: null },
    { key: "firstSale", done: f.paidOrders > 0, href: f.websiteLive ? "/dashboard/orders" : "/preview", sticker: "orders" },
  ];
}

export type Stage = "new" | "active" | "experienced";
export function businessStage(paidOrders: number): Stage {
  if (paidOrders === 0) return "new";
  return paidOrders >= 50 ? "experienced" : "active";
}

/** State-based recommendations; only actions relevant to the current business state are returned. */
export function stateRecommendations(f: SetupFacts & { hasLeadsWaiting?: boolean }): { id: string; href: string }[] {
  const out: { id: string; href: string }[] = [];
  if (!f.websiteDraft) out.push({ id: "createWebsite", href: "/onboarding" });
  if (f.websiteDraft && !f.websiteLive) out.push({ id: "publishWebsite", href: "/preview" });
  if (!f.paymentConnected) out.push({ id: "connectPayment", href: "/dashboard/settings?tab=payments" });
  if (f.websiteLive && f.paidOrders === 0) out.push({ id: "shareLink", href: "/dashboard/website" });
  if (!f.creativeSaved) out.push({ id: "firstCreative", href: "/dashboard/creative" });
  if (f.websiteLive && f.creativeSaved && !f.campaignLaunched) out.push({ id: "firstCampaign", href: "/dashboard/marketing" });
  return out.slice(0, 4);
}

/** Greeting bucket in the workspace's local timezone. */
export function greetingKey(now: Date, timeZone: string): "morning" | "afternoon" | "evening" {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(now)) % 24;
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
