"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Banknote, Loader2, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { MY_BANKS } from "@/lib/finance/banks";
import { activateSelltroAction, changeBankAction, selfVerifyTestAction } from "@/app/actions/commerce";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";

type Bank = { id: string; bankName: string; last4: string; holderName: string; status: string; current: boolean; createdAt: string };
const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { ACTIVE: "success", VERIFIED: "success", PENDING_VERIFICATION: "warning", RESTRICTED: "danger", SUSPENDED: "danger", REJECTED: "danger" };

export function SelltroPaySettings(p: { canEdit: boolean; environment: "test" | "sandbox" | "live" | null; status: string; banks: Bank[]; legacyProvider: string | null; reviewNote: string | null }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [f, setF] = useState({ businessType: "sole_prop", legalName: "", registrationNumber: "", idNumber: "", contactPhone: "", acceptTerms: false, bank: { bankCode: "MBBEMYKL", accountNumber: "", holderName: "", accountType: "personal" } });
  const [change, setChange] = useState<{ open: boolean; password: string; bank: typeof f.bank }>({ open: false, password: "", bank: { ...f.bank } });
  const current = p.banks.find((b) => b.current) ?? null;
  const act = (fn: () => Promise<{ ok: boolean; error?: string; params?: Record<string, string | number> }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: ok } : { tone: "danger", text: t(r.error!, r.params) });
      if (r.ok) router.refresh();
    });
  const bankFields = (b: typeof f.bank, set: (b: typeof f.bank) => void) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("selltro.bank")}>
        <Select value={b.bankCode} onChange={(e) => set({ ...b, bankCode: e.target.value })}>{MY_BANKS.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Select>
      </Field>
      <Field label={t("selltro.accountNumber")}><Input inputMode="numeric" autoComplete="off" value={b.accountNumber} onChange={(e) => set({ ...b, accountNumber: e.target.value })} /></Field>
      <Field label={t("selltro.holderName")}><Input value={b.holderName} onChange={(e) => set({ ...b, holderName: e.target.value })} /></Field>
      <Field label={t("selltro.accountType")}>
        <Select value={b.accountType} onChange={(e) => set({ ...b, accountType: e.target.value })}>{(["personal", "business"] as const).map((x) => <option key={x} value={x}>{t(`selltro.at.${x}`)}</option>)}</Select>
      </Field>
    </div>
  );

  if (!p.environment) return <Notice tone="warning">{t("selltro.unavailable")}</Notice>;
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight"><ShieldCheck className="size-5 text-primary" /> {t("selltro.title")}</h2>
          <Badge tone={TONE[p.status] ?? "neutral"}>{t(`selltro.status.${p.status}`)}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{t("selltro.sub")}</p>
        <p className="mt-2 text-sm">{t("selltro.methods")}</p>
        {p.environment === "test" && <Notice tone="warning" className="mt-3">{t("selltro.testMode")}</Notice>}
        {p.legacyProvider && <Notice tone="blue" className="mt-3">{t("selltro.legacy", { provider: p.legacyProvider })}</Notice>}
        {p.reviewNote && p.status !== "ACTIVE" && <Notice className="mt-3">{p.reviewNote}</Notice>}
        {msg && <Notice tone={msg.tone} className="mt-3">{msg.text}</Notice>}
        {p.environment === "test" && p.status === "PENDING_VERIFICATION" && p.canEdit && (
          <Button size="sm" variant="secondary" className="mt-3" disabled={pending} onClick={() => act(selfVerifyTestAction, t("pm.saved"))}>{t("selltro.selfVerify")}</Button>
        )}
      </Card>

      {(p.status === "NOT_ACTIVATED") && (
        <Card className="space-y-4 p-5 sm:p-6">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-extrabold tracking-tight"><Banknote className="size-5 text-primary" /> {t("selltro.setupTitle")}</h3>
            <p className="mt-1 text-sm text-muted">{t("selltro.setupBody")}</p>
          </div>
          {bankFields(f.bank, (bank) => setF({ ...f, bank }))}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("selltro.businessType")}>
              <Select value={f.businessType} onChange={(e) => setF({ ...f, businessType: e.target.value })}>{(["individual", "sole_prop", "company"] as const).map((x) => <option key={x} value={x}>{t(`selltro.bt.${x}`)}</option>)}</Select>
            </Field>
            <Field label={t("selltro.legalName")}><Input value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} /></Field>
            {f.businessType !== "individual" && <Field label={t("selltro.regNo")}><Input value={f.registrationNumber} onChange={(e) => setF({ ...f, registrationNumber: e.target.value })} /></Field>}
            <Field label={t("selltro.idNumber")} hint={t("selltro.idHint")}><Input autoComplete="off" value={f.idNumber} onChange={(e) => setF({ ...f, idNumber: e.target.value })} /></Field>
            <Field label={t("selltro.phone")}><Input inputMode="tel" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></Field>
          </div>
          <Notice tone="blue">{t("selltro.bankNote")}</Notice>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} /> {t("selltro.terms")}</label>
          {p.canEdit && <Button disabled={pending || !f.acceptTerms} onClick={() => act(() => activateSelltroAction(f), t("selltro.submitted"))}>{pending && <Loader2 className="size-4 animate-spin" />} {t("selltro.submit")}</Button>}
        </Card>
      )}

      {current && (
        <Card className="space-y-3 p-5 sm:p-6">
          <h3 className="font-bold">{t("selltro.currentBank")}</h3>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-canvas p-4">
            <BadgeCheck className="size-5 text-primary" />
            <span className="font-semibold">{current.bankName} •••• {current.last4}</span>
            <span className="text-sm text-muted">{current.holderName}</span>
            <Badge tone={TONE[current.status] ?? "neutral"}>{t(`selltro.bankStatus.${current.status}`)}</Badge>
          </div>
          {p.canEdit && !change.open && <Button size="sm" variant="secondary" onClick={() => setChange({ ...change, open: true })}>{t("selltro.changeBank")}</Button>}
          {change.open && (
            <div className="space-y-3 rounded-2xl p-4 ring-1 ring-line">
              <p className="text-sm text-muted">{t("selltro.changeBankBody")}</p>
              {bankFields(change.bank, (bank) => setChange({ ...change, bank }))}
              <Field label={t("selltro.password")}><Input type="password" autoComplete="current-password" value={change.password} onChange={(e) => setChange({ ...change, password: e.target.value })} /></Field>
              <div className="flex gap-2">
                <Button size="sm" disabled={pending || !change.password} onClick={() => act(async () => { const r = await changeBankAction(change.password, change.bank); if (r.ok) setChange({ open: false, password: "", bank: { ...f.bank } }); return r; }, t("selltro.changed"))}>{t("common.save")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setChange({ ...change, open: false, password: "" })}>{t("common.cancel")}</Button>
              </div>
            </div>
          )}
          {p.banks.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">{t("selltro.history")}</summary>
              <ul className="mt-2 space-y-1 text-muted">{p.banks.map((b) => <li key={b.id}>{new Date(b.createdAt).toLocaleDateString()} · {b.bankName} •••• {b.last4} · {t(`selltro.bankStatus.${b.status}`)}{b.current ? " ✓" : ""}</li>)}</ul>
            </details>
          )}
        </Card>
      )}
    </div>
  );
}
