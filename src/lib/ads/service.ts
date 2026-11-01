import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import { adInsightsDaily, ads, adsSettings, assets, integrations, orders, products, storefronts, type AdAudience, type AdCreative, type AdObjective, type AdsPlaybook } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { audit, track } from "@/lib/audit";
import { log } from "@/lib/log";
import { readAssetBytes } from "@/lib/storage";
import { unlock } from "@/lib/achievements/service";
import { WEBSITE_TYPES, isWebsiteType } from "@/lib/website/types";
import { MetaApi, MetaError, metaAppConfigured, parseInsight } from "./meta";
import { consumeSlot, quotaState, releaseSlot, reserveSlot } from "./quota";
import { cppPlan, resolvePlaybook } from "./playbook";
import { decide, type DecisionResult } from "./decision";
import { CTAS, OBJECTIVES, availableObjectives } from "./strategy";

export type Ctx = { db: DB; workspaceId: string; userId: string; locale: "ms" | "en" };
export type Ad = typeof ads.$inferSelect;
export const MIN_DAILY_BUDGET_SEN = 500;
const MYT = "Asia/Kuala_Lumpur";

// ---------------------------------------------------------------- Meta connection
export type MetaConfig = { adAccountId?: string; adAccountName?: string; currency?: string; pageId?: string; pageName?: string; instagramId?: string; pixelId?: string; pixelName?: string; userName?: string };

export async function getMetaConnection(db: DB, workspaceId: string) {
  const row = await db.query.integrations.findFirst({ where: and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, "meta")) });
  const config = (row?.publicConfig ?? {}) as MetaConfig;
  let token: string | null = null;
  let expiresAt: string | null = null;
  if (row?.secretCiphertext && row.status === "connected") {
    const s = JSON.parse(decryptSecret(row.secretCiphertext)) as { accessToken: string; expiresAt: string | null };
    token = s.accessToken;
    expiresAt = s.expiresAt;
  }
  const expired = Boolean(expiresAt && new Date(expiresAt) < new Date());
  return { row: row ?? null, config, token: expired ? null : token, expired, appConfigured: metaAppConfigured() };
}

export async function saveMetaToken(db: DB, ctx: { workspaceId: string; userId: string }, accessToken: string, expiresAt: string | null, userName?: string) {
  const secret = encryptSecret(JSON.stringify({ accessToken, expiresAt }));
  const existing = await db.query.integrations.findFirst({ where: and(eq(integrations.workspaceId, ctx.workspaceId), eq(integrations.provider, "meta")) });
  const publicConfig = { ...((existing?.publicConfig ?? {}) as MetaConfig), ...(userName ? { userName } : {}) } as Record<string, string>;
  if (existing) await db.update(integrations).set({ secretCiphertext: secret, status: "connected", kind: "ads", publicConfig, lastError: null, updatedAt: new Date() }).where(eq(integrations.id, existing.id));
  else await db.insert(integrations).values({ id: newId("int"), workspaceId: ctx.workspaceId, kind: "ads", provider: "meta", mode: "live", status: "connected", publicConfig, secretCiphertext: secret });
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "ads.meta_connected" });
}

/** Saves the seller's chosen ad account / page / pixel — each id is re-checked against what the token can access. */
export async function saveMetaSelection(db: DB, ctx: { workspaceId: string; userId: string }, sel: { adAccountId: string; pageId: string; pixelId?: string | null }) {
  const conn = await getMetaConnection(db, ctx.workspaceId);
  if (!conn.token || !conn.row) throw new AppError("meta.notConnected");
  const api = new MetaApi(conn.token);
  const [accounts, pages] = await Promise.all([api.adAccounts(), api.pages()]);
  const acct = accounts.data.find((a) => a.id === sel.adAccountId);
  const page = pages.data.find((p) => p.id === sel.pageId);
  if (!acct || !page) throw new AppError("errors.forbidden");
  let pixelName: string | undefined;
  if (sel.pixelId) {
    const px = (await api.pixels(acct.id)).data.find((p) => p.id === sel.pixelId);
    if (!px) throw new AppError("errors.forbidden");
    pixelName = px.name;
  }
  const config: MetaConfig = { ...conn.config, adAccountId: acct.id, adAccountName: acct.name, currency: acct.currency, pageId: page.id, pageName: page.name, instagramId: page.instagram_business_account?.id, pixelId: sel.pixelId ?? undefined, pixelName };
  await db.update(integrations).set({ publicConfig: config as Record<string, string>, updatedAt: new Date() }).where(eq(integrations.id, conn.row.id));
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "ads.meta_selection", data: { adAccountId: acct.id, pageId: page.id, pixelId: sel.pixelId ?? null } });
}

export async function disconnectMeta(db: DB, ctx: { workspaceId: string; userId: string }) {
  await db.update(integrations).set({ status: "disconnected", secretCiphertext: null, updatedAt: new Date() }).where(and(eq(integrations.workspaceId, ctx.workspaceId), eq(integrations.provider, "meta")));
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "ads.meta_disconnected" });
}

// ---------------------------------------------------------------- Settings
export async function getPlaybook(db: DB, workspaceId: string): Promise<AdsPlaybook> {
  const row = await db.query.adsSettings.findFirst({ where: eq(adsSettings.workspaceId, workspaceId) });
  return resolvePlaybook(row?.playbook);
}

const pctField = z.number().min(0).max(100);
export const playbookSchema = z.object({
  benchmarkLowPct: pctField,
  benchmarkHighPct: pctField,
  preferredLowPct: pctField,
  preferredHighPct: pctField,
  scaleBelowPct: z.number().min(10).max(90),
  cutLossSpendMultiple: z.number().min(1).max(20),
  cutLossCppMultiple: z.number().min(1).max(5),
  minObservationHours: z.number().int().min(0).max(720),
  minPurchasesForScale: z.number().int().min(1).max(100),
  feePct: z.number().min(0).max(50),
  shippingSubsidySen: z.number().int().min(0).max(1_000_000),
  otherVariableSen: z.number().int().min(0).max(1_000_000),
  minProfitSen: z.number().int().min(0).max(1_000_000),
  scalingReviewTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).partial();

export async function savePlaybook(db: DB, ctx: { workspaceId: string; userId: string }, raw: unknown) {
  const pb = playbookSchema.parse(raw);
  const merged = { ...(await getPlaybook(db, ctx.workspaceId)), ...pb };
  if (merged.preferredLowPct > merged.preferredHighPct || merged.benchmarkLowPct > merged.benchmarkHighPct) throw new AppError("errors.validation");
  await db.insert(adsSettings).values({ workspaceId: ctx.workspaceId, playbook: merged }).onConflictDoUpdate({ target: adsSettings.workspaceId, set: { playbook: merged, updatedAt: new Date() } });
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "ads.playbook_updated" });
}

// ---------------------------------------------------------------- Drafts
export async function getAd(db: DB, workspaceId: string, id: string) {
  const ad = await db.query.ads.findFirst({ where: and(eq(ads.id, id), eq(ads.workspaceId, workspaceId)) });
  if (!ad) throw new AppError("errors.notFound");
  return ad;
}

/** Where the ad sends people: the product page (catalog stores) or the sales page, tagged with the SellNow ad id. */
export async function destinationFor(db: DB, workspaceId: string, productId: string, adId: string, base: string) {
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, workspaceId) });
  const p = await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.workspaceId, workspaceId)) });
  if (!sf || !p) return null;
  const catalog = isWebsiteType(sf.websiteType) && WEBSITE_TYPES[sf.websiteType].layout === "catalog";
  const u = new URL(`${base}/s/${sf.slug}${catalog ? `/p/${p.slug}` : ""}`);
  u.searchParams.set("sn_ad", adId);
  u.searchParams.set("utm_source", "meta");
  u.searchParams.set("utm_medium", "paid");
  u.searchParams.set("utm_campaign", adId);
  return u.toString();
}

export async function createDraft(ctx: Ctx, productId: string, base: string) {
  const p = await ctx.db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.workspaceId, ctx.workspaceId)) });
  if (!p) throw new AppError("errors.notFound");
  const id = newId("ad");
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: MYT }).format(new Date());
  await ctx.db.insert(ads).values({ id, workspaceId: ctx.workspaceId, productId: p.id, name: `${p.name} · ${date}`.slice(0, 120), step: "strategy", destinationUrl: await destinationFor(ctx.db, ctx.workspaceId, p.id, id, base), createdBy: ctx.userId });
  await track(ctx.db, "ad_draft_created", { workspaceId: ctx.workspaceId, userId: ctx.userId });
  return id;
}

const audienceSchema = z.object({
  country: z.literal("MY").default("MY"),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  gender: z.enum(["all", "female", "male"]),
  mode: z.enum(["broad", "detailed"]),
  interests: z.array(z.string().max(60)).max(10).default([]),
  placements: z.enum(["advantage", "feeds", "stories_reels"]),
  reason: z.string().max(600).optional(),
});
const creativeSchema = z.object({
  approach: z.string().max(40),
  primaryText: z.string().trim().min(1).max(2200),
  headline: z.string().trim().min(1).max(255),
  description: z.string().max(255).default(""),
  cta: z.enum(CTAS),
  imageAssetId: z.string().nullable().optional(),
  ratio: z.string().nullable().optional(),
});
export const draftPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  step: z.enum(["product", "strategy", "audience", "budget", "creative", "review"]).optional(),
  objective: z.enum(OBJECTIVES as [AdObjective, ...AdObjective[]]).optional(),
  audience: audienceSchema.optional(),
  dailyBudgetSen: z.number().int().min(MIN_DAILY_BUDGET_SEN).max(10_000_000).optional(),
  targetCppSen: z.number().int().min(1).max(10_000_000).nullable().optional(),
  creative: creativeSchema.optional(),
  /** Seller's unit product cost — saved on the product, used for break-even CPP. */
  productCostSen: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

/** Drafts are editable freely. Live ads only accept the name (budget/status have their own audited paths). */
export async function updateDraft(ctx: Ctx, adId: string, raw: unknown) {
  const ad = await getAd(ctx.db, ctx.workspaceId, adId);
  const patch = draftPatchSchema.parse(raw);
  const editable = ad.status === "draft" || ad.status === "failed";
  if (!editable && Object.keys(patch).some((k) => k !== "name" && k !== "productCostSen")) throw new AppError("ads.liveNotEditable");
  if (patch.audience && patch.audience.ageMin > patch.audience.ageMax) throw new AppError("errors.validation");
  if (patch.objective) {
    const p = ad.productId ? await ctx.db.query.products.findFirst({ where: eq(products.id, ad.productId) }) : null;
    if (p && !(await availableObjectives(ctx.db, ctx.workspaceId, p))[patch.objective]) throw new AppError("ads.objectiveUnavailable");
  }
  if (patch.creative?.imageAssetId) {
    const a = await ctx.db.query.assets.findFirst({ where: and(eq(assets.id, patch.creative.imageAssetId), eq(assets.workspaceId, ctx.workspaceId)) });
    if (!a || a.kind !== "image") throw new AppError("errors.forbidden");
  }
  if (patch.productCostSen !== undefined && ad.productId) {
    await ctx.db.update(products).set({ costSen: patch.productCostSen, updatedAt: new Date() }).where(and(eq(products.id, ad.productId), eq(products.workspaceId, ctx.workspaceId)));
  }
  const { productCostSen: _ignored, ...rest } = patch;
  void _ignored;
  const set: Partial<typeof ads.$inferInsert> = { ...(rest as Partial<typeof ads.$inferInsert>), updatedAt: new Date() };
  await ctx.db.update(ads).set(set).where(eq(ads.id, ad.id));
}

export async function saveStrategy(ctx: Ctx, adId: string, strategy: NonNullable<Ad["strategy"]>, audience: AdAudience) {
  await ctx.db.update(ads).set({ strategy, objective: strategy.objective, audience, step: "strategy", updatedAt: new Date() }).where(and(eq(ads.id, adId), eq(ads.workspaceId, ctx.workspaceId)));
}

export async function duplicateAd(ctx: Ctx, adId: string) {
  const src = await getAd(ctx.db, ctx.workspaceId, adId);
  const id = newId("ad");
  await ctx.db.insert(ads).values({
    id,
    workspaceId: ctx.workspaceId,
    productId: src.productId,
    name: `${src.name} (copy)`.slice(0, 120),
    step: "review",
    objective: src.objective,
    strategy: src.strategy,
    audience: src.audience,
    dailyBudgetSen: src.dailyBudgetSen,
    targetCppSen: src.targetCppSen,
    creative: src.creative,
    destinationUrl: src.destinationUrl?.replace(src.id, id) ?? null,
    duplicatedFromId: src.id,
    createdBy: ctx.userId,
  });
  return id;
}

export async function deleteDraft(ctx: Ctx, adId: string) {
  const ad = await getAd(ctx.db, ctx.workspaceId, adId);
  if (ad.metaAdId) throw new AppError("ads.liveNotEditable"); // published ads are archived in Meta, not deleted here
  await ctx.db.delete(ads).where(eq(ads.id, ad.id));
}

/** Everything needed to set the ad up manually in Ads Manager (Draft / Export mode). */
export function exportAd(ad: Ad, productName: string | null) {
  return {
    name: ad.name,
    product: productName,
    objective: ad.objective,
    audience: ad.audience,
    dailyBudgetMYR: ad.dailyBudgetSen != null ? (ad.dailyBudgetSen / 100).toFixed(2) : null,
    primaryText: ad.creative?.primaryText ?? "",
    headline: ad.creative?.headline ?? "",
    description: ad.creative?.description ?? "",
    callToAction: ad.creative?.cta ?? "",
    destinationUrl: ad.destinationUrl,
  };
}

// ---------------------------------------------------------------- Readiness
export type Check = { id: string; ok: boolean; blocking: boolean; params?: Record<string, string> };

export async function publishReadiness(db: DB, workspaceId: string, ad: Ad) {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, blocking = true, params?: Record<string, string>) => checks.push({ id, ok, blocking, params });
  const conn = await getMetaConnection(db, workspaceId);
  add("metaApp", conn.appConfigured);
  add("metaConnected", Boolean(conn.token));
  add("adAccount", Boolean(conn.config.adAccountId));
  add("currencyMYR", !conn.config.currency || conn.config.currency === "MYR", true, { currency: conn.config.currency ?? "" });
  add("page", Boolean(conn.config.pageId));
  const p = ad.productId ? await db.query.products.findFirst({ where: eq(products.id, ad.productId) }) : null;
  add("product", Boolean(p));
  const avail = p ? await availableObjectives(db, workspaceId, p) : null;
  add("websiteLive", Boolean(avail?.live) || ad.objective === "messages");
  if (ad.objective === "sales") add("checkout", Boolean(avail?.sales));
  if (ad.objective === "sales" || ad.objective === "leads") {
    add("pixel", Boolean(conn.config.pixelId));
    // A brand-new store has no purchases yet, so an unseen event is a warning, not a blocker.
    let seen = false;
    if (conn.token && conn.config.pixelId) seen = await new MetaApi(conn.token).pixelEventSeen(conn.config.pixelId, ad.objective === "sales" ? "Purchase" : "Lead").catch(() => false);
    add(ad.objective === "sales" ? "purchaseEvent" : "leadEvent", seen, false);
  }
  add("objective", Boolean(ad.objective));
  add("audience", Boolean(ad.audience));
  add("budget", (ad.dailyBudgetSen ?? 0) >= MIN_DAILY_BUDGET_SEN);
  add("creative", Boolean(ad.creative?.primaryText && ad.creative.headline));
  add("destination", Boolean(ad.destinationUrl) || ad.objective === "messages");
  const q = await quotaState(db, workspaceId);
  add("quota", q.remaining > 0 || Boolean(await db.query.adSlotLedger.findFirst({ where: (t, { eq: e }) => e(t.adId, ad.id) })), true, { plan: q.plan });
  return { ready: checks.every((c) => c.ok || !c.blocking), checks, quota: q };
}

// ---------------------------------------------------------------- Publish
/**
 * Publishes ONE ad to Meta (Campaign → Ad Set → Creative → Ad, all created PAUSED then activated).
 * - Requires explicit confirmation from the UI (the action passes `confirmed: true`).
 * - Quota enforced server-side: a slot is reserved first and CONSUMED only after Meta confirms.
 * - Idempotent: an ad that already has a Meta ad id is returned as-is; failures release the slot
 *   and clean up partially created Meta objects. Success is never simulated.
 */
export async function publishAd(ctx: Ctx, adId: string, opts: { confirmed: boolean }) {
  if (!opts.confirmed) throw new AppError("ads.confirmRequired");
  let ad = await getAd(ctx.db, ctx.workspaceId, adId);
  if (ad.metaAdId && ad.status !== "failed") return { status: ad.status, metaAdId: ad.metaAdId, duplicate: true };
  if (ad.status === "publishing") throw new AppError("ads.publishInProgress");
  const readiness = await publishReadiness(ctx.db, ctx.workspaceId, ad);
  const blocking = readiness.checks.filter((c) => !c.ok && c.blocking && c.id !== "quota");
  if (blocking.length) throw new AppError("ads.notReady", { checks: blocking.map((c) => c.id).join(",") });

  await reserveSlot(ctx.db, ctx.workspaceId, ad.id); // throws ads.trialUsed / ads.monthlyQuotaUsed
  // Claim the publish (prevents a second concurrent request from also calling Meta).
  const claimed = await ctx.db.update(ads).set({ status: "publishing", lastError: null, updatedAt: new Date() }).where(and(eq(ads.id, ad.id), inArray(ads.status, ["draft", "failed"]))).returning();
  if (!claimed.length) throw new AppError("ads.publishInProgress");
  ad = claimed[0]!;

  const conn = await getMetaConnection(ctx.db, ctx.workspaceId);
  const api = new MetaApi(conn.token!);
  const acct = conn.config.adAccountId!;
  const created: string[] = [];
  try {
    const campaignId = await api.createCampaign(acct, { name: ad.name, objective: ad.objective! });
    created.push(campaignId);
    const adSetId = await api.createAdSet(acct, { name: `${ad.name} · audience`, campaignId, objective: ad.objective!, dailyBudgetSen: ad.dailyBudgetSen!, audience: ad.audience!, pixelId: conn.config.pixelId, pageId: conn.config.pageId! });
    created.push(adSetId);
    let imageHash: string | null = null;
    const imageId = ad.creative?.imageAssetId ?? (ad.productId ? (await ctx.db.query.products.findFirst({ where: eq(products.id, ad.productId) }))?.imageAssetId : null);
    if (imageId) {
      const a = await ctx.db.query.assets.findFirst({ where: and(eq(assets.id, imageId), eq(assets.workspaceId, ctx.workspaceId)) });
      if (a) imageHash = await api.uploadImage(acct, (await readAssetBytes(a.storageKey)).toString("base64"));
    }
    const creativeId = await api.createCreative(acct, { name: `${ad.name} · creative`, pageId: conn.config.pageId!, instagramId: conn.config.instagramId, creative: ad.creative!, link: ad.destinationUrl ?? `https://facebook.com/${conn.config.pageId}`, imageHash });
    const metaAdId = await api.createAd(acct, { name: ad.name, adSetId, creativeId });
    created.push(metaAdId);
    for (const id of [campaignId, adSetId, metaAdId]) await api.setStatus(id, "ACTIVE");
    const st = await api.adStatus(metaAdId).catch(() => ({ effective_status: "IN_PROCESS" }) as { effective_status: string; ad_review_feedback?: Record<string, unknown> });

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(ads)
        .set({
          status: /PENDING|IN_PROCESS/.test(st.effective_status) ? "pending_review" : st.effective_status === "DISAPPROVED" ? "rejected" : "active",
          metaCampaignId: campaignId,
          metaAdSetId: adSetId,
          metaCreativeId: creativeId,
          metaAdId,
          metaEffectiveStatus: st.effective_status,
          metaReview: st.ad_review_feedback ?? null,
          publishedAt: new Date(),
          originalBudgetSen: ad.originalBudgetSen ?? ad.dailyBudgetSen,
          step: "review",
          updatedAt: new Date(),
        })
        .where(eq(ads.id, ad.id));
      await consumeSlot(tx, ctx.workspaceId, ad.id, metaAdId);
      await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "ads.published", entity: "ad", entityId: ad.id, data: { metaAdId, campaignId, adSetId, dailyBudgetSen: ad.dailyBudgetSen } });
    });
    await unlock(ctx.db, ctx.workspaceId, "marketing_starter", 1, { type: "ad", id: ad.id });
    await track(ctx.db, "ad_published", { workspaceId: ctx.workspaceId, props: { objective: ad.objective } });
    return { status: "published", metaAdId, duplicate: false };
  } catch (e) {
    // Roll back whatever exists in Meta (newest first), release the slot, keep the draft for retry.
    for (const id of created.reverse()) await api.deleteObject(id).catch(() => null);
    await releaseSlot(ctx.db, ctx.workspaceId, ad.id);
    const code = e instanceof AppError ? e.code : "meta.apiError";
    if (!(e instanceof AppError)) log("error", "ads.publish_unexpected", { error: e instanceof Error ? e.message : String(e) });
    await ctx.db.update(ads).set({ status: "failed", lastError: e instanceof MetaError ? `${code}: ${e.detail}`.slice(0, 500) : code, metaCampaignId: null, metaAdSetId: null, metaCreativeId: null, metaAdId: null, updatedAt: new Date() }).where(eq(ads.id, ad.id));
    await audit(ctx.db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "ads.publish_failed", entity: "ad", entityId: ad.id, data: { code } });
    throw e instanceof AppError ? e : new AppError("meta.apiError");
  }
}

// ---------------------------------------------------------------- Manage live ads (no slots involved)
async function liveApi(ctx: Ctx, ad: Ad) {
  if (!ad.metaAdId) throw new AppError("ads.notPublished");
  const conn = await getMetaConnection(ctx.db, ctx.workspaceId);
  if (!conn.token) throw new AppError("meta.notConnected");
  return new MetaApi(conn.token);
}

export async function setAdPaused(ctx: Ctx, adId: string, paused: boolean) {
  const ad = await getAd(ctx.db, ctx.workspaceId, adId);
  const api = await liveApi(ctx, ad);
  await api.setStatus(ad.metaAdId!, paused ? "PAUSED" : "ACTIVE");
  await ctx.db.update(ads).set({ status: paused ? "paused" : "active", metaEffectiveStatus: paused ? "PAUSED" : "ACTIVE", updatedAt: new Date() }).where(eq(ads.id, ad.id));
  await audit(ctx.db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: paused ? "ads.paused" : "ads.resumed", entity: "ad", entityId: ad.id });
}

/** Budget change on a live ad — only after explicit confirmation of the exact new amount; always audited. */
export async function changeBudget(ctx: Ctx, adId: string, newBudgetSen: number, confirmedSen: number) {
  if (newBudgetSen !== confirmedSen) throw new AppError("ads.confirmRequired");
  if (!Number.isInteger(newBudgetSen) || newBudgetSen < MIN_DAILY_BUDGET_SEN || newBudgetSen > 10_000_000) throw new AppError("errors.validation");
  const ad = await getAd(ctx.db, ctx.workspaceId, adId);
  const api = await liveApi(ctx, ad);
  await api.updateDailyBudget(ad.metaAdSetId!, newBudgetSen);
  await ctx.db.update(ads).set({ dailyBudgetSen: newBudgetSen, updatedAt: new Date() }).where(eq(ads.id, ad.id));
  await audit(ctx.db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "ads.budget_changed", entity: "ad", entityId: ad.id, data: { fromSen: ad.dailyBudgetSen, toSen: newBudgetSen, originalSen: ad.originalBudgetSen } });
}

// ---------------------------------------------------------------- Sync (real Meta data only)
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: MYT }).format(d);

export async function syncWorkspaceAds(db: DB, workspaceId: string, days = 30) {
  const conn = await getMetaConnection(db, workspaceId);
  if (!conn.token) return { synced: 0, skipped: "notConnected" as const };
  const api = new MetaApi(conn.token);
  const live = await db.query.ads.findMany({ where: and(eq(ads.workspaceId, workspaceId), isNotNull(ads.metaAdId)) });
  const until = ymd(new Date());
  const since = ymd(new Date(Date.now() - (days - 1) * 86400_000));
  let synced = 0;
  for (const ad of live) {
    try {
      const [ins, st] = await Promise.all([api.insights(ad.metaAdId!, since, until), api.adStatus(ad.metaAdId!)]);
      for (const row of ins.data) {
        const r = parseInsight(row);
        const values = { workspaceId, adId: ad.id, date: r.date, spendSen: r.spendSen, impressions: r.impressions, clicks: r.clicks, purchases: r.purchases, revenueSen: r.revenueSen, leads: r.leads, fetchedAt: new Date() };
        await db.insert(adInsightsDaily).values({ id: newId("ins"), ...values }).onConflictDoUpdate({ target: [adInsightsDaily.adId, adInsightsDaily.date], set: values });
      }
      const status = st.effective_status === "DISAPPROVED" ? "rejected" : st.effective_status === "PAUSED" || st.effective_status === "CAMPAIGN_PAUSED" || st.effective_status === "ADSET_PAUSED" ? "paused" : /PENDING|IN_PROCESS/.test(st.effective_status) ? "pending_review" : st.effective_status === "ACTIVE" ? "active" : ad.status;
      await db.update(ads).set({ metaEffectiveStatus: st.effective_status, metaReview: st.ad_review_feedback ?? null, status, lastSyncedAt: new Date(), lastError: null }).where(eq(ads.id, ad.id));
      synced++;
    } catch (e) {
      await db.update(ads).set({ lastError: e instanceof AppError ? e.code : "meta.apiError" }).where(eq(ads.id, ad.id));
    }
  }
  return { synced };
}

// ---------------------------------------------------------------- Metrics & decisions
export type Range = { since: string; until: string };
export function rangeFor(key: string, now = new Date(), custom?: { from?: string; to?: string }): Range & { key: string } {
  const today = ymd(now);
  const back = (n: number) => ymd(new Date(now.getTime() - n * 86400_000));
  switch (key) {
    case "today":
      return { key, since: today, until: today };
    case "yesterday":
      return { key, since: back(1), until: back(1) };
    case "7d":
      return { key, since: back(6), until: today };
    case "custom":
      if (custom?.from && custom.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) && custom.from <= custom.to) return { key, since: custom.from, until: custom.to };
      return { key: "30d", since: back(29), until: today };
    default:
      return { key: "30d", since: back(29), until: today };
  }
}

export function previousRange(r: Range): Range {
  const days = Math.round((Date.parse(r.until) - Date.parse(r.since)) / 86400_000) + 1;
  const until = ymd(new Date(Date.parse(r.since) - 86400_000));
  return { since: ymd(new Date(Date.parse(until) - (days - 1) * 86400_000)), until };
}

export async function totalsByAd(db: DB, workspaceId: string, r: Range) {
  const rows = await db
    .select({
      adId: adInsightsDaily.adId,
      spendSen: sql<number>`coalesce(sum(${adInsightsDaily.spendSen}),0)::int`,
      purchases: sql<number>`coalesce(sum(${adInsightsDaily.purchases}),0)::int`,
      revenueSen: sql<number>`coalesce(sum(${adInsightsDaily.revenueSen}),0)::int`,
      clicks: sql<number>`coalesce(sum(${adInsightsDaily.clicks}),0)::int`,
      impressions: sql<number>`coalesce(sum(${adInsightsDaily.impressions}),0)::int`,
      leads: sql<number>`coalesce(sum(${adInsightsDaily.leads}),0)::int`,
    })
    .from(adInsightsDaily)
    .where(and(eq(adInsightsDaily.workspaceId, workspaceId), gte(adInsightsDaily.date, r.since), lte(adInsightsDaily.date, r.until)))
    .groupBy(adInsightsDaily.adId);
  return new Map(rows.map((x) => [x.adId, { spendSen: Number(x.spendSen), purchases: Number(x.purchases), revenueSen: Number(x.revenueSen), clicks: Number(x.clicks), impressions: Number(x.impressions), leads: Number(x.leads) }]));
}

export async function dailySeries(db: DB, workspaceId: string, r: Range, adId?: string) {
  return db
    .select({ date: adInsightsDaily.date, spendSen: sql<number>`sum(${adInsightsDaily.spendSen})::int`, purchases: sql<number>`sum(${adInsightsDaily.purchases})::int`, revenueSen: sql<number>`sum(${adInsightsDaily.revenueSen})::int` })
    .from(adInsightsDaily)
    .where(and(eq(adInsightsDaily.workspaceId, workspaceId), gte(adInsightsDaily.date, r.since), lte(adInsightsDaily.date, r.until), ...(adId ? [eq(adInsightsDaily.adId, adId)] : [])))
    .groupBy(adInsightsDaily.date)
    .orderBy(adInsightsDaily.date);
}

/** Confirmed (paid, non-test) store orders that arrived through each ad's tagged link. */
export async function storeOrdersByAd(db: DB, workspaceId: string, r: Range) {
  const rows = await db
    .select({ adRef: orders.adRef, n: sql<number>`count(*)::int`, sen: sql<number>`coalesce(sum(${orders.totalSen} - ${orders.refundedSen}),0)::int` })
    .from(orders)
    .where(and(eq(orders.workspaceId, workspaceId), isNotNull(orders.adRef), eq(orders.isTest, false), sql`${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED')`, sql`(${orders.paidAt} at time zone 'Asia/Kuala_Lumpur')::date between ${r.since}::date and ${r.until}::date`))
    .groupBy(orders.adRef);
  return new Map(rows.map((x) => [x.adRef!, { orders: Number(x.n), revenueSen: Number(x.sen) }]));
}

/** Decision for one ad using lifetime (since publish) metrics — the honest basis for cut/maintain/scale. */
export async function adDecision(db: DB, ad: Ad, pb: AdsPlaybook, trackingReady: boolean): Promise<DecisionResult & { plan: ReturnType<typeof cppPlan> } | null> {
  if (!ad.metaAdId || !ad.productId) return null;
  const p = await db.query.products.findFirst({ where: eq(products.id, ad.productId) });
  if (!p) return null;
  const [t] = await db
    .select({ spendSen: sql<number>`coalesce(sum(${adInsightsDaily.spendSen}),0)::int`, purchases: sql<number>`coalesce(sum(${adInsightsDaily.purchases}),0)::int`, revenueSen: sql<number>`coalesce(sum(${adInsightsDaily.revenueSen}),0)::int` })
    .from(adInsightsDaily)
    .where(eq(adInsightsDaily.adId, ad.id));
  const plan = cppPlan(p.priceSen, pb, p.costSen, ad.targetCppSen);
  const unitCostSen = p.costSen == null ? null : p.costSen + Math.round((p.priceSen * pb.feePct) / 100) + pb.shippingSubsidySen + pb.otherVariableSen;
  const hoursLive = ad.publishedAt ? (Date.now() - ad.publishedAt.getTime()) / 3_600_000 : 0;
  return { ...decide({ spendSen: Number(t?.spendSen ?? 0), purchases: Number(t?.purchases ?? 0), revenueSen: Number(t?.revenueSen ?? 0), hoursLive, trackingReady, unitCostSen }, plan, pb), plan };
}

export async function listAds(db: DB, workspaceId: string) {
  return db.query.ads.findMany({ where: eq(ads.workspaceId, workspaceId), orderBy: desc(ads.updatedAt) });
}

export function trackingReadyFor(ad: Ad, conn: { config: MetaConfig }) {
  if (ad.objective === "messages" || ad.objective === "traffic") return true;
  return Boolean(conn.config.pixelId);
}

export type { AdCreative };
