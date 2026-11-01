"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { useT, useLocale } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { addDiscountAction, toggleDiscountAction } from "@/app/actions/settings";

type Code = { id: string; code: string; kind: "percent" | "fixed"; value: number; active: boolean; maxRedemptions: number | null; redemptions: number };

export function DiscountSettings({ canEdit, codes }: { canEdit: boolean; codes: Code[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ code: "", kind: "percent" as "percent" | "fixed", value: "", max: "" });
  return (
    <div className="max-w-3xl space-y-4">
      {canEdit && (
        <Card className="p-5">
          <p className="font-bold">{t("settings.addDiscount")}</p>
          {error && <Notice tone="danger" className="mt-3">{t(error)}</Notice>}
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Field label={t("settings.discountCode")}><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="RAYA10" /></Field>
            <Field label={t("settings.discountKind")}>
              <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "percent" | "fixed" })}>
                <option value="percent">{t("settings.discountPercent")}</option>
                <option value="fixed">{t("settings.discountFixed")}</option>
              </Select>
            </Field>
            <Field label={t("settings.discountValue")}><Input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
            <Field label={t("settings.discountMax")}><Input inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder="∞" /></Field>
          </div>
          <Button
            size="sm"
            className="mt-3"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await addDiscountAction(f);
                if (!r.ok) setError(r.error);
                else setF({ code: "", kind: "percent", value: "", max: "" });
                router.refresh();
              })
            }
          >
            {t("common.add")}
          </Button>
        </Card>
      )}
      <Card className="divide-y divide-line">
        {codes.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <span className="font-mono font-bold">{c.code}</span>
            <span>{c.kind === "percent" ? `${c.value}%` : formatMYR(c.value, locale)}</span>
            <span className="text-muted">{t("settings.discountUsed", { n: c.redemptions })}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}</span>
            <span className="flex items-center gap-2">
              <Badge tone={c.active ? "success" : "neutral"}>{c.active ? "ON" : "OFF"}</Badge>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => start(async () => { await toggleDiscountAction(c.id, !c.active); router.refresh(); })}>
                  {c.active ? "OFF" : "ON"}
                </Button>
              )}
            </span>
          </div>
        ))}
        {codes.length === 0 && <p className="px-5 py-6 text-center text-sm text-muted">{t("common.none")}</p>}
      </Card>
    </div>
  );
}
