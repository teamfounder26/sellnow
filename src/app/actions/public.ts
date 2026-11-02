"use server";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { storefronts, orders, paymentTransactions } from "@/lib/db/schema";
import { captureLead } from "@/lib/crm/service";
import { createCheckout, type CheckoutInput } from "@/lib/commerce/checkout";
import { computeQuote, type Quote } from "@/lib/commerce/quote";
import { verifyOrderViewToken } from "@/lib/commerce/checkout";
import { submitTransferProof } from "@/lib/orders/service";
import { getPublicStorefront } from "@/lib/storefront/service";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, appUrl } from "@/lib/http";
import { TestGateway } from "@/lib/payments/test-gateway";
import { applyPaymentEvent } from "@/lib/commerce/events";
import { testGatewayAllowed } from "@/lib/payments/integrations";
import { safeEqualHex } from "@/lib/crypto";

export type EnquiryState = { ok?: boolean; error?: string } | undefined;

async function publishedWorkspace(slug: string) {
  const db = await getDb();
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.slug, slug) });
  if (!sf || sf.status !== "PUBLISHED") throw new AppError("errors.storeNotFound");
  return { db, workspaceId: sf.workspaceId };
}

export async function submitEnquiryAction(_: EnquiryState, form: FormData): Promise<EnquiryState> {
  try {
    if (!rateLimit(`enquiry:${await clientIp()}`, 10, 60 * 60 * 1000).ok) return { error: "errors.rateLimited" };
    const { db, workspaceId } = await publishedWorkspace(String(form.get("slug") ?? ""));
    await captureLead(db, workspaceId, {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      message: String(form.get("message") ?? ""),
      productId: String(form.get("productId") ?? "") || undefined,
      consent: form.get("consent") === "on",
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof ZodError) return { error: "errors.validation" };
    if (e instanceof AppError) return { error: e.code };
    console.error(e);
    return { error: "errors.unexpected" };
  }
}

/** Live quote for the checkout UI. The authoritative total is recomputed again at order creation. */
export async function quoteAction(slug: string, input: { lines: CheckoutInput["lines"]; couponCode?: string | null; deliveryMethod?: "shipping" | "pickup" | null; destination?: { postcode: string; state: string } | null; paymentMethod?: "online" | "cod" | "manual_transfer" }): Promise<{ ok: true; quote: Quote } | { ok: false; error: string; params?: Record<string, string | number> }> {
  try {
    const { db, workspaceId } = await publishedWorkspace(slug);
    return { ok: true, quote: await computeQuote(db, workspaceId, { lines: input.lines.map((l) => ({ ...l, variantId: l.variantId ?? null })), couponCode: input.couponCode, deliveryMethod: input.deliveryMethod, destination: input.destination && /^\d{5}$/.test(input.destination.postcode) ? input.destination : null, paymentMethod: input.paymentMethod }) };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.code, params: e.params };
    return { ok: false, error: "errors.unexpected" };
  }
}

export async function checkoutAction(slug: string, input: CheckoutInput): Promise<{ ok: true; redirectUrl: string } | { ok: false; error: string; params?: Record<string, string | number>; fields?: string[] }> {
  try {
    if (!rateLimit(`checkout:${await clientIp()}`, 20, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const pub = await getPublicStorefront(await getDb(), slug);
    if (!pub) return { ok: false, error: "errors.storeNotFound" };
    const r = await createCheckout(await getDb(), pub.storefront.workspaceId, input, { base: await appUrl(), slug });
    return { ok: true, redirectUrl: r.redirectUrl };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message.includes(".") ? e.issues[0].message : "errors.validation", fields: e.issues.map((i) => i.path.join(".")) };
    if (e instanceof AppError) return { ok: false, error: e.code, params: e.params };
    console.error(e);
    return { ok: false, error: "errors.unexpected" };
  }
}

/**
 * Test gateway "payment page" submission. Builds a signed event and feeds it through the same
 * verification + idempotent apply path used by real gateway webhooks. No money moves.
 */
export async function testGatewayPayAction(orderId: string, token: string, outcome: "paid" | "failed") {
  if (!testGatewayAllowed()) throw new AppError("payments.testGatewayDisabled");
  if (!safeEqualHex(token, TestGateway.pageToken(orderId))) throw new AppError("errors.forbidden");
  const db = await getDb();
  const o = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!o || (o.provider !== "test" && o.provider !== "selltro_pay")) throw new AppError("errors.notFound");
  if (o.provider === "selltro_pay") {
    // Only Selltro Pay orders created in test mode use the simulated page.
    const ptx = await db.query.paymentTransactions.findFirst({ where: eq(paymentTransactions.orderId, o.id) });
    if (ptx?.environment !== "test") throw new AppError("errors.notFound");
  }
  const { body, signature } = TestGateway.signEvent(o.id, outcome, o.totalSen);
  await applyPaymentEvent(db, o.workspaceId, TestGateway.verifyWebhook(body, signature, o.provider as "test" | "selltro_pay"));
  return { ok: true };
}

/** Buyer submits a transfer reference/proof for a manual bank transfer order (token-protected link). */
export async function submitTransferProofAction(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const orderId = String(form.get("orderId") ?? "");
    if (!verifyOrderViewToken(orderId, String(form.get("token") ?? ""))) return { ok: false, error: "errors.forbidden" };
    if (!rateLimit(`proof:${await clientIp()}`, 10, 60 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const file = form.get("file");
    await submitTransferProof(await getDb(), orderId, { payerReference: String(form.get("reference") ?? ""), file: file instanceof File && file.size ? file : null });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.code : "errors.unexpected" };
  }
}
