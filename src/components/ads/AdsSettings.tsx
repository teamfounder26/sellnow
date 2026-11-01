"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Loader2, Plug, Save, ShieldAlert, Ticket, XCircle } from "lucide-react";
import type { AdsPlaybook } from "@/lib/db/schema";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { activateTestSubscriptionAction, disconnectMetaAction, metaAssetsAction, savePlaybookAction, saveMetaSelectionAction } from "@/app/actions/ads";
import { Badge, Button, Card, Input, Notice, ProgressBar } from "@/components/ui";

type MetaCfg = { adAccountId?: string; adAccountName?: string; currency?: string; pageId?: string; pageName?: string; pixelId?: string; pixelName?: string; userName?: string; instagramId?: string };

export function AdsSettings(props: {
  canManage: boolean;
  isOwner: boolean;
  meta: { appConfigured: boolean; connected: boolean; expired: boolean; config: MetaCfg };
  playbook: AdsPlaybook;
  quota: { plan: "free" | "paid"; trialUsed: number; trialRemaining: number; monthlyUsed: number; monthlyRemaining: number; periodEnd: string | null };
  subscription: { status: string; provider: string; periodEnd: string; priceSen: number } | null;
  price: number;
  testActivationAllowed: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [assets, setAssets] = useState<{ adAccounts: { id: string; name: string; currency: string }[]; pages: { id: string; name: string; instagram: boolean }[]; pixels: Record<string, { id: string; name: string }[]> } | null>(null);
  const [sel, setSel] = useState({ adAccountId: props.meta.config.adAccountId ?? "", pageId: props.meta.config.pageId ?? "", pixelId: props.meta.config.pixelId ?? "" });
  const [pb, setPb] = useState(props.playbook);
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));

  useEffect(() => {
    if (!props.meta.connected || !props.canManage) return;
    void metaAssetsAction().then((r) => (r.ok ? setAssets(r.data) : setMsg({ tone: "danger", text: t(r.error) })));
  }, [props.meta.connected, props.canManage, t]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: okText } : { tone: "danger", text: t(r.error!) });
      router.refresh();
    });

  const num = (k: keyof AdsPlaybook, v: string, sen = false) => setPb((p) => ({ ...p, [k]: sen ? Math.round(Number(v || 0) * 100) : Number(v) }));
  const field = (k: keyof AdsPlaybook, sen = false, suffix = "%") => (
    <label className="text-sm font-semibold">
      {t(`ads.settings.pb.${k}`)}
      <div className="mt-1 flex items-center gap-2">
        <Input type="number" step="any" min={0} value={sen ? ((pb[k] as number) / 100).toString() : String(pb[k])} onChange={(e) => num(k, e.target.value, sen)} disabled={!props.canManage} />
        <span className="text-xs text-muted">{sen ? "RM" : suffix}</span>
      </div>
    </label>
  );

  return (
    <div className="space-y-6">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {/* Meta connection */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight"><Plug className="size-5 text-primary" /> {t("ads.settings.metaTitle")}</h2>
          <Badge tone={props.meta.connected ? "success" : "warning"}>{t(props.meta.connected ? "ads.settings.connected" : props.meta.expired ? "ads.settings.expired" : "ads.settings.notConnected")}</Badge>
        </div>
        {!props.meta.appConfigured ? (
          <Notice tone="warning" className="mt-4">{t("ads.settings.appMissing")}</Notice>
        ) : !props.meta.connected ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">{t("ads.settings.connectBody")}</p>
            {props.canManage && <a href="/api/integrations/meta/start" className="inline-flex h-11 items-center gap-2 rounded-pill bg-[#1877F2] px-5 font-semibold text-white"><Link2 className="size-4" /> {t("ads.settings.connect")}</a>}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted">{t("ads.settings.connectedAs", { name: props.meta.config.userName ?? "Meta" })}</p>
            {!assets ? <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> {t("ads.settings.loadingAssets")}</p> : (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-semibold">{t("ads.settings.adAccount")}
                  <select value={sel.adAccountId} onChange={(e) => setSel({ ...sel, adAccountId: e.target.value, pixelId: "" })} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3">
                    <option value="">—</option>{assets.adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">{t("ads.settings.page")}
                  <select value={sel.pageId} onChange={(e) => setSel({ ...sel, pageId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3">
                    <option value="">—</option>{assets.pages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.instagram ? " + Instagram" : ""}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">{t("ads.settings.pixel")}
                  <select value={sel.pixelId} onChange={(e) => setSel({ ...sel, pixelId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3">
                    <option value="">—</option>{(assets.pixels[sel.adAccountId] ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {props.canManage && <Button size="sm" disabled={!sel.adAccountId || !sel.pageId || pending} onClick={() => act(() => saveMetaSelectionAction({ ...sel, pixelId: sel.pixelId || null }), t("ads.settings.saved"))}><Save className="size-4" /> {t("common.save")}</Button>}
              {props.isOwner && <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(disconnectMetaAction, t("ads.settings.disconnected"))}>{t("ads.settings.disconnect")}</Button>}
            </div>
            <div className="rounded-2xl bg-canvas p-4 text-sm">
              <p className="font-bold">{t("ads.settings.tracking")}</p>
              <ul className="mt-2 space-y-1.5">
                {[
                  ["pixelSelected", Boolean(props.meta.config.pixelId)],
                  ["pixelOnStore", Boolean(props.meta.config.pixelId)],
                  ["currency", !props.meta.config.currency || props.meta.config.currency === "MYR"],
                ].map(([k, ok]) => <li key={String(k)} className="flex items-center gap-2">{ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-danger" />}{t(`ads.settings.track.${k}`, { currency: props.meta.config.currency ?? "" })}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">{t("ads.settings.trackingNote")}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Subscription */}
      <Card id="subscription" className="scroll-mt-24 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight"><Ticket className="size-5 text-primary" /> {t("ads.settings.subTitle")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-sm font-bold">{t("ads.settings.freeTrial")}</p>
            <p className="mt-1 text-sm text-muted">{t("ads.settings.trialUsed", { n: props.quota.trialUsed })}</p>
            <ProgressBar value={props.quota.trialUsed} max={3} className="mt-2" label={t("ads.settings.freeTrial")} />
          </div>
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-sm font-bold">{t("ads.settings.paidPlan")} · {formatMYR(props.price, locale)}/{t("ads.month")}</p>
            {props.quota.plan === "paid" && props.subscription ? (
              <>
                <p className="mt-1 text-sm text-muted">{t("ads.settings.monthlyUsed", { n: props.quota.monthlyUsed, date: date(props.subscription.periodEnd) })}</p>
                <ProgressBar value={props.quota.monthlyUsed} max={3} className="mt-2" label={t("ads.settings.paidPlan")} />
                {props.subscription.provider === "test" && <Badge tone="warning" className="mt-2">{t("ads.settings.testSub")}</Badge>}
              </>
            ) : (
              <>
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-muted">{["f1", "f2", "f3", "f4", "f5"].map((k) => <li key={k}>{t(`ads.settings.features.${k}`)}</li>)}</ul>
                {props.subscription && props.subscription.status !== "active" && <p className="mt-2 flex items-center gap-1.5 text-sm text-warning"><ShieldAlert className="size-4" /> {t(`ads.settings.subStatus.${props.subscription.status}`)}</p>}
                <Notice tone="blue" className="mt-3">{t("ads.settings.billingPending")}</Notice>
                {props.testActivationAllowed && props.isOwner && <Button size="sm" variant="secondary" className="mt-3" disabled={pending} onClick={() => act(activateTestSubscriptionAction, t("ads.settings.testActivated"))}>{t("ads.settings.activateTest")}</Button>}
              </>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">{t("ads.settings.rules")}</p>
        <p className="mt-1 text-xs font-semibold text-ink/70">{t("ads.feesNote")}</p>
      </Card>

      {/* Playbook */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-extrabold tracking-tight">{t("ads.settings.pbTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("ads.settings.pbSub")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {field("benchmarkLowPct")}
          {field("benchmarkHighPct")}
          {field("preferredLowPct")}
          {field("preferredHighPct")}
          {field("scaleBelowPct")}
          {field("cutLossSpendMultiple", false, "×")}
          {field("cutLossCppMultiple", false, "×")}
          {field("minObservationHours", false, t("ads.hours"))}
          {field("minPurchasesForScale", false, "")}
          {field("feePct")}
          {field("shippingSubsidySen", true)}
          {field("otherVariableSen", true)}
          {field("minProfitSen", true)}
          <label className="text-sm font-semibold">{t("ads.settings.pb.scalingReviewTime")}<Input type="time" value={pb.scalingReviewTime} onChange={(e) => setPb({ ...pb, scalingReviewTime: e.target.value })} disabled={!props.canManage} className="mt-1" /><span className="mt-1 block text-xs font-normal text-muted">{t("ads.settings.reviewTimeNote")}</span></label>
        </div>
        {props.canManage && <Button className="mt-5" disabled={pending} onClick={() => act(() => savePlaybookAction(pb), t("ads.settings.saved"))}><Save className="size-4" /> {t("common.save")}</Button>}
      </Card>
    </div>
  );
}
