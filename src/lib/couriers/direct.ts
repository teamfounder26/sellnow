import type { CourierProvider } from "@/lib/db/schema";
import type { Capability, CourierAdapter } from "./types";
import { COURIER_NAMES } from "./types";

/**
 * Seller's own courier accounts (J&T, Pos Laju, Ninja Van, SPX, DHL). Each needs approved partner
 * API credentials and the provider's current documentation before an API adapter can be built and
 * verified — SPX and the J&T Open Platform are restricted to approved users; DHL Express (MyDHL) and
 * DHL eCommerce are different APIs. Until then these adapters declare NO API capability and the
 * UI offers a clearly labelled manual workflow (book in the courier's own system, record the
 * tracking number here). Nothing is ever simulated as a real booking.
 */
const NOTES: Record<Exclude<CourierProvider, "parceldaily">, string> = {
  jnt: "J&T Express Malaysia Open Platform — partner credentials + signing spec required.",
  poslaju: "Pos Malaysia / SendParcel Pro API — client id/secret, account number and approved scopes required.",
  ninjavan: "Ninja Van shipper API (api-docs.ninjavan.co) — shipper client id/secret for MY required; adapter not yet verified against a sandbox.",
  spx: "SPX Express merchant API is restricted to approved partners — no public documentation.",
  dhl: "Choose DHL eCommerce Malaysia or MyDHL Express — different credentials and APIs.",
};

class AwaitingAccessAdapter implements CourierAdapter {
  readonly capabilities: ReadonlySet<Capability> = new Set();
  readonly name: string;
  constructor(readonly provider: Exclude<CourierProvider, "parceldaily">) {
    this.name = COURIER_NAMES[provider];
  }
  availability() {
    return { live: false, reason: "awaiting_integration_access" };
  }
  note() {
    return NOTES[this.provider];
  }
}

export function directAdapter(p: Exclude<CourierProvider, "parceldaily">) {
  return new AwaitingAccessAdapter(p);
}
export const DIRECT_PROVIDERS = Object.keys(NOTES) as Exclude<CourierProvider, "parceldaily">[];
export const directNote = (p: Exclude<CourierProvider, "parceldaily">) => NOTES[p];
