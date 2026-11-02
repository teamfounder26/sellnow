import { requireAdmin } from "@/lib/admin/guard";
import { REPORTS } from "@/lib/admin/reports";
import { Panel } from "@/components/admin/ui";

export const metadata = { title: "Reports" };

const SETS: { title: string; items: { kind: keyof typeof REPORTS; status?: string; label: string }[] }[] = [
  { title: "Tenant reports", items: [{ kind: "tenants", label: "Tenant directory (incl. activity, plan, risk)" }] },
  { title: "Financial reports", items: [{ kind: "payments", label: "Payment transactions" }, { kind: "payments", status: "REFUNDED", label: "Refunded payments" }, { kind: "settlements", label: "Settlement batches & payouts" }, { kind: "settlements", status: "FAILED", label: "Payout failures" }] },
  { title: "Order reports", items: [{ kind: "orders", label: "All orders" }, { kind: "orders", status: "paid", label: "Paid orders" }, { kind: "orders", status: "cod", label: "COD orders" }, { kind: "orders", status: "cancelled", label: "Cancelled orders" }, { kind: "orders", status: "refunded", label: "Refunded orders" }] },
  { title: "Courier reports", items: [{ kind: "couriers", label: "Bookings, costs, margins, AWB, failures, COD" }] },
  { title: "AI reports", items: [{ kind: "ai", label: "Usage by tenant, credits, model cost, failures" }] },
];

export default async function ReportsAdmin({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const a = await requireAdmin("reports.view");
  const canExport = a.can("reports.export");
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Report center</h1>
      <form className="flex flex-wrap items-end gap-2 text-sm" action="/admin/reports">
        <label>From<input type="date" name="from" defaultValue={sp.from} className="ml-1 h-9 rounded-xl border border-line bg-white px-2" /></label>
        <label>To<input type="date" name="to" defaultValue={sp.to} className="ml-1 h-9 rounded-xl border border-line bg-white px-2" /></label>
        <button className="h-9 rounded-xl bg-ink px-3 font-semibold text-white">Apply</button>
        <span className="text-xs text-muted">Default: last 30 days. Personal data is {a.can("reports.exportPersonal") ? "included" : "masked"} for your role. Every export is audited.</span>
      </form>
      <div className="grid gap-4 xl:grid-cols-2">
        {SETS.map((s) => (
          <Panel key={s.title} title={s.title}>
            <ul className="space-y-2 text-sm">
              {s.items.map((i) => {
                const q = new URLSearchParams(Object.entries({ kind: i.kind, status: i.status, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][]);
                return <li key={i.label} className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2"><span>{i.label}<span className="block text-[11px] text-muted">{REPORTS[i.kind].source}</span></span>{canExport ? <a className="whitespace-nowrap text-xs font-bold text-primary" href={`/api/admin/reports?${q}`}>CSV ↓</a> : <span className="text-xs text-muted">no export permission</span>}</li>;
              })}
            </ul>
          </Panel>
        ))}
      </div>
      <p className="text-xs text-muted">XLSX export and background generation for very large reports are not built yet; CSV exports are capped (10–20k rows) and open in Excel.</p>
    </>
  );
}
