import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillplzSecrets, CreatePaymentInput, CreatePaymentResult, PaymentGateway, VerifiedEvent } from "./types";

/**
 * Billplz v3 adapter (Malaysian FPX gateway). Implemented against Billplz's published v3 API
 * (POST /api/v3/bills with HTTP Basic auth, X-Signature callbacks). It has NOT yet been exercised
 * against a live Billplz sandbox from this codebase — verify with sandbox credentials before going live.
 */
const HOSTS = { test: "https://www.billplz-sandbox.com", live: "https://www.billplz.com" } as const;

export class BillplzGateway implements PaymentGateway {
  readonly provider = "billplz" as const;
  readonly isTest: boolean;
  constructor(
    private secrets: BillplzSecrets,
    private mode: "test" | "live",
  ) {
    this.isTest = mode === "test";
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const body = new URLSearchParams({
      collection_id: this.secrets.collectionId,
      email: input.customer.email,
      name: input.customer.name.slice(0, 255),
      amount: String(input.amountSen),
      callback_url: input.callbackUrl,
      redirect_url: input.successUrl,
      description: input.description.slice(0, 200),
      reference_1_label: "Order",
      reference_1: input.orderId,
    });
    if (input.customer.phone) body.set("mobile", input.customer.phone);
    const res = await fetch(`${HOSTS[this.mode]}/api/v3/bills`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.secrets.apiKey}:`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) throw new Error(`Billplz create bill failed (${res.status})`);
    const bill = (await res.json()) as { id?: string; url?: string };
    if (!bill.id || !bill.url) throw new Error("Billplz returned an unexpected response");
    return { providerRef: bill.id, redirectUrl: bill.url };
  }

  /** X-Signature: HMAC-SHA256 over "key+value" pairs sorted ascending, joined by "|". */
  static signature(params: Record<string, string>, key: string) {
    const source = Object.keys(params)
      .filter((k) => k !== "x_signature")
      .map((k) => `${k}${params[k]}`)
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
      .join("|");
    return createHmac("sha256", key).update(source).digest("hex");
  }

  static verifyCallback(params: Record<string, string>, secrets: BillplzSecrets): VerifiedEvent {
    const given = params.x_signature ?? "";
    const expected = BillplzGateway.signature(params, secrets.xSignatureKey);
    const a = Buffer.from(given, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) throw new Error("Invalid Billplz X-Signature");
    const paid = params.paid === "true";
    return {
      provider: "billplz",
      eventId: `${params.id}:${params.paid}:${params.paid_at ?? ""}:${params.state ?? ""}`,
      type: "bill.callback",
      orderId: null, // resolved by providerRef (bill id)
      providerRef: params.id ?? null,
      outcome: paid ? "paid" : params.state === "deleted" ? "cancelled" : null,
      amountSen: params.paid_amount ? Number(params.paid_amount) : params.amount ? Number(params.amount) : null,
      currency: "myr",
      payload: Object.fromEntries(Object.entries(params).filter(([k]) => k !== "x_signature")),
    };
  }
}
