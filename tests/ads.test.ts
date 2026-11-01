import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, makeLiveStore, makeSeller } from "./helpers";
import type { DB } from "@/lib/db";
import { adSlotLedger, ads, auditLogs, achievementUnlocks, integrations, orders, products, adInsightsDaily } from "@/lib/db/schema";
import { DEFAULT_PLAYBOOK, budgetProjection, cppPlan, scaledBudget } from "@/lib/ads/playbook";
import { decide } from "@/lib/ads/decision";
import { ADS_STUDIO, activateSubscription, quotaState, releaseSlot, reserveSlot, setSubscriptionStatus } from "@/lib/ads/quota";
import { __setMetaFetchForTests, parseInsight } from "@/lib/ads/meta";
import * as svc from "@/lib/ads/service";
import { createCheckout } from "@/lib/commerce/checkout";
import { publishStorefront } from "@/lib/storefront/service";
import { newId } from "@/lib/ids";

let db: DB;
beforeAll(async () => {
  db = await makeDb();
  process.env.META_APP_ID = "app";
  process.env.META_APP_SECRET = "secret";
});
afterEach(() => __setMetaFetchForTests(null));

const pb = DEFAULT_PLAYBOOK;

describe("CPP playbook maths (RM50 example from the brief)", () => {
  const plan = cppPlan(5000, pb, null);
  it("benchmark, preferred range, reference, and the 50%-cheaper band", () => {
    expect(plan.benchmark).toEqual({ lowSen: 1000, highSen: 1750 }); // RM10 – RM17.50
    expect(plan.preferred).toEqual({ lowSen: 1000, highSen: 1500 }); // RM10 – RM15
    expect(plan.referenceSen).toBe(1200); // RM12 reference
    expect(plan.scaleBand).toEqual({ lowSen: 500, highSen: 750 }); // RM5 – RM7.50
    expect(plan.breakEvenSen).toBeNull(); // no cost entered → never guessed
  });
  it("break-even and maximum profitable CPP from real costs", () => {
    const p = cppPlan(5000, { ...pb, feePct: 2, shippingSubsidySen: 500, otherVariableSen: 100, minProfitSen: 500 }, 1800);
    expect(p.breakEvenSen).toBe(5000 - 100 - 1800 - 500 - 100); // RM25
    expect(p.maxProfitableSen).toBe(2000); // RM20 after RM5 desired profit
    expect(cppPlan(5000, pb, null, 1400).referenceSen).toBe(1400); // seller override
  });
  it("budget projections are ranges and scaling is computed from the original budget", () => {
    expect(budgetProjection(5000, plan)).toEqual({ dailySen: 5000, monthlySen: 150000, purchasesLow: 100, purchasesHigh: 150 });
    expect([100, 150, 200].map((x) => scaledBudget(5000, x))).toEqual([10000, 12500, 15000]);
    expect(scaledBudget(5000, 25)).toBe(6250);
    expect(() => scaledBudget(5000, 0)).toThrow();
  });
});

describe("Cut Loss / Maintain / Scale engine", () => {
  const plan = cppPlan(5000, { ...pb }, null, 1500); // target RM15 as in the cut-loss example
  const base = { revenueSen: 0, hoursLive: 72, trackingReady: true, unitCostSen: null };
  it("cuts loss after RM80 spend with no purchase — but only with enough observation time", () => {
    expect(decide({ ...base, spendSen: 8000, purchases: 0 }, plan, pb)).toMatchObject({ decision: "cut", reason: "noPurchases", cppSen: null });
    expect(decide({ ...base, spendSen: 8000, purchases: 0, hoursLive: 12 }, plan, pb)).toMatchObject({ decision: "maintain", reason: "tooEarly", confidence: "low" });
    expect(decide({ ...base, spendSen: 2000, purchases: 0 }, plan, pb)).toMatchObject({ decision: "maintain", reason: "collecting" });
    expect(decide({ ...base, spendSen: 8000, purchases: 0, trackingReady: false }, plan, pb)).toMatchObject({ decision: "maintain", reason: "tracking" });
  });
  const ref12 = cppPlan(5000, pb, null);
  it("maintains at RM12 CPP inside the preferred range", () => {
    expect(decide({ ...base, spendSen: 12000, purchases: 10, revenueSen: 50000 }, ref12, pb)).toMatchObject({ decision: "maintain", reason: "onTarget", cppSen: 1200, diffPct: 0, roas: 4.17 });
  });
  it("scales at RM6 CPP (50% below RM12) with enough purchases; not with a single lucky sale", () => {
    expect(decide({ ...base, spendSen: 7200, purchases: 12, revenueSen: 60000 }, ref12, pb)).toMatchObject({ decision: "scale", cppSen: 600, diffPct: 50 });
    expect(decide({ ...base, spendSen: 600, purchases: 1 }, ref12, pb)).toMatchObject({ decision: "maintain", reason: "fewPurchases", confidence: "low" });
  });
  it("judges profitability with real costs, not CPP alone", () => {
    const withCost = cppPlan(5000, pb, 4200); // break-even RM8
    expect(decide({ ...base, spendSen: 10000, purchases: 10, revenueSen: 50000, unitCostSen: 4200 }, withCost, pb)).toMatchObject({ decision: "cut", reason: "unprofitable", profitSen: 50000 - 10000 - 42000 });
    expect(decide({ ...base, spendSen: 3000, purchases: 1 }, ref12, pb)).toMatchObject({ decision: "cut", reason: "tooExpensive" }); // RM30 > 1.5 × RM15
    expect(decide({ ...base, spendSen: 1700, purchases: 1 }, ref12, pb)).toMatchObject({ decision: "maintain", reason: "aboveTarget" });
  });
});

describe("Meta insights parsing", () => {
  it("counts purchases once even when overlapping action types are reported", () => {
    const r = parseInsight({ date_start: "2026-11-01", spend: "48.20", impressions: "5100", clicks: "120", actions: [{ action_type: "purchase", value: "3" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" }, { action_type: "omni_purchase", value: "3" }], action_values: [{ action_type: "omni_purchase", value: "150.00" }] });
    expect(r).toMatchObject({ spendSen: 4820, purchases: 3, revenueSen: 15000, clicks: 120 });
  });
});

async function fakeAd(workspaceId: string) {
  const id = newId("ad");
  await db.insert(ads).values({ id, workspaceId, name: "x" });
  return id;
}

describe("publication quota (server-side, workspace-based)", () => {
  it("free: exactly 3 trial slots; failures release; same ad never consumes twice", async () => {
    const s = await makeSeller(db);
    const a1 = await fakeAd(s.workspaceId);
    await reserveSlot(db, s.workspaceId, a1);
    await reserveSlot(db, s.workspaceId, a1); // retry / double click
    expect((await quotaState(db, s.workspaceId)).trialUsed).toBe(1);
    const failed = await fakeAd(s.workspaceId);
    await reserveSlot(db, s.workspaceId, failed);
    await releaseSlot(db, s.workspaceId, failed); // failed publication
    expect((await quotaState(db, s.workspaceId)).trialUsed).toBe(1);
    await reserveSlot(db, s.workspaceId, await fakeAd(s.workspaceId));
    await reserveSlot(db, s.workspaceId, await fakeAd(s.workspaceId));
    expect(await quotaState(db, s.workspaceId)).toMatchObject({ plan: "free", trialUsed: 3, remaining: 0 });
    await expect(reserveSlot(db, s.workspaceId, await fakeAd(s.workspaceId))).rejects.toMatchObject({ code: "ads.trialUsed" });
  });

  it("concurrent publishes cannot exceed the quota", async () => {
    const s = await makeSeller(db);
    const ids = await Promise.all(Array.from({ length: 5 }, () => fakeAd(s.workspaceId)));
    const results = await Promise.allSettled(ids.map((id) => reserveSlot(db, s.workspaceId, id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(ADS_STUDIO.trialSlots);
  });

  it("paid: 3 new ads per billing period, no rollover, reset next period; payment failure blocks only new ads", async () => {
    const s = await makeSeller(db);
    const t0 = new Date("2026-11-01T02:00:00Z");
    await activateSubscription(db, s.workspaceId, { provider: "test", now: t0 });
    for (let i = 0; i < 3; i++) await reserveSlot(db, s.workspaceId, await fakeAd(s.workspaceId), new Date("2026-11-05T00:00:00Z"));
    const q = await quotaState(db, s.workspaceId, new Date("2026-11-05T00:00:00Z"));
    expect(q).toMatchObject({ plan: "paid", monthlyUsed: 3, monthlyRemaining: 0, trialRemaining: 3 });
    // Monthly used up → falls back to the unused one-time trial slots.
    const extra = await reserveSlot(db, s.workspaceId, await fakeAd(s.workspaceId), new Date("2026-11-06T00:00:00Z"));
    expect(extra.kind).toBe("trial");
    // Next period (renewed by billing): fresh 3, nothing rolled over.
    await activateSubscription(db, s.workspaceId, { provider: "test", now: new Date("2026-12-01T02:00:00Z") });
    expect(await quotaState(db, s.workspaceId, new Date("2026-12-02T00:00:00Z"))).toMatchObject({ monthlyUsed: 0, monthlyRemaining: 3 });
    await setSubscriptionStatus(db, s.workspaceId, "past_due");
    expect(await quotaState(db, s.workspaceId, new Date("2026-12-02T00:00:00Z"))).toMatchObject({ plan: "free", monthlyRemaining: 0 });
  });
});

type Call = { method: string; path: string; body: URLSearchParams };
let n = 0; // Meta object ids are globally unique — keep the counter across tests
function metaMock(opts: { failOn?: string; purchaseSeen?: boolean } = {}) {
  const calls: Call[] = [];
  const first = n;
  __setMetaFetchForTests((async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    const path = u.pathname.replace(/^\/v\d+\.\d+/, "");
    calls.push({ method, path, body: method === "GET" ? u.searchParams : new URLSearchParams(String(init?.body ?? "")) });
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (opts.failOn && path.endsWith(opts.failOn) && method === "POST") return new Response(JSON.stringify({ error: { message: "Invalid parameter", code: 100, error_user_msg: "Ad text is too long" } }), { status: 400 });
    if (path.endsWith("/stats")) return ok({ data: opts.purchaseSeen ? [{ data: [{ value: "Purchase", count: 2 }] }] : [] });
    if (path.endsWith("/insights")) return ok({ data: [{ date_start: "2026-10-31", spend: "40.00", actions: [{ action_type: "purchase", value: "2" }], action_values: [{ action_type: "purchase", value: "100" }] }, { date_start: "2026-11-01", spend: "32.00", actions: [{ action_type: "purchase", value: "4" }], action_values: [{ action_type: "purchase", value: "200" }] }] });
    if (method === "POST" && path.endsWith("/adimages")) return ok({ images: { img: { hash: "hash1" } } });
    if (method === "POST" && /\/act_1\/(campaigns|adsets|adcreatives|ads)$/.test(path)) return ok({ id: `obj_${++n}` });
    if (method === "POST" || method === "DELETE") return ok({ success: true });
    if (method === "GET") return ok({ effective_status: "PENDING_REVIEW" });
    return ok({});
  }) as typeof fetch);
  return Object.assign(calls, { first });
}

async function readyStore() {
  const s = await makeLiveStore(db);
  expect((await publishStorefront(s.ctx)).ok).toBe(true);
  await svc.saveMetaToken(db, s, "EAAtoken", null, "Seller");
  await db.update(integrations).set({ publicConfig: { adAccountId: "act_1", currency: "MYR", pageId: "page1", pixelId: "123456789" } }).where(and(eq(integrations.workspaceId, s.workspaceId), eq(integrations.provider, "meta")));
  const ctx = { db, workspaceId: s.workspaceId, userId: s.userId, locale: "ms" as const };
  const adId = await svc.createDraft(ctx, s.productId, "http://localhost:3101");
  await svc.updateDraft(ctx, adId, {
    objective: "sales",
    audience: { country: "MY", ageMin: 18, ageMax: 65, gender: "all", mode: "broad", interests: [], placements: "advantage" },
    dailyBudgetSen: 5000,
    creative: { approach: "direct", primaryText: "Sambal garing RM19.90", headline: "Sambal homemade", description: "Pos seluruh Malaysia", cta: "shop_now" },
  });
  return { s, ctx, adId };
}

describe("publishing to Meta", () => {
  it("creates Campaign → Ad Set → Creative → Ad paused, activates them, consumes one slot, and is idempotent", async () => {
    const { s, ctx, adId } = await readyStore();
    const calls = metaMock({ purchaseSeen: true });
    await expect(svc.publishAd(ctx, adId, { confirmed: false })).rejects.toMatchObject({ code: "ads.confirmRequired" });
    const r = await svc.publishAd(ctx, adId, { confirmed: true });
    expect(r).toMatchObject({ status: "published", duplicate: false });
    const posts = calls.filter((c) => c.method === "POST").map((c) => c.path);
    expect(posts.slice(0, 3)).toEqual(["/act_1/campaigns", "/act_1/adsets", "/act_1/adcreatives"]);
    const adset = calls.find((c) => c.path === "/act_1/adsets")!.body;
    expect(adset.get("daily_budget")).toBe("5000");
    expect(JSON.parse(adset.get("promoted_object")!)).toEqual({ pixel_id: "123456789", custom_event_type: "PURCHASE" });
    expect(JSON.parse(adset.get("targeting")!)).toMatchObject({ geo_locations: { countries: ["MY"] }, age_min: 18, age_max: 65 });
    expect(calls.find((c) => c.path === "/act_1/campaigns")!.body.get("status")).toBe("PAUSED");
    const link = JSON.parse(calls.find((c) => c.path === "/act_1/adcreatives")!.body.get("object_story_spec")!).link_data.link as string;
    expect(link).toContain(`sn_ad=${adId}`);
    expect(calls.filter((c) => c.body.get("status") === "ACTIVE")).toHaveLength(3);

    const ad = await svc.getAd(db, s.workspaceId, adId);
    expect(ad).toMatchObject({ status: "pending_review", originalBudgetSen: 5000 });
    expect(ad.metaAdId).toBeTruthy();
    const [slot] = await db.select().from(adSlotLedger).where(eq(adSlotLedger.adId, adId));
    expect(slot).toMatchObject({ status: "consumed", kind: "trial", metaAdId: ad.metaAdId });
    expect((await db.select().from(achievementUnlocks).where(eq(achievementUnlocks.workspaceId, s.workspaceId))).map((u) => u.key)).toContain("marketing_starter");

    const again = await svc.publishAd(ctx, adId, { confirmed: true });
    expect(again.duplicate).toBe(true);
    expect((await quotaState(db, s.workspaceId)).trialUsed).toBe(1);
  });

  it("a failed publication cleans up Meta objects, releases the slot and never claims success", async () => {
    const { s, ctx, adId } = await readyStore();
    const calls = metaMock({ failOn: "/act_1/ads" });
    await expect(svc.publishAd(ctx, adId, { confirmed: true })).rejects.toMatchObject({ code: "meta.invalidRequest" });
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual([`/obj_${calls.first + 2}`, `/obj_${calls.first + 1}`]);
    const ad = await svc.getAd(db, s.workspaceId, adId);
    expect(ad).toMatchObject({ status: "failed", metaAdId: null });
    expect(ad.lastError).toContain("Ad text is too long");
    expect((await quotaState(db, s.workspaceId)).trialUsed).toBe(0);
  });

  it("stays in draft/export mode with an exact list of what's missing when Meta isn't connected", async () => {
    const s = await makeLiveStore(db);
    const ctx = { db, workspaceId: s.workspaceId, userId: s.userId, locale: "ms" as const };
    const adId = await svc.createDraft(ctx, s.productId, "http://x");
    const r = await svc.publishReadiness(db, s.workspaceId, await svc.getAd(db, s.workspaceId, adId));
    expect(r.ready).toBe(false);
    expect(r.checks.filter((c) => !c.ok && c.blocking).map((c) => c.id)).toEqual(expect.arrayContaining(["metaConnected", "adAccount", "page", "objective", "budget", "creative"]));
    await expect(svc.publishAd(ctx, adId, { confirmed: true })).rejects.toMatchObject({ code: "ads.notReady" });
    expect((await quotaState(db, s.workspaceId)).trialUsed).toBe(0);
    expect(svc.exportAd(await svc.getAd(db, s.workspaceId, adId), "Sambal")).toMatchObject({ product: "Sambal" });
  });

  it("the 4th new ad on the free plan is refused; duplicating a published ad uses a new slot; live ads are never paused by quota", async () => {
    const { s, ctx, adId } = await readyStore();
    const calls = metaMock();
    await svc.publishAd(ctx, adId, { confirmed: true });
    const d1 = await svc.duplicateAd(ctx, adId);
    await svc.publishAd(ctx, d1, { confirmed: true });
    const d2 = await svc.duplicateAd(ctx, adId);
    await svc.publishAd(ctx, d2, { confirmed: true });
    expect((await quotaState(db, s.workspaceId)).trialUsed).toBe(3);
    const d3 = await svc.duplicateAd(ctx, adId);
    await expect(svc.publishAd(ctx, d3, { confirmed: true })).rejects.toMatchObject({ code: "ads.trialUsed" });
    expect((await svc.getAd(db, s.workspaceId, d3)).status).toBe("draft");
    expect(calls.some((c) => c.body.get("status") === "PAUSED" && !/act_1/.test(c.path))).toBe(false);
    // Managing existing ads still works without slots.
    await svc.setAdPaused(ctx, adId, true);
    await svc.setAdPaused(ctx, adId, false);
    expect((await quotaState(db, s.workspaceId)).trialUsed).toBe(3);
  });

  it("budget changes need the exact confirmed amount and are audited", async () => {
    const { s, ctx, adId } = await readyStore();
    const calls = metaMock();
    await svc.publishAd(ctx, adId, { confirmed: true });
    await expect(svc.changeBudget(ctx, adId, 10000, 12500)).rejects.toMatchObject({ code: "ads.confirmRequired" });
    await svc.changeBudget(ctx, adId, 10000, 10000);
    const ad = await svc.getAd(db, s.workspaceId, adId);
    expect(ad).toMatchObject({ dailyBudgetSen: 10000, originalBudgetSen: 5000 });
    expect(calls.find((c) => c.path === `/${ad.metaAdSetId}` && c.body.get("daily_budget"))?.body.get("daily_budget")).toBe("10000");
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.workspaceId, s.workspaceId), eq(auditLogs.action, "ads.budget_changed")));
    expect(logs[0]!.data).toMatchObject({ fromSen: 5000, toSen: 10000 });
  });
});

describe("performance sync & attribution (real data only)", () => {
  it("stores Meta daily insights idempotently and feeds the decision engine", async () => {
    const { s, ctx, adId } = await readyStore();
    metaMock();
    await svc.publishAd(ctx, adId, { confirmed: true });
    await svc.syncWorkspaceAds(db, s.workspaceId);
    await svc.syncWorkspaceAds(db, s.workspaceId); // re-sync overwrites, never duplicates
    const rows = await db.select().from(adInsightsDaily).where(eq(adInsightsDaily.adId, adId));
    expect(rows).toHaveLength(2);
    const totals = (await svc.totalsByAd(db, s.workspaceId, { since: "2026-10-01", until: "2026-12-31" })).get(adId)!;
    expect(totals).toMatchObject({ spendSen: 7200, purchases: 6, revenueSen: 30000 });
    const ad = await svc.getAd(db, s.workspaceId, adId);
    await db.update(ads).set({ publishedAt: new Date(Date.now() - 4 * 86400_000) }).where(eq(ads.id, adId));
    const dec = await svc.adDecision(db, { ...ad, publishedAt: new Date(Date.now() - 4 * 86400_000) }, DEFAULT_PLAYBOOK, true);
    // Sambal RM19.90 → reference RM4.00 (midpoint of RM3.98–RM5.97 rounded down); CPP RM12 → too expensive.
    expect(dec).toMatchObject({ cppSen: 1200, purchases: 6, decision: "cut", reason: "tooExpensive" });
  });

  it("attributes confirmed store orders to an ad only when the ad belongs to the store", async () => {
    const { s, adId } = await readyStore();
    await db.update(products).set({ stock: 10 }).where(eq(products.id, s.productId));
    const buyer = { lines: [{ productId: s.productId, quantity: 1 }], customer: { name: "Ali Baba", email: "ali@example.com", marketingConsent: false }, address: null, deliveryMethod: "pickup" as const };
    await db.update(products).set({ attributes: { fulfillment: "both", shippingFlatSen: 800 } }).where(eq(products.id, s.productId));
    const r1 = await createCheckout(db, s.workspaceId, { ...buyer, idempotencyKey: newId("idem"), adRef: adId }, { base: "http://x", slug: s.slug });
    const other = await makeSeller(db);
    const foreign = await fakeAd(other.workspaceId);
    const r2 = await createCheckout(db, s.workspaceId, { ...buyer, idempotencyKey: newId("idem"), adRef: foreign }, { base: "http://x", slug: s.slug });
    const o1 = await db.query.orders.findFirst({ where: eq(orders.id, r1.orderId) });
    const o2 = await db.query.orders.findFirst({ where: eq(orders.id, r2.orderId) });
    expect(o1!.adRef).toBe(adId);
    expect(o2!.adRef).toBeNull();
  });
});
