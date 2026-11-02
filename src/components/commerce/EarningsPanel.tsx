import { Download } from "lucide-react";
import type { getT } from "@/lib/i18n/server";
import { formatMYR } from "@/lib/money";
import { Badge, Card, Notice, cx } from "@/components/ui";
import type { sellerEarnings } from "@/lib/finance/settlement";

type T = Awaited<ReturnType<typeof getT>>["t"];
type Data = Awaited<ReturnType<typeof sellerEarnings>>;
const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { COMPLETED: "success", FAILED: "danger", ON_HOLD: "warning", REVERSED: "danger", UNKNOWN: "warning" };

/** Seller earnings (Selltro Pay only). Server component — every figure comes from the ledger. */
export function EarningsPanel({ t, locale, d, active, canStatement }: { t: T; locale: "ms" | "en"; d: Data; active: boolean; canStatement: boolean }) {
  const m = (sen: number) => formatMYR(sen, locale);
  const date = (s: string | Date | null | undefined) => (s ? new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeZone: "Asia/Kuala_Lumpur" }).format(typeof s === "string" ? new Date(`${s}T12:00:00+08:00`) : s) : t("earn.none"));
  return (
    <section id="earnings" className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{t("earn.title")}</h2>
        <p className="text-sm text-muted">{t("earn.sub")}</p>
      </div>
      {!active && <Notice tone="blue">{t("earn.notActive")}</Notice>}
      {d.environment === "test" && <Notice tone="warning">{t("earn.simulated")}</Notice>}
      {d.holds > 0 && <Notice tone="danger">{t("earn.holdNotice")}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["totalPaid", m(d.totalPaidSen)],
          ["available", m(d.availableSen)],
          ["pending", m(d.pendingSen)],
          ["inProgress", m(d.inProgressSen)],
          ["onHold", m(d.onHoldSen)],
          ["next", date(d.nextSettlementDate)],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-muted">{t(`earn.${k}`)}</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">{t("earn.last")}: {d.lastCompleted ? `${m(d.lastCompleted.netSen)} · ${date(d.lastCompleted.completedAt)}` : t("earn.none")}</p>
      {d.settlements.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <tr>{["reference", "period", "gross", "procFee", "platFee", "refunds", "adjustments", "net", "status", "completed", "bank"].map((k) => <th key={k} className={cx("px-3 py-3", ["gross", "procFee", "platFee", "refunds", "adjustments", "net"].includes(k) && "text-right")}>{t(`earn.${k}`)}</th>)}<th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.settlements.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-3 font-mono text-xs">{s.reference}</td>
                  <td className="px-3 py-3">{date(s.scheduledFor)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{m(s.grossSen)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">−{m(s.processingFeeSen)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">−{m(s.platformFeeSen)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">−{m(s.refundsSen)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{m(s.adjustmentsSen)}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{m(s.netSen)}</td>
                  <td className="px-3 py-3"><Badge tone={TONE[s.status] ?? "neutral"}>{t(`earn.st.${s.status}`)}</Badge></td>
                  <td className="px-3 py-3">{s.completedAt ? date(s.completedAt) : "—"}</td>
                  <td className="px-3 py-3 text-xs">{s.bankSnapshot ? `${s.bankSnapshot.bankName} •••• ${s.bankSnapshot.last4}` : "—"}</td>
                  <td className="px-3 py-3">{canStatement && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/api/settlements/${s.id}/statement`}><Download className="size-3.5" /> {t("earn.statement")}</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-muted">{t("earn.disclaimer")}</p>
      <p className="text-xs text-muted">{t("earn.legacyNote")}</p>
    </section>
  );
}
