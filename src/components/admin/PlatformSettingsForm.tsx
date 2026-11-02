"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { setConfigAction } from "@/app/actions/admin";
import type { PlatformConfig } from "@/lib/finance/settings";

/** Platform configuration editor. Each section saves separately with a password re-check. */
export function PlatformSettingsForm({ initial, environment }: { initial: PlatformConfig; environment: string | null }) {
  const t = useT();
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = <K extends keyof PlatformConfig>(key: K) =>
    start(async () => {
      const r = await setConfigAction(key, c[key], pw);
      setMsg(r.ok ? `Saved ${key}` : t(r.error));
      router.refresh();
    });
  const input = "mt-0.5 block h-8 w-full rounded-lg border border-line bg-white px-2 text-sm";
  const btn = (key: keyof PlatformConfig) => <button disabled={pending || !pw} onClick={() => save(key)} className="h-8 rounded-pill bg-primary px-3 text-xs font-bold text-white disabled:opacity-50">Save</button>;
  return (
    <div className="space-y-5 text-sm">
      <label className="block max-w-xs text-xs font-semibold">Your password (required to save)<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className={input} /></label>
      {msg && <p className="text-sm">{msg}</p>}
      <fieldset className="space-y-2 rounded-2xl p-4 ring-1 ring-line">
        <legend className="px-1 font-bold">Kill switches (environment: {environment ?? "unavailable"})</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={c.payoutsEnabled} onChange={(e) => setC({ ...c, payoutsEnabled: e.target.checked })} /> Real payouts enabled (Billplz Payment Order) {btn("payoutsEnabled")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={c.selltroPayLiveApproved} onChange={(e) => setC({ ...c, selltroPayLiveApproved: e.target.checked })} /> Live Selltro Pay approved (contract, KYC and merchant-of-record model confirmed) {btn("selltroPayLiveApproved")}</label>
      </fieldset>
      <fieldset className="grid gap-3 rounded-2xl p-4 ring-1 ring-line md:grid-cols-3">
        <legend className="px-1 font-bold">Processing fee recovered per paid order</legend>
        <label className="text-xs font-semibold">Fixed (sen)<input type="number" min={0} value={c.processingFee.fixedSen} onChange={(e) => setC({ ...c, processingFee: { ...c.processingFee, fixedSen: Number(e.target.value) } })} className={input} /></label>
        <label className="text-xs font-semibold">Percentage (bps)<input type="number" min={0} value={c.processingFee.bps} onChange={(e) => setC({ ...c, processingFee: { ...c.processingFee, bps: Number(e.target.value) } })} className={input} /></label>
        <span className="self-end">{btn("processingFee")}</span>
        <p className="text-xs text-muted md:col-span-3">Set to the confirmed Billplz rate. The platform fee per package is set in Packages (bps).</p>
      </fieldset>
      <fieldset className="grid gap-3 rounded-2xl p-4 ring-1 ring-line md:grid-cols-3">
        <legend className="px-1 font-bold">Settlement schedule (T+1 calendar day, Asia/Kuala_Lumpur)</legend>
        <label className="text-xs font-semibold">Cutoff time<input type="time" value={c.settlement.cutoffTime} onChange={(e) => setC({ ...c, settlement: { ...c.settlement, cutoffTime: e.target.value } })} className={input} /></label>
        <label className="text-xs font-semibold">Execution time (cron)<input type="time" value={c.settlement.executionTime} onChange={(e) => setC({ ...c, settlement: { ...c.settlement, executionTime: e.target.value } })} className={input} /></label>
        <label className="text-xs font-semibold">Dual approval from (RM)<input type="number" min={0} value={c.settlement.dualApprovalThresholdSen / 100} onChange={(e) => setC({ ...c, settlement: { ...c.settlement, dualApprovalThresholdSen: Math.round(Number(e.target.value) * 100) } })} className={input} /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.settlement.requireApproval} onChange={(e) => setC({ ...c, settlement: { ...c.settlement, requireApproval: e.target.checked } })} /> Require batch approval</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={c.settlement.advanceSettlement} onChange={(e) => setC({ ...c, settlement: { ...c.settlement, advanceSettlement: e.target.checked } })} /> Advance settlement before Billplz confirms collection (needs approved, funded arrangement)</label>
        <span className="self-end">{btn("settlement")}</span>
      </fieldset>
      <fieldset className="grid gap-3 rounded-2xl p-4 ring-1 ring-line md:grid-cols-3">
        <legend className="px-1 font-bold">ParcelDaily</legend>
        <label className="text-xs font-semibold">Low credit alert (RM)<input type="number" min={0} value={c.parceldaily.lowCreditAlertSen / 100} onChange={(e) => setC({ ...c, parceldaily: { ...c.parceldaily, lowCreditAlertSen: Math.round(Number(e.target.value) * 100) } })} className={input} /></label>
        <span className="self-end">{btn("parceldaily")}</span>
      </fieldset>
    </div>
  );
}
