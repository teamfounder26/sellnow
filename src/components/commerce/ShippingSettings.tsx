"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import type { ShipperProfile } from "@/lib/db/schema";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { MY_STATES } from "@/lib/shipping/states";
import { deleteShippingRuleAction, importShippingRulesAction, saveShipperAction, saveShippingRuleAction, saveShippingZoneAction, testShippingAction } from "@/app/actions/commerce";
import { Badge, Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";

type Rule = { id: string; name: string; zone: string; deliveryType: "normal" | "cod"; minGrams: number; maxGrams: number; feeSen: number; courier: string | null; priority: number; status: "active" | "inactive" };
type Zone = { id: string; name: string; postcodeRanges: { from: string; to: string }[] };
const BLANK = { name: "", zone: "peninsular", deliveryType: "normal" as const, minGrams: 0, maxGrams: 500, feeSen: 600, courier: null, priority: 100, status: "active" as const };
const BLANK_SHIPPER: ShipperProfile = { senderName: "", senderPhone: "", pickup: { line1: "", postcode: "", city: "", state: "Selangor" }, defaultWeightGrams: 500, defaultContent: "" };

export function ShippingSettings({ rules, zones, shipper, canEdit, csv }: { rules: Rule[]; zones: Zone[]; shipper: ShipperProfile | null; canEdit: boolean; csv: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "neutral"; text: string } | null>(null);
  const [edit, setEdit] = useState<{ id?: string; r: Omit<Rule, "id"> } | null>(null);
  const [sh, setSh] = useState<ShipperProfile>(shipper ?? BLANK_SHIPPER);
  const [test, setTest] = useState({ postcode: "43000", state: "Selangor", weightGrams: 500, type: "normal" as "normal" | "cod" });
  const [imp, setImp] = useState<string | null>(null);
  const [zone, setZone] = useState<{ name: string; ranges: string } | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string; params?: Record<string, string | number> }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: ok } : { tone: "danger", text: t(r.error!, r.params) });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  const zoneLabel = (z: string) => (z.startsWith("zone:") ? (zones.find((x) => `zone:${x.id}` === z)?.name ?? z) : t(`ship.zones.${z}`));

  return (
    <div className="space-y-5">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card className="space-y-3 p-5 sm:p-6">
        <h2 className="text-lg font-extrabold tracking-tight">{t("ship.shipperTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ship.senderName")}><Input value={sh.senderName} onChange={(e) => setSh({ ...sh, senderName: e.target.value })} /></Field>
          <Field label={t("ship.senderPhone")}><Input inputMode="tel" value={sh.senderPhone} onChange={(e) => setSh({ ...sh, senderPhone: e.target.value })} /></Field>
          <Field label={t("ship.line1")}><Input value={sh.pickup.line1} onChange={(e) => setSh({ ...sh, pickup: { ...sh.pickup, line1: e.target.value } })} /></Field>
          <Field label={t("ship.line2")}><Input value={sh.pickup.line2 ?? ""} onChange={(e) => setSh({ ...sh, pickup: { ...sh.pickup, line2: e.target.value } })} /></Field>
          <Field label={t("ship.postcode")}><Input inputMode="numeric" maxLength={5} value={sh.pickup.postcode} onChange={(e) => setSh({ ...sh, pickup: { ...sh.pickup, postcode: e.target.value } })} /></Field>
          <Field label={t("ship.city")}><Input value={sh.pickup.city} onChange={(e) => setSh({ ...sh, pickup: { ...sh.pickup, city: e.target.value } })} /></Field>
          <Field label={t("ship.state")}><Select value={sh.pickup.state} onChange={(e) => setSh({ ...sh, pickup: { ...sh.pickup, state: e.target.value } })}>{MY_STATES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label={t("ship.defaultWeight")}><Input type="number" min={1} max={30000} value={sh.defaultWeightGrams} onChange={(e) => setSh({ ...sh, defaultWeightGrams: Number(e.target.value) })} /></Field>
          <Field label={t("ship.content")}><Input maxLength={50} value={sh.defaultContent} onChange={(e) => setSh({ ...sh, defaultContent: e.target.value })} /></Field>
        </div>
        {canEdit && <Button size="sm" disabled={pending} onClick={() => act(() => saveShipperAction({ ...sh, returnAddress: null }), t("pm.saved"))}>{t("common.save")}</Button>}
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">{t("ship.rulesTitle")}</h2>
            <p className="text-sm text-muted">{t("ship.rulesSub")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <Button size="sm" onClick={() => setEdit({ r: { ...BLANK } })}><Plus className="size-4" /> {t("ship.add")}</Button>}
            {canEdit && <Button size="sm" variant="secondary" onClick={() => setImp("")}><Upload className="size-4" /> {t("ship.import")}</Button>}
            <a className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold ring-1 ring-line" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download="postage-rates.csv"><Download className="size-4" /> {t("ship.export")}</a>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">{t("ship.inclusive")}</p>
        {imp !== null && (
          <div className="mt-3 space-y-2 rounded-2xl p-3 ring-1 ring-line">
            <p className="text-xs text-muted">{t("ship.importHint")}</p>
            <Textarea rows={4} className="font-mono text-xs" value={imp} onChange={(e) => setImp(e.target.value)} />
            <div className="flex gap-2"><Button size="sm" disabled={pending || !imp.trim()} onClick={() => act(() => importShippingRulesAction(imp), t("pm.saved"), () => setImp(null))}>{t("ship.import")}</Button><Button size="sm" variant="ghost" onClick={() => setImp(null)}>{t("common.cancel")}</Button></div>
          </div>
        )}
        {edit && (
          <div className="mt-4 grid gap-3 rounded-2xl bg-canvas p-4 sm:grid-cols-4">
            <Field label={t("ship.name")}><Input value={edit.r.name} onChange={(e) => setEdit({ ...edit, r: { ...edit.r, name: e.target.value } })} /></Field>
            <Field label={t("ship.zone")}>
              <Select value={edit.r.zone} onChange={(e) => setEdit({ ...edit, r: { ...edit.r, zone: e.target.value } })}>
                {["peninsular", "sabah", "sarawak", "labuan", "all"].map((z) => <option key={z} value={z}>{t(`ship.zones.${z}`)}</option>)}
                {zones.map((z) => <option key={z.id} value={`zone:${z.id}`}>{z.name}</option>)}
              </Select>
            </Field>
            <Field label={t("ship.type")}><Select value={edit.r.deliveryType} onChange={(e) => setEdit({ ...edit, r: { ...edit.r, deliveryType: e.target.value as "normal" } })}>{(["normal", "cod"] as const).map((x) => <option key={x} value={x}>{t(`ship.types.${x}`)}</option>)}</Select></Field>
            <Field label={t("ship.fee")}><Input inputMode="decimal" defaultValue={(edit.r.feeSen / 100).toFixed(2)} onChange={(e) => setEdit({ ...edit, r: { ...edit.r, feeSen: Math.round(Number(e.target.value) * 100) } })} /></Field>
            <Field label={t("ship.minW")}><Input type="number" min={0} value={edit.r.minGrams} onChange={(e) => setEdit({ ...edit, r: { ...edit.r, minGrams: Number(e.target.value) } })} /></Field>
            <Field label={t("ship.maxW")}><Input type="number" min={1} value={edit.r.maxGrams} onChange={(e) => setEdit({ ...edit, r: { ...edit.r, maxGrams: Number(e.target.value) } })} /></Field>
            <Field label={t("ship.priority")}><Input type="number" min={1} max={1000} value={edit.r.priority} onChange={(e) => setEdit({ ...edit, r: { ...edit.r, priority: Number(e.target.value) } })} /></Field>
            <Field label={t("ship.status")}><Select value={edit.r.status} onChange={(e) => setEdit({ ...edit, r: { ...edit.r, status: e.target.value as "active" } })}><option value="active">{t("ship.active")}</option><option value="inactive">{t("ship.inactive")}</option></Select></Field>
            <div className="flex gap-2 sm:col-span-4">
              <Button size="sm" disabled={pending || !edit.r.name} onClick={() => act(() => saveShippingRuleAction(edit.r, edit.id), t("pm.saved"), () => setEdit(null))}>{t("common.save")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>{t("common.cancel")}</Button>
            </div>
          </div>
        )}
        {rules.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-canvas p-4 text-sm text-muted">{t("ship.noRules")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr>{["name", "zone", "type", "minW", "maxW", "fee", "priority", "status"].map((k) => <th key={k} className="px-2 py-2">{t(`ship.${k}`)}</th>)}<th /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2 font-semibold">{r.name}</td>
                    <td className="px-2 py-2">{zoneLabel(r.zone)}</td>
                    <td className="px-2 py-2"><Badge tone={r.deliveryType === "cod" ? "yellow" : "neutral"}>{t(`ship.types.${r.deliveryType}`)}</Badge></td>
                    <td className="px-2 py-2 tabular-nums">{r.minGrams}</td>
                    <td className="px-2 py-2 tabular-nums">{r.maxGrams}</td>
                    <td className="px-2 py-2 font-semibold tabular-nums">{formatMYR(r.feeSen, locale)}</td>
                    <td className="px-2 py-2 tabular-nums">{r.priority}</td>
                    <td className="px-2 py-2"><Badge tone={r.status === "active" ? "success" : "neutral"}>{t(`ship.${r.status}`)}</Badge></td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {canEdit && (
                        <>
                          <button type="button" aria-label={t("common.edit")} className="p-1 text-muted hover:text-ink" onClick={() => setEdit({ id: r.id, r: { ...r } })}><Pencil className="size-4" /></button>
                          <button type="button" aria-label={t("ship.duplicate")} className="p-1 text-muted hover:text-ink" onClick={() => setEdit({ r: { ...r, name: `${r.name} (2)`, priority: r.priority + 1 } })}><Copy className="size-4" /></button>
                          <button type="button" aria-label={t("ship.delete")} className="p-1 text-muted hover:text-danger" onClick={() => act(() => deleteShippingRuleAction(r.id), t("pm.saved"))}><Trash2 className="size-4" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h3 className="font-bold">{t("ship.test")}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("ship.postcode")}><Input inputMode="numeric" maxLength={5} value={test.postcode} onChange={(e) => setTest({ ...test, postcode: e.target.value })} /></Field>
            <Field label={t("ship.state")}><Select value={test.state} onChange={(e) => setTest({ ...test, state: e.target.value })}>{MY_STATES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label={t("ship.testWeight")}><Input type="number" min={1} value={test.weightGrams} onChange={(e) => setTest({ ...test, weightGrams: Number(e.target.value) })} /></Field>
            <Field label={t("ship.type")}><Select value={test.type} onChange={(e) => setTest({ ...test, type: e.target.value as "normal" })}>{(["normal", "cod"] as const).map((x) => <option key={x} value={x}>{t(`ship.types.${x}`)}</option>)}</Select></Field>
          </div>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await testShippingAction(test); setMsg(!r.ok ? { tone: "danger", text: t(r.error) } : r.data ? { tone: "neutral", text: t("ship.testResult", { fee: formatMYR(r.data.feeSen, locale), rule: r.data.rule.name }) } : { tone: "danger", text: t("ship.noRule") }); })}>{pending && <Loader2 className="size-4 animate-spin" />} {t("ship.test")}</Button>
        </Card>
        <Card className="space-y-3 p-5">
          <h3 className="font-bold">{t("ship.customZone")}</h3>
          {zones.map((z) => <p key={z.id} className="text-sm"><b>{z.name}</b> · {z.postcodeRanges.map((r) => `${r.from}–${r.to}`).join(", ")}</p>)}
          {zone ? (
            <div className="space-y-2">
              <Field label={t("ship.customZoneName")}><Input value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} /></Field>
              <Field label={t("ship.customZoneRanges")}><Textarea rows={3} value={zone.ranges} onChange={(e) => setZone({ ...zone, ranges: e.target.value })} /></Field>
              <Button size="sm" disabled={pending} onClick={() => act(() => saveShippingZoneAction({ name: zone.name, states: [], postcodeRanges: zone.ranges.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => { const [from, to] = l.split(/\s*-\s*/); return { from: from ?? "", to: to ?? from ?? "" }; }) }), t("pm.saved"), () => setZone(null))}>{t("common.save")}</Button>
            </div>
          ) : (
            canEdit && <Button size="sm" variant="secondary" onClick={() => setZone({ name: "", ranges: "" })}><Plus className="size-4" /> {t("ship.addZone")}</Button>
          )}
        </Card>
      </div>
    </div>
  );
}
