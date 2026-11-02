import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import type { DB, Tx } from "@/lib/db";
import {
  assets,
  codRemittances,
  courierConnections,
  courierWebhookEvents,
  orderItems,
  orders,
  shipmentEvents,
  shipments,
  shippingSettings,
  customers,
  type CourierProvider,
  type ShipmentStatus,
  type ShipperProfile,
} from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { sha256, encryptSecret } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { audit, notify } from "@/lib/audit";
import { readAssetBytes, storeBytes } from "@/lib/storage";
import { raiseAlert, clearAlert } from "@/lib/admin/alerts";
import { orderEvent } from "@/lib/orders/events";
import { MY_STATES } from "@/lib/commerce/checkout";
import { addressConsistent } from "@/lib/shipping/zones";
import { getConfig } from "@/lib/finance/settings";
import { ParcelDailyAdapter, ParcelDailyError, mapStatusGroup, parcelDailyConfigured } from "./parceldaily";
import { DIRECT_PROVIDERS, directAdapter, directNote } from "./direct";
import { COURIER_NAMES, type CourierAdapter, type Party } from "./types";

export type Ctx = { db: DB; workspaceId: string; userId: string };
export type Shipment = typeof shipments.$inferSelect;
const ACTIVE_EXCLUDED: ShipmentStatus[] = ["CANCELLED", "FAILED"];
const MAX_GRAMS = 30_000;

export function adapterFor(provider: CourierProvider, base?: string): CourierAdapter {
  return provider === "parceldaily" ? new ParcelDailyAdapter(base ? `${base}/api/webhooks/couriers/parceldaily` : null) : directAdapter(provider);
}

// ------------------------------------------------------------------ shipper profile & connections

const addr = z.object({ line1: z.string().trim().min(3).max(130), line2: z.string().trim().max(130).optional(), postcode: z.string().regex(/^\d{5}$/), city: z.string().trim().min(2).max(80), state: z.enum(MY_STATES) });
export const shipperSchema = z.object({
  senderName: z.string().trim().min(3).max(120),
  senderPhone: z.string().trim().regex(/^(\+?6?0)[0-9]{8,10}$/, "checkout.phoneInvalid"),
  pickup: addr,
  returnAddress: addr.nullable().optional(),
  defaultWeightGrams: z.number().int().min(1).max(MAX_GRAMS),
  defaultContent: z.string().trim().min(2).max(50),
});

export async function getShipper(db: DB | Tx, workspaceId: string) {
  return (await db.query.shippingSettings.findFirst({ where: eq(shippingSettings.workspaceId, workspaceId) }))?.shipper ?? null;
}
export async function saveShipper(ctx: Ctx, raw: unknown) {
  const s = shipperSchema.parse(raw) as ShipperProfile;
  if (!addressConsistent(s.pickup.postcode, s.pickup.state)) throw new AppError("shipping.addressMismatch");
  await ctx.db.insert(shippingSettings).values({ workspaceId: ctx.workspaceId, shipper: s }).onConflictDoUpdate({ target: shippingSettings.workspaceId, set: { shipper: s, updatedAt: new Date() } });
  await audit(ctx.db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "couriers.shipper_saved" });
}

/** Courier cards for Integrations → Couriers (status, capability, COD, why unavailable). */
export async function courierCatalog(db: DB, workspaceId: string) {
  const rows = await db.query.courierConnections.findMany({ where: eq(courierConnections.workspaceId, workspaceId) });
  return (["parceldaily", ...DIRECT_PROVIDERS] as CourierProvider[]).map((p) => {
    const a = adapterFor(p);
    const row = rows.find((r) => r.provider === p) ?? null;
    return {
      provider: p,
      name: COURIER_NAMES[p],
      mode: p === "parceldaily" ? ("platform" as const) : ("own" as const),
      status: row?.status ?? "NOT_CONNECTED",
      isDefault: row?.isDefault ?? false,
      capabilities: [...a.capabilities],
      api: a.availability(),
      note: p === "parceldaily" ? null : directNote(p as Exclude<CourierProvider, "parceldaily">),
      codEnabled: row?.config.codEnabled ?? false,
      lastError: row?.lastError ?? null,
      lastCheckedAt: row?.lastCheckedAt ?? null,
      accountLabel: row?.config.accountLabel ?? null,
    };
  });
}

/**
 * Connect a courier. ParcelDaily uses SellNow's platform account (no seller credentials).
 * Own accounts store the seller's credentials encrypted; until an approved API adapter exists the
 * connection is AWAITING_ACCESS and shipments are recorded manually.
 */
export async function connectCourier(ctx: Ctx, provider: CourierProvider, raw: { credentials?: Record<string, string>; accountLabel?: string; codEnabled?: boolean } = {}) {
  const a = adapterFor(provider);
  let status: "CONNECTED" | "ERROR" | "AWAITING_ACCESS";
  let lastError: string | null = null;
  if (provider === "parceldaily") {
    if (!parcelDailyConfigured()) {
      status = "AWAITING_ACCESS";
      lastError = "platform_credentials_missing";
    } else {
      const v = await a.verifyConnection!();
      status = v.ok ? "CONNECTED" : "ERROR";
      lastError = v.ok ? null : (v.detail ?? "verify_failed");
    }
  } else status = "AWAITING_ACCESS";
  const creds = raw.credentials && Object.keys(raw.credentials).length ? encryptSecret(JSON.stringify(raw.credentials)) : null;
  const values = { mode: provider === "parceldaily" ? ("platform" as const) : ("own" as const), status, lastError, lastCheckedAt: new Date(), config: { accountLabel: raw.accountLabel?.slice(0, 60), codEnabled: Boolean(raw.codEnabled) }, ...(creds ? { credentialsCiphertext: creds } : {}), updatedAt: new Date() };
  const existing = await ctx.db.query.courierConnections.findFirst({ where: and(eq(courierConnections.workspaceId, ctx.workspaceId), eq(courierConnections.provider, provider)) });
  const hasDefault = await ctx.db.query.courierConnections.findFirst({ where: and(eq(courierConnections.workspaceId, ctx.workspaceId), eq(courierConnections.isDefault, true)) });
  if (existing) await ctx.db.update(courierConnections).set(values).where(eq(courierConnections.id, existing.id));
  else await ctx.db.insert(courierConnections).values({ id: newId("crc"), workspaceId: ctx.workspaceId, provider, isDefault: !hasDefault, ...values });
  await audit(ctx.db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "couriers.connected", data: { provider, status } });
  return status;
}

export async function disconnectCourier(ctx: Ctx, provider: CourierProvider) {
  await ctx.db.update(courierConnections).set({ status: "DISABLED", isDefault: false, credentialsCiphertext: null, updatedAt: new Date() }).where(and(eq(courierConnections.workspaceId, ctx.workspaceId), eq(courierConnections.provider, provider)));
  await audit(ctx.db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "couriers.disconnected", data: { provider } });
}

export async function setDefaultCourier(ctx: Ctx, provider: CourierProvider) {
  await ctx.db.transaction(async (tx) => {
    await tx.update(courierConnections).set({ isDefault: false }).where(eq(courierConnections.workspaceId, ctx.workspaceId));
    const r = await tx.update(courierConnections).set({ isDefault: true }).where(and(eq(courierConnections.workspaceId, ctx.workspaceId), eq(courierConnections.provider, provider))).returning({ id: courierConnections.id });
    if (!r.length) throw new AppError("couriers.notConnected");
  });
}

export async function testCourier(ctx: Ctx, provider: CourierProvider) {
  const a = adapterFor(provider);
  if (!a.verifyConnection) return { ok: false, detail: a.availability().reason };
  const r = await a.verifyConnection();
  await ctx.db.update(courierConnections).set({ status: r.ok ? "CONNECTED" : "ERROR", lastError: r.ok ? null : (r.detail ?? null), lastCheckedAt: new Date() }).where(and(eq(courierConnections.workspaceId, ctx.workspaceId), eq(courierConnections.provider, provider)));
  return r;
}

// ------------------------------------------------------------------ eligibility & push

async function loadOrder(db: DB | Tx, workspaceId: string, orderId: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)) });
  if (!o) throw new AppError("errors.notFound");
  return o;
}

/** Why an order can't be pushed yet (null = ready). Unpaid prepaid orders are never pushed. */
export async function pushBlocker(db: DB | Tx, o: typeof orders.$inferSelect) {
  if (o.deliveryMethod !== "shipping" || !o.shippingAddress) return "shipments.noShipping";
  if (o.orderStatus === "CANCELLED" || o.paymentStatus === "CANCELLED" || o.paymentStatus === "REFUNDED") return "shipments.orderClosed";
  if (o.paymentMethod === "cod") {
    if (o.codStatus === "NOT_APPLICABLE") return "shipments.notPayable";
  } else if (o.paymentStatus !== "PAID" && o.paymentStatus !== "PARTIALLY_REFUNDED") return o.paymentMethod === "manual_transfer" ? "shipments.awaitingTransfer" : "shipments.notPaid";
  const active = await db.query.shipments.findFirst({ where: and(eq(shipments.orderId, o.id), notInArray(shipments.status, ACTIVE_EXCLUDED)) });
  if (active) return "shipments.alreadyBooked";
  if ((o.weightGrams ?? 0) > MAX_GRAMS) return "shipments.tooHeavy";
  return null;
}

async function parties(db: DB | Tx, o: typeof orders.$inferSelect, shipper: ShipperProfile): Promise<{ sender: Party; receiver: Party }> {
  const c = await db.query.customers.findFirst({ where: eq(customers.id, o.customerId) });
  const a = o.shippingAddress!;
  if (!c?.phone) throw new AppError("shipments.receiverPhone");
  return {
    sender: { name: shipper.senderName, phone: shipper.senderPhone, ...shipper.pickup },
    receiver: { name: c.name, phone: c.phone, email: c.email, line1: a.line1, line2: a.line2, postcode: a.postcode, city: a.city, state: a.state },
  };
}

export async function quoteForOrder(ctx: Ctx, orderId: string) {
  const o = await loadOrder(ctx.db, ctx.workspaceId, orderId);
  const shipper = await getShipper(ctx.db, ctx.workspaceId);
  if (!shipper) throw new AppError("shipments.noShipper");
  const a = adapterFor("parceldaily");
  if (!a.availability().live) throw new AppError("couriers.parceldailyUnavailable");
  const { sender, receiver } = await parties(ctx.db, o, shipper);
  const codSen = o.paymentMethod === "cod" ? o.totalSen : 0;
  return a.quote!(sender, receiver, o.weightGrams ?? shipper.defaultWeightGrams, codSen);
}

async function applyShipmentStatus(tx: Tx | DB, s: Shipment, status: ShipmentStatus, providerStatus: string, source: "booking" | "webhook" | "poll" | "manual", occurredAt = new Date(), description?: string | null) {
  const ins = await tx
    .insert(shipmentEvents)
    .values({ id: newId("sev"), shipmentId: s.id, workspaceId: s.workspaceId, status, providerStatus, description: description ?? null, source, dedupeKey: `${status}:${providerStatus}:${occurredAt.toISOString()}`, occurredAt })
    .onConflictDoNothing()
    .returning({ id: shipmentEvents.id });
  if (!ins.length) return false;
  await tx.update(shipments).set({ status, providerStatus, updatedAt: new Date(), ...(status === "DELIVERED" ? { deliveredAt: occurredAt } : {}) }).where(eq(shipments.id, s.id));
  const o = await tx.query.orders.findFirst({ where: eq(orders.id, s.orderId) });
  if (!o) return true;
  const patch: Partial<typeof orders.$inferInsert> = { updatedAt: new Date() };
  if (["AWB_READY", "PICKUP_PENDING", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "BOOKED"].includes(status)) patch.fulfillmentStatus = "SHIPPED";
  if (status === "DELIVERED") {
    patch.fulfillmentStatus = "DELIVERED";
    // COD: delivered is NOT paid — money is pending until the courier remits it.
    if (o.paymentMethod === "cod") patch.codStatus = "AWAITING_REMITTANCE";
    else patch.orderStatus = "COMPLETED";
  }
  if (status === "RETURNED") {
    patch.fulfillmentStatus = "RETURNED";
    patch.orderStatus = "RETURNED";
  }
  await tx.update(orders).set(patch).where(eq(orders.id, o.id));
  await orderEvent(tx, { workspaceId: s.workspaceId, orderId: o.id, type: `shipment.${status.toLowerCase()}`, data: { provider: s.provider, providerStatus, tracking: s.trackingNumber } });
  return true;
}

const pushSchema = z.object({ provider: z.enum(["parceldaily"]), service: z.string().min(2).max(30), quotedPriceSen: z.number().int().positive() });

/**
 * Push ONE order to a courier (ParcelDaily: create → credit check → checkout). The shipment row
 * is written first; the partial unique index makes a second concurrent push for the same order
 * fail instead of booking twice. A create that succeeded is never re-created on retry — only
 * checked out again.
 */
export async function pushOrder(ctx: Ctx, orderId: string, raw: unknown, base?: string) {
  const input = pushSchema.parse(raw);
  const o = await loadOrder(ctx.db, ctx.workspaceId, orderId);
  const blocker = await pushBlocker(ctx.db, o);
  if (blocker) throw new AppError(blocker);
  const shipper = await getShipper(ctx.db, ctx.workspaceId);
  if (!shipper) throw new AppError("shipments.noShipper");
  const conn = await ctx.db.query.courierConnections.findFirst({ where: and(eq(courierConnections.workspaceId, ctx.workspaceId), eq(courierConnections.provider, input.provider)) });
  if (conn?.status !== "CONNECTED") throw new AppError("couriers.notConnected");
  const a = adapterFor(input.provider, base) as ParcelDailyAdapter;
  const { sender, receiver } = await parties(ctx.db, o, shipper);
  const items = await ctx.db.query.orderItems.findMany({ where: eq(orderItems.orderId, o.id) });
  const codSen = o.paymentMethod === "cod" ? o.totalSen : 0;
  if (codSen > 0 && !conn.config.codEnabled) throw new AppError("shipments.codNotEnabled");
  const weight = o.weightGrams ?? shipper.defaultWeightGrams;

  // Re-use a ParcelDaily order that was created but never checked out (never create twice).
  const prior = await ctx.db.query.shipments.findFirst({ where: and(eq(shipments.orderId, o.id), eq(shipments.status, "FAILED")), orderBy: desc(shipments.createdAt) });
  const reuseExternal = prior?.externalOrderId && !prior.trackingNumber && prior.serviceCode === input.service ? prior.externalOrderId : null;

  const id = newId("shp");
  try {
    await ctx.db.insert(shipments).values({ id, workspaceId: ctx.workspaceId, orderId: o.id, connectionId: conn.id, provider: input.provider, status: "BOOKING_PENDING", serviceCode: input.service, courierCostSen: input.quotedPriceSen, codAmountSen: codSen, weightGrams: weight, externalOrderId: reuseExternal });
  } catch {
    throw new AppError("shipments.alreadyBooked");
  }
  await ctx.db.update(orders).set({ fulfillmentStatus: "BOOKING_PENDING" }).where(eq(orders.id, o.id));

  // Credit check BEFORE checkout (checkout deducts ParcelDaily credit).
  const cfg = await getConfig(ctx.db);
  const credit = await a.balanceSen().catch(() => null);
  if (credit != null && credit < input.quotedPriceSen) {
    await failShipment(ctx.db, id, o.id, "couriers.insufficientCredit", null);
    await raiseAlert(ctx.db, { kind: "courier.parceldaily_credit", severity: "critical", message: `ParcelDaily credit RM${(credit / 100).toFixed(2)} is below a booking of RM${(input.quotedPriceSen / 100).toFixed(2)}.`, dedupeKey: "parceldaily:credit", link: "/admin/couriers" });
    throw new AppError("couriers.insufficientCredit");
  }
  if (credit != null && credit < cfg.parceldaily.lowCreditAlertSen) await raiseAlert(ctx.db, { kind: "courier.parceldaily_low", severity: "warning", message: `ParcelDaily credit is low: RM${(credit / 100).toFixed(2)}.`, dedupeKey: "parceldaily:low", link: "/admin/couriers" });

  let externalOrderId = reuseExternal;
  try {
    if (!externalOrderId) {
      externalOrderId = await a.create({ reference: id, sender, receiver, weightGrams: weight, content: shipper.defaultContent || items.map((i) => i.name).join(", "), contentValueSen: o.subtotalSen - o.discountSen, codSen, service: input.service, quotedPriceSen: input.quotedPriceSen });
      await ctx.db.update(shipments).set({ externalOrderId }).where(eq(shipments.id, id));
    }
    const { connote, raw } = await a.checkout(externalOrderId);
    const s = (await ctx.db.query.shipments.findFirst({ where: eq(shipments.id, id) }))!;
    await ctx.db.transaction(async (tx) => {
      await tx.update(shipments).set({ trackingNumber: connote, courierName: input.service, bookedAt: new Date(), providerResponse: raw, lastError: null }).where(eq(shipments.id, id));
      await tx.update(orders).set({ courierCostSen: input.quotedPriceSen }).where(eq(orders.id, o.id));
      await applyShipmentStatus(tx, { ...s, trackingNumber: connote }, connote ? "AWB_READY" : "BOOKED", "checked_out", "booking");
      await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "shipment.booked", entity: "shipment", entityId: id, data: { provider: input.provider, service: input.service, costSen: input.quotedPriceSen } });
    });
    await clearAlert(ctx.db, "parceldaily:credit");
    if (connote) await cacheAwb(ctx.db, id).catch(() => null);
    return { shipmentId: id, trackingNumber: connote };
  } catch (e) {
    const unknown = e instanceof ParcelDailyError && e.httpStatus === null;
    if (unknown) {
      // Network error: we can't tell whether ParcelDaily booked it — keep it pending (blocks duplicates) for reconciliation.
      await ctx.db.update(shipments).set({ lastError: "provider_state_unknown", externalOrderId }).where(eq(shipments.id, id));
      await raiseAlert(ctx.db, { kind: "courier.booking_unknown", severity: "warning", message: `Booking ${id} state unknown — reconcile with ParcelDaily.`, dedupeKey: `shipment:unknown:${id}`, link: "/admin/couriers", workspaceId: ctx.workspaceId });
      throw new AppError("shipments.pendingConfirmation");
    }
    await failShipment(ctx.db, id, o.id, e instanceof Error ? e.message.slice(0, 300) : String(e), externalOrderId);
    throw new AppError("shipments.bookingFailed", { detail: e instanceof Error ? e.message.slice(0, 120) : "" });
  }
}

async function failShipment(db: DB, id: string, orderId: string, error: string, externalOrderId: string | null) {
  await db.update(shipments).set({ status: "FAILED", lastError: error, externalOrderId, updatedAt: new Date() }).where(eq(shipments.id, id));
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (o?.fulfillmentStatus === "BOOKING_PENDING") await db.update(orders).set({ fulfillmentStatus: "READY_TO_SHIP" }).where(eq(orders.id, orderId));
}

/** Own-courier (no API yet): seller booked in the courier's system and records the tracking number. Labelled manual. */
export async function recordManualShipment(ctx: Ctx, orderId: string, raw: unknown) {
  const input = z.object({ provider: z.enum(["jnt", "poslaju", "ninjavan", "spx", "dhl"]), trackingNumber: z.string().trim().min(5).max(40), courierCostSen: z.number().int().min(0).max(1_000_000).nullable().optional() }).parse(raw);
  const o = await loadOrder(ctx.db, ctx.workspaceId, orderId);
  const blocker = await pushBlocker(ctx.db, o);
  if (blocker) throw new AppError(blocker);
  const id = newId("shp");
  await ctx.db.transaction(async (tx) => {
    await tx.insert(shipments).values({ id, workspaceId: ctx.workspaceId, orderId: o.id, provider: input.provider, status: "BOOKED", providerStatus: "manual", trackingNumber: input.trackingNumber, courierName: COURIER_NAMES[input.provider], courierCostSen: input.courierCostSen ?? null, codAmountSen: o.paymentMethod === "cod" ? o.totalSen : 0, weightGrams: o.weightGrams, bookedAt: new Date() });
    if (input.courierCostSen != null) await tx.update(orders).set({ courierCostSen: input.courierCostSen }).where(eq(orders.id, o.id));
    const s = (await tx.query.shipments.findFirst({ where: eq(shipments.id, id) }))!;
    await applyShipmentStatus(tx, s, "BOOKED", "manual", "manual");
  });
  return id;
}

/** Seller-confirmed delivery for manual shipments (no courier webhook exists for them). */
export async function markManualDelivered(ctx: Ctx, shipmentId: string) {
  const s = await ctx.db.query.shipments.findFirst({ where: and(eq(shipments.id, shipmentId), eq(shipments.workspaceId, ctx.workspaceId)) });
  // ParcelDaily deliveries come from the courier's webhook; only manual shipments are confirmed by hand.
  if (!s || s.provider === "parceldaily") throw new AppError("errors.notFound");
  await ctx.db.transaction((tx) => applyShipmentStatus(tx, s, "DELIVERED", "manual_delivered", "manual"));
}

export async function cancelShipment(ctx: Ctx, shipmentId: string) {
  const s = await ctx.db.query.shipments.findFirst({ where: and(eq(shipments.id, shipmentId), eq(shipments.workspaceId, ctx.workspaceId)) });
  if (!s) throw new AppError("errors.notFound");
  if (!["BOOKED", "AWB_READY", "PICKUP_PENDING", "BOOKING_PENDING"].includes(s.status)) throw new AppError("shipments.notCancellable");
  if (s.provider === "parceldaily" && s.externalOrderId && s.trackingNumber) await adapterFor("parceldaily").cancel!(s.externalOrderId);
  await ctx.db.transaction(async (tx) => {
    await applyShipmentStatus(tx, s, "CANCELLED", "cancelled_by_seller", "manual");
    await tx.update(orders).set({ fulfillmentStatus: "READY_TO_SHIP" }).where(eq(orders.id, s.orderId));
  });
}

// ------------------------------------------------------------------ bulk push (background job)

export type BulkPreview = { ready: { orderId: string; number: number; cod: boolean }[]; blocked: { orderId: string; number: number; reason: string }[] };
export async function bulkPreview(ctx: Ctx, orderIds: string[]): Promise<BulkPreview> {
  const list = await ctx.db.query.orders.findMany({ where: and(eq(orders.workspaceId, ctx.workspaceId), inArray(orders.id, orderIds.slice(0, 200))) });
  const out: BulkPreview = { ready: [], blocked: [] };
  for (const o of list) {
    const b = await pushBlocker(ctx.db, o);
    if (b) out.blocked.push({ orderId: o.id, number: o.number, reason: b });
    else out.ready.push({ orderId: o.id, number: o.number, cod: o.paymentMethod === "cod" });
  }
  return out;
}

/** One job stage = one order; results are recorded per order so a retry skips the successes. */
export async function bulkPushOne(ctx: Ctx, orderId: string, service: string, base?: string) {
  const o = await loadOrder(ctx.db, ctx.workspaceId, orderId);
  const existing = await ctx.db.query.shipments.findFirst({ where: and(eq(shipments.orderId, o.id), notInArray(shipments.status, ACTIVE_EXCLUDED)) });
  if (existing) return { orderId, ok: true, skipped: true, trackingNumber: existing.trackingNumber, costSen: existing.courierCostSen ?? 0 };
  const opts = await quoteForOrder(ctx, orderId);
  const opt = opts.find((x) => x.service === service);
  if (!opt) return { orderId, ok: false, error: "shipments.serviceUnavailable" };
  try {
    const r = await pushOrder(ctx, orderId, { provider: "parceldaily", service, quotedPriceSen: opt.priceSen }, base);
    return { orderId, ok: true, trackingNumber: r.trackingNumber, costSen: opt.priceSen };
  } catch (e) {
    return { orderId, ok: false, error: e instanceof AppError ? e.code : "errors.unexpected" };
  }
}

// ------------------------------------------------------------------ AWB

async function cacheAwb(db: DB, shipmentId: string) {
  const s = await db.query.shipments.findFirst({ where: eq(shipments.id, shipmentId) });
  if (!s?.trackingNumber || s.awbAssetId) return s?.awbAssetId ?? null;
  const pdf = await adapterFor(s.provider as CourierProvider).awbPdf!(s.trackingNumber);
  const a = await storeBytes(db, { workspaceId: s.workspaceId, buf: pdf, mime: "application/pdf", kind: "awb", originalName: `awb-${s.trackingNumber}.pdf` });
  await db.update(shipments).set({ awbAssetId: a.id }).where(eq(shipments.id, s.id));
  return a.id;
}

/** AWB PDF for one shipment of this tenant (cached; never regenerated needlessly). */
export async function awbFor(db: DB, workspaceId: string, shipmentId: string) {
  const s = await db.query.shipments.findFirst({ where: and(eq(shipments.id, shipmentId), eq(shipments.workspaceId, workspaceId)) });
  if (!s?.trackingNumber || s.provider !== "parceldaily") throw new AppError("shipments.noAwb");
  const assetId = s.awbAssetId ?? (await cacheAwb(db, s.id));
  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId!), eq(assets.workspaceId, workspaceId)) });
  if (!asset) throw new AppError("shipments.noAwb");
  return { pdf: await readAssetBytes(asset.storageKey), name: `AWB-${s.trackingNumber}.pdf` };
}

/** One print-ready PDF for many labels — only this tenant's shipments, in the requested order. */
export async function bulkAwb(db: DB, workspaceId: string, shipmentIds: string[]) {
  if (!shipmentIds.length || shipmentIds.length > 200) throw new AppError("errors.validation");
  const rows = await db.query.shipments.findMany({ where: and(eq(shipments.workspaceId, workspaceId), inArray(shipments.id, shipmentIds)) });
  if (rows.length !== new Set(shipmentIds).size) throw new AppError("errors.forbidden");
  const merged = await PDFDocument.create();
  const mapping: { shipmentId: string; tracking: string; pages: number }[] = [];
  for (const id of shipmentIds) {
    const { pdf } = await awbFor(db, workspaceId, id);
    const doc = await PDFDocument.load(pdf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
    mapping.push({ shipmentId: id, tracking: rows.find((r) => r.id === id)!.trackingNumber!, pages: pages.length });
  }
  return { pdf: Buffer.from(await merged.save()), mapping };
}

// ------------------------------------------------------------------ webhooks & COD

/** Handles a VERIFIED ParcelDaily webhook exactly once (dedupe by body hash). */
export async function handleParcelDailyEvent(db: DB, rawBody: string) {
  const ins = await db.insert(courierWebhookEvents).values({ id: newId("cwe"), provider: "parceldaily", dedupeKey: sha256(rawBody), payload: JSON.parse(rawBody) as Record<string, unknown> }).onConflictDoNothing().returning({ id: courierWebhookEvents.id });
  if (!ins.length) return "duplicate";
  const body = JSON.parse(rawBody) as Record<string, unknown> & { data?: Record<string, unknown> };
  const event = body.event as string | undefined;
  const consign = (body.consign_no ?? body.data?.consign_no) as string | undefined;
  const s = consign ? await db.query.shipments.findFirst({ where: and(eq(shipments.provider, "parceldaily"), eq(shipments.trackingNumber, consign)) }) : null;
  let result = "ignored";
  if (!event && body.data) {
    // Checkout webhook: may carry the connote for an async/bulk checkout.
    const orderId = body.data.orderId as string | undefined;
    const pending = orderId ? await db.query.shipments.findFirst({ where: and(eq(shipments.provider, "parceldaily"), eq(shipments.externalOrderId, orderId)) }) : null;
    if (pending && consign && !pending.trackingNumber) {
      await db.update(shipments).set({ trackingNumber: consign, lastError: null }).where(eq(shipments.id, pending.id));
      await db.transaction((tx) => applyShipmentStatus(tx, { ...pending, trackingNumber: consign }, "AWB_READY", String(body.data!.status ?? "checked_out"), "webhook"));
      result = "checkout_confirmed";
    }
  } else if (s && event === "STATUS_UPDATED") {
    const st = mapStatusGroup(body.statusGroup as string);
    if (st) {
      await db.transaction((tx) => applyShipmentStatus(tx, s, st, String(body.status ?? body.statusGroup), "webhook"));
      result = st;
      if (st === "DELIVERY_FAILED") await notify(db, s.workspaceId, "shipment.delivery_failed", { orderId: s.orderId, tracking: consign });
    }
  } else if (s && event === "COD_REMITTED") {
    await recordCodRemittance(db, s.workspaceId, s.orderId, Math.round(Number(body.amount) * 100), `parceldaily:${consign}`, null, body.remittedAt ? new Date(String(body.remittedAt)) : new Date());
    result = "cod_remitted";
  } else if (s && event === "CANCEL_STATUS_UPDATED") {
    await db.transaction((tx) => applyShipmentStatus(tx, s, "CANCELLED", String(body.status), "webhook"));
    result = "cancelled";
  } else if (s && event === "WEIGHT_UPDATED") {
    await db.update(shipments).set({ weightGrams: Math.round(Number(body.newWeight) * 1000) }).where(eq(shipments.id, s.id));
    result = "weight";
  } else if (consign && !s) result = "unmatched";
  await db.update(courierWebhookEvents).set({ result }).where(eq(courierWebhookEvents.id, ins[0]!.id));
  return result;
}

/**
 * COD money actually remitted (courier webhook or a seller/admin record with a reference).
 * The amount must match the COD collected or it is flagged DISPUTED — never silently accepted.
 */
export async function recordCodRemittance(db: DB, workspaceId: string, orderId: string, amountSen: number, reference: string, userId: string | null, at = new Date()) {
  const o = await loadOrder(db, workspaceId, orderId);
  if (o.paymentMethod !== "cod") throw new AppError("orders.notCod");
  const ok = amountSen === o.totalSen;
  await db.transaction(async (tx) => {
    const ins = await tx.insert(codRemittances).values({ id: newId("cod"), workspaceId, orderId, amountSen, status: ok ? "REMITTED" : "DISPUTED", reference, recordedBy: userId, remittedAt: at }).onConflictDoNothing().returning({ id: codRemittances.id });
    if (!ins.length) return;
    await tx.update(orders).set({ codStatus: ok ? "REMITTED" : "DISPUTED", ...(ok ? { paymentStatus: "PAID", paidAt: at, orderStatus: o.fulfillmentStatus === "DELIVERED" ? "COMPLETED" : o.orderStatus } : {}), updatedAt: new Date() }).where(eq(orders.id, o.id));
    await orderEvent(tx, { workspaceId, orderId, type: ok ? "cod.remitted" : "cod.disputed", actorUserId: userId, data: { amountSen, expectedSen: o.totalSen, reference } });
  });
  if (!ok) await raiseAlert(db, { kind: "cod.mismatch", severity: "warning", message: `COD remittance for order #${o.number} is RM${(amountSen / 100).toFixed(2)}, expected RM${(o.totalSen / 100).toFixed(2)}.`, dedupeKey: `cod:${o.id}`, link: "/admin/couriers", workspaceId });
}

export async function reconcileCod(ctx: Ctx, orderId: string) {
  const o = await loadOrder(ctx.db, ctx.workspaceId, orderId);
  if (o.codStatus !== "REMITTED") throw new AppError("orders.codNotRemitted");
  await ctx.db.update(orders).set({ codStatus: "RECONCILED" }).where(eq(orders.id, o.id));
  await orderEvent(ctx.db, { workspaceId: ctx.workspaceId, orderId, type: "cod.reconciled", actorUserId: ctx.userId });
}

export async function shipmentsForOrder(db: DB, workspaceId: string, orderId: string) {
  const list = await db.query.shipments.findMany({ where: and(eq(shipments.workspaceId, workspaceId), eq(shipments.orderId, orderId)), orderBy: desc(shipments.createdAt) });
  const events = list.length ? await db.query.shipmentEvents.findMany({ where: inArray(shipmentEvents.shipmentId, list.map((s) => s.id)), orderBy: desc(shipmentEvents.occurredAt) }) : [];
  return list.map((s) => ({ ...s, events: events.filter((e) => e.shipmentId === s.id) }));
}
