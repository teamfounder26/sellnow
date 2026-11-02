"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Printer, Truck } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { bulkPreviewAction, bulkPushAction } from "@/app/actions/commerce";
import { Badge, Button, Card, Notice, Select } from "@/components/ui";

export type BoardRow = {
  id: string;
  number: number;
  createdAt: string;
  customer: string;
  phone: string | null;
  product: string;
  quantity: number;
  totalSen: number;
  shippingSen: number;
  method: string;
  paymentStatus: string;
  fulfillment: string;
  courier: string | null;
  tracking: string | null;
  shipmentId: string | null;
  hasAwb: boolean;
  isTest: boolean;
};
const PAY_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { PAID: "success", PENDING: "warning", PROCESSING: "warning", FAILED: "danger", CANCELLED: "neutral", REFUNDED: "neutral", PARTIALLY_REFUNDED: "warning" };

export function OrdersBoard({ rows, canEdit, services }: { rows: BoardRow[]; canEdit: boolean; services: { service: string; courierName: string }[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [bulk, setBulk] = useState<{ ready: number; blocked: { number: number; reason: string }[]; service: string } | null>(null);
  const [job, setJob] = useState<{ id: string } | null>(null);
  const [result, setResult] = useState<{ ok: number; fail: number; costSen: number; failed: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const awbIds = rows.filter((r) => sel.has(r.id) && r.hasAwb && r.shipmentId).map((r) => r.shipmentId!);

  useEffect(() => {
    if (!job) return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" }).then((x) => x.json() as Promise<{ status: string; error?: string; output?: { push?: { results: { orderId: string; ok: boolean }[]; succeeded: number; failed: number; courierChargesSen: number } } }>).catch(() => null);
      if (stop) return;
      if (r?.status === "COMPLETED" || r?.status === "FAILED") {
        const out = r.output?.push;
        if (out) setResult({ ok: out.succeeded, fail: out.failed, costSen: out.courierChargesSen, failed: out.results.filter((x) => !x.ok).map((x) => x.orderId) });
        else if (r.status === "FAILED") setErr(t(r.error ?? "errors.unexpected"));
        setJob(null);
        router.refresh();
        return;
      }
      setTimeout(() => void tick(), 2000);
    };
    void tick();
    return () => { stop = true; };
  }, [job, router, t]);

  const openBulk = () =>
    start(async () => {
      setErr(null);
      const r = await bulkPreviewAction([...sel]);
      if (!r.ok) return setErr(t(r.error));
      setBulk({ ready: r.data.ready.length, blocked: r.data.blocked.map((b) => ({ number: b.number, reason: b.reason })), service: services[0]?.service ?? "" });
    });

  return (
    <div className="space-y-3">
      {canEdit && sel.size > 0 && (
        <Card className="sticky top-20 z-10 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-semibold">{t("orders.selected", { n: sel.size })}</span>
          <Button size="sm" disabled={pending || Boolean(job)} onClick={openBulk}><Truck className="size-4" /> {t("orders.bulkPush")}</Button>
          {awbIds.length > 0 && <a className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold ring-1 ring-line" href={`/api/shipments/awb?ids=${awbIds.join(",")}`} target="_blank" rel="noreferrer"><Printer className="size-4" /> {t("orders.bulkPrint")} ({awbIds.length})</a>}
        </Card>
      )}
      {err && <Notice tone="danger">{err}</Notice>}
      {job && <Notice tone="blue" className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> {t("orders.bulkRunning")}</Notice>}
      {result && (
        <Notice tone={result.fail ? "warning" : "success"} className="flex flex-wrap items-center gap-2">
          {t("orders.bulkResult", { ok: result.ok, fail: result.fail, cost: formatMYR(result.costSen, locale) })}
          {result.fail > 0 && canEdit && <Button size="sm" variant="secondary" onClick={() => { setSel(new Set(result.failed)); setResult(null); }}>{t("orders.retryFailed")}</Button>}
        </Notice>
      )}
      {bulk && (
        <Card className="space-y-3 p-4">
          <p className="font-bold">{t("orders.bulkPush")}</p>
          <p className="text-sm">{t("orders.ready", { n: bulk.ready })} · {t("orders.blocked", { n: bulk.blocked.length })}</p>
          {bulk.blocked.length > 0 && <ul className="text-xs text-muted">{bulk.blocked.slice(0, 8).map((b) => <li key={b.number}>#{b.number}: {t(`orders.blockers.${b.reason}`) === `orders.blockers.${b.reason}` ? t(b.reason) : t(`orders.blockers.${b.reason}`)}</li>)}</ul>}
          {services.length ? (
            <Select value={bulk.service} onChange={(e) => setBulk({ ...bulk, service: e.target.value })} aria-label={t("orders.service")}>{services.map((s) => <option key={s.service} value={s.service}>{s.courierName}</option>)}</Select>
          ) : (
            <Notice tone="warning">{t("couriers.parceldailyUnavailable")}</Notice>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !bulk.ready || !bulk.service} onClick={() => start(async () => { const r = await bulkPushAction([...sel], bulk.service); if (!r.ok) return setErr(t(r.error)); setJob({ id: r.data.jobId }); setBulk(null); setSel(new Set()); setResult(null); })}>{t("orders.push")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setBulk(null)}>{t("common.cancel")}</Button>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <tr>
                {canEdit && <th className="w-8 px-3 py-3"><input type="checkbox" aria-label="all" checked={sel.size === rows.length && rows.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
                <th className="px-3 py-3">{t("orders.number")}</th>
                <th className="px-3 py-3">{t("common.date")}</th>
                <th className="px-3 py-3">{t("orders.customer")}</th>
                <th className="px-3 py-3">{t("orders.col.product")}</th>
                <th className="px-3 py-3 text-right">{t("orders.col.qty")}</th>
                <th className="px-3 py-3 text-right">{t("common.total")}</th>
                <th className="px-3 py-3">{t("orders.col.method")}</th>
                <th className="px-3 py-3">{t("orders.col.payment")}</th>
                <th className="px-3 py-3">{t("orders.col.fulfillment")}</th>
                <th className="px-3 py-3">{t("orders.col.courier")}</th>
                <th className="px-3 py-3 text-right">{t("orders.col.shipping")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  {canEdit && <td className="px-3 py-3"><input type="checkbox" aria-label={`#${r.number}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>}
                  <td className="px-3 py-3 font-bold"><Link href={`/dashboard/orders/${r.id}`} className="hover:underline">#{r.number}</Link>{r.isTest && <Badge tone="warning" className="ml-1">{t("orders.testBadge")}</Badge>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{fmt.format(new Date(r.createdAt))}</td>
                  <td className="px-3 py-3"><p className="font-medium">{r.customer}</p>{r.phone && <p className="text-xs text-muted">{r.phone}</p>}</td>
                  <td className="max-w-48 truncate px-3 py-3">{r.product}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{formatMYR(r.totalSen, locale)}</td>
                  <td className="px-3 py-3">{t(`orders.method.${r.method}`)}</td>
                  <td className="px-3 py-3"><Badge tone={PAY_TONE[r.paymentStatus] ?? "neutral"}>{t(`orders.status.${r.paymentStatus}`)}</Badge></td>
                  <td className="px-3 py-3 text-muted">{t(`orders.fstatus.${r.fulfillment}`)}</td>
                  <td className="px-3 py-3 text-xs">{r.courier ?? "—"}{r.tracking && <p className="font-mono">{r.tracking}</p>}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMYR(r.shippingSen, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
