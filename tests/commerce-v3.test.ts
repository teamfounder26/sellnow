import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { makeDb, makeLiveStore } from "./helpers";
import type { DB } from "@/lib/db";
import { codRemittances, orders, products, shipments } from "@/lib/db/schema";
import { createCheckout, type CheckoutInput } from "@/lib/commerce/checkout";
import { computeQuote } from "@/lib/commerce/quote";
import { newId } from "@/lib/ids";
import { pickRule, rangesOverlap, saveRule, saveZone, importRules } from "@/lib/shipping/rules";
import { addressConsistent, regionForPostcode } from "@/lib/shipping/zones";
import { saveOrderSettings, DEFAULT_ORDER_SETTINGS } from "@/lib/orders/settings";
import { searchOrders, sellerCancelOrder, verifyManualTransfer, submitTransferProof, ordersCsv } from "@/lib/orders/service";
import { __setParcelDailyFetchForTests, mapStatusGroup, pdPhone, verifyParcelDailyWebhook } from "@/lib/couriers/parceldaily";
import * as cs from "@/lib/couriers/service";

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});
afterEach(() => {
  __setParcelDailyFetchForTests(null);
  delete process.env.PARCELDAILY_TOKEN;
  delete process.env.PARCELDAILY_MERCHANT_ID;
  delete process.env.PARCELDAILY_WEBHOOK_SECRET;
});

const urls = { base: "http://localhost:3100", slug: "x" };
const buyer = (productId: string, extra: Partial<CheckoutInput> = {}): CheckoutInput => ({
  idempotencyKey: newId("idem"),
  lines: [{ productId, quantity: 1 }],
  customer: { name: "Pembeli Satu", email: "buyer@example.com", phone: "0123456789", marketingConsent: false },
  address: { line1: "No 1, Jalan Mawar", postcode: "43000", city: "Kajang", state: "Selangor" },
  deliveryMethod: "shipping",
  ...extra,
});
const R = (o: Partial<Parameters<typeof saveRule>[2] & object>) => ({ name: "r", zone: "peninsular", deliveryType: "normal", minGrams: 0, maxGrams: 500, feeSen: 600, priority: 100, ...o });

async function storeWithRules() {
  const s = await makeLiveStore(db);
  await db.update(products).set({ weightG: 400 }).where(eq(products.id, s.productId));
  await saveRule(db, s, R({ name: "Semenanjung ≤500g", minGrams: 0, maxGrams: 500, feeSen: 600 }));
  await saveRule(db, s, R({ name: "Semenanjung 501–1000g", minGrams: 501, maxGrams: 1000, feeSen: 900 }));
  await saveRule(db, s, R({ name: "Sabah COD 1–2kg", zone: "sabah", deliveryType: "cod", minGrams: 1001, maxGrams: 2000, feeSen: 2000 }));
  await saveRule(db, s, R({ name: "Sabah ≤1kg", zone: "sabah", minGrams: 0, maxGrams: 1000, feeSen: 1200 }));
  return s;
}

describe("Malaysian zones", () => {
  it("postcode decides the region; state must agree", () => {
    expect(regionForPostcode("43000")).toBe("peninsular");
    expect(regionForPostcode("88300")).toBe("sabah");
    expect(regionForPostcode("93050")).toBe("sarawak");
    expect(regionForPostcode("87000")).toBe("labuan");
    expect(addressConsistent("88300", "Sabah")).toBe(true);
    expect(addressConsistent("88300", "Selangor")).toBe(false);
  });
});

describe("postage rule engine", () => {
  it("boundaries are inclusive and deterministic; no match is never RM0", async () => {
    expect(rangesOverlap({ minGrams: 0, maxGrams: 500 }, { minGrams: 501, maxGrams: 1000 })).toBe(false);
    expect(rangesOverlap({ minGrams: 0, maxGrams: 500 }, { minGrams: 500, maxGrams: 1000 })).toBe(true);
    const s = await storeWithRules();
    const q = (weight: number, postcode: string, state: string, method: "online" | "cod" = "online", qty = 1) =>
      db.update(products).set({ weightG: weight }).where(eq(products.id, s.productId)).then(() => computeQuote(db, s.workspaceId, { lines: [{ productId: s.productId, quantity: qty }], deliveryMethod: "shipping", destination: { postcode, state }, paymentMethod: method }));
    expect((await q(500, "43000", "Selangor")).shippingSen).toBe(600); // boundary 500g
    expect((await q(501, "43000", "Selangor")).shippingSen).toBe(900);
    expect((await q(1000, "88300", "Sabah")).shippingSen).toBe(1200);
    expect((await q(1500, "88300", "Sabah", "cod")).shippingSen).toBe(2000);
    await expect(q(1500, "93050", "Sarawak")).rejects.toMatchObject({ code: "shipping.unavailable" });
    await expect(q(400, "88300", "Selangor")).rejects.toMatchObject({ code: "shipping.addressMismatch" });
    const multi = await q(300, "43000", "Selangor", "online", 2); // 600g total
    expect(multi).toMatchObject({ shippingSen: 900, weightGrams: 600 });
    expect(multi.shippingRule?.name).toBe("Semenanjung 501–1000g");
    // No address yet: fee pending, not zero-and-final.
    expect((await computeQuote(db, s.workspaceId, { lines: [{ productId: s.productId, quantity: 1 }], deliveryMethod: "shipping" })).shippingPending).toBe(true);
  });

  it("refuses ambiguous overlaps; priority and custom zones resolve deterministically", async () => {
    const s = await storeWithRules();
    await expect(saveRule(db, s, R({ name: "dup", minGrams: 400, maxGrams: 700 }))).rejects.toMatchObject({ code: "shipping.overlap" });
    const zid = await saveZone(db, s, { name: "Klang Valley", states: [], postcodeRanges: [{ from: "40000", to: "48300" }] });
    await saveRule(db, s, R({ name: "KV promo", zone: `zone:${zid}`, minGrams: 0, maxGrams: 1000, feeSen: 500 }));
    const rules = await db.query.shippingRateRules.findMany({ where: eq((await import("@/lib/db/schema")).shippingRateRules.workspaceId, s.workspaceId) });
    expect(pickRule(rules, [{ id: zid, workspaceId: s.workspaceId, name: "KV", states: [], postcodeRanges: [{ from: "40000", to: "48300" }], createdAt: new Date() }], { postcode: "43000", state: "Selangor", region: "peninsular" }, 300, "normal")?.rule.name).toBe("KV promo");
    expect(await importRules(db, s, "name,zone,type,min_g,max_g,fee_rm\nSarawak 1kg,sarawak,normal,0,1000,12.50")).toBe(1);
    await expect(importRules(db, s, "Bad,mars,normal,0,1,1")).rejects.toMatchObject({ code: "shipping.importRow" });
  });
});

describe("COD and manual bank transfer", () => {
  it("COD is offered only when configured for the region; manual transfer waits for the seller", async () => {
    const s = await storeWithRules();
    await expect(createCheckout(db, s.workspaceId, buyer(s.productId, { paymentMethod: "cod" }), urls)).rejects.toMatchObject({ code: "checkout.methodUnavailable" });
    await expect(saveOrderSettings(db, s, { ...DEFAULT_ORDER_SETTINGS, codEnabled: true })).rejects.toMatchObject({ code: "orders.codNeedsCourier" });
    await saveRule(db, s, R({ name: "Pen COD", deliveryType: "cod", minGrams: 0, maxGrams: 1000, feeSen: 800 }));
    await saveOrderSettings(db, s, {
      ...DEFAULT_ORDER_SETTINGS,
      codEnabled: true,
      cod: { ...DEFAULT_ORDER_SETTINGS.cod, feeSen: 200, courierConfirmed: true, regions: ["peninsular"] },
      manualEnabled: true,
      manual: { ...DEFAULT_ORDER_SETTINGS.manual, bankName: "Maybank", accountName: "Mak Teh", accountNumber: "512345678901" },
    });
    const cod = await createCheckout(db, s.workspaceId, buyer(s.productId, { paymentMethod: "cod" }), urls);
    const o = (await db.query.orders.findFirst({ where: eq(orders.id, cod.orderId) }))!;
    expect(o).toMatchObject({ paymentMethod: "cod", paymentStatus: "PENDING", orderStatus: "CONFIRMED", codStatus: "AWAITING_DELIVERY", fulfillmentStatus: "READY_TO_SHIP", shippingSen: 800, codFeeSen: 200, totalSen: 1990 + 800 + 200, stockReserved: false });
    await expect(createCheckout(db, s.workspaceId, buyer(s.productId, { paymentMethod: "cod", address: { line1: "Lot 2", postcode: "88300", city: "KK", state: "Sabah" } }), urls)).rejects.toMatchObject({ code: "checkout.codNotAvailable" });

    const man = await createCheckout(db, s.workspaceId, buyer(s.productId, { paymentMethod: "manual_transfer" }), urls);
    const m = (await db.query.orders.findFirst({ where: eq(orders.id, man.orderId) }))!;
    expect(m).toMatchObject({ paymentStatus: "PENDING", orderStatus: "NEW", provider: "manual_transfer" });
    await submitTransferProof(db, m.id, { payerReference: "IBG 123" });
    expect((await db.query.orders.findFirst({ where: eq(orders.id, m.id) }))!.paymentStatus).toBe("PENDING"); // proof ≠ paid
    await verifyManualTransfer(db, s, m.id, true, "Seen in Maybank statement");
    expect((await db.query.orders.findFirst({ where: eq(orders.id, m.id) }))).toMatchObject({ paymentStatus: "PAID", orderStatus: "CONFIRMED", fulfillmentStatus: "READY_TO_SHIP", settlementStatus: "NOT_ELIGIBLE" });

    const stock = (await db.query.products.findFirst({ where: eq(products.id, s.productId) }))!.stock;
    await sellerCancelOrder(db, s, cod.orderId, "buyer changed mind");
    expect((await db.query.products.findFirst({ where: eq(products.id, s.productId) }))!.stock).toBe(stock + 1);

    const codTab = await searchOrders(db, s.workspaceId, { tab: "cod" });
    expect(codTab.map((r) => r.order.id)).toContain(cod.orderId);
    expect(ordersCsv(codTab)).toContain("cod");
    expect(ordersCsv([{ ...codTab[0]!, customer: { ...codTab[0]!.customer, name: "=HYPERLINK(1)" } }])).toContain("'=HYPERLINK");
  });
});

describe("ParcelDaily courier flow (mocked HTTP)", () => {
  function pdServer(opts: { credit?: number; failPay?: boolean; network?: boolean } = {}) {
    const calls: { path: string; body: unknown }[] = [];
    __setParcelDailyFetchForTests(async (u, init) => {
      const path = new URL(String(u)).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ path, body });
      if (opts.network && path.endsWith("/order/pay")) throw new Error("ECONNRESET");
      if (path.endsWith("/account-info")) return Response.json({ data: { credit: opts.credit ?? 500.5 } });
      if (path.endsWith("/merchant/quote")) return Response.json({ success: { jntPrice: "8.00", jntCod: "", poslajuPrice: "10.00", dhlPrice: "", ninjavanPrice: "9.00" } });
      if (path.endsWith("/order/create")) return Response.json({ success: { objectId: `pd_${calls.length}` } });
      if (path.endsWith("/order/pay")) return opts.failPay ? Response.json({ data: { statusCode: 400, orderId: body.orderId } }, { status: 400 }) : Response.json({ data: { statusCode: 200, orderId: body.orderId, connote: `JNT${calls.length}` } });
      if (path.endsWith("/consign-pdf/")) return new Response(Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 288 432]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"), { status: 200 });
      return new Response("not found", { status: 404 });
    });
    return calls;
  }
  async function readyStore() {
    process.env.PARCELDAILY_TOKEN = "t";
    process.env.PARCELDAILY_MERCHANT_ID = "m";
    const s = await makeLiveStore(db);
    await cs.saveShipper(s.ctx, { senderName: "Mak Teh Enterprise", senderPhone: "0123456789", pickup: { line1: "No 5 Jalan Kenari", postcode: "43000", city: "Kajang", state: "Selangor" }, defaultWeightGrams: 500, defaultContent: "Sambal" });
    pdServer();
    expect(await cs.connectCourier(s.ctx, "parceldaily", { codEnabled: true })).toBe("CONNECTED");
    return s;
  }
  async function paidOrder(s: { workspaceId: string; productId: string }) {
    const r = await createCheckout(db, s.workspaceId, buyer(s.productId), urls);
    const { TestGateway } = await import("@/lib/payments/test-gateway");
    const { applyPaymentEvent } = await import("@/lib/commerce/events");
    const o = (await db.query.orders.findFirst({ where: eq(orders.id, r.orderId) }))!;
    const { body, signature } = TestGateway.signEvent(o.id, "paid", o.totalSen);
    await applyPaymentEvent(db, s.workspaceId, TestGateway.verifyWebhook(body, signature));
    return o.id;
  }

  it("units and status mapping follow the spec", () => {
    expect(pdPhone("0123456789")).toBe("123456789");
    expect(pdPhone("+60123456789")).toBe("123456789");
    expect(mapStatusGroup("Picked Up")).toBe("PICKED_UP");
    expect(mapStatusGroup("Picked up")).toBe("PICKED_UP");
    expect(mapStatusGroup("COD amount remitted")).toBeNull();
  });

  it("unpaid orders can't be pushed; quote → create → checkout; duplicate push refused; AWB cached and merged per tenant", async () => {
    const s = await readyStore();
    const unpaid = await createCheckout(db, s.workspaceId, buyer(s.productId), urls);
    await expect(cs.pushOrder(s.ctx, unpaid.orderId, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 })).rejects.toMatchObject({ code: "shipments.notPaid" });
    const oid = await paidOrder(s);
    const quotes = await cs.quoteForOrder(s.ctx, oid);
    expect(quotes.map((q) => q.service)).toEqual(["jnt", "ninjavan", "poslaju"]); // dhl empty = unsupported
    const calls = pdServer();
    const r = await cs.pushOrder(s.ctx, oid, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 });
    expect(r.trackingNumber).toMatch(/^JNT/);
    const create = calls.find((c) => c.path.endsWith("/order/create"))!.body as Record<string, unknown>;
    expect(create).toMatchObject({ serviceProvider: "jnt", price: 8, kg: 0.5, isDropoff: false, reference: r.shipmentId });
    expect((create.clientAddress as Record<string, unknown>).phone).toBe("123456789");
    const o = (await db.query.orders.findFirst({ where: eq(orders.id, oid) }))!;
    expect(o).toMatchObject({ fulfillmentStatus: "SHIPPED", courierCostSen: 800 });
    await expect(cs.pushOrder(s.ctx, oid, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 })).rejects.toMatchObject({ code: "shipments.alreadyBooked" });

    const sh = (await db.query.shipments.findFirst({ where: eq(shipments.id, r.shipmentId) }))!;
    expect(sh.awbAssetId).toBeTruthy();
    const other = await makeLiveStore(db);
    await expect(cs.bulkAwb(db, other.workspaceId, [r.shipmentId])).rejects.toMatchObject({ code: "errors.forbidden" });
    const merged = await cs.bulkAwb(db, s.workspaceId, [r.shipmentId]);
    expect(merged.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(merged.mapping[0]).toMatchObject({ shipmentId: r.shipmentId, pages: 1 });
  });

  it("insufficient credit stops before checkout; a network error leaves the booking pending (no double booking)", async () => {
    const s = await readyStore();
    const oid = await paidOrder(s);
    pdServer({ credit: 5 });
    await expect(cs.pushOrder(s.ctx, oid, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 })).rejects.toMatchObject({ code: "couriers.insufficientCredit" });
    const calls = pdServer({ network: true });
    await expect(cs.pushOrder(s.ctx, oid, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 })).rejects.toMatchObject({ code: "shipments.pendingConfirmation" });
    expect(calls.filter((c) => c.path.endsWith("/order/create"))).toHaveLength(1);
    await expect(cs.pushOrder(s.ctx, oid, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 })).rejects.toMatchObject({ code: "shipments.alreadyBooked" });
  });

  it("a failed checkout is retried without creating a second ParcelDaily order", async () => {
    const s = await readyStore();
    const oid = await paidOrder(s);
    pdServer({ failPay: true });
    await expect(cs.pushOrder(s.ctx, oid, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 })).rejects.toMatchObject({ code: "shipments.bookingFailed" });
    const calls = pdServer();
    await cs.pushOrder(s.ctx, oid, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 });
    expect(calls.filter((c) => c.path.endsWith("/order/create"))).toHaveLength(0);
    expect(calls.filter((c) => c.path.endsWith("/order/pay"))).toHaveLength(1);
  });

  it("signed webhooks: tracking updates, COD delivered ≠ remitted, duplicates ignored", async () => {
    process.env.PARCELDAILY_WEBHOOK_SECRET = "whsec";
    const s = await readyStore();
    process.env.PARCELDAILY_WEBHOOK_SECRET = "whsec";
    const { saveRule } = await import("@/lib/shipping/rules");
    await saveRule(db, s, R({ name: "COD", deliveryType: "cod", minGrams: 0, maxGrams: 2000, feeSen: 900 }));
    await saveRule(db, s, R({ name: "Normal", minGrams: 0, maxGrams: 2000, feeSen: 700 }));
    await saveOrderSettings(db, s, { ...DEFAULT_ORDER_SETTINGS, codEnabled: true, cod: { ...DEFAULT_ORDER_SETTINGS.cod, courierConfirmed: true } });
    const cod = await createCheckout(db, s.workspaceId, buyer(s.productId, { paymentMethod: "cod" }), urls);
    const r = await cs.pushOrder(s.ctx, cod.orderId, { provider: "parceldaily", service: "jnt", quotedPriceSen: 800 });
    const sign = (body: string, ts = Math.floor(Date.now() / 1000)) => ({ ts: String(ts), sig: createHmac("sha256", "whsec").update(`${ts}.${body}`).digest("hex") });
    const delivered = JSON.stringify({ status: "Successfully delivered", statusGroup: "Delivered", consign_no: r.trackingNumber, event: "STATUS_UPDATED" });
    const { ts, sig } = sign(delivered);
    expect(verifyParcelDailyWebhook(delivered, ts, sig)).toBe(true);
    expect(verifyParcelDailyWebhook(delivered, ts, "00".repeat(32))).toBe(false);
    expect(verifyParcelDailyWebhook(delivered, String(Number(ts) - 600), sign(delivered, Number(ts) - 600).sig)).toBe(false); // stale
    expect(await cs.handleParcelDailyEvent(db, delivered)).toBe("DELIVERED");
    expect(await cs.handleParcelDailyEvent(db, delivered)).toBe("duplicate");
    let o = (await db.query.orders.findFirst({ where: eq(orders.id, cod.orderId) }))!;
    expect(o).toMatchObject({ fulfillmentStatus: "DELIVERED", codStatus: "AWAITING_REMITTANCE", paymentStatus: "PENDING" });
    const remitted = JSON.stringify({ consign_no: r.trackingNumber, event: "COD_REMITTED", amount: (o.totalSen / 100).toFixed(2), currency: "MYR", remittedAt: "2026-11-05T08:41:03.649+00:00" });
    expect(await cs.handleParcelDailyEvent(db, remitted)).toBe("cod_remitted");
    o = (await db.query.orders.findFirst({ where: eq(orders.id, cod.orderId) }))!;
    expect(o).toMatchObject({ codStatus: "REMITTED", paymentStatus: "PAID", orderStatus: "COMPLETED" });
    expect(await db.query.codRemittances.findMany({ where: and(eq(codRemittances.orderId, cod.orderId)) })).toHaveLength(1);
  });

  it("own-courier accounts are honest: awaiting access, manual tracking only", async () => {
    const s = await makeLiveStore(db);
    expect(await cs.connectCourier(s.ctx, "spx", { accountLabel: "My SPX" })).toBe("AWAITING_ACCESS");
    const cat = await cs.courierCatalog(db, s.workspaceId);
    const spx = cat.find((c) => c.provider === "spx")!;
    expect(spx).toMatchObject({ status: "AWAITING_ACCESS", capabilities: [], api: { live: false } });
    const oid = await paidOrder(s);
    const id = await cs.recordManualShipment(s.ctx, oid, { provider: "spx", trackingNumber: "SPXMY0001234" });
    expect((await db.query.shipments.findFirst({ where: eq(shipments.id, id) }))).toMatchObject({ providerStatus: "manual", status: "BOOKED" });
  });
});
