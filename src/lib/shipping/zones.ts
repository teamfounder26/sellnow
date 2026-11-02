/**
 * Malaysian address normalisation for postage rules. The postcode decides the region (East
 * Malaysia ranges are unambiguous); the buyer-typed state is only checked against it, never trusted.
 */
export type Region = "peninsular" | "sabah" | "sarawak" | "labuan";
export const REGIONS: Region[] = ["peninsular", "sabah", "sarawak", "labuan"];

export function regionForPostcode(postcode: string): Region | null {
  if (!/^\d{5}$/.test(postcode)) return null;
  const n = Number(postcode);
  if (n >= 87000 && n <= 87999) return "labuan";
  if (n >= 88000 && n <= 91999) return "sabah";
  if (n >= 93000 && n <= 98999) return "sarawak";
  if (n >= 1000 && n <= 86999) return "peninsular";
  return null;
}

const STATE_REGION: Record<string, Region> = {
  Sabah: "sabah",
  Sarawak: "sarawak",
  "W.P. Labuan": "labuan",
};

export function regionForState(state: string): Region {
  return STATE_REGION[state] ?? "peninsular";
}

/** The postcode and the chosen state must agree on the region (catches typos before a courier does). */
export function addressConsistent(postcode: string, state: string) {
  const r = regionForPostcode(postcode);
  return r !== null && r === regionForState(state);
}

export type Destination = { postcode: string; state: string; region: Region };

export function inPostcodeRanges(postcode: string, ranges: { from: string; to: string }[]) {
  const n = Number(postcode);
  return ranges.some((r) => n >= Number(r.from) && n <= Number(r.to));
}
