import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { orders, orderItems, customers, paymentEvents, downloadEntitlements, integrations } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { canTransitionPayment, type PaymentStatus } from "./payment-state";
import { readSecrets } from "@/lib/payments/integrations";
import { StripeGateway } from "@/lib/payments/stripe";
import type { StripeSecrets } from "@/lib/payments/types";

export async function listOrders(db: DB, workspaceId: string, opts: { status?: PaymentStatus; limit?: number } = {}) {
  return db
    .select({ order: orders, customer: { name: customers.name, email: customers.email } })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.workspaceId, workspaceId), ...(opts.status ? [eq(orders.paymentStatus, opts.status)] : [])))
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 100);
}

export async function getOrder(db: DB, workspaceId: string, orderId: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId)) });
  if (!o) throw new AppError("errors.notFound");
  const [items, customer, events, entitlements] = await Promise.all([
    db.query.orderItems.findMany({ where: eq(orderItems.orderId, o.id) }),
    db.query.customers.findFirst({ where: eq(customers.id, o.customerId) }),
    db.query.paymentEvents.findMany({ where: eq(paymentEvents.orderId, o.id), orderBy: desc(paymentEvents.createdAt) }),
    db.query.downloadEntitlements.findMany({ where: eq(downloadEntitlements.orderId, o.id) }),
  ]);
  return { order: o, items, customer: customer!, events, entitlements };
}

export async function markFulfilled(db: DB, ctx: { workspaceId: string; userId: string }, orderId: string) {
  const { order } = await getOrder(db, ctx.workspaceId, orderId);
  if (order.paymentStatus !== "PAID") throw new AppError("orders.notPaid");
  await db.update(orders).set({ fulfillmentStatus: "FULFILLED", updatedAt: new Date() }).where(eq(orders.id, order.id));
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "order.fulfilled", entity: "order", entityId: order.id });
}

/**
 * Refunds (owner/admin only — enforced by the caller's role check).
 * Stripe refunds are executed through the Stripe API; Billplz has no refund API, so the merchant
 * refunds in Billplz first and records it here; test-gateway orders are recorded directly.
 */
export async function refundOrder(db: DB, ctx: { workspaceId: string; userId: string }, orderId: string, amountSen: number) {
  const { order, events } = await getOrder(db, ctx.workspaceId, orderId);
  const remaining = order.totalSen - order.refundedSen;
  if (!Number.isInteger(amountSen) || amountSen <= 0 || amountSen > remaining) throw new AppError("orders.badRefundAmount");
  const to: PaymentStatus = amountSen === remaining ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (!canTransitionPayment(order.paymentStatus as PaymentStatus, to)) throw new AppError("orders.notRefundable");

  if (order.provider === "stripe") {
    const integ = await db.query.integrations.findFirst({ where: and(eq(integrations.workspaceId, ctx.workspaceId), eq(integrations.provider, "stripe")) });
    if (!integ) throw new AppError("payments.notConfigured");
    const gw = new StripeGateway(readSecrets<StripeSecrets>(integ));
    const session = await gw.retrieveSession(order.providerRef!);
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!pi) throw new AppError("orders.notRefundable");
    await gw.refund(pi, amountSen, order.id);
  }
  void events;
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ paymentStatus: to, refundedSen: sql`${orders.refundedSen} + ${amountSen}`, updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.workspaceId, ctx.workspaceId)));
    if (to === "REFUNDED") {
      await tx.update(downloadEntitlements).set({ revokedAt: new Date() }).where(eq(downloadEntitlements.orderId, order.id));
    }
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "order.refunded", entity: "order", entityId: order.id, data: { amountSen, provider: order.provider } });
  });
}
