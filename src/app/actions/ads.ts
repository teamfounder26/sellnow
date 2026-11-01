"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { appUrl } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { toActionError, type ActionResult } from "@/lib/errors";
import { ads, creatives } from "@/lib/db/schema";
import type { Role } from "@/lib/auth/service";
import * as svc from "@/lib/ads/service";
import { APPROACHES, generateAdCopy, getOwnedProduct, recommendStrategy, templateCopy, type Approach } from "@/lib/ads/strategy";
import { setCreativeStatus } from "@/lib/marketing/service";
import { MetaApi } from "@/lib/ads/meta";
import { activateSubscription } from "@/lib/ads/quota";
import { isAIConfigured } from "@/lib/ai/provider";
import type { AdCreative } from "@/lib/db/schema";

async function ctx(min: Role = "editor") {
  const { user, db, workspace } = await requireWorkspace(min);
  return { db, workspaceId: workspace.id, userId: user.id, locale: await getLocale() };
}
function done<T>(data: T): ActionResult<T> {
  revalidatePath("/dashboard/creative", "layout");
  return { ok: true, data };
}
function fail(e: unknown) {
  if (e instanceof ZodError) return { ok: false as const, error: "errors.validation" };
  return toActionError(e);
}

export async function createAdDraftAction(productId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const c = await ctx();
    return done({ id: await svc.createDraft(c, productId, await appUrl()) });
  } catch (e) {
    return fail(e);
  }
}

export async function recommendStrategyAction(adId: string): Promise<ActionResult> {
  try {
    const c = await ctx();
    if (!rateLimit(`ai:${c.userId}`, 30, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const ad = await svc.getAd(c.db, c.workspaceId, adId);
    const p = await getOwnedProduct(c.db, c.workspaceId, ad.productId!);
    const r = await recommendStrategy(c, p);
    await svc.saveStrategy(c, adId, r.strategy, r.audience);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function updateAdDraftAction(adId: string, patch: unknown): Promise<ActionResult> {
  try {
    await svc.updateDraft(await ctx(), adId, patch);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function generateAdCopyAction(adId: string, approach: string): Promise<ActionResult<{ creativeId: string | null; variants: AdCreative[]; notes: string; byAI: boolean }>> {
  try {
    const c = await ctx();
    if (!(APPROACHES as readonly string[]).includes(approach)) return { ok: false, error: "errors.validation" };
    const ad = await svc.getAd(c.db, c.workspaceId, adId);
    const p = await getOwnedProduct(c.db, c.workspaceId, ad.productId!);
    if (!(await isAIConfigured())) return { ok: true, data: { creativeId: null, variants: [templateCopy(p, ad.objective ?? "sales", c.locale)], notes: "", byAI: false } };
    if (!rateLimit(`ai:${c.userId}`, 30, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const r = await generateAdCopy(c, p, approach as Approach, ad.objective ?? "sales");
    return { ok: true, data: { ...r, byAI: true } };
  } catch (e) {
    return fail(e);
  }
}

/** Seller picks (and possibly edits) a variant: saved on the ad; the AI creative is marked approved. */
export async function chooseCreativeAction(adId: string, creative: AdCreative, creativeId: string | null): Promise<ActionResult> {
  try {
    const c = await ctx();
    await svc.updateDraft(c, adId, { creative, step: "review" });
    if (creativeId) {
      const owned = await c.db.query.creatives.findFirst({ where: and(eq(creatives.id, creativeId), eq(creatives.workspaceId, c.workspaceId)) });
      if (owned) {
        await setCreativeStatus(c.db, c, creativeId, "approved");
        await c.db.update(ads).set({ creativeId }).where(and(eq(ads.id, adId), eq(ads.workspaceId, c.workspaceId)));
      }
    }
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function readinessAction(adId: string): Promise<ActionResult<Awaited<ReturnType<typeof svc.publishReadiness>>>> {
  try {
    const c = await ctx();
    const r = await svc.publishReadiness(c.db, c.workspaceId, await svc.getAd(c.db, c.workspaceId, adId));
    return { ok: true, data: { ...r, quota: { ...r.quota, subscription: null } } };
  } catch (e) {
    return fail(e);
  }
}

export async function publishAdAction(adId: string, confirmed: boolean): Promise<ActionResult<{ status: string }>> {
  try {
    const c = await ctx("admin");
    if (!rateLimit(`adpub:${c.userId}`, 10, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const r = await svc.publishAd(c, adId, { confirmed });
    return done({ status: r.status });
  } catch (e) {
    revalidatePath("/dashboard/creative", "layout");
    return fail(e);
  }
}

export async function setAdPausedAction(adId: string, paused: boolean): Promise<ActionResult> {
  try {
    await svc.setAdPaused(await ctx("admin"), adId, paused);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function changeBudgetAction(adId: string, newBudgetSen: number, confirmedSen: number): Promise<ActionResult> {
  try {
    await svc.changeBudget(await ctx("admin"), adId, newBudgetSen, confirmedSen);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function duplicateAdAction(adId: string): Promise<ActionResult<{ id: string }>> {
  try {
    return done({ id: await svc.duplicateAd(await ctx(), adId) });
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAdDraftAction(adId: string): Promise<ActionResult> {
  try {
    await svc.deleteDraft(await ctx(), adId);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function syncAdsAction(): Promise<ActionResult<{ synced: number }>> {
  try {
    const c = await ctx("viewer");
    if (!rateLimit(`adsync:${c.workspaceId}`, 6, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const r = await svc.syncWorkspaceAds(c.db, c.workspaceId);
    return done({ synced: r.synced });
  } catch (e) {
    return fail(e);
  }
}

export async function savePlaybookAction(raw: unknown): Promise<ActionResult> {
  try {
    const c = await ctx("admin");
    await svc.savePlaybook(c.db, c, raw);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

/** Live lists from Meta for the selection dropdowns (never cached guesses). */
export async function metaAssetsAction(): Promise<ActionResult<{ adAccounts: { id: string; name: string; currency: string }[]; pages: { id: string; name: string; instagram: boolean }[]; pixels: Record<string, { id: string; name: string }[]> }>> {
  try {
    const c = await ctx("admin");
    const conn = await svc.getMetaConnection(c.db, c.workspaceId);
    if (!conn.token) return { ok: false, error: conn.expired ? "meta.tokenExpired" : "meta.notConnected" };
    const api = new MetaApi(conn.token);
    const [accts, pages] = await Promise.all([api.adAccounts(), api.pages()]);
    const pixels: Record<string, { id: string; name: string }[]> = {};
    for (const a of accts.data.slice(0, 10)) pixels[a.id] = (await api.pixels(a.id).catch(() => ({ data: [] }))).data.map((p) => ({ id: p.id, name: p.name }));
    return { ok: true, data: { adAccounts: accts.data.map((a) => ({ id: a.id, name: a.name, currency: a.currency })), pages: pages.data.map((p) => ({ id: p.id, name: p.name, instagram: Boolean(p.instagram_business_account) })), pixels } };
  } catch (e) {
    return fail(e);
  }
}

export async function saveMetaSelectionAction(sel: { adAccountId: string; pageId: string; pixelId?: string | null }): Promise<ActionResult> {
  try {
    const c = await ctx("admin");
    await svc.saveMetaSelection(c.db, c, sel);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectMetaAction(): Promise<ActionResult> {
  try {
    const c = await ctx("owner");
    await svc.disconnectMeta(c.db, c);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

/**
 * NO-CHARGE test activation — only where the test gateway is allowed (development). Real
 * subscriptions must be activated by a verified billing webhook once SellNow billing is connected.
 */
export async function activateTestSubscriptionAction(): Promise<ActionResult> {
  try {
    const { testGatewayAllowed } = await import("@/lib/payments/integrations");
    if (!testGatewayAllowed()) return { ok: false, error: "ads.billingUnavailable" };
    const c = await ctx("owner");
    await activateSubscription(c.db, c.workspaceId, { provider: "test", actorUserId: c.userId });
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}
