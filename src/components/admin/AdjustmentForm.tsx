"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { createAdjustmentAction } from "@/app/actions/admin";

/** Propose a seller balance adjustment; a different finance admin must approve it. */
export function AdjustmentForm() {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ ws: "", rm: "", reason: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <input placeholder="Tenant id (ws_…)" value={f.ws} onChange={(e) => setF({ ...f, ws: e.target.value.trim() })} className="h-8 w-36 rounded-lg border border-line bg-white px-2" />
      <input placeholder="RM (+credit / −debit)" value={f.rm} onChange={(e) => setF({ ...f, rm: e.target.value })} className="h-8 w-32 rounded-lg border border-line bg-white px-2" />
      <input placeholder="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className="h-8 w-44 rounded-lg border border-line bg-white px-2" />
      <button disabled={pending || !f.ws || !f.rm || f.reason.length < 5} className="h-8 rounded-pill bg-primary px-3 font-bold text-white disabled:opacity-50" onClick={() => start(async () => { const r = await createAdjustmentAction(f.ws, Math.round(Number(f.rm) * 100), f.reason); setMsg(r.ok ? "Proposed — awaiting a second approver" : t(r.error)); router.refresh(); })}>Propose</button>
      {msg && <span>{msg}</span>}
    </span>
  );
}
