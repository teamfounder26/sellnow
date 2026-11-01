import { Check, Package, Quote, Info } from "lucide-react";
import type { StorefrontContent, StorefrontTheme, products as productsTable } from "@/lib/db/schema";
import { ENGINES } from "@/lib/categories";
import { formatMYR } from "@/lib/money";
import { translate, type Locale } from "@/lib/i18n/translate";
import { DESIGN_PRESETS, onColor, type DesignPresetId } from "@/lib/website/design";
import { WEBSITE_TYPES, isWebsiteType } from "@/lib/website/types";
import { EnquiryForm } from "./EnquiryForm";
import { CartButton, CartDrawer, CartProvider } from "./Cart";
import { CatalogGrid } from "./CatalogGrid";
import { storefrontFontVars } from "./fonts";

type Product = typeof productsTable.$inferSelect;

export type RenderMode = "public" | "preview" | "example";

export type RendererProps = {
  content: StorefrontContent;
  theme: StorefrontTheme;
  products: Product[];
  businessName: string;
  slug: string;
  locale: Locale;
  /** public = live site · preview = owner's draft (navigable, no checkout) · example = representative template */
  mode?: RenderMode;
  viewport?: "desktop" | "mobile";
  /** Products that have variants (catalog shows "Choose options" → product page). */
  variantProductIds?: string[];
  /** @deprecated use mode="preview" */
  preview?: boolean;
};

/** Shared visual frame (fonts, CSS vars, header, cart, footer) for every storefront page. */
export function StorefrontFrame({ content, theme, businessName, slug, locale, mode = "public", children }: Omit<RendererProps, "products"> & { children: React.ReactNode }) {
  const t = (k: string, p?: Record<string, string | number>) => translate(locale, k, p);
  const preset = DESIGN_PRESETS[(theme.preset as DesignPresetId) ?? "modern"] ?? DESIGN_PRESETS.modern;
  const onPrimary = theme.onPrimary ?? onColor(theme.primary);
  const base = mode === "public" ? `/s/${slug}` : mode === "preview" ? "/preview/frame" : null;
  const type = isWebsiteType(content.websiteType) ? WEBSITE_TYPES[content.websiteType] : null;
  const hasCart = Boolean(type?.modules.includes("cart")) && content.salesMode !== "enquiry";
  const radius = { soft: ["18px", "14px"], round: ["28px", "999px"], sharp: ["4px", "4px"] }[preset.radius];
  const headingFont = preset.heading === "serif" ? "var(--font-sf-serif), Georgia, serif" : preset.heading === "display" ? "var(--font-sf-display), var(--font-jakarta), sans-serif" : "var(--font-jakarta), sans-serif";
  const style = {
    "--sf-primary": theme.primary,
    "--sf-on-primary": onPrimary,
    "--sf-accent": theme.accent,
    "--sf-radius": radius[0],
    "--sf-radius-btn": radius[1],
    "--sf-heading": headingFont,
    background: theme.background,
    color: theme.text,
  } as React.CSSProperties;

  return (
    <CartProvider slug={slug} disabled={mode !== "public"}>
      <div style={style} className={`${storefrontFontVars} min-h-full [&_h1]:[font-family:var(--sf-heading)] [&_h2]:[font-family:var(--sf-heading)]`}>
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <a href={base ?? "#"} className="text-lg font-extrabold tracking-tight [font-family:var(--sf-heading)]">
            {businessName}
          </a>
          <div className="flex items-center gap-2">
            {type?.layout === "catalog" && (
              <a href={base ? `${base}#catalog` : "#catalog"} className="hidden text-sm font-semibold opacity-80 hover:opacity-100 sm:inline">
                {t("store.shop")}
              </a>
            )}
            {hasCart && <CartButton color={theme.primary} />}
          </div>
        </header>
        {children}
        {hasCart && <CartDrawer checkoutHref={mode === "public" ? `/s/${slug}/checkout` : null} primary={theme.primary} onPrimary={onPrimary} previewNote={t("store.checkoutDisabledPreview")} />}
        <footer className="mx-auto max-w-6xl px-5 pb-10 pt-8 text-sm opacity-70">
          {(content.policies?.contactEmail || content.policies?.contactPhone) && (
            <p>
              {content.policies?.contactEmail && <>✉ {content.policies.contactEmail}</>}
              {content.policies?.contactPhone ? ` · ☎ ${content.policies.contactPhone}` : ""}
            </p>
          )}
          {content.policies?.refund && (
            <details className="mt-2">
              <summary className="cursor-pointer">{t("storefront.refundPolicy")}</summary>
              <p className="mt-1 whitespace-pre-wrap">{content.policies.refund}</p>
            </details>
          )}
          {content.policies?.shipping && (
            <details className="mt-1">
              <summary className="cursor-pointer">{t("storefront.shippingPolicy")}</summary>
              <p className="mt-1 whitespace-pre-wrap">{content.policies.shipping}</p>
            </details>
          )}
          <p className="mt-4 text-xs">
            © {businessName} · {t("store.poweredBy")}{" "}
            <a href="/" className="underline">
              SellNow
            </a>
          </p>
        </footer>
      </div>
    </CartProvider>
  );
}

/**
 * Renders a storefront version from validated section data (never generated HTML). Prices always
 * come from the product catalog, testimonials render only when the seller confirmed them, and
 * buy buttons only ever lead to functionality that exists (checkout, cart, or the enquiry form).
 */
export function StorefrontRenderer(props: RendererProps) {
  const { content, theme, products, slug, locale, viewport = "desktop" } = props;
  const mode: RenderMode = props.preview ? "preview" : (props.mode ?? "public");
  const t = (k: string, p?: Record<string, string | number>) => translate(locale, k, p);
  const preset = DESIGN_PRESETS[(theme.preset as DesignPresetId) ?? "modern"] ?? DESIGN_PRESETS.modern;
  const onPrimary = theme.onPrimary ?? onColor(theme.primary);
  const type = isWebsiteType(content.websiteType) ? WEBSITE_TYPES[content.websiteType] : null;
  const visibleProducts = content.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
  const main = visibleProducts[0];
  const interest = type?.availability === "interest" || (main ? ENGINES[main.type].checkout === "unsupported" : false);
  const sellOnline = content.salesMode !== "enquiry" && !interest && Boolean(main && ENGINES[main.type].checkout === "full");
  const base = mode === "public" ? `/s/${slug}` : mode === "preview" ? "/preview/frame" : null;
  const ctaKey = sellOnline ? "full" : interest ? "unsupported" : "enquiry";
  const buyHref = (p: Product | undefined) => {
    if (!sellOnline || !p) return "#enquiry";
    if (type?.layout === "catalog") return "#catalog";
    return mode === "public" ? `/s/${slug}/checkout?product=${p.id}` : "#pricing";
  };
  // Custom button text is only honoured when online checkout is actually on; otherwise the label always
  // matches what the button really does (enquiry / register interest) — never a "Buy Now" without checkout.
  const ctaLabel = (custom: unknown) => (sellOnline && custom ? String(custom) : t(`storefront.template.cta.${ctaKey}`));
  const narrow = viewport === "mobile";
  const btn = "inline-flex h-12 items-center justify-center rounded-[var(--sf-radius-btn)] px-7 font-bold transition hover:brightness-95";
  const primaryBtn = { background: theme.primary, color: onPrimary };
  const card = "rounded-[var(--sf-radius)] bg-white text-[#171717] ring-1 ring-black/5";
  const dark = preset.id === "fitness";
  const needsContact = !sellOnline && !content.sections.some((s) => s.visible && s.type === "contact");

  const contactBlock = (key: string, title?: string, body?: string, sectionMode?: string) =>
    main ? (
      <section key={key} id="enquiry" className="mx-auto max-w-xl scroll-mt-6 px-5 py-12">
        <div className={`${card} p-6`}>
          <h2 className="text-2xl font-extrabold">{title || t(interest || sectionMode === "interest" ? "enquiry.titleInterest" : "enquiry.title")}</h2>
          {body ? <p className="mt-1 text-sm opacity-70">{body}</p> : null}
          {interest && <p className="mt-2 flex gap-1.5 text-xs opacity-70"><Info className="mt-0.5 size-3.5 shrink-0" />{t("enquiry.unsupportedNote", { category: t(`categories.${main.type}`) })}</p>}
          <EnquiryForm slug={slug} productId={main.id} disabled={mode !== "public"} accent={theme.primary} />
        </div>
      </section>
    ) : null;

  return (
    <StorefrontFrame {...props} mode={mode}>
      {mode === "example" && <p className="mx-auto max-w-6xl px-5 text-xs font-semibold uppercase tracking-wider opacity-60">{t("preview.exampleLabel")}</p>}
      {content.sections
        .filter((s) => s.visible)
        .map((s) => {
          const p = s.props as Record<string, unknown> & { items?: { title?: string; body?: string; q?: string; a?: string; label?: string; value?: string }[] };
          switch (s.type) {
            case "hero": {
              const img = (p.imageAssetId as string | null) ?? main?.imageAssetId;
              const media = (
                <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[var(--sf-radius)]" style={{ background: `linear-gradient(135deg, ${theme.primary}55, ${theme.accent}66)` }}>
                  {img ? <img src={`/api/assets/${img}`} alt={main?.name ?? ""} className="h-full w-full object-cover" /> : <Package className="size-16 opacity-25" />}
                </div>
              );
              const priceTag = main && main.priceSen > 0 && type?.layout !== "catalog" && (
                <span className="text-2xl font-extrabold">
                  {formatMYR(main.priceSen, locale)}
                  {main.compareAtSen ? <s className="ml-2 text-base font-medium opacity-50">{formatMYR(main.compareAtSen, locale)}</s> : null}
                </span>
              );
              const cta = (
                <a href={buyHref(main)} className={btn} style={primaryBtn}>
                  {ctaLabel(p.cta)}
                </a>
              );
              if (preset.hero === "centered" || narrow) {
                return (
                  <section key={s.id} className="mx-auto max-w-4xl px-5 py-12 text-center md:py-20">
                    <h1 className={`text-balance font-extrabold leading-[1.04] tracking-tight ${narrow ? "text-4xl" : "text-5xl md:text-7xl"}`}>{String(p.headline ?? "")}</h1>
                    {p.subheadline ? <p className="mx-auto mt-5 max-w-2xl text-lg opacity-75">{String(p.subheadline)}</p> : null}
                    <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
                      {cta}
                      {priceTag}
                    </div>
                    {img && <div className="mx-auto mt-10 max-w-md">{media}</div>}
                  </section>
                );
              }
              if (preset.hero === "editorial") {
                return (
                  <section key={s.id} className="mx-auto grid max-w-6xl items-end gap-10 px-5 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
                    <div className="order-2 md:order-1">
                      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] opacity-60">{props.businessName}</p>
                      <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">{String(p.headline ?? "")}</h1>
                      {p.subheadline ? <p className="mt-6 max-w-lg text-lg opacity-75">{String(p.subheadline)}</p> : null}
                      <div className="mt-8 flex flex-wrap items-center gap-5">
                        {cta}
                        {priceTag}
                      </div>
                    </div>
                    <div className="order-1 md:order-2">{media}</div>
                  </section>
                );
              }
              return (
                <section key={s.id} className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-2 md:py-16">
                  <div>
                    <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">{String(p.headline ?? "")}</h1>
                    {p.subheadline ? <p className="mt-4 text-lg opacity-75">{String(p.subheadline)}</p> : null}
                    <div className="mt-7 flex flex-wrap items-center gap-4">
                      {cta}
                      {priceTag}
                    </div>
                  </div>
                  {media}
                </section>
              );
            }
            case "catalog":
              return (
                <section key={s.id} id="catalog" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-10">
                  {p.title ? <h2 className="text-3xl font-extrabold tracking-tight">{String(p.title)}</h2> : null}
                  <CatalogGrid
                    products={visibleProducts.map((pr) => ({
                      id: pr.id,
                      slug: pr.slug,
                      name: pr.name,
                      description: pr.description,
                      priceSen: pr.priceSen,
                      compareAtSen: pr.compareAtSen,
                      imageAssetId: pr.imageAssetId,
                      collection: pr.collection,
                      soldOut: pr.trackStock && pr.stock <= 0 && !(props.variantProductIds ?? []).includes(pr.id),
                      hasVariants: (props.variantProductIds ?? []).includes(pr.id),
                    }))}
                    showSearch={Boolean(p.showSearch)}
                    base={base}
                    theme={{ primary: theme.primary, onPrimary, accent: theme.accent }}
                    sellOnline={sellOnline}
                    enquiryHref="#enquiry"
                    narrow={narrow}
                  />
                </section>
              );
            case "benefits":
              return (
                <section key={s.id} className="mx-auto max-w-6xl px-5 py-10">
                  {p.title ? <h2 className="text-3xl font-extrabold tracking-tight">{String(p.title)}</h2> : null}
                  <div className={`mt-6 grid gap-4 ${narrow ? "" : "md:grid-cols-3"}`}>
                    {(p.items ?? []).map((it, i) => (
                      <div key={i} className={`${card} p-6`}>
                        <span className="grid size-10 place-items-center rounded-[calc(var(--sf-radius)/2)]" style={{ background: `${theme.primary}22`, color: theme.primary }}>
                          <Check className="size-5" />
                        </span>
                        <p className="mt-4 text-lg font-bold">{it.title}</p>
                        {it.body ? <p className="mt-1 text-[15px] opacity-70">{it.body}</p> : null}
                      </div>
                    ))}
                  </div>
                </section>
              );
            case "details":
              return (
                <section key={s.id} className="mx-auto max-w-4xl px-5 py-10">
                  {p.title ? <h2 className="text-3xl font-extrabold tracking-tight">{String(p.title)}</h2> : null}
                  <dl className={`${card} mt-6 grid divide-y divide-black/5 sm:grid-cols-2 sm:divide-y-0`}>
                    {(p.items ?? []).map((it, i) => (
                      <div key={i} className="p-5">
                        <dt className="text-xs font-semibold uppercase tracking-wider opacity-50">{it.label}</dt>
                        <dd className="mt-1 text-lg font-bold">{it.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            case "problem_solution":
              return (
                <section key={s.id} className={`mx-auto grid max-w-6xl gap-4 px-5 py-10 ${narrow ? "" : "md:grid-cols-2"}`}>
                  <div className="rounded-[var(--sf-radius)] p-7" style={{ background: dark ? "rgb(255 255 255 / 0.06)" : "rgb(0 0 0 / 0.04)" }}>
                    <p className="text-[16px] leading-relaxed opacity-80">{String(p.problem ?? "")}</p>
                  </div>
                  <div className="rounded-[var(--sf-radius)] p-7" style={{ background: `${theme.primary}26` }}>
                    <p className="text-[16px] font-medium leading-relaxed">{String(p.solution ?? "")}</p>
                  </div>
                </section>
              );
            case "showcase":
              return (
                <section key={s.id} className="mx-auto max-w-6xl px-5 py-10">
                  {p.title ? <h2 className="text-3xl font-extrabold tracking-tight">{String(p.title)}</h2> : null}
                  <div className={`mt-6 grid gap-4 ${narrow ? "" : "sm:grid-cols-2 md:grid-cols-3"}`}>
                    {visibleProducts.map((pr) => (
                      <div key={pr.id} className={`${card} overflow-hidden`}>
                        <a href={base && type?.layout === "catalog" ? `${base}/p/${pr.slug}` : undefined} className="flex aspect-[4/3] items-center justify-center" style={{ background: `${theme.accent}33` }}>
                          {pr.imageAssetId ? <img src={`/api/assets/${pr.imageAssetId}`} alt={pr.name} className="h-full w-full object-cover" /> : <Package className="size-10 opacity-25" />}
                        </a>
                        <div className="p-5">
                          <p className="font-bold">{pr.name}</p>
                          {pr.description ? <p className="mt-1 line-clamp-3 text-sm opacity-70">{pr.description}</p> : null}
                          <div className="mt-4 flex items-center justify-between gap-2">
                            {pr.priceSen > 0 ? <span className="font-extrabold">{formatMYR(pr.priceSen, locale)}</span> : <span />}
                            <a href={buyHref(pr)} className="rounded-[var(--sf-radius-btn)] px-4 py-2 text-sm font-bold" style={primaryBtn}>
                              {t(`storefront.template.cta.${ctaKey}`)}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            case "offer":
              return (
                <section key={s.id} className="mx-auto max-w-6xl px-5 py-6">
                  <div className="rounded-[var(--sf-radius)] p-10 text-center" style={{ background: theme.primary, color: onPrimary }}>
                    <p className="text-2xl font-extrabold tracking-tight [font-family:var(--sf-heading)] md:text-4xl">{String(p.title ?? "")}</p>
                    {p.body ? <p className="mx-auto mt-3 max-w-xl opacity-85">{String(p.body)}</p> : null}
                  </div>
                </section>
              );
            case "pricing":
              return (
                <section key={s.id} id="pricing" className="mx-auto max-w-3xl scroll-mt-6 px-5 py-10">
                  {p.title ? <h2 className="text-3xl font-extrabold tracking-tight">{String(p.title)}</h2> : null}
                  <div className={`${card} mt-5 divide-y divide-black/5`}>
                    {visibleProducts.map((pr) => (
                      <div key={pr.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                        <span className="font-semibold">{pr.name}</span>
                        <span className="flex items-center gap-3">
                          {pr.priceSen > 0 && <span className="text-lg font-extrabold">{formatMYR(pr.priceSen, locale)}</span>}
                          <a href={buyHref(pr)} className="rounded-[var(--sf-radius-btn)] px-4 py-2 text-sm font-bold" style={primaryBtn}>
                            {t(`storefront.template.cta.${ctaKey}`)}
                          </a>
                        </span>
                      </div>
                    ))}
                  </div>
                  {mode !== "public" && sellOnline && <p className="mt-3 text-center text-xs opacity-60">{t("store.checkoutDisabledPreview")}</p>}
                </section>
              );
            case "social_proof": {
              const items = (p.testimonials as { quote: string; author: string }[]) ?? [];
              if (!p.confirmed || items.length === 0) return null;
              return (
                <section key={s.id} className="mx-auto max-w-6xl px-5 py-10">
                  {p.title ? <h2 className="text-3xl font-extrabold tracking-tight">{String(p.title)}</h2> : null}
                  <div className={`mt-6 grid gap-4 ${narrow ? "" : "md:grid-cols-2"}`}>
                    {items.map((it, i) => (
                      <figure key={i} className={`${card} p-6`}>
                        <Quote className="size-5 opacity-30" />
                        <blockquote className="mt-2 text-[15px]">{it.quote}</blockquote>
                        <figcaption className="mt-3 text-sm font-bold">{it.author}</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              );
            }
            case "faq":
              return (
                <section key={s.id} className="mx-auto max-w-3xl px-5 py-10">
                  {p.title ? <h2 className="text-3xl font-extrabold tracking-tight">{String(p.title)}</h2> : null}
                  <div className="mt-5 space-y-2">
                    {(p.items ?? []).map((it, i) => (
                      <details key={i} className={`${card} px-5 py-4`}>
                        <summary className="cursor-pointer font-bold">{it.q}</summary>
                        <p className="mt-2 text-[15px] opacity-75">{it.a}</p>
                      </details>
                    ))}
                  </div>
                </section>
              );
            case "contact":
              return contactBlock(s.id, String(p.title ?? ""), String(p.body ?? ""), String(p.mode ?? ""));
            case "cta":
              return (
                <section key={s.id} className="mx-auto max-w-5xl px-5 py-14 text-center">
                  <p className="text-balance text-3xl font-extrabold tracking-tight [font-family:var(--sf-heading)] md:text-5xl">{String(p.headline ?? "")}</p>
                  {main && (
                    <a href={buyHref(main)} className={`${btn} mt-7`} style={primaryBtn}>
                      {ctaLabel(p.button)}
                    </a>
                  )}
                </section>
              );
            default:
              return null;
          }
        })}
      {needsContact && contactBlock("auto-contact")}
    </StorefrontFrame>
  );
}
