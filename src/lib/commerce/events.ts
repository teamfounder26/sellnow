import { and, eq, ne, sql } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import { orders, orderItems, paymentEvents, products, productVariants, discountCodes, downloadEntitlements } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { hmacHex, sha256 } from "@/lib/crypto";
import { audit, notify, track } from "@/lib/audit";
import { log } from "@/lib/log";
import type { VerifiedEvent } from "@/lib/payments/types";
import { canTransitionPayment, type PaymentStatus } from "./payment-state";
import { releaseStock } from "./checkout";
import { evaluateOrderAchievements } from "@/lib/achievements/service";

export type ApplyResult = { status: "duplicate" | "ignored" | "applied" | "rejected"; orderId?: string; paymentStatus?: PaymentStatus; reason?: string };

const OUTCOME_TO_STATUS = { processing: "PROCESSING", paid: "PAID", failed: "FAILED", cancelled: "CANCELLED" } as const;

/** Deterministic raw download token for an entitlement (only its hash is stored). */
export function entitlementToken(entitlementId: string) {
  return `${entitlementId}.${hmacHex(`download:${entitlementId}`).slice(0, 32)}`;
}

async function grantEntitlements(tx: Tx, order: typeof orders.$inferSelect) {
  const items = await tx.query.orderItems.findMany({ where: and(eq(orderItems.orderId, order.id), eq(orderItems.productType, "digital")) });
  for (const it of items) {
    const p = await tx.query.products.findFirst({ where: and(eq(products.id, it.productId), eq(products.workspaceId, order.workspaceId)) });
    const assetId = p?.attributes.digitalAssetId;
    if (!p || !assetId) {
      log("error", "entitlement.missing_file", { orderId: order.id, productId: it.productId });
      continue;
    }
    const id = newId("ent");
    await tx
      .insert(downloadEntitlements)
      .values({
        id,
        workspaceId: order.workspaceId,
        orderId: order.id,
        productId: p.id,
        assetId,
        tokenHash: sha256(entitlementToken(id)),
        expiresAt: new Date(Date.now() + (p.attributes.downloadExpiryDays ?? 7) * 86400_000),
        maxDownloads: p.attributes.downloadLimit ?? 5,
      })
      .onConflictDoNothing();
  }
  return items.length;
}

/** Re-reserve stock when a payment succeeds after its reservation had been released. */
async function recommitStock(tx: Tx, order: typeof orders.$inferSelect): Promise<boolean> {
  let ok = true;
  const items = await tx.query.orderItems.findMany({ where: eq(orderItems.orderId, order.id) });
  for (const it of items) {
    const p = await tx.query.products.findFirst({ where: eq(products.id, it.productId) });
    if (!p?.trackStock) continue;
    const table = it.variantId ? productVariants : products;
    const id = it.variantId ?? it.productId;
    await tx.update(table).set({ stock: sql`${table.stock} - ${it.quantity}` }).where(eq(table.id, id));
    const row = it.variantId
      ? await tx.query.productVariants.findFirst({ where: eq(productVariants.id, id) })
      : await tx.query.products.findFirst({ where: eq(products.id, id) });
    if ((row?.stock ?? 0) < 0) ok = false;
  }
  return ok;
}

/**
 * Applies a VERIFIED provider event exactly once.
 *  - (provider, event id) is unique → duplicates are no-ops.
 *  - Amount and currency must match the server-side order total before PAID is accepted.
 *  - Transitions are enforced by the payment state machine.
 */
export async function applyPaymentEvent(db: DB, workspaceId: string, ev: VerifiedEvent): Promise<ApplyResult> {
  let result: ApplyResult = { status: "ignored" };
  let becamePaid: typeof orders.$inferSelect | null = null;
  await db.transaction(async (tx) => {
    const ins = await tx
      .insert(paymentEvents)
      .values({ id: newId("pev"), workspaceId, provider: ev.provider, providerEventId: ev.eventId, type: ev.type, payload: ev.payload })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });
    if (!ins.length) {
      result = { status: "duplicate" };
      return;
    }
    const eventRowId = ins[0]!.id;
    if (!ev.outcome) return;

    const where = ev.orderId
      ? and(eq(orders.id, ev.orderId), eq(orders.workspaceId, workspaceId))
      : and(eq(orders.providerRef, ev.providerRef ?? "__none__"), eq(orders.workspaceId, workspaceId), eq(orders.provider, ev.provider));
    const [order] = await tx.select().from(orders).where(where).for("update");
    if (!order) {
      result = { status: "rejected", reason: "order_not_found" };
      return;
    }
    await tx.update(paymentEvents).set({ orderId: order.id }).where(eq(paymentEvents.id, eventRowId));
    if (order.provider !== ev.provider) {
      result = { status: "rejected", orderId: order.id, reason: "provider_mismatch" };
      return;
    }
    const to = OUTCOME_TO_STATUS[ev.outcome];
    const from = order.paymentStatus as PaymentStatus;
    if (from === to) {
      result = { status: "ignored", orderId: order.id, paymentStatus: from };
      return;
    }
    if (to === "PAID") {
      if (ev.amountSen !== order.totalSen || (ev.currency ?? "").toLowerCase() !== "myr") {
        log("error", "payment.amount_mismatch", { orderId: order.id, expected: order.totalSen, got: ev.amountSen, currency: ev.currency });
        await notify(tx, workspaceId, "payment.amount_mismatch", { orderId: order.id, orderNumber: order.number });
        result = { status: "rejected", orderId: order.id, reason: "amount_mismatch" };
        return;
      }
      if (from === "CANCELLED") {
        // Money arrived for an order we already cancelled — never silently drop it.
        await notify(tx, workspaceId, "payment.after_cancel", { orderId: order.id, orderNumber: order.number });
        await audit(tx, { workspaceId, action: "payment.after_cancel", entity: "order", entityId: order.id });
        result = { status: "rejected", orderId: order.id, reason: "order_cancelled" };
        return;
      }
    }
    if (!canTransitionPayment(from, to)) {
      result = { status: "rejected", orderId: order.id, reason: `invalid_transition_${from}_${to}` };
      return;
    }

    const patch: Partial<typeof orders.$inferInsert> = { paymentStatus: to, updatedAt: new Date() };
    if (to === "FAILED" || to === "CANCELLED") {
      if (order.stockReserved) await releaseStock(tx, order.id, workspaceId);
      patch.stockReserved = false;
    }
    if (to === "PAID") {
      patch.paidAt = new Date();
      patch.stockReserved = false; // reservation is now committed
      if (!order.stockReserved && from === "FAILED") {
        const ok = await recommitStock(tx, order);
        if (!ok) await notify(tx, workspaceId, "stock.oversold", { orderId: order.id, orderNumber: order.number });
      }
      if (order.discountCodeId) {
        await tx.update(discountCodes).set({ redemptions: sql`${discountCodes.redemptions} + 1` }).where(eq(discountCodes.id, order.discountCodeId));
      }
      const items = await tx.query.orderItems.findMany({ where: eq(orderItems.orderId, order.id) });
      const digitalCount = await grantEntitlements(tx, order);
      if (digitalCount === items.length) patch.fulfillmentStatus = "DELIVERED_DIGITAL";
    }
    await tx.update(orders).set(patch).where(eq(orders.id, order.id));
    await tx.update(paymentEvents).set({ resultingStatus: to }).where(eq(paymentEvents.id, eventRowId));
    await audit(tx, { workspaceId, action: `payment.${to.toLowerCase()}`, entity: "order", entityId: order.id, data: { provider: ev.provider, eventId: ev.eventId } });
    if (to === "PAID") becamePaid = { ...order, ...patch } as typeof orders.$inferSelect;
    result = { status: "applied", orderId: order.id, paymentStatus: to };
  });

  if (becamePaid) {
    const o = becamePaid as typeof orders.$inferSelect;
    await track(db, "checkout_completed", { workspaceId, props: { isTest: o.isTest, provider: o.provider } });
    await notify(db, workspaceId, "order.paid", { orderId: o.id, orderNumber: o.number, totalSen: o.totalSen, isTest: o.isTest });
    if (!o.isTest) {
      const prior = await db.query.orders.findFirst({
        where: and(eq(orders.workspaceId, workspaceId), eq(orders.paymentStatus, "PAID"), eq(orders.isTest, false), ne(orders.id, o.id)),
      });
      if (!prior) {
        await track(db, "first_paid_order", { workspaceId });
        await notify(db, workspaceId, "milestone.first_sale", { orderId: o.id, totalSen: o.totalSen });
      }
      // Stickers are awarded only from this verified, server-side, non-test path.
      await evaluateOrderAchievements(db, workspaceId, o.id);
    }
  }
  return result;
}
