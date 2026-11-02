"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, Truck } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { cancelOrderAction, cancelShipmentAction, manualShipmentAction, markDeliveredAction, pushOrderAction, quoteOrderAction, reconcileCodAction, recordCodAction, verifyTransferAction } from "@/app/actions/commerce";
import { Button, Card, Field, Input, Notice, Select } from "@/components/ui";

type Shipment = { id: string; provider: string; status: string; trackingNumber: string | null; courierName: string | null; awbAssetId: string | null; providerStatus: string | null };
type Props = {
  orderId: string;
  canEdit: boolean;
  canManage: boolean;
  blocker: string | null;
  pdConnected: boolean;
  shipment: Shipment | null;
  method: string;
  paymentStatus: string;
  codStatus: string;
  totalSen: number;
  transferPending: boolean;
  cancellable: boolean;
};
type Quote = { service: string; courierName: string; priceSen: number; codSupported: boolean };

export function OrderOps(p: Props) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "blue"; text: string } | null>(null);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [pick, setPick] = useState<string>("");
  const [manual, setManual] = useState({ provider: "jnt", trackingNumber: "", cost: "" });
  const [note, setNote] = useState("");
  const [cod, setCod] = useState({ amount: (p.totalSen / 100).toFixed(2), ref: "" });
  const [reason, setReason] = useState("");
  const act = (fn: () => Promise<{ ok: boolean; error?: string; params?: Record<string, string | number> }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (ok ? { tone: "success", text: ok } : null) : { tone: "danger", text: t(r.error!, r.params) });
      router.refresh();
    });
  const blockerText = p.blocker ? (t(`orders.blockers.${p.blocker}`) === `orders.blockers.${p.blocker}` ? t(p.blocker) : t(`orders.blockers.${p.blocker}`)) : null;

  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {p.shipment && p.shipment.status !== "CANCELLED" && p.shipment.status !== "FAILED" ? (
        <Card className="space-y-2 p-5">
          <p className="font-bold">{p.shipment.courierName ?? p.shipment.provider}</p>
          {p.shipment.trackingNumber && <p className="font-mono text-sm">{p.shipment.trackingNumber}</p>}
          <div className="flex flex-wrap gap-2">
            {p.shipment.awbAssetId && <a className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-primary px-3 text-sm font-semibold text-white" href={`/api/shipments/awb?ids=${p.shipment.id}`} target="_blank" rel="noreferrer"><Printer className="size-4" /> {t("orders.viewAwb")}</a>}
            {p.canEdit && p.shipment.providerStatus === "manual" && p.shipment.status !== "DELIVERED" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => markDeliveredAction(p.shipment!.id))}>{t("orders.markDelivered")}</Button>}
            {p.canManage && ["BOOKED", "AWB_READY", "PICKUP_PENDING"].includes(p.shipment.status) && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => cancelShipmentAction(p.shipment!.id))}>{t("orders.cancelShipment")}</Button>}
          </div>
        </Card>
      ) : (
        p.canEdit && (
          <Card className="space-y-3 p-5">
            <p className="flex items-center gap-2 font-bold"><Truck className="size-4 text-primary" /> {t("orders.pushTitle")}</p>
            {blockerText ? (
              <Notice>{blockerText}</Notice>
            ) : p.pdConnected ? (
              <>
                {!quotes ? (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await quoteOrderAction(p.orderId); if (!r.ok) return setMsg({ tone: "danger", text: t(r.error) }); setQuotes(r.data); setPick(r.data[0]?.service ?? ""); })}>{pending && <Loader2 className="size-4 animate-spin" />} {t("orders.getRates")}</Button>
                ) : quotes.length === 0 ? (
                  <Notice tone="warning">{t("shipments.serviceUnavailable")}</Notice>
                ) : (
                  <>
                    <Select aria-label={t("orders.service")} value={pick} onChange={(e) => setPick(e.target.value)}>{quotes.map((q) => <option key={q.service} value={q.service}>{q.courierName} — {formatMYR(q.priceSen, locale)}</option>)}</Select>
                    <Button size="sm" disabled={pending || !pick} onClick={() => act(async () => { const q = quotes.find((x) => x.service === pick)!; const r = await pushOrderAction(p.orderId, { provider: "parceldaily", service: q.service, quotedPriceSen: q.priceSen }); if (r.ok) setMsg({ tone: "success", text: t("orders.booked", { tracking: r.data.trackingNumber ?? "—" }) }); return r.ok ? { ok: true } : r; })}>{pending ? t("orders.pushing") : t("orders.push")}</Button>
                  </>
                )}
              </>
            ) : (
              <Notice tone="blue">{t("couriers.parceldailyUnavailable")}</Notice>
            )}
            {!blockerText && (
              <details className="rounded-xl bg-canvas p-3 text-sm">
                <summary className="cursor-pointer font-semibold">{t("orders.manualTitle")}</summary>
                <p className="mt-1 text-muted">{t("orders.manualBody")}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Select value={manual.provider} onChange={(e) => setManual({ ...manual, provider: e.target.value })} aria-label={t("orders.col.courier")}>{[["jnt", "J&T Express"], ["poslaju", "Pos Laju"], ["ninjavan", "Ninja Van"], ["spx", "SPX Express"], ["dhl", "DHL"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                  <Input placeholder={t("orders.col.tracking")} value={manual.trackingNumber} onChange={(e) => setManual({ ...manual, trackingNumber: e.target.value })} />
                  <Input inputMode="decimal" placeholder={t("orders.courierCost")} value={manual.cost} onChange={(e) => setManual({ ...manual, cost: e.target.value })} />
                </div>
                <Button size="sm" className="mt-2" disabled={pending || manual.trackingNumber.length < 5} onClick={() => act(() => manualShipmentAction(p.orderId, { provider: manual.provider, trackingNumber: manual.trackingNumber, courierCostSen: manual.cost ? Math.round(Number(manual.cost) * 100) : null }), t("pm.saved"))}>{t("orders.record")}</Button>
              </details>
            )}
          </Card>
        )
      )}

      {p.method === "manual_transfer" && p.paymentStatus === "PENDING" && p.canManage && (
        <Card className="space-y-2 p-5">
          <p className="font-bold">{t("orders.paymentTitle")}</p>
          <p className="text-sm text-muted">{p.transferPending ? t("orders.transferProof") : t("orders.noProof")}</p>
          <p className="text-xs text-muted">{t("pm.manualBody")}</p>
          <Field label={t("orders.transferNote")}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || note.trim().length < 3} onClick={() => act(() => verifyTransferAction(p.orderId, true, note), t("pm.saved"))}>{t("orders.verifyTransfer")}</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => verifyTransferAction(p.orderId, false, note))}>{t("orders.rejectTransfer")}</Button>
          </div>
        </Card>
      )}

      {p.method === "cod" && p.canManage && (
        <Card className="space-y-2 p-5">
          <p className="font-bold">{t("orders.codTitle")} · {t(`orders.cstatus.${p.codStatus}`)}</p>
          <p className="text-xs text-muted">{t("orders.codNote")}</p>
          {p.codStatus === "AWAITING_REMITTANCE" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input inputMode="decimal" aria-label={t("orders.codAmount")} value={cod.amount} onChange={(e) => setCod({ ...cod, amount: e.target.value })} />
                <Input placeholder={t("orders.codRef")} value={cod.ref} onChange={(e) => setCod({ ...cod, ref: e.target.value })} />
              </div>
              <Button size="sm" disabled={pending || cod.ref.length < 3} onClick={() => act(() => recordCodAction(p.orderId, Math.round(Number(cod.amount) * 100), cod.ref), t("pm.saved"))}>{t("orders.codRecord")}</Button>
            </>
          )}
          {p.codStatus === "REMITTED" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => reconcileCodAction(p.orderId), t("pm.saved"))}>{t("orders.codReconcile")}</Button>}
        </Card>
      )}

      {p.cancellable && p.canManage && (
        <details className="rounded-2xl p-4 text-sm ring-1 ring-line">
          <summary className="cursor-pointer font-semibold text-danger">{t("orders.cancel")}</summary>
          <Field label={t("orders.cancelReason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button size="sm" variant="secondary" className="mt-2" disabled={pending || reason.length < 3} onClick={() => act(() => cancelOrderAction(p.orderId, reason), t("pm.saved"))}>{t("orders.cancel")}</Button>
        </details>
      )}
    </div>
  );
}
