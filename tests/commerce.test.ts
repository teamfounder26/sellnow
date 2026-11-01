import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, makeLiveStore, sambal } from "./helpers";
import type { DB } from "@/lib/db";
import { orders, products, discountCodes, assets, productVariants } from "@/lib/db/schema";
import { publishStorefront } from "@/lib/storefront/service";
import { createCheckout, releaseExpiredReservations, type CheckoutInput } from "@/lib/commerce/checkout";
import { computeQuote } from "@/lib/commerce/quote";
import { applyPaymentEvent, entitlementToken } from "@/lib/commerce/events";
import { TestGateway } from "@/lib/payments/test-gateway";
import { BillplzGateway } from "@/lib/payments/billplz";
import { consumeDownload } from "@/lib/commerce/downloads";
import { refundOrder } from "@/lib/commerce/orders";
import { getKpis, rangeFromDays } from "@/lib/analytics/kpis";
import { getMilestones } from "@/lib/analytics/milestones";
import { canTransitionPayment } from "@/lib/commerce/payment-state";
import { newId } from "@/lib/ids";
import { createProduct } from "@/lib/products/service";
import { saveDraft, getStorefront } from "@/lib/storefront/service";

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});

const urls = { base: "http://localhost:3000", slug: "x" };
function buyer(productId: string, extra: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    idempotencyKey: newId("idem"),
    lines: [{ productId, quantity: 1 }],
    customer: { name: "Pembeli Satu", email: "buyer@example.com", phone: "0123456789", marketingConsent: false },
    address: { line1: "No 1, Jalan Mawar", postcode: "43000", city: "Kajang", state: "Selangor" },
    deliveryMethod: "shipping",
    ...extra,
  };
}

async function pay(workspaceId: string, orderId: string, outcome: "paid" | "failed" = "paid", amount?: number) {
  const o = (await db.query.orders.findFirst({ where: eq(orders.id, orderId) }))!;
  const { body, signature } = TestGateway.signEvent(orderId, outcome, amount ?? o.totalSen);
  return { ev: TestGateway.verifyWebhook(body, signature), result: await applyPaymentEvent(db, workspaceId, TestGateway.verifyWebhook(body, signature)) };
}

describe("payment state machine", () => {
  it("enforces valid transitions", () => {
    expect(canTransitionPayment("PENDING", "PAID")).toBe(true);
    expect(canTransitionPayment("PAID", "PENDING")).toBe(false);
    expect(canTransitionPayment("REFUNDED", "PAID")).toBe(false);
    expect(canTransitionPayment("CANCELLED", "PAID")).toBe(false);
  });
});

describe("checkout integrity", () => {
  it("computes totals on the server, applying coupons and shipping", async () => {
    const s = await makeLiveStore(db);
    await db.insert(discountCodes).values({ id: newId("dc"), workspaceId: s.workspaceId, code: "RAYA10", kind: "percent", value: 10 });
    const q = await computeQuote(db, s.workspaceId, { lines: [{ productId: s.productId, quantity: 3 }], couponCode: "raya10", deliveryMethod: "shipping" });
    expect(q.subtotalSen).toBe(5970);
    expect(q.discountSen).toBe(597);
    expect(q.shippingSen).toBe(800);
    expect(q.totalSen).toBe(5970 - 597 + 800);
    await expect(computeQuote(db, s.workspaceId, { lines: [{ productId: s.productId, quantity: 1 }], couponCode: "NOPE" })).rejects.toMatchObject({ code: "checkout.badCoupon" });
    await expect(computeQuote(db, s.workspaceId, { lines: [{ productId: s.productId, quantity: 0 }] })).rejects.toMatchObject({ code: "checkout.badQuantity" });
  });

  it("ignores any client-supplied price fields", async () => {
    const s = await makeLiveStore(db);
    const input = buyer(s.productId) as CheckoutInput & { totalSen?: number };
    (input.lines[0] as Record<string, unknown>).unitPriceSen = 1;
    input.totalSen = 1;
    const r = await createCheckout(db, s.workspaceId, input, urls);
    const o = await db.query.orders.findFirst({ where: eq(orders.id, r.orderId) });
    expect(o?.totalSen).toBe(1990 + 800);
  });

  it("treats duplicate submissions idempotently", async () => {
    const s = await makeLiveStore(db);
    const input = buyer(s.productId);
    const a = await createCheckout(db, s.workspaceId, input, urls);
    const b = await createCheckout(db, s.workspaceId, input, urls);
    expect(b.duplicate).toBe(true);
    expect(b.orderId).toBe(a.orderId);
    const all = await db.query.orders.findMany({ where: eq(orders.workspaceId, s.workspaceId) });
    expect(all).toHaveLength(1);
  });

  it("prevents overselling under concurrent checkouts", async () => {
    const s = await makeLiveStore(db, { ...sambal, stock: "1" });
    const results = await Promise.allSettled([createCheckout(db, s.workspaceId, buyer(s.productId), urls), createCheckout(db, s.workspaceId, buyer(s.productId), urls)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "checkout.outOfStock" });
    const p = await db.query.products.findFirst({ where: eq(products.id, s.productId) });
    expect(p?.stock).toBe(0);
  });

  it("enforces variant stock and requires a variant choice", async () => {
    const s = await makeLiveStore(db);
    const pid = await createProduct(s.ctx, { ...sambal, name: "Baju Kurung", variants: [{ name: "S", price: "89.00", stock: "1" }, { name: "M", price: "95.00", stock: "0" }] });
    await db.update(products).set({ status: "active" }).where(eq(products.id, pid));
    const vars = await db.query.productVariants.findMany({ where: eq(productVariants.productId, pid) });
    await expect(computeQuote(db, s.workspaceId, { lines: [{ productId: pid, quantity: 1 }] })).rejects.toMatchObject({ code: "checkout.variantRequired" });
    const m = vars.find((v) => v.name === "M")!;
    await expect(createCheckout(db, s.workspaceId, buyer(pid, { lines: [{ productId: pid, variantId: m.id, quantity: 1 }] }), urls)).rejects.toMatchObject({ code: "checkout.outOfStock" });
    const sv = vars.find((v) => v.name === "S")!;
    const r = await createCheckout(db, s.workspaceId, buyer(pid, { lines: [{ productId: pid, variantId: sv.id, quantity: 1 }] }), urls);
    const o = await db.query.orders.findFirst({ where: eq(orders.id, r.orderId) });
    expect(o?.subtotalSen).toBe(8900);
  });

  it("requires an address for shipped goods", async () => {
    const s = await makeLiveStore(db);
    await expect(createCheckout(db, s.workspaceId, buyer(s.productId, { address: null }), urls)).rejects.toMatchObject({ code: "checkout.addressRequired" });
  });

  it("blocks checkout for categories without a supported flow", async () => {
    const s = await makeLiveStore(db);
    const pid = await createProduct(s.ctx, { type: "event", name: "Bengkel Batik", price: "120.00", status: "active" });
    await expect(computeQuote(db, s.workspaceId, { lines: [{ productId: pid, quantity: 1 }] })).rejects.toMatchObject({ code: "checkout.categoryNotPurchasable" });
  });
});

describe("payment verification", () => {
  it("applies a verified event exactly once (webhook idempotency)", async () => {
    const s = await makeLiveStore(db);
    const r = await createCheckout(db, s.workspaceId, buyer(s.productId), urls);
    const o = (await db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
    const { body, signature } = TestGateway.signEvent(o.id, "paid", o.totalSen);
    const ev = TestGateway.verifyWebhook(body, signature);
    expect((await applyPaymentEvent(db, s.workspaceId, ev)).status).toBe("applied");
    expect((await applyPaymentEvent(db, s.workspaceId, ev)).status).toBe("duplicate");
    const paid = await db.query.orders.findFirst({ where: eq(orders.id, o.id) });
    expect(paid?.paymentStatus).toBe("PAID");
    expect(paid?.stockReserved).toBe(false);
  });

  it("rejects forged signatures and mismatched amounts", async () => {
    const s = await makeLiveStore(db);
    const r = await createCheckout(db, s.workspaceId, buyer(s.productId), urls);
    const { body } = TestGateway.signEvent(r.orderId, "paid", 1);
    expect(() => TestGateway.verifyWebhook(body, "00".repeat(32))).toThrow();
    const { result } = await pay(s.workspaceId, r.orderId, "paid", 1);
    expect(result).toMatchObject({ status: "rejected", reason: "amount_mismatch" });
    expect((await db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))?.paymentStatus).toBe("PENDING");
  });

  it("releases reserved stock when payment fails or reservation expires", async () => {
    const s = await makeLiveStore(db, { ...sambal, stock: "2" });
    const a = await createCheckout(db, s.workspaceId, buyer(s.productId), urls);
    await pay(s.workspaceId, a.orderId, "failed");
    expect((await db.query.products.findFirst({ where: eq(products.id, s.productId) }))?.stock).toBe(2);
    const b = await createCheckout(db, s.workspaceId, buyer(s.productId), urls);
    await db.update(orders).set({ createdAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(orders.id, b.orderId));
    expect(await releaseExpiredReservations(db, s.workspaceId)).toBe(1);
    expect((await db.query.orders.findFirst({ where: eq(orders.id, b.orderId) }))?.paymentStatus).toBe("CANCELLED");
    expect((await db.query.products.findFirst({ where: eq(products.id, s.productId) }))?.stock).toBe(2);
  });

  it("verifies Billplz X-Signature", () => {
    const secrets = { apiKey: "k", collectionId: "c", xSignatureKey: "S3cret" };
    const params: Record<string, string> = { id: "bill1", paid: "true", state: "paid", amount: "2790", paid_amount: "2790", paid_at: "2026-11-01 10:00:00 +0800", collection_id: "c" };
    params.x_signature = BillplzGateway.signature(params, secrets.xSignatureKey);
    const ev = BillplzGateway.verifyCallback(params, secrets);
    expect(ev).toMatchObject({ outcome: "paid", amountSen: 2790, providerRef: "bill1" });
    expect(() => BillplzGateway.verifyCallback({ ...params, paid_amount: "1" }, secrets)).toThrow();
  });
});

describe("digital delivery", () => {
  it("blocks downloads until payment is verified, then grants limited access; refunds revoke", async () => {
    const s = await makeLiveStore(db, { type: "digital", name: "Ebook Resipi", price: "15.00", status: "draft" });
    const assetId = newId("ast");
    await db.insert(assets).values({ id: assetId, workspaceId: s.workspaceId, kind: "digital_file", storageKey: `private/${s.workspaceId}/${assetId}`, mime: "application/pdf", size: 10, originalName: "resipi.pdf", visibility: "private" });
    await db.update(products).set({ status: "active", attributes: { digitalAssetId: assetId, downloadLimit: 2, downloadExpiryDays: 7 } }).where(eq(products.id, s.productId));
    const r = await createCheckout(db, s.workspaceId, buyer(s.productId, { address: null, deliveryMethod: null }), urls);
    // No entitlement exists before payment; a guessed token is rejected.
    expect(await consumeDownload(db, entitlementToken("ent_guess"))).toMatchObject({ ok: false, reason: "invalid" });
    await pay(s.workspaceId, r.orderId);
    const order = await db.query.orders.findFirst({ where: eq(orders.id, r.orderId), with: undefined });
    expect(order?.fulfillmentStatus).toBe("DELIVERED_DIGITAL");
    const ent = (await db.query.downloadEntitlements.findMany()).find((e) => e.orderId === r.orderId)!;
    const token = entitlementToken(ent.id);
    expect((await consumeDownload(db, token)).ok).toBe(true);
    expect((await consumeDownload(db, token)).ok).toBe(true);
    expect(await consumeDownload(db, token)).toMatchObject({ ok: false, reason: "limit" });
    await refundOrder(db, s, r.orderId, order!.totalSen);
    expect(await consumeDownload(db, token)).toMatchObject({ ok: false, reason: "revoked" });
  });
});

describe("analytics & milestones", () => {
  it("revenue reconciles with paid orders, nets refunds and excludes test orders", async () => {
    const s = await makeLiveStore(db, { ...sambal, stock: "20" });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await createCheckout(db, s.workspaceId, buyer(s.productId, { customer: { name: `B${i}`, email: `b${i}@ex.com`, marketingConsent: false } }), urls);
      ids.push(r.orderId);
    }
    // First order stays a test order; the others are treated as live orders.
    await db.update(orders).set({ isTest: false }).where(eq(orders.id, ids[1]!));
    await db.update(orders).set({ isTest: false }).where(eq(orders.id, ids[2]!));
    for (const id of ids) await pay(s.workspaceId, id);
    let m = await getMilestones(db, s.workspaceId);
    expect(m.find((x) => x.id === "first_sale")?.done).toBe(true);
    await refundOrder(db, s, ids[2]!, 500);
    const k = await getKpis(db, s.workspaceId, rangeFromDays(30, new Date(Date.now() + 1000)));
    const each = 1990 + 800;
    expect(k.paidOrders).toBe(2);
    expect(k.revenue).toBe(each * 2 - 500);
    expect(k.refundedSen).toBe(500);
    expect(k.testOrders.count).toBe(1);
    expect(k.customers).toBe(2);
    expect(k.adSpend).toBeNull();
    m = await getMilestones(db, s.workspaceId);
    expect(m.find((x) => x.id === "first_campaign")?.done).toBe(false);
  });

  it("does not unlock First Sale from test-mode orders", async () => {
    const s = await makeLiveStore(db);
    const r = await createCheckout(db, s.workspaceId, buyer(s.productId), urls);
    await pay(s.workspaceId, r.orderId);
    const m = await getMilestones(db, s.workspaceId);
    expect(m.find((x) => x.id === "first_sale")?.done).toBe(false);
  });
});

describe("storefront publishing", () => {
  it("validates, versions, and keeps the live page independent of draft edits", async () => {
    const s = await makeLiveStore(db);
    const res = await publishStorefront(s.ctx);
    expect(res.ok).toBe(true);
    const sf = (await getStorefront(db, s.workspaceId))!;
    const liveId = sf.publishedVersionId;
    const edited = structuredClone(sf.draftContent);
    edited.sections[0]!.props.headline = "Tajuk Baharu";
    await saveDraft(s.ctx, { content: edited, theme: sf.draftTheme });
    const after = (await getStorefront(db, s.workspaceId))!;
    expect(after.publishedVersionId).toBe(liveId);
    const { getPublicStorefront } = await import("@/lib/storefront/service");
    const pub = await getPublicStorefront(db, sf.slug);
    expect(pub?.version.content.sections[0]?.props.headline).not.toBe("Tajuk Baharu");
  });

  it("reports precise missing requirements", async () => {
    const s = await makeLiveStore(db);
    const sf = (await getStorefront(db, s.workspaceId))!;
    await saveDraft(s.ctx, { content: { ...sf.draftContent, policies: { contactEmail: "" } }, theme: sf.draftTheme });
    const res = await publishStorefront(s.ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["publish.contactEmail", "publish.refundPolicy", "publish.shippingPolicy"]));
  });
});
