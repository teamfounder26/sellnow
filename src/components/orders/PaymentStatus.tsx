import { Badge } from "@/components/ui";

const TONE = { PAID: "success", PENDING: "yellow", PROCESSING: "ai", FAILED: "danger", CANCELLED: "neutral", REFUNDED: "neutral", PARTIALLY_REFUNDED: "warning" } as const;

export function PaymentStatus({ status, label }: { status: string; label: string }) {
  return <Badge tone={TONE[status as keyof typeof TONE] ?? "neutral"}>{label}</Badge>;
}
