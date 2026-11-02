"use client";
import { useState } from "react";
import { ChevronDown, ImagePlus, Loader2, Package, RefreshCw, Sparkles, X } from "lucide-react";
import type { PosterSettings } from "@/lib/db/schema";
import { POSTER_ANGLES, POSTER_OBJECTIVES, POSTER_RATIOS, POSTER_STYLES, POSTER_THEMES, POSTER_VARIATIONS } from "@/lib/posters/options";
import { formatMYR } from "@/lib/money";
import { Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { asset, type ProductOpt, type StudioEnv, type T } from "./types";

function Chips<V extends string | number>({ value, options, onChange, label, disabled }: { value: V; options: { v: V; label: string; off?: boolean }[]; onChange: (v: V) => void; label: string; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          disabled={disabled || o.off}
          onClick={() => onChange(o.v)}
          className={cx("rounded-pill px-3 py-1.5 text-xs font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-40", value === o.v ? "bg-primary text-white ring-primary" : "bg-white text-ink ring-line hover:ring-primary/50")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

async function upload(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", "image");
  const r = await fetch("/api/upload", { method: "POST", body: fd }).then((x) => x.json() as Promise<{ ok: boolean; id?: string }>);
  return r.ok ? r.id! : null;
}

export function SetupPanel(props: {
  t: T;
  env: StudioEnv;
  products: ProductOpt[];
  productId: string;
  onProduct?: (id: string) => void;
  settings: PosterSettings;
  onChange: (s: PosterSettings) => void;
  locked: boolean;
  pending: boolean;
  mode: "create" | "regenerate";
  onSubmit: () => void;
}) {
  const { t, env, settings: st, onChange } = props;
  const [openAdv, setOpenAdv] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const product = props.products.find((p) => p.id === props.productId);
  const set = (patch: Partial<PosterSettings>) => onChange({ ...st, ...patch });
  const adv = (patch: Partial<PosterSettings["advanced"]>) => onChange({ ...st, advanced: { ...st.advanced, ...patch } });
  const hasTestimonial = env.testimonials > 0 || Boolean(st.advanced.testimonial?.permission && st.advanced.testimonial.quote && st.advanced.testimonial.author);
  const needsDescription = product && !product.description.trim() && !st.advanced.keyMessage?.trim();
  const dis = props.locked || props.pending || !env.canEdit;

  const onUpload = async (key: "logo" | "ref", f: File | undefined) => {
    if (!f) return;
    setUploading(key);
    const id = await upload(f);
    setUploading(null);
    if (!id) return;
    if (key === "logo") adv({ logoAssetId: id });
    else adv({ referenceAssetIds: [...(st.advanced.referenceAssetIds ?? []), id].slice(0, 4) });
  };

  return (
    <Card className="h-fit space-y-5 p-5 @4xl:sticky @4xl:top-24">
      {/* Step 1 — product */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.step.1")}</h2>
        <Select aria-label={t("posters.setup.product")} value={props.productId} disabled={!props.onProduct || dis} onChange={(e) => props.onProduct?.(e.target.value)}>
          {props.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {product && (
          <div className="flex gap-3 rounded-2xl bg-canvas p-3">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-line">
              {product.imageAssetId ? <img src={asset(product.imageAssetId)!} alt="" className="h-full w-full object-cover" /> : <Package className="size-6 text-primary/40" />}
            </div>
            <div className="min-w-0 text-sm">
              <p className="truncate font-bold">{product.name}</p>
              <p className="font-semibold text-primary">{formatMYR(product.priceSen, env.locale)}</p>
              <p className="line-clamp-2 text-xs text-muted">{product.description || t("posters.setup.noDescription")}</p>
            </div>
          </div>
        )}
        {needsDescription && (
          <Field label={t("posters.setup.askDescribe")} hint={t("posters.setup.askDescribeHint")}>
            <Textarea rows={2} maxLength={300} value={st.advanced.keyMessage ?? ""} onChange={(e) => adv({ keyMessage: e.target.value })} disabled={dis} />
          </Field>
        )}
      </section>

      {/* Step 2 — strategy */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.step.2")}</h2>
        <Field label={t("posters.setup.objective")}>
          <Select value={st.objective} onChange={(e) => set({ objective: e.target.value as PosterSettings["objective"] })} disabled={dis}>
            <option value="auto">{t("posters.aiRecommend")}</option>
            {POSTER_OBJECTIVES.map((o) => (
              <option key={o} value={o} disabled={!product?.allowed.includes(o)}>
                {t(`posters.objective.${o}`)}
                {!product?.allowed.includes(o) ? ` — ${t(`posters.objectiveNA.${o}`)}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{t("posters.setup.theme")}</p>
          <Chips label={t("posters.setup.theme")} value={st.theme} onChange={(v) => set({ theme: v })} disabled={dis} options={[{ v: "auto" as const, label: t("posters.aiDecide") }, ...POSTER_THEMES.map((x) => ({ v: x, label: t(`posters.theme.${x}`), off: x === "testimonial" && !hasTestimonial }))]} />
          {!hasTestimonial && <p className="text-xs text-muted">{t("posters.setup.noTestimonial")}</p>}
        </div>
        <Field label={t("posters.setup.angle")}>
          <Select value={st.angle} onChange={(e) => set({ angle: e.target.value as PosterSettings["angle"] })} disabled={dis}>
            <option value="auto">{t("posters.aiRecommend")}</option>
            {POSTER_ANGLES.map((a) => (
              <option key={a} value={a}>
                {t(`posters.angle.${a}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{t("posters.setup.style")}</p>
          <Chips label={t("posters.setup.style")} value={st.style} onChange={(v) => set({ style: v })} disabled={dis} options={[...POSTER_STYLES.map((x) => ({ v: x, label: t(`posters.style.${x}`) })), { v: "auto" as const, label: t("posters.aiDecide") }]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">{t("posters.setup.ratio")}</p>
            <Chips label={t("posters.setup.ratio")} value={st.ratio} onChange={(v) => set({ ratio: v })} disabled={dis} options={POSTER_RATIOS.map((r) => ({ v: r, label: r }))} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">{t("posters.setup.variations")}</p>
            <Chips label={t("posters.setup.variations")} value={st.variations} onChange={(v) => set({ variations: v })} disabled={dis} options={POSTER_VARIATIONS.map((n) => ({ v: n, label: String(n) }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{t("posters.setup.language")}</p>
          <Chips label={t("posters.setup.language")} value={st.language} onChange={(v) => set({ language: v })} disabled={dis} options={(["ms", "en", "mixed"] as const).map((l) => ({ v: l, label: t(`posters.lang.${l}`) }))} />
        </div>
      </section>

      {/* Advanced settings */}
      <section className="rounded-2xl ring-1 ring-line">
        <button type="button" onClick={() => setOpenAdv(!openAdv)} aria-expanded={openAdv} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold">
          {t("posters.adv.title")}
          <ChevronDown className={cx("size-4 transition", openAdv && "rotate-180")} />
        </button>
        {openAdv && (
          <div className="space-y-4 border-t border-line px-4 py-4">
            <p className="text-xs text-muted">{t("posters.adv.sub")}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.adv.customer")}</p>
            <Field label={t("posters.adv.audience")}><Input value={st.advanced.audience ?? ""} maxLength={300} onChange={(e) => adv({ audience: e.target.value })} disabled={dis} placeholder={t("posters.adv.aiDefault")} /></Field>
            <Field label={t("posters.adv.problem")}><Input value={st.advanced.problem ?? ""} maxLength={300} onChange={(e) => adv({ problem: e.target.value })} disabled={dis} placeholder={t("posters.adv.aiDefault")} /></Field>
            <Field label={t("posters.adv.motivation")}><Input value={st.advanced.motivation ?? ""} maxLength={300} onChange={(e) => adv({ motivation: e.target.value })} disabled={dis} placeholder={t("posters.adv.aiDefault")} /></Field>
            <Field label={t("posters.adv.awareness")}>
              <Select value={st.advanced.awareness ?? ""} onChange={(e) => adv({ awareness: (e.target.value || undefined) as PosterSettings["advanced"]["awareness"] })} disabled={dis}>
                <option value="">{t("posters.aiRecommend")}</option>
                {(["unaware", "problem", "solution", "product", "most"] as const).map((a) => <option key={a} value={a}>{t(`posters.adv.aw.${a}`)}</option>)}
              </Select>
            </Field>

            <p className="pt-2 text-xs font-bold uppercase tracking-wider text-muted">{t("posters.adv.marketing")}</p>
            <Field label={t("posters.adv.keyMessage")}><Input value={st.advanced.keyMessage ?? ""} maxLength={300} onChange={(e) => adv({ keyMessage: e.target.value })} disabled={dis} placeholder={t("posters.adv.aiDefault")} /></Field>
            <Field label={t("posters.adv.offer")} hint={t("posters.adv.offerHint")}><Input value={st.advanced.offer ?? ""} maxLength={300} onChange={(e) => adv({ offer: e.target.value })} disabled={dis} /></Field>
            <Field label={t("posters.adv.proof")} hint={t("posters.adv.proofHint")}><Textarea rows={2} value={st.advanced.proofPoints ?? ""} maxLength={600} onChange={(e) => adv({ proofPoints: e.target.value })} disabled={dis} /></Field>
            <Field label={t("posters.adv.cta")}><Input value={st.advanced.customCta ?? ""} maxLength={30} onChange={(e) => adv({ customCta: e.target.value })} disabled={dis} placeholder={t("posters.adv.aiDefault")} /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={st.advanced.showPrice !== false} onChange={(e) => adv({ showPrice: e.target.checked })} disabled={dis} className="size-4 accent-[var(--color-primary)]" /> {t("posters.adv.showPrice")}</label>
            <div className="space-y-2 rounded-xl bg-canvas p-3">
              <p className="text-sm font-semibold">{t("posters.adv.testimonial")}</p>
              <p className="text-xs text-muted">{t("posters.adv.testimonialHint")}</p>
              <Textarea rows={2} maxLength={400} placeholder={t("posters.adv.quote")} value={st.advanced.testimonial?.quote ?? ""} onChange={(e) => adv({ testimonial: { quote: e.target.value, author: st.advanced.testimonial?.author ?? "", permission: st.advanced.testimonial?.permission ?? false } })} disabled={dis} />
              <Input maxLength={80} placeholder={t("posters.adv.author")} value={st.advanced.testimonial?.author ?? ""} onChange={(e) => adv({ testimonial: { quote: st.advanced.testimonial?.quote ?? "", author: e.target.value, permission: st.advanced.testimonial?.permission ?? false } })} disabled={dis} />
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 size-4" checked={st.advanced.testimonial?.permission ?? false} onChange={(e) => adv({ testimonial: { quote: st.advanced.testimonial?.quote ?? "", author: st.advanced.testimonial?.author ?? "", permission: e.target.checked } })} disabled={dis} /> {t("posters.adv.permission")}</label>
            </div>

            <p className="pt-2 text-xs font-bold uppercase tracking-wider text-muted">{t("posters.adv.brand")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className={cx("inline-flex cursor-pointer items-center gap-2 rounded-pill bg-white px-3 py-2 text-xs font-semibold ring-1 ring-line", dis && "pointer-events-none opacity-50")}>
                {uploading === "logo" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {t("posters.adv.logo")}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onUpload("logo", e.target.files?.[0])} />
              </label>
              {st.advanced.logoAssetId && (
                <span className="relative inline-flex">
                  <img src={asset(st.advanced.logoAssetId)!} alt={t("posters.adv.logo")} className="h-10 rounded-lg bg-white object-contain p-1 ring-1 ring-line" />
                  <button type="button" aria-label={t("common.remove")} onClick={() => adv({ logoAssetId: null })} className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 ring-1 ring-line"><X className="size-3" /></button>
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">{t("posters.adv.colors")}</p>
              <div className="flex items-center gap-2">
                {[0, 1].map((i) => (
                  <input key={i} type="color" aria-label={`${t("posters.adv.colors")} ${i + 1}`} value={st.advanced.brandColors?.[i] ?? (i === 0 ? "#1f83d8" : "#f5b700")} disabled={dis} onChange={(e) => { const c = [...(st.advanced.brandColors ?? ["#1F83D8", "#F5B700"])]; c[i] = e.target.value.toUpperCase(); adv({ brandColors: c.slice(0, 2) }); }} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-white" />
                ))}
                <span className="text-xs text-muted">{t("posters.adv.colorsHint")}</span>
              </div>
            </div>
            <Field label={t("posters.adv.font")}><Input value={st.advanced.fontPreference ?? ""} maxLength={60} onChange={(e) => adv({ fontPreference: e.target.value })} disabled={dis} placeholder={t("posters.adv.aiDefault")} /></Field>
            <div className="space-y-1.5">
              <label className={cx("inline-flex cursor-pointer items-center gap-2 rounded-pill bg-white px-3 py-2 text-xs font-semibold ring-1 ring-line", (dis || (st.advanced.referenceAssetIds?.length ?? 0) >= 4) && "pointer-events-none opacity-50")}>
                {uploading === "ref" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {t("posters.adv.references")}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onUpload("ref", e.target.files?.[0])} />
              </label>
              <div className="flex flex-wrap gap-2">
                {(st.advanced.referenceAssetIds ?? []).map((id) => (
                  <span key={id} className="relative inline-flex">
                    <img src={asset(id)!} alt="" className="size-12 rounded-lg object-cover ring-1 ring-line" />
                    <button type="button" aria-label={t("common.remove")} onClick={() => adv({ referenceAssetIds: st.advanced.referenceAssetIds!.filter((x) => x !== id) })} className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 ring-1 ring-line"><X className="size-3" /></button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted">{t("posters.adv.referencesHint")}</p>
            </div>
            <Field label={t("posters.adv.restrictions")}><Input value={st.advanced.restrictions ?? ""} maxLength={400} onChange={(e) => adv({ restrictions: e.target.value })} disabled={dis} placeholder={t("posters.adv.restrictionsPh")} /></Field>

            <p className="pt-2 text-xs font-bold uppercase tracking-wider text-muted">{t("posters.adv.design")}</p>
            <Field label={t("posters.adv.layout")}><Input value={st.advanced.layout ?? ""} maxLength={120} onChange={(e) => adv({ layout: e.target.value })} disabled={dis} placeholder={t("posters.adv.aiDefault")} /></Field>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">{t("posters.adv.density")}</p>
              <Chips label={t("posters.adv.density")} value={st.advanced.textDensity ?? "balanced"} onChange={(v) => adv({ textDensity: v })} disabled={dis} options={(["light", "balanced", "rich"] as const).map((d) => ({ v: d, label: t(`posters.adv.dens.${d}`) }))} />
            </div>
            <Field label={t("posters.adv.background")}><Input value={st.advanced.background ?? ""} maxLength={120} onChange={(e) => adv({ background: e.target.value })} disabled={dis} placeholder={t("posters.adv.aiDefault")} /></Field>
          </div>
        )}
      </section>

      {env.canEdit && (
        <div className="space-y-2">
          <Button className="w-full" onClick={props.onSubmit} disabled={props.pending || !product || props.locked || Boolean(st.advanced.testimonial?.quote && !st.advanced.testimonial.permission && st.theme === "testimonial")}>
            {props.pending ? <Loader2 className="size-4 animate-spin" /> : props.mode === "create" ? <Sparkles className="size-4" /> : <RefreshCw className="size-4" />}
            {t(props.mode === "create" ? "posters.setup.create" : "posters.setup.regenerate")}
          </Button>
          <p className="text-center text-xs text-muted">
            {env.aiConfigured ? t("posters.setup.briefCost", { n: env.costs.brief, balance: env.credits }) : t("posters.setup.manual")}
          </p>
        </div>
      )}
    </Card>
  );
}
