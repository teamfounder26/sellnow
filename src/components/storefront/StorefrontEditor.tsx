"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, EyeOff, Monitor, Smartphone, Loader2, Rocket, ExternalLink, Copy, Check, X, AlertTriangle, Plus, Trash2, Sparkles, Info } from "lucide-react";
import clsx from "clsx";
import { useT, useLocale } from "@/lib/i18n/client";
import { Badge, Button, Card, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { StorefrontRenderer } from "./StorefrontRenderer";
import { GenerateStoreButtons } from "./GenerateStoreButtons";
import { FileUploader } from "@/components/FileUploader";
import { Celebration } from "@/components/Celebration";
import { saveStorefrontDraftAction, publishStorefrontAction, unpublishStorefrontAction, updateSlugAction } from "@/app/actions/storefront";
import type { StorefrontContent, StorefrontSection, StorefrontTheme, products } from "@/lib/db/schema";
import type { PublishIssue } from "@/lib/storefront/service";

type Product = typeof products.$inferSelect;
type Tab = "sections" | "design" | "policies" | "settings";

export function StorefrontEditor(props: {
  initialTab: Tab;
  canPublish: boolean;
  canEdit: boolean;
  aiConfigured: boolean;
  generatedByAI: boolean;
  storefront: { slug: string; status: string; publishedVersionId: string | null; content: StorefrontContent; theme: StorefrontTheme };
  versions: { id: string; version: number; publishedAt: string }[];
  products: Product[];
  businessName: string;
  baseUrl: string;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [content, setContent] = useState(props.storefront.content);
  const [theme, setTheme] = useState(props.storefront.theme);
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(content.sections[0]?.id ?? null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<null | { issues: PublishIssue[] } | { slug: string; firstPublish: boolean }>(null);
  const [slug, setSlug] = useState(props.storefront.slug);
  const [copied, setCopied] = useState(false);
  const liveUrl = `${props.baseUrl}/s/${props.storefront.slug}`;

  const update = (c: StorefrontContent) => {
    setContent(c);
    setDirty(true);
  };
  const updateSection = (id: string, patch: Partial<StorefrontSection>) => update({ ...content, sections: content.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const setProp = (id: string, key: string, value: unknown) => {
    const s = content.sections.find((x) => x.id === id)!;
    updateSection(id, { props: { ...s.props, [key]: value } });
  };
  const move = (i: number, dir: -1 | 1) => {
    const next = [...content.sections];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    update({ ...content, sections: next });
  };

  const save = () =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        setError(null);
        const r = await saveStorefrontDraftAction(content, theme);
        if (r.ok) {
          setDirty(false);
          router.refresh();
        } else setError(r.error);
        resolve(r.ok);
      }),
    );

  const publish = () =>
    start(async () => {
      if (dirty) {
        const r = await saveStorefrontDraftAction(content, theme);
        if (!r.ok) return setError(r.error);
        setDirty(false);
      }
      const r = await publishStorefrontAction();
      if (!r.ok) return setError(r.error);
      setPublishState(r.data);
      router.refresh();
    });

  const productMap = useMemo(() => new Map(props.products.map((p) => [p.id, p])), [props.products]);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t("storefront.title")}</h1>
            <Badge tone={props.storefront.status === "PUBLISHED" ? "success" : "neutral"}>{t(`storefront.status.${props.storefront.status}`)}</Badge>
            {dirty ? <Badge tone="warning">{t("storefront.draftUnsaved")}</Badge> : <Badge tone="neutral">{t("storefront.draftSaved")}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">{t("storefront.sub")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.storefront.publishedVersionId && (
            <a href={`/s/${props.storefront.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 text-sm font-semibold">
              <ExternalLink className="size-4" /> {t("storefront.viewLive")}
            </a>
          )}
          {props.canEdit && (
            <Button variant="secondary" size="sm" onClick={() => void save()} disabled={pending || !dirty}>
              {pending && <Loader2 className="size-4 animate-spin" />} {t("storefront.saveDraft")}
            </Button>
          )}
          {props.canPublish && (
            <Button size="sm" onClick={publish} disabled={pending}>
              <Rocket className="size-4" /> {t("storefront.publish")}
            </Button>
          )}
        </div>
      </div>

      <Notice tone={props.generatedByAI ? "ai" : "neutral"} className="flex items-center gap-2">
        {props.generatedByAI ? <Sparkles className="size-4 shrink-0" /> : <Info className="size-4 shrink-0" />}
        {t(props.generatedByAI ? "storefront.generatedWith.ai" : "storefront.generatedWith.template")}
      </Notice>
      {error && <Notice tone="danger">{t(error)}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Editor panel */}
        <Card className="h-fit overflow-hidden">
          <div className="flex overflow-x-auto border-b border-line p-1.5">
            {(["sections", "design", "policies", "settings"] as Tab[]).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={clsx("whitespace-nowrap rounded-pill px-3.5 py-1.5 text-sm font-semibold", tab === k ? "bg-ink text-white" : "text-muted hover:text-ink")}>
                {t(`storefront.${k}`)}
              </button>
            ))}
          </div>
          <fieldset disabled={!props.canEdit} className="p-4">
            {tab === "sections" && (
              <div className="space-y-2">
                {content.sections.map((s, i) => (
                  <div key={s.id} className={cx("rounded-2xl border", open === s.id ? "border-ink/30" : "border-line")}>
                    <div className="flex items-center gap-1 px-3 py-2">
                      <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className={cx("flex-1 text-left text-sm font-bold", !s.visible && "text-muted line-through")}>
                        {t(`storefront.sectionTypes.${s.type}`)}
                      </button>
                      <IconBtn label={t("storefront.moveUp")} onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></IconBtn>
                      <IconBtn label={t("storefront.moveDown")} onClick={() => move(i, 1)} disabled={i === content.sections.length - 1}><ArrowDown className="size-4" /></IconBtn>
                      <IconBtn label={s.visible ? t("storefront.hide") : t("storefront.show")} onClick={() => updateSection(s.id, { visible: !s.visible })}>
                        {s.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </IconBtn>
                    </div>
                    {open === s.id && <div className="space-y-3 border-t border-line px-3 py-3"><SectionFields s={s} setProp={(k, v) => setProp(s.id, k, v)} /></div>}
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={() => update({ ...content, sections: [...content.sections, { id: `sec_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, type: "embed", visible: true, props: { title: "", mode: "url", url: "", html: "", height: 480 } }] })}>
                  <Plus className="size-4" /> {t("storefront.embed.add")}
                </Button>
                <div className="pt-3">
                  <GenerateStoreButtons ai={props.aiConfigured} confirm />
                </div>
              </div>
            )}
            {tab === "design" && (
              <div className="grid grid-cols-2 gap-3">
                {(["primary", "accent", "background", "text"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 rounded-xl border border-line p-2 text-sm font-semibold">
                    <input
                      type="color"
                      value={theme[k]}
                      onChange={(e) => {
                        setTheme({ ...theme, [k]: e.target.value });
                        setDirty(true);
                      }}
                      className="size-9 cursor-pointer rounded-lg border border-line p-0.5"
                    />
                    {t(`storefront.color${k[0]!.toUpperCase()}${k.slice(1)}`)}
                  </label>
                ))}
              </div>
            )}
            {tab === "policies" && (
              <div className="space-y-3">
                <Field label={t("storefront.contactEmail")} required>
                  <Input type="email" value={content.policies?.contactEmail ?? ""} onChange={(e) => update({ ...content, policies: { ...content.policies, contactEmail: e.target.value } })} />
                </Field>
                <Field label={t("storefront.contactPhone")}>
                  <Input value={content.policies?.contactPhone ?? ""} onChange={(e) => update({ ...content, policies: { ...content.policies, contactPhone: e.target.value } })} />
                </Field>
                <Field label={t("storefront.refundPolicy")}>
                  <Textarea value={content.policies?.refund ?? ""} onChange={(e) => update({ ...content, policies: { ...content.policies, refund: e.target.value } })} />
                </Field>
                <Field label={t("storefront.shippingPolicy")}>
                  <Textarea value={content.policies?.shipping ?? ""} onChange={(e) => update({ ...content, policies: { ...content.policies, shipping: e.target.value } })} />
                </Field>
              </div>
            )}
            {tab === "settings" && (
              <div className="space-y-4">
                <Field label={t("storefront.slug")} hint={t("storefront.slugHelp")}>
                  <div className="flex gap-2">
                    <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-11"
                      disabled={pending || slug === props.storefront.slug || !props.canPublish}
                      onClick={() =>
                        start(async () => {
                          const r = await updateSlugAction(slug);
                          if (!r.ok) setError(r.error);
                          router.refresh();
                        })
                      }
                    >
                      {t("common.save")}
                    </Button>
                  </div>
                </Field>
                <div>
                  <p className="text-sm font-semibold">{t("storefront.productsOnPage")}</p>
                  <div className="mt-2 space-y-1.5">
                    {props.products.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-ink"
                          checked={content.productIds.includes(p.id)}
                          onChange={(e) => update({ ...content, productIds: e.target.checked ? [...content.productIds, p.id] : content.productIds.filter((x) => x !== p.id) })}
                        />
                        {p.name} <span className="text-muted">· {t(`categories.${p.type}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Field label={t("storefront.orderBump")}>
                  <Select value={content.orderBumpProductId ?? ""} onChange={(e) => update({ ...content, orderBumpProductId: e.target.value || null })}>
                    <option value="">{t("storefront.orderBumpNone")}</option>
                    {props.products.filter((p) => p.type === "physical" || p.type === "digital").map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("storefront.customDomain")} hint={t("storefront.customDomainNote")}>
                  <Input disabled placeholder="kedai.example.my" />
                </Field>
                {props.versions.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold">{t("storefront.versions")}</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {props.versions.map((v) => (
                        <li key={v.id} className="flex justify-between text-muted">
                          <span>
                            {t("storefront.versionN", { n: v.version })} {v.id === props.storefront.publishedVersionId && <Badge tone="success">{t("common.live")}</Badge>}
                          </span>
                          <time>{new Date(v.publishedAt).toLocaleString(locale === "ms" ? "ms-MY" : "en-MY")}</time>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {props.storefront.status === "PUBLISHED" && props.canPublish && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      start(async () => {
                        await unpublishStorefrontAction();
                        router.refresh();
                      })
                    }
                  >
                    {t("storefront.unpublish")}
                  </Button>
                )}
              </div>
            )}
          </fieldset>
        </Card>

        {/* Preview */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-muted">{t("storefront.preview")}</p>
            <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
              {(["desktop", "mobile"] as const).map((v) => (
                <button key={v} onClick={() => setViewport(v)} className={clsx("inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold", viewport === v ? "bg-ink text-white" : "text-muted")}>
                  {v === "desktop" ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />} {t(`storefront.${v}`)}
                </button>
              ))}
            </div>
          </div>
          <div className={clsx("mx-auto overflow-hidden rounded-[24px] border border-line shadow-lift transition-all", viewport === "mobile" ? "max-w-[390px]" : "max-w-full")}>
            <div className="max-h-[78vh] overflow-y-auto">
              <StorefrontRenderer
                content={content}
                theme={theme}
                products={content.productIds.map((id) => productMap.get(id)).filter((p): p is Product => Boolean(p))}
                businessName={props.businessName}
                slug={props.storefront.slug}
                locale={locale}
                preview
                viewport={viewport}
              />
            </div>
          </div>
        </div>
      </div>

      {publishState && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal="true">
          {"slug" in publishState && publishState.firstPublish && <Celebration id={`publish-${publishState.slug}`} title={t("milestones.store_live")} />}
          <Card className="w-full max-w-md p-6 animate-rise">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-extrabold">{t("storefront.publishTitle")}</h2>
              <button onClick={() => setPublishState(null)} className="rounded-full p-1 hover:bg-ink/5" aria-label={t("common.close")}>
                <X className="size-5" />
              </button>
            </div>
            {"issues" in publishState ? (
              <>
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-warning">
                  <AlertTriangle className="size-4" /> {t("storefront.publishIssues")}
                </p>
                <ul className="mt-3 space-y-2">
                  {publishState.issues.map((i, n) => (
                    <li key={n} className="flex items-start justify-between gap-3 rounded-xl bg-cream px-3 py-2 text-sm">
                      <span>{t(i.code, i.params)}</span>
                      <FixLink code={i.code} onTab={(tb) => { setTab(tb); setPublishState(null); }} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="mt-3 text-lg font-bold text-success">{t("storefront.publishSuccess")}</p>
                <p className="mt-1 text-sm text-muted">{t("storefront.publishSuccessBody")}</p>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-cream p-2 pl-3 text-sm">
                  <span className="flex-1 truncate font-mono">{liveUrl}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(liveUrl);
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? t("common.copied") : t("common.copy")}
                  </Button>
                </div>
                <a href={`/s/${publishState.slug}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold underline">
                  {t("storefront.viewLive")} <ExternalLink className="size-3.5" />
                </a>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

function FixLink({ code, onTab }: { code: string; onTab: (t: "policies" | "settings" | "sections") => void }) {
  const t = useT();
  const map: Record<string, { href?: string; tab?: "policies" | "settings" | "sections" }> = {
    "publish.emailUnverified": { href: "/dashboard/settings" },
    "publish.paymentNotConnected": { href: "/dashboard/settings?tab=payments" },
    "publish.contactEmail": { tab: "policies" },
    "publish.refundPolicy": { tab: "policies" },
    "publish.shippingPolicy": { tab: "policies" },
    "publish.noProducts": { tab: "settings" },
    "publish.heroHeadline": { tab: "sections" },
    "publish.testimonialsUnconfirmed": { tab: "sections" },
    "publish.digitalFile": { href: "/dashboard/products" },
    "publish.fulfillment": { href: "/dashboard/products" },
    "publish.productPrice": { href: "/dashboard/products" },
    "publish.outOfStock": { href: "/dashboard/products" },
  };
  const m = map[code];
  if (!m) return null;
  return m.href ? (
    <Link href={m.href} className="shrink-0 font-bold underline">{t("storefront.fix")}</Link>
  ) : (
    <button onClick={() => onTab(m.tab!)} className="shrink-0 font-bold underline">{t("storefront.fix")}</button>
  );
}

function SectionFields({ s, setProp }: { s: StorefrontSection; setProp: (k: string, v: unknown) => void }) {
  const t = useT();
  const p = s.props as Record<string, unknown>;
  const text = (k: string, label: string, multi = false) =>
    multi ? (
      <Field label={t(`storefront.fields.${label}`)}>
        <Textarea value={String(p[k] ?? "")} onChange={(e) => setProp(k, e.target.value)} />
      </Field>
    ) : (
      <Field label={t(`storefront.fields.${label}`)}>
        <Input value={String(p[k] ?? "")} onChange={(e) => setProp(k, e.target.value)} />
      </Field>
    );
  type Item = Record<string, string>;
  const list = (k: string, fields: [string, string, boolean][], empty: Item) => {
    const items = (p[k] as Item[]) ?? [];
    return (
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="space-y-1.5 rounded-xl bg-cream p-2.5">
            {fields.map(([fk, label, multi]) =>
              multi ? (
                <Textarea key={fk} aria-label={t(`storefront.fields.${label}`)} placeholder={t(`storefront.fields.${label}`)} value={it[fk] ?? ""} onChange={(e) => setProp(k, items.map((x, j) => (j === i ? { ...x, [fk]: e.target.value } : x)))} className="min-h-16" />
              ) : (
                <Input key={fk} aria-label={t(`storefront.fields.${label}`)} placeholder={t(`storefront.fields.${label}`)} value={it[fk] ?? ""} onChange={(e) => setProp(k, items.map((x, j) => (j === i ? { ...x, [fk]: e.target.value } : x)))} />
              ),
            )}
            <button type="button" onClick={() => setProp(k, items.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
              <Trash2 className="size-3.5" /> {t("common.remove")}
            </button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setProp(k, [...items, empty])}>
          <Plus className="size-4" /> {t("storefront.fields.addItem")}
        </Button>
      </div>
    );
  };

  switch (s.type) {
    case "hero":
      return (
        <>
          {text("headline", "headline")}
          {text("subheadline", "subheadline", true)}
          {text("cta", "cta")}
          <Field label={t("storefront.fields.heroImage")}>
            <FileUploader kind="image" accept="image/jpeg,image/png,image/webp" value={(p.imageAssetId as string) ?? null} onChange={(id) => setProp("imageAssetId", id)} />
          </Field>
        </>
      );
    case "benefits":
      return (
        <>
          {text("title", "title")}
          {list("items", [["title", "itemTitle", false], ["body", "itemBody", true]], { title: "", body: "" })}
        </>
      );
    case "problem_solution":
      return (
        <>
          {text("problem", "problem", true)}
          {text("solution", "solution", true)}
        </>
      );
    case "offer":
      return (
        <>
          {text("title", "title")}
          {text("body", "body", true)}
        </>
      );
    case "faq":
      return (
        <>
          {text("title", "title")}
          {list("items", [["q", "question", false], ["a", "answer", true]], { q: "", a: "" })}
        </>
      );
    case "social_proof":
      return (
        <>
          <Notice tone="ai">{t("storefront.fields.testimonialsNote")}</Notice>
          {text("title", "title")}
          {list("testimonials", [["quote", "quote", true], ["author", "author", false]], { quote: "", author: "" })}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4 accent-ink" checked={Boolean(p.confirmed)} onChange={(e) => setProp("confirmed", e.target.checked)} />
            {t("storefront.fields.confirmTestimonials")}
          </label>
        </>
      );
    case "cta":
      return (
        <>
          {text("headline", "headline")}
          {text("button", "button")}
        </>
      );
    case "details":
      return (
        <>
          {text("title", "title")}
          {list("items", [["label", "itemTitle", false], ["value", "itemBody", true]], { label: "", value: "" })}
        </>
      );
    case "contact":
      return (
        <>
          {text("title", "title")}
          {text("body", "body", true)}
        </>
      );
    case "embed":
      return (
        <>
          <Notice tone="blue">{t("storefront.embed.note")}</Notice>
          {text("title", "title")}
          <Field label={t("storefront.embed.mode")}>
            <select className="h-10 rounded-xl border border-line bg-white px-3 text-sm" value={String(p.mode ?? "url")} onChange={(e) => setProp("mode", e.target.value)}>
              <option value="url">{t("storefront.embed.modeUrl")}</option>
              <option value="html">{t("storefront.embed.modeHtml")}</option>
            </select>
          </Field>
          {p.mode === "html" ? (
            <Field label={t("storefront.embed.html")} hint={t("storefront.embed.htmlHint")}>
              <textarea rows={6} maxLength={20000} className="w-full rounded-xl border border-line bg-white p-3 font-mono text-xs" value={String(p.html ?? "")} onChange={(e) => setProp("html", e.target.value)} />
            </Field>
          ) : (
            <Field label={t("storefront.embed.url")} hint={t("storefront.embed.urlHint")}>
              <input className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" inputMode="url" value={String(p.url ?? "")} onChange={(e) => setProp("url", e.target.value)} />
            </Field>
          )}
          <Field label={t("storefront.embed.height")}>
            <input type="number" min={120} max={1600} className="h-10 w-32 rounded-xl border border-line bg-white px-3 text-sm" value={Number(p.height ?? 480)} onChange={(e) => setProp("height", Number(e.target.value))} />
          </Field>
        </>
      );
    default:
      return text("title", "title");
  }
}
