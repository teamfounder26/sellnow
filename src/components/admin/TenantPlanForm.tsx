"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { tenantPlanAction } from "@/app/actions/admin";

/** Change a tenant's package (now or at period end). Reason required; audited and logged to billing history. */
export function TenantPlanForm({ workspaceId, plans }: { workspaceId: string; plans: { id: string; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ planId: plans[0]?.id ?? "", reason: "", when: "now" as "now" | "period_end" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-2 text-xs">
      <select value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })} className="h-8 rounded-lg border border-line bg-white px-2">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select value={f.when} onChange={(e) => setF({ ...f, when: e.target.value as "now" })} className="h-8 rounded-lg border border-line bg-white px-2"><option value="now">Now</option><option value="period_end">At period end</option></select>
      <input placeholder="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className="h-8 w-48 rounded-lg border border-line bg-white px-2" />
      <button disabled={pending || f.reason.length < 5} className="h-8 rounded-pill bg-primary px-3 font-bold text-white disabled:opacity-50" onClick={() => start(async () => { const r = await tenantPlanAction(workspaceId, f.planId, f.reason, f.when); setMsg(r.ok ? "Plan updated" : t(r.error)); router.refresh(); })}>Change plan</button>
      {msg && <span>{msg}</span>}
    </div>
  );
}
