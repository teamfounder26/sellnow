"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { savePlanAction } from "@/app/actions/admin";
import type { PlanEntitlements } from "@/lib/db/schema";

type Plan = { id: string; name: string; status: "active" | "inactive" | "archived"; monthlySen: number; annualSen: number | null; trialDays: number; monthlyCredits: number; transactionFeeBps: number; entitlements: PlanEntitlements; sortOrder: number };
const BLANK: Plan = { id: "", name: "", status: "inactive", monthlySen: 0, annualSen: null, trialDays: 0, monthlyCredits: 100, transactionFeeBps: 0, sortOrder: 10, entitlements: { publishStorefront: true, checkout: true, maxProducts: 10, maxWorkspaces: 1, maxWebsites: 1, maxMembers: 3, creativeStudio: true, marketing: false, salesAssistant: false, advancedAnalytics: false, courierAccess: true, monthlyAdsStudioAds: 3 } };

export function PlanEditor({ plan, canEdit }: { plan: Plan | null; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [p, setP] = useState<Plan>(plan ?? BLANK);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const num = (label: string, v: number | null, set: (n: number | null) => void, money = false) => (
    <label className="text-xs font-semibold">{label}<input disabled={!canEdit} inputMode="decimal" defaultValue={v == null ? "" : money ? (v / 100).toFixed(2) : v} onChange={(e) => set(e.target.value === "" ? null : money ? Math.round(Number(e.target.value) * 100) : Number(e.target.value))} className="mt-0.5 block h-8 w-full rounded-lg border border-line bg-white px-2" /></label>
  );
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="text-xs font-semibold">Id<input disabled={!canEdit || Boolean(plan)} value={p.id} onChange={(e) => setP({ ...p, id: e.target.value })} className="mt-0.5 block h-8 w-full rounded-lg border border-line bg-white px-2" /></label>
        <label className="text-xs font-semibold">Name<input disabled={!canEdit} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className="mt-0.5 block h-8 w-full rounded-lg border border-line bg-white px-2" /></label>
        <label className="text-xs font-semibold">Status<select disabled={!canEdit} value={p.status} onChange={(e) => setP({ ...p, status: e.target.value as Plan["status"] })} className="mt-0.5 block h-8 w-full rounded-lg border border-line bg-white px-2"><option>active</option><option>inactive</option><option>archived</option></select></label>
        {num("Sort", p.sortOrder, (n) => setP({ ...p, sortOrder: n ?? 0 }))}
        {num("Monthly (RM)", p.monthlySen, (n) => setP({ ...p, monthlySen: n ?? 0 }), true)}
        {num("Annual (RM)", p.annualSen, (n) => setP({ ...p, annualSen: n }), true)}
        {num("Trial days", p.trialDays, (n) => setP({ ...p, trialDays: n ?? 0 }))}
        {num("AI credits / month", p.monthlyCredits, (n) => setP({ ...p, monthlyCredits: n ?? 0 }))}
        {num("Selltro Pay fee (bps)", p.transactionFeeBps, (n) => setP({ ...p, transactionFeeBps: n ?? 0 }))}
        {(["maxProducts", "maxWorkspaces", "maxWebsites", "maxMembers", "monthlyAdsStudioAds"] as const).map((k) => <span key={k}>{num(k, p.entitlements[k], (n) => setP({ ...p, entitlements: { ...p.entitlements, [k]: n ?? 0 } }))}</span>)}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {(["publishStorefront", "checkout", "creativeStudio", "marketing", "salesAssistant", "advancedAnalytics", "courierAccess"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1"><input type="checkbox" disabled={!canEdit} checked={p.entitlements[k]} onChange={(e) => setP({ ...p, entitlements: { ...p.entitlements, [k]: e.target.checked } })} /> {k}</label>
        ))}
      </div>
      {canEdit && <button disabled={pending || !p.id || !p.name} className="h-8 rounded-pill bg-primary px-4 text-xs font-bold text-white disabled:opacity-50" onClick={() => start(async () => { const r = await savePlanAction(p); setMsg(r.ok ? "Saved" : t(r.error)); router.refresh(); })}>Save package</button>}
      {msg && <span className="ml-2 text-xs">{msg}</span>}
    </div>
  );
}
