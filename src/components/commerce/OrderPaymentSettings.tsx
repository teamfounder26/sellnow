"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { OrderPaymentSettings as S } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { saveOrderSettingsAction } from "@/app/actions/commerce";
import { Button, Card, Field, Input, Notice, Textarea } from "@/components/ui";

const rm = (sen: number | null) => (sen == null ? "" : (sen / 100).toFixed(2));
const sen = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));

export function OrderPaymentSettings({ initial, selltroActive, canEdit }: { initial: S; selltroActive: boolean; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className="flex items-center gap-3 text-base font-bold"><input type="checkbox" className="size-5" checked={checked} disabled={disabled || !canEdit} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
  );
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="space-y-3 p-5 sm:p-6">
        <h2 className="text-lg font-extrabold tracking-tight">{t("pm.title")}</h2>
        {toggle(t("pm.online"), s.onlineEnabled, (v) => setS({ ...s, onlineEnabled: v }))}
        {!selltroActive && <p className="pl-8 text-sm text-muted">{t("pm.onlineNA")}</p>}
      </Card>

      <Card className="space-y-3 p-5 sm:p-6">
        {toggle(t("pm.cod"), s.codEnabled, (v) => setS({ ...s, codEnabled: v }))}
        <p className="text-sm text-muted">{t("pm.codBody")}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={s.cod.courierConfirmed} disabled={!canEdit} onChange={(e) => setS({ ...s, cod: { ...s.cod, courierConfirmed: e.target.checked } })} /> {t("pm.codConfirm")}</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("pm.codMin")}><Input inputMode="decimal" defaultValue={rm(s.cod.minSen)} onChange={(e) => setS({ ...s, cod: { ...s.cod, minSen: sen(e.target.value) } })} /></Field>
          <Field label={t("pm.codMax")}><Input inputMode="decimal" defaultValue={rm(s.cod.maxSen)} onChange={(e) => setS({ ...s, cod: { ...s.cod, maxSen: sen(e.target.value) } })} /></Field>
          <Field label={t("pm.codFee")}><Input inputMode="decimal" defaultValue={rm(s.cod.feeSen)} onChange={(e) => setS({ ...s, cod: { ...s.cod, feeSen: sen(e.target.value) ?? 0 } })} /></Field>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t("pm.codRegions")}</p>
          <div className="flex flex-wrap gap-3">
            {(["peninsular", "sabah", "sarawak", "labuan"] as const).map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.cod.regions.includes(r)} disabled={!canEdit} onChange={(e) => setS({ ...s, cod: { ...s.cod, regions: e.target.checked ? [...s.cod.regions, r] : s.cod.regions.filter((x) => x !== r) } })} /> {t(`ship.zones.${r}`)}</label>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-5 sm:p-6">
        {toggle(t("pm.manual"), s.manualEnabled, (v) => setS({ ...s, manualEnabled: v }))}
        <p className="text-sm text-muted">{t("pm.manualBody")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("pm.manualBank")}><Input value={s.manual.bankName} onChange={(e) => setS({ ...s, manual: { ...s.manual, bankName: e.target.value } })} /></Field>
          <Field label={t("pm.manualName")}><Input value={s.manual.accountName} onChange={(e) => setS({ ...s, manual: { ...s.manual, accountName: e.target.value } })} /></Field>
          <Field label={t("pm.manualNumber")}><Input inputMode="numeric" value={s.manual.accountNumber} onChange={(e) => setS({ ...s, manual: { ...s.manual, accountNumber: e.target.value.replace(/\D/g, "") } })} /></Field>
        </div>
        <Field label={t("pm.manualInstructions")}><Textarea rows={2} value={s.manual.instructions} onChange={(e) => setS({ ...s, manual: { ...s.manual, instructions: e.target.value } })} /></Field>
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t("pm.manualDeadline")}><Input type="number" min={1} max={168} value={s.manual.deadlineHours} onChange={(e) => setS({ ...s, manual: { ...s.manual, deadlineHours: Number(e.target.value) } })} /></Field>
          <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" checked={s.manual.proofRequired} onChange={(e) => setS({ ...s, manual: { ...s.manual, proofRequired: e.target.checked } })} /> {t("pm.manualProof")}</label>
        </div>
      </Card>

      <Card className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
        <Field label={t("pm.freeShip")}><Input inputMode="decimal" defaultValue={rm(s.freeShippingThresholdSen)} onChange={(e) => setS({ ...s, freeShippingThresholdSen: sen(e.target.value) })} /></Field>
        <Field label={t("pm.defaultWeight")}><Input type="number" min={1} max={30000} value={s.defaultWeightGrams} onChange={(e) => setS({ ...s, defaultWeightGrams: Number(e.target.value) })} /></Field>
      </Card>
      <Notice tone="blue">{t("pm.separate")}</Notice>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {canEdit && (
        <Button disabled={pending} onClick={() => start(async () => { const r = await saveOrderSettingsAction(s); setMsg(r.ok ? { tone: "success", text: t("pm.saved") } : { tone: "danger", text: t(r.error) }); if (r.ok) router.refresh(); })}>
          {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
        </Button>
      )}
    </div>
  );
}
