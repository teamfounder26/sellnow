import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, makeLiveStore, makeSeller } from "./helpers";
import type { DB } from "@/lib/db";
import { achievementNotifications, achievementUnlocks, aiGenerations, campaigns, creatives, customers, orders, products } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { orderLevel, orderThreshold, nextOrderMilestone, orderLevelName, tierFor } from "@/lib/achievements/definitions";
import { evaluateOrderAchievements, eligibleOrderCount, listUnlocks, markReward, pendingRewards, unlock } from "@/lib/achievements/service";
import { createCheckout, type CheckoutInput } from "@/lib/commerce/checkout";
import { applyPaymentEvent } from "@/lib/commerce/events";
import { refundOrder } from "@/lib/commerce/orders";
import { TestGateway } from "@/lib/payments/test-gateway";
import { recordCampaignLaunchConfirmed, setCreativeStatus } from "@/lib/marketing/service";

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});

describe("order level maths (deterministic, unlimited)", () => {
  it("maps counts to levels at 1, 10, 50, 100 and every +100 after", () => {
    const cases: [number, number][] = [
      [0, 0], [1, 1], [9, 1], [10, 2], [49, 2], [50, 3], [99, 3], [100, 4], [199, 4], [200, 5], [300, 6], [400, 7], [500, 8], [1100, 14], [100_000, 1003],
    ];
    for (const [n, l] of cases) expect(orderLevel(n), `count ${n}`).toBe(l);
  });
  it("threshold is the inverse of level", () => {
    for (let l = 1; l <= 60; l++) {
      expect(orderLevel(orderThreshold(l))).toBe(l);
      expect(orderLevel(orderThreshold(l) - 1)).toBe(l - 1);
    }
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(orderThreshold)).toEqual([1, 10, 50, 100, 200, 300, 400, 500]);
  });
  it("reports progress to the next milestone and names every level", () => {
    expect(nextOrderMilestone(50)).toMatchObject({ level: 3, nextLevel: 4, target: 100, remaining: 50 });
    expect(nextOrderMilestone(0)).toMatchObject({ target: 1, remaining: 1 });
    expect(orderLevelName(4).key).toBe("achievements.orderNames.centurySeller");
    expect(orderLevelName(9)).toEqual({ key: "achievements.orderNames.commerceLegend", params: { n: 600 } });
    expect(orderLevelName(13).key).toBe("achievements.orderNames.commerceLegend"); // series cycles, never runs out
    expect([1, 2, 4, 5, 7, 20].map((l) => tierFor("orders", l))).toEqual(["blue", "silver", "gold", "purple", "platinum", "diamond"]);
  });
});

describe("unlock persistence & idempotency", () => {
  it("unlocks once even under concurrent duplicate events", async () => {
    const s = await makeSeller(db);
    const results = await Promise.all(Array.from({ length: 6 }, () => unlock(db, s.workspaceId, "website_creator", 1, { type: "storefront", id: "sf_x" })));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(achievementUnlocks).where(eq(achievementUnlocks.workspaceId, s.workspaceId))).toHaveLength(1);
  });

  it("keeps the unlock when the modal is collected or dismissed; pending list reflects presentation only", async () => {
    const s = await makeSeller(db);
    await unlock(db, s.workspaceId, "website_creator", 1);
    await unlock(db, s.workspaceId, "creative_star", 1);
    const pending = await pendingRewards(db, s.workspaceId);
    expect(pending.map((p) => p.unlock.key)).toEqual(["website_creator", "creative_star"]);
    await markReward(db, s.workspaceId, pending[0]!.notification.id, "dismiss");
    await markReward(db, s.workspaceId, pending[1]!.notification.id, "collect");
    expect(await pendingRewards(db, s.workspaceId)).toHaveLength(0);
    expect(await listUnlocks(db, s.workspaceId)).toHaveLength(2); // still collected
    // Another tenant cannot touch these notifications.
    const other = await makeSeller(db);
    await markReward(db, other.workspaceId, pending[0]!.notification.id, "collect");
    const [n] = await db.select().from(achievementNotifications).where(eq(achievementNotifications.id, pending[0]!.notification.id));
    expect(n!.collectedAt).toBeNull();
  });
});

function buyer(productId: string): CheckoutInput {
  return {
    idempotencyKey: newId("idem"),
    lines: [{ productId, quantity: 1 }],
    customer: { name: "Pembeli", email: `b${Math.random()}@example.com`, phone: "0123456789", marketingConsent: false },
    address: { line1: "No 1, Jalan Mawar", postcode: "43000", city: "Kajang", state: "Selangor" },
    deliveryMethod: "shipping",
  };
}

async function liveOrder(s: Awaited<ReturnType<typeof makeLiveStore>>, live = true) {
  const r = await createCheckout(db, s.workspaceId, buyer(s.productId), { base: "http://x", slug: s.slug });
  // Simulates an order taken through a live gateway (the test gateway flags its own orders as test).
  if (live) await db.update(orders).set({ isTest: false }).where(eq(orders.id, r.orderId));
  return r.orderId;
}
async function pay(workspaceId: string, orderId: string) {
  const o = (await db.query.orders.findFirst({ where: eq(orders.id, orderId) }))!;
  const { body, signature } = TestGateway.signEvent(orderId, "paid", o.totalSen);
  const ev = TestGateway.verifyWebhook(body, signature);
  return { ev, result: await applyPaymentEvent(db, workspaceId, ev) };
}

describe("first paid order → First Sale sticker", () => {
  it("awards on a verified paid order, ignores test orders, and survives duplicate webhooks", async () => {
    const s = await makeLiveStore(db);
    await db.update(products).set({ stock: 50 }).where(eq(products.id, s.productId));

    const testOrder = await liveOrder(s, false);
    await pay(s.workspaceId, testOrder);
    expect(await listUnlocks(db, s.workspaceId)).toHaveLength(0); // test/sandbox never counts

    const real = await liveOrder(s);
    const { ev } = await pay(s.workspaceId, real);
    const dup = await applyPaymentEvent(db, s.workspaceId, ev); // provider retries the same webhook
    expect(dup.status).toBe("duplicate");
    const u = await listUnlocks(db, s.workspaceId);
    expect(u.map((x) => [x.key, x.level])).toEqual([["orders", 1]]);
    expect(u[0]!.sourceId).toBe(real);
  });

  it("is not unlocked by an unpaid (pending) order", async () => {
    const s = await makeLiveStore(db);
    await liveOrder(s);
    expect(await eligibleOrderCount(db, s.workspaceId)).toBe(0);
    expect((await evaluateOrderAchievements(db, s.workspaceId)).created).toHaveLength(0);
  });
});

async function seedPaid(workspaceId: string, n: number, extra: Partial<typeof orders.$inferInsert> = {}) {
  const cid = newId("cus");
  await db.insert(customers).values({ id: cid, workspaceId, name: "C", email: `${cid}@x.com` });
  const [{ max } = { max: 0 }] = (await db.execute(`select coalesce(max(number),0)::int as max from orders where workspace_id='${workspaceId}'`)).rows as { max: number }[];
  const rows = Array.from({ length: n }, (_, i) => ({
    id: newId("ord"),
    workspaceId,
    number: Number(max) + i + 1,
    customerId: cid,
    paymentStatus: "PAID" as const,
    subtotalSen: 1000,
    totalSen: 1000,
    provider: "stripe",
    idempotencyKey: newId("idem"),
    paidAt: new Date(),
    ...extra,
  }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(orders).values(rows.slice(i, i + 500));
  return rows.map((r) => r.id);
}

describe("order milestone track", () => {
  it("awards 10 / 50 / 100 / 200 / 300 and catches up skipped levels", async () => {
    const s = await makeSeller(db);
    await seedPaid(s.workspaceId, 9);
    expect((await evaluateOrderAchievements(db, s.workspaceId)).level).toBe(1);
    await seedPaid(s.workspaceId, 3); // 12: crosses 10
    expect((await evaluateOrderAchievements(db, s.workspaceId)).created.map((c) => c.level)).toEqual([2]);
    await seedPaid(s.workspaceId, 300 - 12); // jump straight to 300
    const r = await evaluateOrderAchievements(db, s.workspaceId);
    expect(r.count).toBe(300);
    expect(r.created.map((c) => c.level)).toEqual([3, 4, 5, 6]); // 50, 100, 200, 300 — none skipped
    expect((await evaluateOrderAchievements(db, s.workspaceId)).created).toHaveLength(0); // re-evaluation is a no-op
  });

  it("handles large order counts without a cap", async () => {
    const s = await makeSeller(db);
    await seedPaid(s.workspaceId, 1250);
    const r = await evaluateOrderAchievements(db, s.workspaceId);
    expect(r.level).toBe(15); // 1250 → 4 + floor(1150/100)
    expect(Math.max(...(await listUnlocks(db, s.workspaceId)).map((u) => u.level))).toBe(15);
  });

  it("concurrent payment processing never double-awards", async () => {
    const s = await makeSeller(db);
    await seedPaid(s.workspaceId, 10);
    await Promise.all(Array.from({ length: 8 }, () => evaluateOrderAchievements(db, s.workspaceId)));
    const u = await db.select().from(achievementUnlocks).where(and(eq(achievementUnlocks.workspaceId, s.workspaceId), eq(achievementUnlocks.key, "orders")));
    expect(u.map((x) => x.level).sort()).toEqual([1, 2]);
  });

  it("refund policy: fully refunded/cancelled/test orders don't count, but earned stickers are kept", async () => {
    const s = await makeLiveStore(db);
    await db.update(products).set({ stock: 50 }).where(eq(products.id, s.productId));
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = await liveOrder(s);
      await pay(s.workspaceId, id);
      ids.push(id);
    }
    expect((await listUnlocks(db, s.workspaceId)).map((u) => u.level)).toEqual([1, 2]);
    const o = (await db.query.orders.findFirst({ where: eq(orders.id, ids[0]!) }))!;
    await refundOrder(db, { workspaceId: s.workspaceId, userId: s.userId }, ids[0]!, o.totalSen);
    await seedPaid(s.workspaceId, 5, { isTest: true });
    await seedPaid(s.workspaceId, 5, { paymentStatus: "CANCELLED" });
    expect(await eligibleOrderCount(db, s.workspaceId)).toBe(9);
    expect((await listUnlocks(db, s.workspaceId)).map((u) => u.level)).toEqual([1, 2]); // not revoked
    // A partial refund still counts as a sale.
    const p = (await db.query.orders.findFirst({ where: eq(orders.id, ids[1]!) }))!;
    await refundOrder(db, { workspaceId: s.workspaceId, userId: s.userId }, ids[1]!, Math.floor(p.totalSen / 2));
    expect(await eligibleOrderCount(db, s.workspaceId)).toBe(9);
  });
});

describe("setup stickers", () => {
  it("Creative Star needs an approved creative from a successful generation", async () => {
    const s = await makeSeller(db);
    const manual = newId("cre");
    await db.insert(creatives).values({ id: manual, workspaceId: s.workspaceId, type: "ad_copy", objective: "offer", content: { text: "x" } });
    await setCreativeStatus(db, s, manual, "approved");
    expect(await listUnlocks(db, s.workspaceId)).toHaveLength(0); // no generation → no sticker

    const gen = newId("gen");
    await db.insert(aiGenerations).values({ id: gen, workspaceId: s.workspaceId, task: "creative.text", status: "succeeded", provider: "fake", model: "m", input: {}, credits: 2 });
    const good = newId("cre");
    await db.insert(creatives).values({ id: good, workspaceId: s.workspaceId, type: "ad_copy", objective: "offer", content: { variants: [] }, generationId: gen });
    await setCreativeStatus(db, s, good, "draft");
    expect(await listUnlocks(db, s.workspaceId)).toHaveLength(0); // saved draft is not enough
    await setCreativeStatus(db, s, good, "approved");
    await setCreativeStatus(db, s, good, "approved");
    expect((await listUnlocks(db, s.workspaceId)).map((u) => u.key)).toEqual(["creative_star"]);
  });

  it("Marketing Starter only on provider-confirmed launch; drafts/approvals don't qualify", async () => {
    const s = await makeSeller(db);
    const id = newId("cmp");
    await db.insert(campaigns).values({ id, workspaceId: s.workspaceId, name: "Raya", objective: "sales", dailyBudgetSen: 2000, durationDays: 7, status: "approved" });
    await expect(recordCampaignLaunchConfirmed(db, s.workspaceId, id, "ext_1")).rejects.toMatchObject({ code: "marketing.notPublishing" });
    expect(await listUnlocks(db, s.workspaceId)).toHaveLength(0);
    await db.update(campaigns).set({ status: "publishing" }).where(eq(campaigns.id, id));
    await expect(recordCampaignLaunchConfirmed(db, s.workspaceId, id, "")).rejects.toMatchObject({ code: "errors.validation" });
    await recordCampaignLaunchConfirmed(db, s.workspaceId, id, "ext_1");
    expect((await listUnlocks(db, s.workspaceId)).map((u) => u.key)).toEqual(["marketing_starter"]);
  });
});
