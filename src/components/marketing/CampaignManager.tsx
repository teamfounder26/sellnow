"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plug, Loader2, ShieldCheck, Megaphone } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Notice, Select } from "@/components/ui";
import { useT, useLocale } from "@/lib/i18n/client";
import { formatMYR, parseRinggitToSen } from "@/lib/money";
import { createCampaignAction, approveCampaignAction, publishCampaignAction } from "@/app/actions/marketing";

type Camp = { id: string; name: string; objective: string; status: string; dailyBudgetSen: number; durationDays: number; approvedBudgetSen: number | null; lastError: string | null };

export function CampaignManager(p: {
  canEdit: boolean;
  canApprove: boolean;
  meta: { appConfigured: boolean; connected: boolean };
  products: { id: string; name: string }[];
  creatives: { id: string; label: string; productId: string | null }[];
  campaigns: Camp[];
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", productId: p.products[0]?.id ?? "", creativeId: "", objective: "sales" as "awareness" | "traffic" | "leads" | "sales", location: "Malaysia", ageMin: 18, ageMax: 45, interests: "", dailyBudget: "20.00", durationDays: 7 });
  const daily = parseRinggitToSen(f.dailyBudget);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "errors.unexpected");
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        {error && <Notice tone="danger">{t(error)}</Notice>}
        {p.campaigns.length === 0 ? (
          <EmptyState icon={<Megaphone className="size-6" />} title={t("marketing.empty")} />
        ) : (
          p.campaigns.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold">{c.name}</p>
                <Badge tone={c.status === "approved" ? "success" : c.status === "active" ? "yellow" : c.status === "failed" ? "danger" : "neutral"}>{t(`marketing.status.${c.status}`)}</Badge>
                <Badge>{t(`marketing.objectives.${c.objective}`)}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">
                {formatMYR(c.dailyBudgetSen, locale)} × {c.durationDays} = <b>{formatMYR(c.dailyBudgetSen * c.durationDays, locale)}</b>
              </p>
              {c.lastError && <p className="mt-1 text-sm text-danger">{c.lastError}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {(c.status === "draft" || c.status === "pending_approval") && p.canApprove && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const total = formatMYR(c.dailyBudgetSen * c.durationDays, locale);
                      if (window.confirm(t("marketing.approveConfirm", { daily: formatMYR(c.dailyBudgetSen, locale), days: c.durationDays, total }))) run(() => approveCampaignAction(c.id));
                    }}
                    disabled={pending}
                  >
                    <ShieldCheck className="size-4" /> {t("marketing.approve")}
                  </Button>
                )}
                {c.status === "approved" && p.canApprove && (
                  <Button size="sm" variant="dark" onClick={() => run(() => publishCampaignAction(c.id))} disabled={pending}>
                    {pending && <Loader2 className="size-4 animate-spin" />} {t("marketing.publish")}
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="flex items-center gap-2 font-bold">
            <Plug className="size-5 text-ai-strong" /> {t("marketing.metaTitle")}
          </p>
          {p.meta.connected ? (
            <Badge tone="success" className="mt-2">{t("marketing.metaConnected")}</Badge>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">{p.meta.appConfigured ? t("marketing.metaConnectPending") : t("marketing.metaNotConfigured")}</p>
              <Button size="sm" variant="secondary" className="mt-3" disabled>
                {t("marketing.metaConnect")}
              </Button>
            </>
          )}
        </Card>

        {p.canEdit && p.products.length > 0 && (
          <Card className="space-y-3 p-5">
            <p className="font-bold">{t("marketing.newCampaign")}</p>
            <Field label={t("marketing.name")}>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label={t("marketing.product")}>
              <Select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
                {p.products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            <Field label={t("marketing.creative")}>
              <Select value={f.creativeId} onChange={(e) => setF({ ...f, creativeId: e.target.value })}>
                <option value="">{t("common.none")}</option>
                {p.creatives.filter((c) => !c.productId || c.productId === f.productId).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label={t("marketing.objective")}>
              <Select value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value as typeof f.objective })}>
                {(["awareness", "traffic", "leads", "sales"] as const).map((o) => <option key={o} value={o}>{t(`marketing.objectives.${o}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("marketing.location")}>
              <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
            </Field>
            <Field label={t("marketing.ageRange")}>
              <div className="flex items-center gap-2">
                <Input type="number" min={18} max={65} value={f.ageMin} onChange={(e) => setF({ ...f, ageMin: Number(e.target.value) })} />
                <span>–</span>
                <Input type="number" min={18} max={65} value={f.ageMax} onChange={(e) => setF({ ...f, ageMax: Number(e.target.value) })} />
              </div>
            </Field>
            <Field label={t("marketing.interests")}>
              <Input value={f.interests} onChange={(e) => setF({ ...f, interests: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("marketing.dailyBudget")}>
                <Input inputMode="decimal" value={f.dailyBudget} onChange={(e) => setF({ ...f, dailyBudget: e.target.value })} />
              </Field>
              <Field label={t("marketing.duration")}>
                <Input type="number" min={1} max={90} value={f.durationDays} onChange={(e) => setF({ ...f, durationDays: Number(e.target.value) })} />
              </Field>
            </div>
            {daily !== null && <p className="text-sm font-semibold">{t("marketing.estTotal", { amount: formatMYR(daily * f.durationDays, locale) })}</p>}
            <p className="text-xs text-muted">{t("marketing.spendNote")}</p>
            <Button
              className="w-full"
              disabled={pending}
              onClick={() =>
                run(() =>
                  createCampaignAction({
                    name: f.name,
                    productId: f.productId,
                    creativeId: f.creativeId || null,
                    objective: f.objective,
                    audience: { location: f.location, ageMin: f.ageMin, ageMax: f.ageMax, interests: f.interests },
                    dailyBudget: f.dailyBudget,
                    durationDays: f.durationDays,
                  }),
                )
              }
            >
              {t("marketing.createDraft")}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
