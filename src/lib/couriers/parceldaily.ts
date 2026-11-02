import { createHmac, timingSafeEqual } from "node:crypto";
import type { ShipmentStatus } from "@/lib/db/schema";
import type { BookingResult, Capability, CourierAdapter, Party, QuoteOption, ShipmentRequest, TrackingUpdate } from "./types";

/**
 * ParcelDaily partner API (api-docs.parceldaily.com, OpenAPI 1.0). Platform-managed: SellNow holds
 * ONE token + merchant id (PARCELDAILY_TOKEN, PARCELDAILY_MERCHANT_ID, PARCELDAILY_ENV=sandbox|live,
 * PARCELDAILY_WEBHOOK_SECRET). Sellers never see these.
 *
 * Workflow: QUOTE → CREATE (/v1/partner/order/create) → CHECKOUT (/v1/partner/order/pay, deducts
 * credit, returns `connote`) → TRACK (webhook / v2 track). Units: kg and RM decimals (converted from
 * grams/sen here). No quote ids: create must send `serviceProvider` + the exact quoted `price`.
 */
const COURIERS = ["jnt", "poslaju", "ninjavan", "dhl", "citylink", "spx", "lex", "kex", "best", "lineclear", "teleport", "aramex", "sfstandard", "sfeconomy"] as const;
const LABEL: Record<string, string> = { jnt: "J&T Express", poslaju: "Pos Laju", ninjavan: "Ninja Van", dhl: "DHL eCommerce", citylink: "City-Link", spx: "SPX Express", lex: "Lazada Express", kex: "Kerry Express", best: "Best Express", lineclear: "Line Clear", teleport: "Teleport", aramex: "Aramex", sfstandard: "SF Standard", sfeconomy: "SF Economy" };

let fetchImpl: typeof fetch | null = null;
export function __setParcelDailyFetchForTests(f: typeof fetch | null) {
  fetchImpl = f;
}

export function parcelDailyConfigured() {
  return Boolean(process.env.PARCELDAILY_TOKEN && process.env.PARCELDAILY_MERCHANT_ID);
}
function baseUrl() {
  return process.env.PARCELDAILY_ENV === "live" ? "https://api.parceldaily.com" : "https://api.sandbox.parceldaily.com";
}

export class ParcelDailyError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number | null,
    public readonly retryable: boolean,
    public readonly body: unknown = null,
  ) {
    super(message);
  }
}

const toKg = (g: number) => Math.max(0.1, Math.round(g / 10) / 100); // grams → kg, 2dp, min 0.1
const toRm = (sen: number) => Math.round(sen) / 100;
const toSen = (rm: string | number | null | undefined) => (rm === "" || rm == null ? null : Math.round(Number(rm) * 100));
/** National number without country code, 8–10 digits ("0123456789" → "123456789"). */
export function pdPhone(p: string) {
  const d = p.replace(/\D/g, "").replace(/^60/, "").replace(/^0/, "");
  return d.slice(0, 10);
}
function address(p: Party) {
  return { fullName: p.name.slice(0, 120), countryCode: "+60", phone: pdPhone(p.phone), ...(p.email ? { email: p.email } : {}), line1: p.line1.slice(0, 130), ...(p.line2 ? { line2: p.line2.slice(0, 130) } : {}), city: p.city, postcode: p.postcode, state: p.state, country: "Malaysia" };
}

/** ParcelDaily status group → platform shipment state (case-insensitive; the docs mix "Picked up"/"Picked Up"). */
export function mapStatusGroup(group: string | null | undefined): ShipmentStatus | null {
  switch ((group ?? "").trim().toLowerCase()) {
    case "shipment data received":
    case "processing":
      return "BOOKED";
    case "waiting pickup":
      return "PICKUP_PENDING";
    case "picked up":
      return "PICKED_UP";
    case "in transit":
    case "custom matter":
      return "IN_TRANSIT";
    case "on delivery":
    case "self collect":
      return "OUT_FOR_DELIVERY";
    case "delivered":
      return "DELIVERED";
    case "problematic processing":
    case "return in transit":
      return "DELIVERY_FAILED";
    case "returned":
      return "RETURNED";
    case "cancelled":
    case "cancelled by user":
    case "cancel requested by user":
    case "refunded":
      return "CANCELLED";
    default:
      return null; // e.g. "Closed", COD groups — not a parcel movement
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}, raw = false): Promise<T> {
  let res: Response;
  try {
    res = await (fetchImpl ?? fetch)(`${baseUrl()}${path}`, {
      method: init.method ?? "POST",
      headers: { token: process.env.PARCELDAILY_TOKEN ?? "", merchantid: process.env.PARCELDAILY_MERCHANT_ID ?? "", "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new ParcelDailyError(`network: ${String(e)}`, null, true);
  }
  if (raw) {
    if (!res.ok) throw new ParcelDailyError(`HTTP ${res.status}`, res.status, res.status >= 500 || res.status === 429);
    return Buffer.from(await res.arrayBuffer()) as T;
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = (json as { message?: string; error?: unknown } | null)?.message ?? JSON.stringify((json as { error?: unknown } | null)?.error ?? text).slice(0, 300);
    throw new ParcelDailyError(`HTTP ${res.status}: ${msg}`, res.status, res.status >= 500 || res.status === 429, json);
  }
  return json as T;
}

export class ParcelDailyAdapter implements CourierAdapter {
  readonly provider = "parceldaily" as const;
  readonly name = "ParcelDaily";
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(["verifyConnection", "getShippingQuote", "createShipment", "createBulkShipments", "confirmShipment", "cancelShipment", "getTrackingStatus", "downloadAWB", "downloadBulkAWB", "trackingWebhook", "cod", "accountBalance"]);
  constructor(private readonly webhookUrl: string | null = null) {}

  availability() {
    return parcelDailyConfigured() ? { live: true, reason: null } : { live: false, reason: "platform_credentials_missing" };
  }

  async balanceSen() {
    const r = await call<{ data?: { credit?: number | string } }>("/v1/partner/account-info", { method: "GET" });
    return toSen(r.data?.credit ?? 0) ?? 0;
  }

  async verifyConnection() {
    try {
      await this.balanceSen();
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  async quote(from: Party, to: Party, weightGrams: number, codSen: number): Promise<QuoteOption[]> {
    const r = await call<{ success?: Record<string, unknown> }>("/v1/partner/merchant/quote", {
      body: { origin: from.postcode, destination: to.postcode, originCountry: "Malaysia", destinationCountry: "Malaysia", weight: toKg(weightGrams), ...(codSen > 0 ? { cod: toRm(codSen) } : {}) },
    });
    const s = r.success ?? {};
    const out: QuoteOption[] = [];
    for (const c of COURIERS) {
      const price = toSen(s[`${c}Price`] as string | undefined);
      // An empty/missing price means this courier can't take the parcel (with COD when cod > 0).
      if (price == null || price <= 0) continue;
      out.push({ service: c, courierName: LABEL[c] ?? c, priceSen: price, codSupported: codSen > 0 });
    }
    return out.sort((a, b) => a.priceSen - b.priceSen);
  }

  /** Create only (cart). Returns ParcelDaily's order id (`success.objectId`). */
  async create(req: ShipmentRequest) {
    const r = await call<{ success?: { objectId?: string } }>("/v1/partner/order/create", {
      body: {
        serviceProvider: req.service,
        pickupAddress: address(req.sender),
        clientAddress: address(req.receiver),
        kg: toKg(req.weightGrams),
        price: toRm(req.quotedPriceSen),
        content: req.content.slice(0, 50),
        content_value: toRm(req.contentValueSen),
        ...(req.codSen > 0 ? { cod: toRm(req.codSen) } : {}),
        ...(req.service === "ninjavan" ? { quantity: 1, contentValueCurrency: "MYR" } : {}),
        isDropoff: false,
        reference: req.reference,
      },
    });
    const id = r.success?.objectId;
    if (!id) throw new ParcelDailyError("create returned no objectId", 200, false, r);
    return id;
  }

  /** Checkout = confirmed + paid from ParcelDaily credit. Returns the connote (tracking number). */
  async checkout(orderId: string) {
    const r = await call<{ data?: { statusCode?: number; connote?: string } }>("/v1/partner/order/pay", {
      body: { orderId, ...(this.webhookUrl ? { trackingWebhookUrl: this.webhookUrl, checkoutWebhookUrl: this.webhookUrl } : {}) },
    });
    if (r.data?.statusCode && r.data.statusCode !== 200) throw new ParcelDailyError(`checkout status ${r.data.statusCode}`, r.data.statusCode, false, r);
    return { connote: r.data?.connote ?? null, raw: r as Record<string, unknown> };
  }

  async book(req: ShipmentRequest): Promise<BookingResult> {
    const externalOrderId = await this.create(req);
    const { connote, raw } = await this.checkout(externalOrderId);
    return { externalOrderId, trackingNumber: connote, status: connote ? "AWB_READY" : "BOOKED", providerStatus: "checked_out", costSen: req.quotedPriceSen, raw };
  }

  async cancel(externalOrderId: string) {
    await call("/v1/partner/order/cancel", { body: { orderId: externalOrderId } });
  }

  async track(trackingNumber: string): Promise<TrackingUpdate[]> {
    const r = await call<{ status?: string; statusGroup?: string; date?: string; orderTracking?: { status: string; place?: string; date: string }[] }>("/v2/partner/track/", { body: { connote: trackingNumber } });
    const st = mapStatusGroup(r.statusGroup);
    return st ? [{ status: st, providerStatus: r.status ?? r.statusGroup ?? "", occurredAt: r.date ? new Date(`${r.date.replace(" ", "T")}+08:00`) : new Date(), description: r.orderTracking?.[0]?.place ?? null }] : [];
  }

  async awbPdf(trackingNumber: string) {
    const buf = await call<Buffer>("/v1/partner/consign-pdf/", { body: { connote: trackingNumber } }, true);
    if (buf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new ParcelDailyError("consign-pdf did not return a PDF", 200, false);
    return buf;
  }
}

/**
 * Webhook signature (only when a secret is set on the ParcelDaily account):
 * X-Webhook-Signature = hex HMAC-SHA256(timestamp + "." + rawBody), 300 s freshness window.
 * SellNow REQUIRES the secret — unsigned deliveries are refused.
 */
export function verifyParcelDailyWebhook(rawBody: string, timestamp: string | null, signature: string | null, now = Date.now()) {
  const secret = process.env.PARCELDAILY_WEBHOOK_SECRET;
  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
