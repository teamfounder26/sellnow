export type PaymentStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";

const ALLOWED: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["PROCESSING", "PAID", "FAILED", "CANCELLED"],
  PROCESSING: ["PAID", "FAILED", "CANCELLED"],
  // A verified late success after a failed attempt (e.g. retried FPX) is accepted.
  FAILED: ["PAID", "CANCELLED"],
  CANCELLED: [],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  REFUNDED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) {
  return ALLOWED[from].includes(to);
}

export function isTerminal(s: PaymentStatus) {
  return ALLOWED[s].length === 0;
}
