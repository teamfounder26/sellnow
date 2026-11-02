import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/** Superadmin building blocks (information-dense, same blue-and-glass identity). */
export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warning" | "success" }) {
  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-line backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={cx("mt-1 text-xl font-extrabold tabular-nums", tone === "danger" && "text-danger", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-3xl bg-white/85 p-5 shadow-sm ring-1 ring-line backdrop-blur", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Table({ head, rows, empty = "No records.", minWidth = 720 }: { head: ReactNode[]; rows: ReactNode[][]; empty?: string; minWidth?: number }) {
  if (!rows.length) return <p className="rounded-2xl bg-canvas p-4 text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="bg-canvas text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => <tr key={i} className="hover:bg-canvas/50">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

/** Minimal bar chart (no library). Values are real; empty months show as 0. */
export function Bars({ data, format }: { data: { m: string; v: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div className="flex h-32 items-end gap-1" role="img" aria-label={data.map((d) => `${d.m}: ${format ? format(d.v) : d.v}`).join(", ")}>
      {data.map((d) => (
        <div key={d.m} className="group flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t-md bg-primary/80 transition group-hover:bg-primary" style={{ height: `${Math.max(2, (d.v / max) * 100)}%` }} title={`${d.m}: ${format ? format(d.v) : d.v}`} />
          <span className="text-[9px] text-muted">{d.m.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

const TONES: Record<string, string> = {
  ok: "bg-success-soft text-success", ACTIVE: "bg-success-soft text-success", COMPLETED: "bg-success-soft text-success", VERIFIED: "bg-success-soft text-success", CONNECTED: "bg-success-soft text-success", PAID: "bg-success-soft text-success", active: "bg-success-soft text-success", published: "bg-success-soft text-success", matched: "bg-success-soft text-success",
  critical: "bg-danger-soft text-danger", FAILED: "bg-danger-soft text-danger", SUSPENDED: "bg-danger-soft text-danger", suspended: "bg-danger-soft text-danger", REJECTED: "bg-danger-soft text-danger", mismatch: "bg-danger-soft text-danger", UNKNOWN: "bg-danger-soft text-danger", REVERSED: "bg-danger-soft text-danger", ERROR: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning", ON_HOLD: "bg-warning-soft text-warning", PENDING_VERIFICATION: "bg-warning-soft text-warning", AWAITING_APPROVAL: "bg-warning-soft text-warning", AWAITING_FUNDING: "bg-warning-soft text-warning", payout_hold: "bg-warning-soft text-warning", flagged: "bg-warning-soft text-warning", AWAITING_ACCESS: "bg-warning-soft text-warning", PENDING: "bg-warning-soft text-warning", unreconciled: "bg-warning-soft text-warning",
};
export function Status({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="text-muted">—</span>;
  return <span className={cx("inline-flex rounded-pill px-2 py-0.5 text-[11px] font-bold", TONES[v] ?? "bg-canvas text-ink/70")}>{v.replace(/_/g, " ")}</span>;
}

export const rm = (sen: number | null | undefined) => (sen == null ? "—" : `RM ${((Number(sen) || 0) / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const dt = (d: Date | string | null | undefined) => (d ? new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(d)) : "—");
