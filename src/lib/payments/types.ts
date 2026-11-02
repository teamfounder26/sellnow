export type PaymentProvider = "stripe" | "billplz" | "test" | "selltro_pay";

export type CreatePaymentInput = {
  orderId: string;
  orderNumber: number;
  amountSen: number;
  currency: "MYR";
  description: string;
  customer: { name: string; email: string; phone?: string | null };
  lines: { name: string; unitPriceSen: number; quantity: number }[];
  successUrl: string;
  cancelUrl: string;
  callbackUrl: string;
};

export type CreatePaymentResult = { providerRef: string; redirectUrl: string };

/** Normalized outcome derived from a verified provider event. */
export type PaymentOutcome = "processing" | "paid" | "failed" | "cancelled";

export type VerifiedEvent = {
  provider: PaymentProvider;
  eventId: string;
  type: string;
  orderId: string | null;
  providerRef: string | null;
  outcome: PaymentOutcome | null;
  amountSen: number | null;
  currency: string | null;
  payload: Record<string, unknown>;
};

export interface PaymentGateway {
  provider: PaymentProvider;
  isTest: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
}

export type StripeSecrets = { secretKey: string; webhookSecret: string };
export type BillplzSecrets = { apiKey: string; xSignatureKey: string; collectionId: string };
