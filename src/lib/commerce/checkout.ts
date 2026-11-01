import { and, eq, gte, lt, max, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "@/lib/db";
import { orders, orderItems, products, productVariants, customers, storefronts, storefrontVersions, ads, type ShippingAddress } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { hmacHex, safeEqualHex } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { lockWorkspace } from "@/lib/billing/credits";
import { computeQuote, type CartLine, type QuoteLine } from "./quote";
import { getPaymentIntegration } from "@/lib/payments/integrations";
import { gatewayFor } from "@/lib/payments";
import { audit, track } from "@/lib/audit";
import { log } from "@/lib/log";
import { canTransitionPayment, type PaymentStatus } from "./payment-state";

export const MY_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Pulau Pinang",
  "Sabah", "Sarawak", "Selangor", "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya",
] as const;

export const RESERVATION_MINUTES = 60;

export const checkoutSchema = z.object({
  idempotencyKey: z.string().min(16).max(64),
  lines: z.array(z.object({ productId: z.string(), variantId: z.string().nullable().optional(), quantity: z.number().int() })).min(1).max(20),
  couponCode: z.string().max(40).optional().nullable(),
  /** SellNow ad id carried from the ad's destination link (?sn_ad=…); verified server-side. */
  adRef: z.string().regex(/^ad_[a-z0-9]{16}$/).optional().nullable(),
  deliveryMethod: z.enum(["shipping", "pickup"]).nullable().optional(),
  customer: z.object({
    name: z.string().trim().min(2, "checkout.nameRequired").max(120),
    email: z.string().trim().toLowerCase().email("checkout.emailInvalid").max(200),
    // Malaysian mobile: +60 / 60 / 0 followed by 9–10 digits
    phone: z
      .string()
      .trim()
      .regex(/^(\+?6?0)[0-9]{8,10}$/, "checkout.phoneInvalid")
      .optional()
      .or(z.literal("")),
    marketingConsent: z.boolean().default(false),
  }),
  address: z
    .object({
      line1: z.string().trim().min(3).max(200),
      line2: z.string().trim().max(200).optional(),
      postcode: z.string().trim().regex(/^\d{5}$/, "checkout.postcodeInvalid"),
      city: z.string().trim().min(2).max(80),
      state: z.enum(MY_STATES),
    })
    .nullable()
    .optional(),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

/** Atomic stock deduction: only succeeds when enough stock remains (prevents overselling). */
async function reserveStock(tx: Tx, workspaceId: string, line: QuoteLine) {
  if (!line.trackStock) return;
  if (line.variantId) {
    const r = await tx
      .update(productVariants)
      .set({ stock: sql`${productVariants.stock} - ${line.quantity}` })
      .where(and(eq(productVariants.id, line.variantId), eq(productVariants.workspaceId, workspaceId), gte(productVariants.stock, line.quantity)))
      .returning({ id: productVariants.id });
    if (!r.length) throw new AppError("checkout.outOfStock", { name: line.name });
  } else {
    const r = await tx
      .update(products)
      .set({ stock: sql`${products.stock} - ${line.quantity}` })
      .where(and(eq(products.id, line.productId), eq(products.workspaceId, workspaceId), gte(products.stock, line.quantity)))
      .returning({ id: products.id });
    if (!r.length) throw new AppError("checkout.outOfStock", { name: line.name });
  }
}

export async function releaseStock(tx: Tx, orderId: string, workspaceId: string) {
  const items = await tx.query.orderItems.findMany({ where: and(eq(orderItems.orderId, orderId), eq(orderItems.workspaceId, workspaceId)) });
  for (const it of items) {
    const p = await tx.query.products.findFirst({ where: eq(products.id, it.productId) });
    if (!p?.trackStock) continue;
    if (it.variantId) {
      await tx.update(productVariants).set({ stock: sql`${productVariants.stock} + ${it.quantity}` }).where(eq(productVariants.id, it.variantId));
    } else {
      await tx.update(products).set({ stock: sql`${products.stock} + ${it.quantity}` }).where(eq(products.id, it.productId));
    }
  }
}

/**
 * Creates a PENDING order with server-computed totals and reserved stock, then opens a payment
 * with the workspace's connected gateway. Duplicate submissions (same idempotency key) return the
 * original order instead of creating a new one.
 */
export async function createCheckout(db: DB, workspaceId: string, raw: CheckoutInput, urls: { base: string; slug: string }) {
  const input = checkoutSchema.parse(raw);
  const existing = await db.query.orders.findFirst({ where: eq(orders.idempotencyKey, input.idempotencyKey) });
  if (existing) {
    if (existing.workspaceId !== workspaceId) throw new AppError("errors.forbidden");
    if (existing.paymentStatus === "PENDING" && existing.paymentUrl) return { orderId: existing.id, redirectUrl: existing.paymentUrl, duplicate: true };
    throw new AppError("checkout.alreadySubmitted");
  }

  // A site published in enquiry mode has no online checkout — refuse server-side, whatever the client sends.
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, workspaceId) });
  const live = sf?.publishedVersionId ? await db.query.storefrontVersions.findFirst({ where: eq(storefrontVersions.id, sf.publishedVersionId) }) : null;
  if (live?.content.salesMode === "enquiry") throw new AppError("checkout.enquiryOnly");

  // Only attribute to an ad that really belongs to this store.
  const adRef = input.adRef ? ((await db.query.ads.findFirst({ where: and(eq(ads.id, input.adRef), eq(ads.workspaceId, workspaceId)) }))?.id ?? null) : null;

  const integration = await getPaymentIntegration(db, workspaceId);
  if (!integration) throw new AppError("checkout.paymentsUnavailable");
  const gateway = gatewayFor(integration);

  await releaseExpiredReservations(db, workspaceId);

  const orderId = newId("ord");
  let order: typeof orders.$inferSelect;
  let quoteLines: QuoteLine[] = [];
  try {
    order = await db.transaction(async (tx) => {
      await lockWorkspace(tx, workspaceId);
      const quote = await computeQuote(tx, workspaceId, { lines: input.lines as CartLine[], couponCode: input.couponCode, deliveryMethod: input.deliveryMethod });
      quoteLines = quote.lines;
      if (quote.requiresShippingAddress && !input.address) throw new AppError("checkout.addressRequired");
      for (const l of quote.lines) await reserveStock(tx, workspaceId, l);

      const [cust] = await tx
        .insert(customers)
        .values({
          id: newId("cus"),
          workspaceId,
          name: input.customer.name,
          email: input.customer.email,
          phone: input.customer.phone || null,
          marketingConsent: input.customer.marketingConsent,
          source: "checkout",
        })
        .onConflictDoUpdate({
          target: [customers.workspaceId, customers.email],
          set: { name: input.customer.name, ...(input.customer.phone ? { phone: input.customer.phone } : {}) },
        })
        .returning();
      const [n] = await tx.select({ n: max(orders.number) }).from(orders).where(eq(orders.workspaceId, workspaceId));
      const address: ShippingAddress | null = quote.requiresShippingAddress && input.address ? { ...input.address, country: "MY" } : null;
      const [o] = await tx
        .insert(orders)
        .values({
          id: orderId,
          workspaceId,
          number: (n?.n ?? 1000) + 1,
          customerId: cust!.id,
          subtotalSen: quote.subtotalSen,
          discountSen: quote.discountSen,
          shippingSen: quote.shippingSen,
          totalSen: quote.totalSen,
          discountCodeId: quote.discountCodeId,
          shippingAddress: address,
          deliveryMethod: quote.deliveryMethod,
          provider: gateway.provider,
          isTest: gateway.isTest,
          idempotencyKey: input.idempotencyKey,
          adRef,
          stockReserved: quote.lines.some((l) => l.trackStock),
        })
        .returning();
      await tx.insert(orderItems).values(
        quote.lines.map((l) => ({
          id: newId("oit"),
          workspaceId,
          orderId,
          productId: l.productId,
          variantId: l.variantId,
          productType: l.productType,
          name: l.name,
          unitPriceSen: l.unitPriceSen,
          quantity: l.quantity,
          totalSen: l.totalSen,
        })),
      );
      await audit(tx, { workspaceId, action: "order.created", entity: "order", entityId: orderId, data: { totalSen: quote.totalSen, provider: gateway.provider } });
      return o!;
    });
  } catch (e) {
    // Unique violation on idempotency key from a concurrent duplicate submit.
    const again = await db.query.orders.findFirst({ where: eq(orders.idempotencyKey, input.idempotencyKey) });
    if (again?.paymentUrl) return { orderId: again.id, redirectUrl: again.paymentUrl, duplicate: true };
    throw e;
  }
  await track(db, "checkout_started", { workspaceId, props: { provider: gateway.provider, isTest: gateway.isTest } });

  const orderUrl = `${urls.base}/s/${urls.slug}/order/${order.id}?k=${orderViewToken(order.id)}`;
  try {
    const payment = await gateway.createPayment({
      orderId: order.id,
      orderNumber: order.number,
      amountSen: order.totalSen,
      currency: "MYR",
      description: `#${order.number} ${quoteLines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}`,
      customer: { name: input.customer.name, email: input.customer.email, phone: input.customer.phone || null },
      lines: quoteLines,
      successUrl: orderUrl,
      cancelUrl: `${urls.base}/s/${urls.slug}/checkout?cancelled=${order.id}`,
      callbackUrl: `${urls.base}/api/webhooks/${gateway.provider}/${integration.id}`,
    });
    await db.update(orders).set({ providerRef: payment.providerRef, paymentUrl: payment.redirectUrl }).where(eq(orders.id, order.id));
    return { orderId: order.id, redirectUrl: payment.redirectUrl, duplicate: false };
  } catch (e) {
    log("error", "payment.create_failed", { orderId: order.id, provider: gateway.provider, error: String(e) });
    await cancelOrder(db, order.id, workspaceId, "payment_create_failed");
    throw new AppError("checkout.gatewayError");
  }
}

export function orderViewToken(orderId: string) {
  return hmacHex(`order-view:${orderId}`).slice(0, 40);
}
export function verifyOrderViewToken(orderId: string, token: string | undefined | null) {
  return Boolean(token) && safeEqualHex(token!, orderViewToken(orderId));
}

/** Cancels an unpaid order and releases its stock reservation (idempotent). */
export async function cancelOrder(db: DB, orderId: string, workspaceId: string, reason: string) {
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.workspaceId, workspaceId))).for("update");
    if (!o || !canTransitionPayment(o.paymentStatus as PaymentStatus, "CANCELLED")) return;
    if (o.stockReserved) await releaseStock(tx, o.id, workspaceId);
    await tx.update(orders).set({ paymentStatus: "CANCELLED", stockReserved: false, updatedAt: new Date() }).where(eq(orders.id, o.id));
    await audit(tx, { workspaceId, action: "order.cancelled", entity: "order", entityId: o.id, data: { reason } });
  });
}

/** Releases stock held by unpaid orders older than the reservation window. */
export async function releaseExpiredReservations(db: DB, workspaceId?: string) {
  const cutoff = new Date(Date.now() - RESERVATION_MINUTES * 60 * 1000);
  const stale = await db.query.orders.findMany({
    where: and(
      eq(orders.stockReserved, true),
      lt(orders.createdAt, cutoff),
      sql`${orders.paymentStatus} in ('PENDING','FAILED')`,
      ...(workspaceId ? [eq(orders.workspaceId, workspaceId)] : []),
    ),
    limit: 200,
  });
  for (const o of stale) await cancelOrder(db, o.id, o.workspaceId, "reservation_expired");
  return stale.length;
}
