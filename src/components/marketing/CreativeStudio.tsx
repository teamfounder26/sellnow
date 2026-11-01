"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, Copy, ImageOff, AlertTriangle } from "lucide-react";
import { Badge, Button, Card, Field, Notice, Select, EmptyState } from "@/components/ui";
import { GenerationProgress } from "@/components/ai/GenerationProgress";
import { useT } from "@/lib/i18n/client";
import { generateCreativeAction, setCreativeStatusAction } from "@/app/actions/marketing";
import type { CreativeTextOutput } from "@/lib/ai/schemas";

type Creative = { id: string; type: string; objective: string; ratio: string | null; status: string; productId: string | null; priceSnapshotSen: number | null; content: CreativeTextOutput; createdAt: string };

export function CreativeStudio(p: {
  canEdit: boolean;
  aiConfigured: boolean;
  credits: number;
  cost: number;
  products: { id: string; name: string; priceSen: number }[];
  textTypes: string[];
  visualTypes: string[];
  objectives: string[];
  ratios: string[];
  creatives: Creative[];
}) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState({ productId: p.products[0]?.id ?? "", type: p.textTypes[0]!, objective: p.objectives[0]!, style: "friendly", ratio: "1:1" });
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; params?: Record<string, string | number> } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  if (!p.products.length) return <EmptyState title={t("creative.needProduct")} />;

  const generate = () =>
    start(async () => {
      setError(null);
      const r = await generateCreativeAction(form);
      if (!r.ok) setError({ code: r.error, params: r.params });
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="h-fit space-y-4 p-5">
        <Field label={t("creative.product")}>
          <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
            {p.products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label={t("creative.objective")}>
          <Select value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })}>
            {p.objectives.map((x) => <option key={x} value={x}>{t(`creative.objectives.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("creative.type")}>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {p.textTypes.map((x) => <option key={x} value={x}>{t(`creative.types.${x}`)}</option>)}
            {p.visualTypes.map((x) => <option key={x} value={x} disabled>{t(`creative.types.${x}`)} — {t("common.notAvailable")}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("creative.style")}>
            <Select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
              {["friendly", "premium", "playful", "urgent"].map((x) => <option key={x} value={x}>{t(`creative.styles.${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("creative.ratio")}>
            <Select value={form.ratio} onChange={(e) => setForm({ ...form, ratio: e.target.value })}>
              {p.ratios.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
        </div>
        <Button className="w-full" onClick={generate} disabled={!p.aiConfigured || !p.canEdit || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t("creative.generate", { cost: p.cost })}
        </Button>
        <p className="text-xs text-muted">{t("credits.balance", { n: p.credits })}</p>
        {error && <Notice tone="danger">{t(error.code, error.params)}</Notice>}
        <Notice tone="neutral" className="flex gap-2 text-xs">
          <ImageOff className="size-4 shrink-0" /> {t("creative.imageNotConfigured")}
        </Notice>
      </Card>

      <div className="space-y-4">
        <p className="text-lg font-bold">{t("creative.library")}</p>
        {pending && <GenerationProgress label={t("creative.generating")} />}
        {p.creatives.length === 0 && !pending ? (
          <EmptyState title={t("creative.empty")} />
        ) : (
          p.creatives.map((c) => {
            const prod = p.products.find((x) => x.id === c.productId);
            const stale = prod && c.priceSnapshotSen != null && prod.priceSen !== c.priceSnapshotSen;
            return (
              <Card key={c.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="ai">{t(`creative.types.${c.type}`)}</Badge>
                  <Badge>{t(`creative.objectives.${c.objective}`)}</Badge>
                  {c.ratio && <Badge>{c.ratio}</Badge>}
                  {prod && <span className="text-sm text-muted">{prod.name}</span>}
                  <span className="flex-1" />
                  {c.status === "approved" ? (
                    <Badge tone="success"><Check className="size-3" /> {t("common.approved")}</Badge>
                  ) : (
                    p.canEdit && (
                      <Button size="sm" variant="secondary" onClick={() => start(async () => { await setCreativeStatusAction(c.id, "approved"); router.refresh(); })}>
                        {t("common.approve")}
                      </Button>
                    )
                  )}
                </div>
                {stale && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-warning">
                    <AlertTriangle className="size-4" /> {t("creative.priceStale")}
                  </p>
                )}
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {c.content.variants.map((v, i) => {
                    const text = `${v.headline}\n\n${v.primary_text}\n\n${v.call_to_action}\n${v.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`;
                    return (
                      <div key={i} className="rounded-2xl bg-cream p-4 text-sm">
                        <p className="text-xs font-semibold text-muted">{t("creative.variant", { n: i + 1 })}</p>
                        <p className="mt-1 font-bold">{v.headline}</p>
                        <p className="mt-2 whitespace-pre-wrap">{v.primary_text}</p>
                        <p className="mt-2 font-semibold">{v.call_to_action}</p>
                        <p className="mt-1 text-ai-strong">{v.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
                        <button
                          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
                          onClick={() => {
                            void navigator.clipboard?.writeText(text);
                            setCopied(`${c.id}-${i}`);
                          }}
                        >
                          {copied === `${c.id}-${i}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === `${c.id}-${i}` ? t("common.copied") : t("common.copy")}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {c.content.notes && <p className="mt-3 text-xs text-muted">{t("creative.notes")}: {c.content.notes}</p>}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
