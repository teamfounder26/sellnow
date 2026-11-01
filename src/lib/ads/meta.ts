import "server-only";
import type { AdAudience, AdCreative, AdObjective } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";

/**
 * Official Meta Marketing API (Graph API) adapter. Every call goes to graph.facebook.com with the
 * workspace's own user access token (stored encrypted). Nothing here simulates success: any
 * failure throws an AppError with a precise code the UI can explain.
 */
export const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Permissions requested on Connect (ads, pages, Instagram identity). Facebook *Login* alone grants none of these. */
export const META_SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement", "instagram_basic"];

export function metaAppConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

let fetchImpl: typeof fetch | null = null;
export function __setMetaFetchForTests(f: typeof fetch | null) {
  fetchImpl = f;
}

type GraphError = { message?: string; type?: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string };

export class MetaError extends AppError {
  constructor(code: string, public readonly detail: string, public readonly graphCode?: number) {
    super(code, { detail: detail.slice(0, 300) });
  }
}

function mapError(e: GraphError, status: number): MetaError {
  const detail = e.error_user_msg || e.message || `HTTP ${status}`;
  const c = e.code ?? 0;
  if (c === 190 || c === 102) return new MetaError("meta.tokenExpired", detail, c);
  if (c === 10 || (c >= 200 && c <= 299) || c === 3) return new MetaError("meta.permissionDenied", detail, c);
  if ([4, 17, 32, 613, 80004].includes(c) || status === 429) return new MetaError("meta.rateLimited", detail, c);
  if (c === 1487390 || /disapprov|policy/i.test(detail)) return new MetaError("meta.policyRejected", detail, c);
  if (c === 100 || status === 400) return new MetaError("meta.invalidRequest", detail, c);
  return new MetaError("meta.apiError", detail, c);
}

export class MetaApi {
  constructor(private readonly token: string) {}

  private async call<T>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, unknown> = {}): Promise<T> {
    const f = fetchImpl ?? fetch;
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
    body.set("access_token", this.token);
    const url = method === "GET" ? `${GRAPH}${path}?${body}` : `${GRAPH}${path}`;
    let res: Response;
    try {
      res = await f(url, { method, ...(method === "GET" ? {} : { body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }), signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      throw new MetaError("meta.unreachable", e instanceof Error ? e.message : String(e));
    }
    const json = (await res.json().catch(() => ({}))) as { error?: GraphError } & T;
    if (!res.ok || json.error) {
      const err = mapError(json.error ?? {}, res.status);
      log("warn", "meta.api_error", { path: path.replace(/\d{6,}/g, "…"), code: err.code, graphCode: err.graphCode });
      throw err;
    }
    return json;
  }

  // ---- account discovery
  me() {
    return this.call<{ id: string; name: string }>("GET", "/me", { fields: "id,name" });
  }
  adAccounts() {
    return this.call<{ data: { id: string; name: string; currency: string; account_status: number; timezone_name?: string }[] }>("GET", "/me/adaccounts", { fields: "id,name,currency,account_status,timezone_name", limit: 50 });
  }
  pages() {
    return this.call<{ data: { id: string; name: string; instagram_business_account?: { id: string } }[] }>("GET", "/me/accounts", { fields: "id,name,instagram_business_account", limit: 50 });
  }
  pixels(adAccountId: string) {
    return this.call<{ data: { id: string; name: string; last_fired_time?: string }[] }>("GET", `/${adAccountId}/adspixels`, { fields: "id,name,last_fired_time" });
  }
  /** Whether Meta has received a given standard event from this pixel in the last 7 days. */
  async pixelEventSeen(pixelId: string, event: "Purchase" | "Lead"): Promise<boolean> {
    const since = Math.floor(Date.now() / 1000) - 7 * 86400;
    const r = await this.call<{ data: { data?: { value: string; count: number }[] }[] }>("GET", `/${pixelId}/stats`, { aggregation: "event", start_time: since });
    return r.data.some((bucket) => (bucket.data ?? []).some((d) => d.value === event && d.count > 0));
  }

  // ---- creation (everything is created PAUSED, then activated once the whole chain exists)
  uploadImage(adAccountId: string, base64: string) {
    return this.call<{ images: Record<string, { hash: string }> }>("POST", `/${adAccountId}/adimages`, { bytes: base64 }).then((r) => Object.values(r.images)[0]!.hash);
  }
  createCampaign(adAccountId: string, p: { name: string; objective: AdObjective }) {
    return this.call<{ id: string }>("POST", `/${adAccountId}/campaigns`, { name: p.name, objective: OBJECTIVE[p.objective], status: "PAUSED", special_ad_categories: [], buying_type: "AUCTION" }).then((r) => r.id);
  }
  createAdSet(adAccountId: string, p: { name: string; campaignId: string; objective: AdObjective; dailyBudgetSen: number; audience: AdAudience; pixelId?: string | null; pageId: string }) {
    return this.call<{ id: string }>("POST", `/${adAccountId}/adsets`, {
      name: p.name,
      campaign_id: p.campaignId,
      // Meta budgets are in the account currency's minor unit — sen for MYR accounts.
      daily_budget: p.dailyBudgetSen,
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      ...adSetGoal(p.objective, p.pixelId, p.pageId),
      targeting: targeting(p.audience),
      status: "PAUSED",
    }).then((r) => r.id);
  }
  createCreative(adAccountId: string, p: { name: string; pageId: string; instagramId?: string | null; creative: AdCreative; link: string; imageHash?: string | null }) {
    return this.call<{ id: string }>("POST", `/${adAccountId}/adcreatives`, {
      name: p.name,
      object_story_spec: {
        page_id: p.pageId,
        ...(p.instagramId ? { instagram_actor_id: p.instagramId } : {}),
        link_data: {
          link: p.link,
          message: p.creative.primaryText,
          name: p.creative.headline,
          description: p.creative.description,
          ...(p.imageHash ? { image_hash: p.imageHash } : {}),
          call_to_action: { type: CTA[p.creative.cta] ?? "LEARN_MORE", value: { link: p.link } },
        },
      },
    }).then((r) => r.id);
  }
  createAd(adAccountId: string, p: { name: string; adSetId: string; creativeId: string }) {
    return this.call<{ id: string }>("POST", `/${adAccountId}/ads`, { name: p.name, adset_id: p.adSetId, creative: { creative_id: p.creativeId }, status: "PAUSED" }).then((r) => r.id);
  }
  setStatus(objectId: string, status: "ACTIVE" | "PAUSED") {
    return this.call<{ success: boolean }>("POST", `/${objectId}`, { status });
  }
  updateDailyBudget(adSetId: string, dailyBudgetSen: number) {
    return this.call<{ success: boolean }>("POST", `/${adSetId}`, { daily_budget: dailyBudgetSen });
  }
  deleteObject(objectId: string) {
    return this.call<{ success: boolean }>("DELETE", `/${objectId}`);
  }
  adStatus(adId: string) {
    return this.call<{ effective_status: string; ad_review_feedback?: Record<string, unknown> }>("GET", `/${adId}`, { fields: "effective_status,ad_review_feedback" });
  }
  /** Daily insights with Meta's default attribution (7-day click, 1-day view). */
  insights(adId: string, since: string, until: string) {
    return this.call<{ data: InsightRow[] }>("GET", `/${adId}/insights`, {
      fields: "spend,impressions,clicks,actions,action_values,date_start",
      time_increment: 1,
      time_range: { since, until },
      action_attribution_windows: ["7d_click", "1d_view"],
      limit: 100,
    });
  }
}

export type InsightRow = { date_start: string; spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] };

const OBJECTIVE: Record<AdObjective, string> = { sales: "OUTCOME_SALES", leads: "OUTCOME_LEADS", messages: "OUTCOME_ENGAGEMENT", traffic: "OUTCOME_TRAFFIC" };

export const CTA: Record<string, string> = {
  shop_now: "SHOP_NOW",
  order_now: "ORDER_NOW",
  learn_more: "LEARN_MORE",
  sign_up: "SIGN_UP",
  send_message: "MESSAGE_PAGE",
  contact_us: "CONTACT_US",
  get_quote: "GET_QUOTE",
  subscribe: "SUBSCRIBE",
  download: "DOWNLOAD",
};

function adSetGoal(objective: AdObjective, pixelId: string | null | undefined, pageId: string) {
  switch (objective) {
    case "sales":
      return { optimization_goal: "OFFSITE_CONVERSIONS", promoted_object: { pixel_id: pixelId, custom_event_type: "PURCHASE" } };
    case "leads":
      return { optimization_goal: "OFFSITE_CONVERSIONS", promoted_object: { pixel_id: pixelId, custom_event_type: "LEAD" } };
    case "messages":
      return { optimization_goal: "CONVERSATIONS", destination_type: "MESSENGER", promoted_object: { page_id: pageId } };
    case "traffic":
      return { optimization_goal: "LANDING_PAGE_VIEWS" };
  }
}

function targeting(a: AdAudience) {
  return {
    geo_locations: { countries: [a.country || "MY"] },
    age_min: Math.max(18, a.ageMin),
    age_max: Math.min(65, a.ageMax),
    ...(a.gender === "male" ? { genders: [1] } : a.gender === "female" ? { genders: [2] } : {}),
    ...(a.placements === "feeds"
      ? { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["feed"], instagram_positions: ["stream"] }
      : a.placements === "stories_reels"
        ? { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["story", "facebook_reels"], instagram_positions: ["story", "reels"] }
        : {}),
    targeting_automation: { advantage_audience: a.mode === "broad" ? 1 : 0 },
  };
}

/** Purchases/revenue from Meta actions without double counting overlapping action types. */
export function parseInsight(row: InsightRow) {
  const pick = (list: { action_type: string; value: string }[] | undefined, types: string[]) => {
    for (const t of types) {
      const hit = list?.find((x) => x.action_type === t);
      if (hit) return Number(hit.value) || 0;
    }
    return 0;
  };
  const purchaseTypes = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
  const leadTypes = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
  return {
    date: row.date_start,
    spendSen: Math.round((Number(row.spend) || 0) * 100),
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    purchases: Math.round(pick(row.actions, purchaseTypes)),
    revenueSen: Math.round(pick(row.action_values, purchaseTypes) * 100),
    leads: Math.round(pick(row.actions, leadTypes)),
  };
}

// ---- OAuth (Connect Meta Business) ----------------------------------------
export function metaAuthorizeUrl(redirectUri: string, state: string) {
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.search = new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: redirectUri, state, scope: META_SCOPES.join(","), response_type: "code" }).toString();
  return u.toString();
}

/** Code → short-lived token → long-lived (~60 day) user token. Server-side only (uses the app secret). */
export async function exchangeMetaCode(code: string, redirectUri: string): Promise<{ accessToken: string; expiresAt: string | null }> {
  const f = fetchImpl ?? fetch;
  const q = (p: Record<string, string>) => new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, ...p }).toString();
  const short = (await (await f(`${GRAPH}/oauth/access_token?${q({ redirect_uri: redirectUri, code })}`)).json()) as { access_token?: string; error?: GraphError };
  if (!short.access_token) throw mapError(short.error ?? {}, 400);
  const long = (await (await f(`${GRAPH}/oauth/access_token?${q({ grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`)).json()) as { access_token?: string; expires_in?: number };
  const token = long.access_token ?? short.access_token;
  return { accessToken: token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null };
}
