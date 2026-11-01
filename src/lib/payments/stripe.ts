import Stripe from "stripe";
import type { CreatePaymentInput, CreatePaymentResult, PaymentGateway, StripeSecrets, VerifiedEvent } from "./types";

/**
 * Stripe Checkout adapter (official SDK). The merchant supplies their own Stripe account keys.
 * Payment methods are taken from the merchant's Stripe dashboard (FPX / cards / GrabPay where enabled).
 */
export class StripeGateway implements PaymentGateway {
  readonly provider = "stripe" as const;
  readonly isTest: boolean;
  private stripe: Stripe;

  constructor(private secrets: StripeSecrets) {
    this.stripe = new Stripe(secrets.secretKey);
    this.isTest = secrets.secretKey.startsWith("sk_test_");
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        currency: "myr",
        customer_email: input.customer.email,
        client_reference_id: input.orderId,
        metadata: { orderId: input.orderId },
        payment_intent_data: { metadata: { orderId: input.orderId } },
        // Totals were computed server-side; a single line keeps discounts/shipping exact.
        line_items: [
          {
            quantity: 1,
            price_data: { currency: "myr", unit_amount: input.amountSen, product_data: { name: input.description.slice(0, 250) } },
          },
        ],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      { idempotencyKey: `checkout-${input.orderId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { providerRef: session.id, redirectUrl: session.url };
  }

  async refund(paymentIntentId: string, amountSen: number, orderId: string) {
    return this.stripe.refunds.create({ payment_intent: paymentIntentId, amount: amountSen }, { idempotencyKey: `refund-${orderId}-${amountSen}` });
  }

  async retrieveSession(id: string) {
    return this.stripe.checkout.sessions.retrieve(id);
  }

  /** Verifies the Stripe-Signature header and normalizes the event. Throws on bad signature. */
  static verifyWebhook(rawBody: string, signature: string, secrets: StripeSecrets): VerifiedEvent {
    const stripe = new Stripe(secrets.secretKey);
    const event = stripe.webhooks.constructEvent(rawBody, signature, secrets.webhookSecret);
    const base = { provider: "stripe" as const, eventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown> };
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        const outcome =
          event.type === "checkout.session.expired"
            ? "cancelled"
            : event.type === "checkout.session.async_payment_failed"
              ? "failed"
              : s.payment_status === "paid"
                ? "paid"
                : "processing";
        return {
          ...base,
          orderId: s.metadata?.orderId ?? s.client_reference_id ?? null,
          providerRef: s.id,
          outcome,
          amountSen: s.amount_total ?? null,
          currency: s.currency ?? null,
        };
      }
      default:
        return { ...base, orderId: null, providerRef: null, outcome: null, amountSen: null, currency: null };
    }
  }
}
