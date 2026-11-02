import type { CourierProvider, ShipmentStatus, ShipperProfile } from "@/lib/db/schema";

/**
 * Unified courier adapter. Every adapter DECLARES what it can do; the UI and services check the
 * capability before offering an action. Nothing is ever simulated for a real courier.
 */
export type Capability =
  | "connectAccount" | "verifyConnection" | "getShippingQuote" | "createShipment" | "createBulkShipments"
  | "confirmShipment" | "cancelShipment" | "getTrackingStatus" | "downloadAWB" | "downloadBulkAWB" | "trackingWebhook" | "cod" | "accountBalance";

export type Party = { name: string; phone: string; email?: string | null; line1: string; line2?: string; postcode: string; city: string; state: string };
export type ShipmentRequest = {
  reference: string; // our idempotency reference (unique per shipment attempt)
  sender: Party;
  receiver: Party;
  weightGrams: number;
  content: string;
  contentValueSen: number;
  codSen: number;
  service: string; // provider service code (ParcelDaily: serviceProvider)
  quotedPriceSen: number;
};
export type QuoteOption = { service: string; courierName: string; priceSen: number; codSupported: boolean };
export type BookingResult = { externalOrderId: string; trackingNumber: string | null; status: ShipmentStatus; providerStatus: string; costSen: number; raw: Record<string, unknown> };
export type TrackingUpdate = { status: ShipmentStatus; providerStatus: string; occurredAt: Date; description?: string | null };

export interface CourierAdapter {
  readonly provider: CourierProvider;
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;
  /** Why the integration is not live (credentials/contract/docs missing), or null when usable. */
  availability(): { live: boolean; reason: string | null };
  verifyConnection?(): Promise<{ ok: boolean; detail?: string }>;
  quote?(from: Party, to: Party, weightGrams: number, codSen: number): Promise<QuoteOption[]>;
  /** Create + confirm (ParcelDaily: create → checkout). Must be safe to call once per reference. */
  book?(req: ShipmentRequest): Promise<BookingResult>;
  cancel?(externalOrderId: string): Promise<void>;
  track?(trackingNumber: string): Promise<TrackingUpdate[]>;
  awbPdf?(trackingNumber: string): Promise<Buffer>;
  balanceSen?(): Promise<number>;
}

export const COURIER_NAMES: Record<CourierProvider, string> = { parceldaily: "ParcelDaily", jnt: "J&T Express", poslaju: "Pos Laju", ninjavan: "Ninja Van", spx: "SPX Express", dhl: "DHL" };
export type { ShipperProfile };
