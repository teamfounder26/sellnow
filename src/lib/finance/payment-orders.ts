import { createHmac, timingSafeEqual } from "node:crypto";
import { platformBillplzSecrets } from "./selltro-pay";

/**
 * Billplz Payment Order API (v5) — the disbursement rail (DuitNow, can run on weekends/holidays,
 * limited by the pre-funded Payment Order Limit). Separate product from bill collection.
 * Implemented from support.billplz.com/api:
 *   POST /api/v5/payment_orders            checksum: payment_order_collection_id, bank_account_number, total, epoch
 *   GET  /api/v5/payment_orders/{id}       checksum: payment_order_id, epoch
 *   GET  /api/v5/payment_order_limit       checksum: epoch
 *   callback                               checksum: id, bank_account_number, status, total, reference_id, epoch
 * Checksum = HMAC-SHA512(values concatenated without separators, X Signature key), hex.
 * NOT yet exercised against a Billplz sandbox from this codebase.
 */
export type PaymentOrder = { id: string; status: string; total: number; reference_id?: string | null; bank_account_number?: string };

let fetchImpl: typeof fetch | null = null;
export function __setPayoutFetchForTests(f: typeof fetch | null) {
  fetchImpl = f;
}
const doFetch: typeof fetch = (...a) => (fetchImpl ?? fetch)(...a);

export function poChecksum(values: (string | number)[], key: string) {
  return createHmac("sha512", key).update(values.map(String).join("")).digest("hex");
}

export class PayoutError extends Error {
  constructor(
    public readonly kind: "rejected" | "insufficient_limit" | "unknown",
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
  }
}

export function payoutConfigured() {
  const s = platformBillplzSecrets();
  return Boolean(s.apiKey && s.xSignatureKey && process.env.BILLPLZ_PAYMENT_ORDER_COLLECTION_ID);
}

function base(live: boolean) {
  return live ? "https://www.billplz.com" : "https://www.billplz-sandbox.com";
}
function auth() {
  return `Basic ${Buffer.from(`${platformBillplzSecrets().apiKey}:`).toString("base64")}`;
}
const epoch = () => Math.floor(Date.now() / 1000);

/** Maps Billplz payment-order status to our attempt status. */
export function mapPoStatus(s: string): "processing" | "completed" | "failed" | "refunded" {
  if (s === "completed") return "completed";
  if (s === "refunded") return "refunded";
  if (s === "cancelled") return "failed";
  return "processing"; // processing | enquiring | executing | reviewing
}

export async function createPaymentOrder(p: { live: boolean; bankCode: string; accountNumber: string; name: string; description: string; totalSen: number; referenceId: string }): Promise<PaymentOrder> {
  const key = platformBillplzSecrets().xSignatureKey;
  const collectionId = process.env.BILLPLZ_PAYMENT_ORDER_COLLECTION_ID!;
  const e = epoch();
  const body = new URLSearchParams({
    payment_order_collection_id: collectionId,
    bank_code: p.bankCode,
    bank_account_number: p.accountNumber,
    name: p.name.slice(0, 255),
    // "Special characters are not allowed" (max 200).
    description: p.description.replace(/[^A-Za-z0-9 ]/g, " ").slice(0, 200),
    total: String(p.totalSen),
    reference_id: p.referenceId,
    epoch: String(e),
    checksum: poChecksum([collectionId, p.accountNumber, p.totalSen, e], key),
  });
  let res: Response;
  try {
    res = await doFetch(`${base(p.live)}/api/v5/payment_orders`, { method: "POST", headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    // We can't know whether Billplz accepted it → never retry blindly.
    throw new PayoutError("unknown", String(err));
  }
  const text = await res.text();
  if (res.status >= 500) throw new PayoutError("unknown", `HTTP ${res.status} ${text.slice(0, 200)}`, res.status);
  if (res.status === 422 && /enough payments/i.test(text)) throw new PayoutError("insufficient_limit", text.slice(0, 300), 422);
  if (!res.ok) throw new PayoutError("rejected", `HTTP ${res.status} ${text.slice(0, 300)}`, res.status);
  try {
    return JSON.parse(text) as PaymentOrder;
  } catch {
    throw new PayoutError("unknown", "unparseable response");
  }
}

export async function getPaymentOrder(live: boolean, id: string): Promise<PaymentOrder> {
  const e = epoch();
  const url = `${base(live)}/api/v5/payment_orders/${encodeURIComponent(id)}?epoch=${e}&checksum=${poChecksum([id, e], platformBillplzSecrets().xSignatureKey)}`;
  const res = await doFetch(url, { headers: { Authorization: auth() }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new PayoutError("unknown", `HTTP ${res.status}`, res.status);
  return (await res.json()) as PaymentOrder;
}

/** Remaining pre-funded Payment Order Limit (sen). */
export async function getPaymentOrderLimit(live: boolean): Promise<number> {
  const e = epoch();
  const url = `${base(live)}/api/v5/payment_order_limit?epoch=${e}&checksum=${poChecksum([e], platformBillplzSecrets().xSignatureKey)}`;
  const res = await doFetch(url, { headers: { Authorization: auth() }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new PayoutError("unknown", `HTTP ${res.status}`, res.status);
  const j = (await res.json()) as { total?: string | number };
  return Number(j.total ?? 0);
}

export function verifyPayoutCallback(params: Record<string, string>) {
  const key = platformBillplzSecrets().xSignatureKey;
  const expected = poChecksum([params.id ?? "", params.bank_account_number ?? "", params.status ?? "", params.total ?? "", params.reference_id ?? "", params.epoch ?? ""], key);
  const a = Buffer.from(params.checksum ?? "", "hex");
  const b = Buffer.from(expected, "hex");
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid payment order checksum");
  return { id: params.id!, status: params.status!, total: Number(params.total), referenceId: params.reference_id ?? null };
}
