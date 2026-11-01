import Link from "next/link";
import { Ticket } from "lucide-react";
import { cx } from "@/components/ui";

type T = (k: string, p?: Record<string, string | number>) => string;

/** "1 / 3 ads remaining" — free trial or this month's paid slots. */
export function QuotaPill({ t, quota }: { t: T; quota: { plan: "free" | "paid"; trialRemaining: number; monthlyRemaining: number; remaining: number } }) {
  const n = quota.plan === "paid" ? quota.monthlyRemaining : quota.trialRemaining;
  return (
    <Link href="/dashboard/creative?tab=settings#subscription" className={cx("inline-flex items-center gap-2 rounded-pill px-3.5 py-2 text-sm font-semibold ring-1", n > 0 ? "bg-white/80 ring-line" : "bg-warning-soft ring-warning/30 text-warning")}>
      <Ticket className="size-4 text-primary" />
      {t(quota.plan === "paid" ? "ads.quota.paid" : "ads.quota.free", { n, total: 3 })}
    </Link>
  );
}
