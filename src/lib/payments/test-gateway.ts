import { hmacHex, safeEqualHex } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import type { CreatePaymentInput, CreatePaymentResult, PaymentGateway, PaymentOutcome, VerifiedEvent } from "./types";

/**
 * SellNow Test Gateway — moves NO money. Used for local development and end-to-end tests.
 * It exercises the same signed-webhook path as real gateways; orders are flagged is_test and
 * are excluded from revenue, KPIs and milestones. Disabled in production unless ALLOW_TEST_GATEWAY=true.
 */
export class TestGateway implements PaymentGateway {
  readonly provider = "test" as const;
  readonly isTest = true;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const ref = `tst_${input.orderId}`;
    return { providerRef: ref, redirectUrl: `/pay/test/${input.orderId}?k=${TestGateway.pageToken(input.orderId)}` };
  }

  static pageToken(orderId: string) {
    return hmacHex(`test-pay:${orderId}`).slice(0, 32);
  }

  static signEvent(orderId: string, outcome: PaymentOutcome, amountSen: number) {
    const body = JSON.stringify({ id: newId("tev"), orderId, outcome, amountSen, currency: "myr" });
    return { body, signature: hmacHex(`test-webhook:${body}`) };
  }

  static verifyWebhook(rawBody: string, signature: string): VerifiedEvent {
    if (!safeEqualHex(signature, hmacHex(`test-webhook:${rawBody}`))) throw new Error("Invalid test gateway signature");
    const e = JSON.parse(rawBody) as { id: string; orderId: string; outcome: PaymentOutcome; amountSen: number; currency: string };
    return {
      provider: "test",
      eventId: e.id,
      type: `test.${e.outcome}`,
      orderId: e.orderId,
      providerRef: `tst_${e.orderId}`,
      outcome: e.outcome,
      amountSen: e.amountSen,
      currency: e.currency,
      payload: e as unknown as Record<string, unknown>,
    };
  }
}
