import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, makeLiveStore, makeSeller } from "./helpers";
import type { DB } from "@/lib/db";
import { authAccounts, sessions, users } from "@/lib/db/schema";
import { __setOAuthFetchForTests, completeOAuth, openState, resolveOAuthUser, sealState, beginOAuth } from "@/lib/auth/oauth";
import { authenticate, createPasswordReset, createSession, registerUser, resetPassword, resolveSession } from "@/lib/auth/service";
import { businessStage, greetingKey, setupProgress, stateRecommendations, websiteBanner, LIVE_BANNER_MS } from "@/lib/dashboard/state";
import { getStorefront, publishStorefront, saveDraft, validateForPublish } from "@/lib/storefront/service";
import { createCheckout } from "@/lib/commerce/checkout";
import { disconnectPaymentProvider } from "@/lib/payments/integrations";
import { newId } from "@/lib/ids";
import { NAV, sectionFor, subActive } from "@/components/dashboard/nav";

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});
afterEach(() => __setOAuthFetchForTests(null));

describe("dashboard website banner", () => {
  const base = { status: "READY_FOR_REVIEW", viewedAt: null, publishedAt: null, hasLive: false, generation: "completed" as const };
  it("promotes a generated, unviewed draft and switches to 'ready to view' after opening", () => {
    expect(websiteBanner(base)?.kind).toBe("ready");
    expect(websiteBanner({ ...base, viewedAt: new Date() })?.kind).toBe("draft");
  });
  it("shows a short-lived live banner after publishing", () => {
    const now = new Date();
    expect(websiteBanner({ ...base, hasLive: true, status: "PUBLISHED", publishedAt: now }, now)?.kind).toBe("live");
    expect(websiteBanner({ ...base, hasLive: true, status: "PUBLISHED", publishedAt: new Date(now.getTime() - LIVE_BANNER_MS - 1) }, now)).toBeNull();
  });
  it("never says 'ready' when generation failed or is still running", () => {
    expect(websiteBanner({ ...base, status: "FAILED", generation: "failed" })?.kind).toBe("failed");
    expect(websiteBanner({ ...base, status: null, generation: "failed" })?.kind).toBe("failed");
    expect(websiteBanner({ ...base, status: "GENERATING", generation: "active" })?.kind).toBe("generating");
    expect(websiteBanner({ ...base, status: null, generation: "none" })?.kind).toBe("start");
  });
});

describe("dashboard setup, recommendations and personalization", () => {
  const fresh = { websiteDraft: false, websiteLive: false, creativeSaved: false, campaignLaunched: false, paymentConnected: false, paidOrders: 0 };
  it("derives setup items and only relevant recommendations", () => {
    expect(setupProgress(fresh).map((s) => s.done)).toEqual([false, false, false, false, false]);
    expect(stateRecommendations(fresh).map((r) => r.id)).toEqual(["createWebsite", "connectPayment", "firstCreative"]);
    const live = { ...fresh, websiteDraft: true, websiteLive: true, paymentConnected: true, creativeSaved: true };
    expect(stateRecommendations(live).map((r) => r.id)).toEqual(["shareLink", "firstCampaign"]);
    expect(stateRecommendations({ ...live, paidOrders: 3, campaignLaunched: true })).toEqual([]);
  });
  it("personalizes by stage and greets in local time", () => {
    expect([0, 1, 49, 50].map(businessStage)).toEqual(["new", "active", "active", "experienced"]);
    expect(greetingKey(new Date("2026-11-01T00:30:00Z"), "Asia/Kuala_Lumpur")).toBe("morning"); // 08:30 MYT
    expect(greetingKey(new Date("2026-11-01T07:00:00Z"), "Asia/Kuala_Lumpur")).toBe("afternoon"); // 15:00
    expect(greetingKey(new Date("2026-11-01T13:00:00Z"), "Asia/Kuala_Lumpur")).toBe("evening"); // 21:00
  });
  it("resolves the contextual sidebar from the route", () => {
    expect(sectionFor("/dashboard").key).toBe("dashboard");
    expect(sectionFor("/dashboard/storefront").key).toBe("website");
    expect(sectionFor("/dashboard/orders/ord_1").key).toBe("orders");
    const orders = NAV.find((s) => s.key === "orders")!;
    const active = (q: string) => orders.items.filter((i) => subActive(i, "/dashboard/orders", new URLSearchParams(q), orders.items)).map((i) => i.key);
    expect(active("")).toEqual(["allOrders"]);
    // V3 order navigation: lifecycle tabs (?tab=…) replaced the V2 payment-status filters.
    expect(active("tab=ready")).toEqual(["ordersReady"]);
    expect(active("tab=cod")).toEqual(["ordersCod"]);
  });
});

function fakeProvider(profile: Record<string, unknown>, tokenOk = true) {
  __setOAuthFetchForTests((async (url: string) => {
    if (String(url).includes("token")) return new Response(JSON.stringify(tokenOk ? { access_token: "at" } : { error: "invalid_grant" }), { status: tokenOk ? 200 : 400 });
    return new Response(JSON.stringify(profile), { status: 200 });
  }) as typeof fetch);
}

describe("OAuth (Google / Facebook)", () => {
  it("state cookie is signed, expiring and tamper-evident; PKCE challenge is sent", () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    const { url, cookie } = beginOAuth("google", "http://localhost/api/auth/google/callback", "/onboarding");
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
    const st = openState(cookie)!;
    expect(st.s).toBe(u.searchParams.get("state"));
    expect(openState(cookie.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).toBeNull();
    expect(openState(sealState({ ...st, exp: Date.now() - 1 }))).toBeNull();
    expect(url).not.toContain("secret");
  });

  it("creates a new verified user from a Google callback, then logs the same identity in without duplicates", async () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    fakeProvider({ sub: "g-123", email: "Aminah@Example.com", email_verified: true, name: "Aminah" });
    const p = await completeOAuth("google", "code", "verifier", "http://x/cb");
    expect(p).toEqual({ provider: "google", id: "g-123", email: "aminah@example.com", emailVerified: true, name: "Aminah" });
    const first = await resolveOAuthUser(db, p);
    expect(first.created).toBe(true);
    const u = await db.query.users.findFirst({ where: eq(users.id, first.userId) });
    expect(u).toMatchObject({ passwordHash: null });
    expect(u!.emailVerifiedAt).not.toBeNull();
    const again = await resolveOAuthUser(db, p);
    expect(again).toEqual({ userId: first.userId, created: false, linked: false });
    expect(await db.select().from(users).where(eq(users.email, "aminah@example.com"))).toHaveLength(1);
    // OAuth-only users can't be logged into with an empty/any password.
    await expect(authenticate(db, "aminah@example.com", "password123")).rejects.toMatchObject({ code: "auth.invalidCredentials" });
  });

  it("links to an existing account only when both emails are verified (prevents pre-registration hijack)", async () => {
    const victim = await registerUser(db, { name: "Victim", email: `v${Date.now()}@example.com`, password: "password123" });
    // Attacker pre-registered the victim's email (unverified) → Google sign-in must NOT merge into it.
    await expect(resolveOAuthUser(db, { provider: "google", id: `g-${victim.id}`, email: victim.email, emailVerified: true, name: "V" })).rejects.toMatchObject({ code: "oauth.accountExists" });
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, victim.id));
    // Facebook gives no verification flag → never auto-links.
    await expect(resolveOAuthUser(db, { provider: "facebook", id: `f-${victim.id}`, email: victim.email, emailVerified: false, name: "V" })).rejects.toMatchObject({ code: "oauth.accountExists" });
    const linked = await resolveOAuthUser(db, { provider: "google", id: `g-${victim.id}`, email: victim.email, emailVerified: true, name: "V" });
    expect(linked).toEqual({ userId: victim.id, created: false, linked: true });
    expect(await db.select().from(authAccounts).where(eq(authAccounts.userId, victim.id))).toHaveLength(1);
  });

  it("explicit linking while signed in, and refuses identities owned by someone else", async () => {
    const a = await makeSeller(db);
    const b = await makeSeller(db);
    const r = await resolveOAuthUser(db, { provider: "facebook", id: "fb-777", email: null, emailVerified: false, name: "A" }, a.userId);
    expect(r.linked).toBe(true);
    await expect(resolveOAuthUser(db, { provider: "facebook", id: "fb-777", email: null, emailVerified: false, name: "A" }, b.userId)).rejects.toMatchObject({ code: "oauth.linkedElsewhere" });
    await expect(resolveOAuthUser(db, { provider: "facebook", id: "fb-888", email: null, emailVerified: false, name: "X" })).rejects.toMatchObject({ code: "oauth.emailRequired" });
  });

  it("handles a failed code exchange", async () => {
    process.env.FACEBOOK_APP_ID = "app";
    process.env.FACEBOOK_APP_SECRET = "s";
    fakeProvider({}, false);
    await expect(completeOAuth("facebook", "bad", "v", "http://x/cb")).rejects.toMatchObject({ code: "oauth.exchangeFailed" });
  });
});

describe("password reset", () => {
  it("is single-use, expires, revokes sessions and never reveals whether an email exists", async () => {
    const u = await registerUser(db, { name: "Reset Me", email: `r${Date.now()}@example.com`, password: "password123" });
    const { token: sess } = await createSession(db, u.id);
    expect(await createPasswordReset(db, "nobody@example.com")).toBeNull();
    const r = (await createPasswordReset(db, u.email))!;
    await expect(resetPassword(db, r.token, "short")).rejects.toMatchObject({ code: "errors.validation" });
    await resetPassword(db, r.token, "newpassword456");
    await expect(resetPassword(db, r.token, "another12345")).rejects.toMatchObject({ code: "auth.resetInvalid" });
    expect(await resolveSession(db, sess)).toBeNull(); // signed out everywhere
    expect((await db.select().from(sessions).where(eq(sessions.userId, u.id))).length).toBe(0);
    await expect(authenticate(db, u.email, "password123")).rejects.toBeTruthy();
    expect((await authenticate(db, u.email, "newpassword456")).id).toBe(u.id);
  });
});

describe("enquiry-only publishing", () => {
  it("publishes without a payment gateway and refuses checkout server-side", async () => {
    const s = await makeLiveStore(db);
    await disconnectPaymentProvider(db, s, "test").catch(async () => {
      const { integrations } = await import("@/lib/db/schema");
      await db.delete(integrations).where(eq(integrations.workspaceId, s.workspaceId));
    });
    expect((await validateForPublish(db, s.workspaceId, s.userId)).map((i) => i.code)).toContain("publish.paymentNotConnected");
    const sf = (await getStorefront(db, s.workspaceId))!;
    await saveDraft(s.ctx, { content: { ...sf.draftContent, salesMode: "enquiry" }, theme: sf.draftTheme });
    expect((await validateForPublish(db, s.workspaceId, s.userId)).map((i) => i.code)).not.toContain("publish.paymentNotConnected");
    const pub = await publishStorefront(s.ctx);
    expect(pub.ok).toBe(true);
    await expect(
      createCheckout(db, s.workspaceId, { idempotencyKey: newId("idem"), lines: [{ productId: s.productId, quantity: 1 }], customer: { name: "Ali", email: "ali@example.com", marketingConsent: false }, address: null, deliveryMethod: "pickup" }, { base: "http://x", slug: s.slug }),
    ).rejects.toMatchObject({ code: "checkout.enquiryOnly" });
  });
});
