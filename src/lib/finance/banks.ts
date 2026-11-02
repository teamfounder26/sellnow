/** Malaysian banks with their SWIFT/BIC codes (Billplz Payment Order `bank_code` is the SWIFT code). */
export const MY_BANKS = [
  { code: "MBBEMYKL", name: "Maybank" },
  { code: "CIBBMYKL", name: "CIMB Bank" },
  { code: "PBBEMYKL", name: "Public Bank" },
  { code: "RHBBMYKL", name: "RHB Bank" },
  { code: "HLBBMYKL", name: "Hong Leong Bank" },
  { code: "ARBKMYKL", name: "AmBank" },
  { code: "BIMBMYKL", name: "Bank Islam" },
  { code: "BKRMMYKL", name: "Bank Rakyat" },
  { code: "BSNAMYK1", name: "Bank Simpanan Nasional (BSN)" },
  { code: "PHBMMYKL", name: "Affin Bank" },
  { code: "MFBBMYKL", name: "Alliance Bank" },
  { code: "BMMBMYKL", name: "Bank Muamalat" },
  { code: "AGOBMYKL", name: "Agrobank" },
  { code: "OCBCMYKL", name: "OCBC Bank" },
  { code: "UOVBMYKL", name: "UOB Malaysia" },
  { code: "HBMBMYKL", name: "HSBC Bank Malaysia" },
  { code: "SCBLMYKX", name: "Standard Chartered" },
  { code: "CITIMYKL", name: "Citibank" },
  { code: "RJHIMYKL", name: "Al Rajhi Bank" },
  { code: "KFHOMYKL", name: "Kuwait Finance House" },
  { code: "AFBQMYKL", name: "MBSB Bank" },
] as const;

export function bankByCode(code: string) {
  return MY_BANKS.find((b) => b.code === code) ?? null;
}

/** Format check only — it does NOT prove ownership. Ownership is verified by a reviewer (or a verification service, when available). */
export function validAccountNumber(n: string) {
  return /^\d{8,17}$/.test(n);
}

export function maskAccount(last4: string) {
  return `•••• ${last4}`;
}
