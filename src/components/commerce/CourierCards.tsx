"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Truck } from "lucide-react";
import type { CourierProvider } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { connectCourierAction, disconnectCourierAction, setDefaultCourierAction, testCourierAction } from "@/app/actions/commerce";
import { Badge, Button, Card, Input, Notice } from "@/components/ui";

type Item = { provider: CourierProvider; name: string; mode: "platform" | "own"; status: string; isDefault: boolean; capabilities: string[]; api: { live: boolean; reason: string | null }; note: string | null; codEnabled: boolean; lastError: string | null; accountLabel: string | null };
const TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { CONNECTED: "success", AWAITING_ACCESS: "warning", ERROR: "danger", EXPIRED: "danger" };

export function CourierCards({ items, canEdit }: { items: Item[]; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [open, setOpen] = useState<CourierProvider | null>(null);
  const [form, setForm] = useState({ accountLabel: "", codEnabled: false });
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: ok } : { tone: "danger", text: t(r.error!) });
      router.refresh();
    });
  const pd = items.find((i) => i.provider === "parceldaily")!;
  const own = items.filter((i) => i.provider !== "parceldaily");

  const card = (c: Item) => (
    <Card key={c.provider} className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft"><Truck className="size-5 text-primary" /></span>
          <div>
            <p className="font-bold">{c.name}</p>
            <p className="text-xs text-muted">{t("couriers.capabilities")}: {c.capabilities.length ? c.capabilities.filter((x) => ["createShipment", "downloadAWB", "getTrackingStatus", "cod"].includes(x)).join(", ") : t("couriers.none")}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={TONE[c.status] ?? "neutral"}>{t(`couriers.status.${c.status}`)}</Badge>
          {c.isDefault && <Badge tone="blue">{t("couriers.default")}</Badge>}
        </div>
      </div>
      {c.note && <p className="text-xs text-muted">{c.note}</p>}
      {c.lastError && c.status !== "AWAITING_ACCESS" && <p className="text-xs text-danger">{c.lastError}</p>}
      {c.codEnabled && <p className="flex items-center gap-1 text-xs"><CheckCircle2 className="size-3.5 text-success" /> {t("couriers.cod")}</p>}
      {canEdit && open === c.provider && (
        <div className="space-y-2 rounded-xl bg-canvas p-3">
          {c.mode === "own" && <Input placeholder={t("couriers.accountLabel")} value={form.accountLabel} onChange={(e) => setForm({ ...form, accountLabel: e.target.value })} />}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.codEnabled} onChange={(e) => setForm({ ...form, codEnabled: e.target.checked })} /> {t("couriers.codOn")}</label>
          <Button size="sm" disabled={pending} onClick={() => act(() => connectCourierAction(c.provider, form), t("couriers.ok"))}>{pending && <Loader2 className="size-4 animate-spin" />} {t("couriers.connect")}</Button>
        </div>
      )}
      {canEdit && (
        <div className="mt-auto flex flex-wrap gap-2">
          {open !== c.provider && <Button size="sm" variant={c.status === "NOT_CONNECTED" || c.status === "DISABLED" ? "primary" : "secondary"} onClick={() => { setOpen(c.provider); setForm({ accountLabel: c.accountLabel ?? "", codEnabled: c.codEnabled }); }}>{c.status === "NOT_CONNECTED" || c.status === "DISABLED" ? t("couriers.connect") : t("couriers.manage")}</Button>}
          {c.capabilities.includes("verifyConnection") && c.status !== "NOT_CONNECTED" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => testCourierAction(c.provider), t("couriers.ok"))}>{t("couriers.test")}</Button>}
          {c.status !== "NOT_CONNECTED" && c.status !== "DISABLED" && !c.isDefault && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setDefaultCourierAction(c.provider), t("pm.saved"))}>{t("couriers.makeDefault")}</Button>}
          {c.status !== "NOT_CONNECTED" && c.status !== "DISABLED" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => disconnectCourierAction(c.provider), t("pm.saved"))}>{t("couriers.disconnect")}</Button>}
        </div>
      )}
    </Card>
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{t("couriers.title")}</h2>
        <p className="text-sm text-muted">{t("couriers.sub")}</p>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div>
        <p className="mb-1 font-bold">{t("couriers.pdTitle")}</p>
        <p className="mb-3 text-sm text-muted">{t("couriers.pdBody")}</p>
        {!pd.api.live && <Notice tone="warning" className="mb-3">{t("couriers.pdUnavailable")}</Notice>}
        <div className="grid gap-4 md:grid-cols-2">{card(pd)}</div>
      </div>
      <div>
        <p className="mb-1 font-bold">{t("couriers.ownTitle")}</p>
        <p className="mb-3 text-sm text-muted">{t("couriers.ownBody")}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{own.map(card)}</div>
      </div>
    </section>
  );
}
