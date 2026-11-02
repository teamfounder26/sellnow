import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { customers, manualTransferVerifications, orderEvents, orderItems, orders, paymentTransactions, products, productVariants, shipments } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit, notify } from "@/lib/audit";
import { storeBytes, detectImageMime } from "@/lib/storage";
import { orderEvent } from "./events";

export const ORDER_TABS = ["all", "new", "ready", "pending_payment", "shipped", "delivered", "cod", "returns", "shipments"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];
export type OrderFilters = { tab?: OrderTab; q?: string; from?: string; to?: string; payment?: string; method?: string; courier?: string; limit?: number };

function tabWhere(tab: OrderTab): SQL | undefined {
  switch (tab) {
    case "new":
      return and(eq(orders.orderStatus, "NEW"), sql`${orders.paymentStatus} <> 'CANCELLED'`);
    case "ready":
      return eq(orders.fulfillmentStatus, "READY_TO_SHIP");
    case "pending_payment":
      return and(eq(orders.paymentStatus, "PENDING"), sql`${orders.paymentMethod} <> 'cod'`);
    case "shipped":
      return inArray(orders.fulfillmentStatus, ["SHIPPED", "FULFILLED", "BOOKING_PENDING"]);
    case "delivered":
      return inArray(orders.fulfillmentStatus, ["DELIVERED", "DELIVERED_DIGITAL"]);
    case "cod":
      return eq(orders.paymentMethod, "cod");
    case "returns":
      return or(inArray(orders.paymentStatus, ["REFUNDED", "PARTIALLY_REFUNDED"]), eq(orders.orderStatus, "RETURNED"), eq(orders.fulfillmentStatus, "RETURNED"));
    default:
      return undefined;
  }
}

/** Seller order list with filters. Every query is scoped by workspace. */
export async function searchOrders(db: DB, workspaceId: string, f: OrderFilters = {}) {
  const conds: (SQL | undefined)[] = [eq(orders.workspaceId, workspaceId), tabWhere(f.tab ?? "all")];
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(ilike(customers.name, q), ilike(customers.email, q), ilike(customers.phone, q), sql`${orders.number}::text like ${q}`, sql`exists (select 1 from shipments s where s.order_id = ${orders.id} and s.tracking_number ilike ${q})`));
  }
  if (f.from) conds.push(gte(orders.createdAt, new Date(`${f.from}T00:00:00+08:00`)));
  if (f.to) conds.push(lte(orders.createdAt, new Date(`${f.to}T23:59:59+08:00`)));
  if (f.payment) conds.push(eq(orders.paymentStatus, f.payment as "PAID"));
  if (f.method) conds.push(eq(orders.paymentMethod, f.method as "cod"));
  if (f.courier) conds.push(sql`exists (select 1 from shipments s where s.order_id = ${orders.id} and s.provider = ${f.courier} and s.status not in ('CANCELLED','FAILED'))`);
  const rows = await db
    .select({ order: orders, customer: { name: customers.name, email: customers.email, phone: customers.phone } })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt))
    .limit(Math.min(f.limit ?? 200, 1000));
  const ids = rows.map((r) => r.order.id);
  const [items, ships] = ids.length
    ? await Promise.all([db.query.orderItems.findMany({ where: inArray(orderItems.orderId, ids) }), db.query.shipments.findMany({ where: and(inArray(shipments.orderId, ids), sql`${shipments.status} not in ('CANCELLED','FAILED')`) })])
    : [[], []];
  return rows.map((r) => {
    const its = items.filter((i) => i.orderId === r.order.id);
    const sh = ships.find((s) => s.orderId === r.order.id) ?? null;
    return { ...r, items: its, quantity: its.reduce((a, i) => a + i.quantity, 0), shipment: sh };
  });
}

export async function tabCounts(db: DB, workspaceId: string) {
  const out: Record<string, number> = {};
  for (const t of ORDER_TABS.filter((x) => x !== "shipments")) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.workspaceId, workspaceId), tabWhere(t)));
    out[t] = Number(r?.n ?? 0);
  }
  return out;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Guard against spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function ordersCsv(rows: Awaited<ReturnType<typeof searchOrders>>) {
  const rm = (n: number) => (n / 100).toFixed(2);
  const head = ["order", "date", "customer", "phone", "products", "qty", "subtotal_rm", "shipping_rm", "cod_fee_rm", "total_rm", "payment_method", "payment_status", "fulfillment", "order_status", "courier", "tracking", "courier_cost_rm"];
  return [head.join(","), ...rows.map((r) => [`#${r.order.number}`, r.order.createdAt.toISOString(), r.customer.name, r.customer.phone, r.items.map((i) => i.name).join(" | "), r.quantity, rm(r.order.subtotalSen), rm(r.order.shippingSen), rm(r.order.codFeeSen), rm(r.order.totalSen), r.order.paymentMethod, r.order.paymentStatus, r.order.fulfillmentStatus, r.order.orderStatus, r.shipment?.courierName ?? r.shipment?.provider ?? "", r.shipment?.trackingNumber ?? "", r.order.courierCostSen != null ? rm(r.order.courierCostSen) : ""].map(csvCell).join(","))].join("\n");
}

export async function orderTimeline(db: DB, workspaceId: string, orderId: string) {
  return db.query.orderEvents.findMany({ where: and(eq(orderEvents.workspaceId, workspaceId), eq(orderEvents.orderId, orderId)), orderBy: desc(orderEvents.createdAt) });
}

export async function orderFinance(db: DB, workspaceId: string, orderId: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)) });
  if (!o) throw new AppError("errors.notFound");
  const ptx = await db.query.paymentTransactions.findFirst({ where: eq(paymentTransactions.orderId, o.id) });
  const transfers = await db.query.manualTransferVerifications.findMany({ where: eq(manualTransferVerifications.orderId, o.id), orderBy: desc(manualTransferVerifications.createdAt) });
  return {
    ptx,
    transfers,
    shippingDifferenceSen: o.courierCostSen != null ? o.shippingSen - o.courierCostSen : null,
    paidSen: o.paymentStatus === "PAID" || o.paymentStatus === "PARTIALLY_REFUNDED" || o.paymentStatus === "REFUNDED" ? o.totalSen : 0,
  };
}

// ------------------------------------------------------------------ manual bank transfer

/** Buyer uploads proof (optional). It never marks the order paid on its own. */
export async function submitTransferProof(db: DB, orderId: string, input: { payerReference?: string; file?: File | null }) {
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o || o.paymentMethod !== "manual_transfer" || o.paymentStatus !== "PENDING") throw new AppError("errors.notFound");
  let proofAssetId: string | null = null;
  if (input.file && input.file.size) {
    const buf = Buffer.from(await input.file.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) throw new AppError("upload.tooLarge", { mb: 5 });
    const mime = detectImageMime(buf) ?? (buf.subarray(0, 5).toString("ascii") === "%PDF-" ? "application/pdf" : null);
    if (!mime) throw new AppError("upload.badType");
    proofAssetId = (await storeBytes(db, { workspaceId: o.workspaceId, buf, mime, kind: "payment_proof", originalName: `transfer-${o.number}` })).id;
  }
  await db.insert(manualTransferVerifications).values({ id: newId("mtv"), workspaceId: o.workspaceId, orderId: o.id, proofAssetId, payerReference: input.payerReference?.slice(0, 80) ?? null });
  await orderEvent(db, { workspaceId: o.workspaceId, orderId: o.id, type: "manual_transfer.proof_submitted", data: { hasFile: Boolean(proofAssetId) } });
  await notify(db, o.workspaceId, "order.transfer_proof", { orderId: o.id, orderNumber: o.number });
}

/**
 * Seller (owner/admin) confirms the money is in their bank. Audited; recorded as a direct-to-seller
 * payment — never part of Selltro Pay balances or settlements.
 */
export async function verifyManualTransfer(db: DB, ctx: { workspaceId: string; userId: string }, orderId: string, approve: boolean, note?: string) {
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.workspaceId, ctx.workspaceId))).for("update");
    if (!o || o.paymentMethod !== "manual_transfer" || o.paymentStatus !== "PENDING") throw new AppError("orders.notAwaitingTransfer");
    const pending = await tx.query.manualTransferVerifications.findFirst({ where: and(eq(manualTransferVerifications.orderId, o.id), eq(manualTransferVerifications.status, "submitted")) });
    if (pending) await tx.update(manualTransferVerifications).set({ status: approve ? "approved" : "rejected", reviewedBy: ctx.userId, reviewedAt: new Date(), note: note ?? null }).where(eq(manualTransferVerifications.id, pending.id));
    else await tx.insert(manualTransferVerifications).values({ id: newId("mtv"), workspaceId: ctx.workspaceId, orderId: o.id, status: approve ? "approved" : "rejected", reviewedBy: ctx.userId, reviewedAt: new Date(), note: note ?? "confirmed in bank statement" });
    if (approve) {
      await tx
        .update(orders)
        .set({ paymentStatus: "PAID", paidAt: new Date(), orderStatus: "CONFIRMED", stockReserved: false, fulfillmentStatus: o.deliveryMethod === "shipping" ? "READY_TO_SHIP" : o.fulfillmentStatus, updatedAt: new Date() })
        .where(eq(orders.id, o.id));
    }
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: approve ? "order.transfer_verified" : "order.transfer_rejected", entity: "order", entityId: o.id, data: { note: note ?? null } });
    await orderEvent(tx, { workspaceId: ctx.workspaceId, orderId: o.id, type: approve ? "manual_transfer.verified" : "manual_transfer.rejected", actorUserId: ctx.userId, data: { note: note ?? null } });
  });
}

/**
 * Seller cancels an order that hasn't shipped. Stock comes back (COD stock was committed at
 * checkout, so it's restored explicitly). Paid online orders must be refunded instead.
 */
export async function sellerCancelOrder(db: DB, ctx: { workspaceId: string; userId: string }, orderId: string, reason: string) {
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.workspaceId, ctx.workspaceId))).for("update");
    if (!o) throw new AppError("errors.notFound");
    if (o.paymentStatus === "PAID" && o.paymentMethod !== "cod") throw new AppError("orders.refundInstead");
    if (["SHIPPED", "DELIVERED", "BOOKING_PENDING", "FULFILLED"].includes(o.fulfillmentStatus)) throw new AppError("orders.alreadyShipped");
    if (o.orderStatus === "CANCELLED") return;
    const restore = o.stockReserved || o.paymentMethod === "cod";
    if (restore) {
      const items = await tx.query.orderItems.findMany({ where: eq(orderItems.orderId, o.id) });
      for (const it of items) {
        const p = await tx.query.products.findFirst({ where: eq(products.id, it.productId) });
        if (!p?.trackStock) continue;
        if (it.variantId) await tx.update(productVariants).set({ stock: sql`${productVariants.stock} + ${it.quantity}` }).where(eq(productVariants.id, it.variantId));
        else await tx.update(products).set({ stock: sql`${products.stock} + ${it.quantity}` }).where(eq(products.id, it.productId));
      }
    }
    await tx.update(orders).set({ orderStatus: "CANCELLED", paymentStatus: o.paymentStatus === "PENDING" ? "CANCELLED" : o.paymentStatus, codStatus: o.paymentMethod === "cod" ? "NOT_APPLICABLE" : o.codStatus, stockReserved: false, updatedAt: new Date() }).where(eq(orders.id, o.id));
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "order.cancelled_by_seller", entity: "order", entityId: o.id, data: { reason } });
    await orderEvent(tx, { workspaceId: ctx.workspaceId, orderId: o.id, type: "order.cancelled", actorUserId: ctx.userId, data: { reason } });
  });
}

/** Marks a pickup / no-courier order handed over (keeps the V2 "mark fulfilled" for non-shipping orders). */
export async function markCollected(db: DB, ctx: { workspaceId: string; userId: string }, orderId: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.workspaceId, ctx.workspaceId)) });
  if (!o) throw new AppError("errors.notFound");
  if (o.paymentStatus !== "PAID") throw new AppError("orders.notPaid");
  await db.update(orders).set({ fulfillmentStatus: "DELIVERED", orderStatus: "COMPLETED", updatedAt: new Date() }).where(eq(orders.id, o.id));
  await orderEvent(db, { workspaceId: ctx.workspaceId, orderId, type: "order.collected", actorUserId: ctx.userId });
}

export async function customerFor(db: DB, workspaceId: string, customerId: string) {
  return db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.workspaceId, workspaceId)) });
}
