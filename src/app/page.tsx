import { Check, ShoppingBag, FileDown, Briefcase, CalendarClock, Ticket, Users, Sparkles, Store, Megaphone, CreditCard, BarChart3, Wand2, ShieldCheck, Menu, ChevronDown } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LinkButton, Badge } from "@/components/ui";
import { HeroComposer } from "@/components/landing/HeroComposer";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getT } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PLANS } from "@/lib/billing/plans";
import { formatMYR } from "@/lib/money";
import { ENGINES, CATEGORIES } from "@/lib/categories";

const CAT_ICON = { physical: ShoppingBag, digital: FileDown, service: Briefcase, booking: CalendarClock, event: Ticket, membership: Users } as const;
const CAT_BG = { physical: "bg-primary-soft", digital: "bg-mint", service: "bg-lavender", booking: "bg-pink", event: "bg-primary-soft", membership: "bg-lavender" } as const;

export default async function Landing() {
  const { t, locale } = await getT();
  const user = await getCurrentUser().catch(() => null);
  const startHref = user ? "/onboarding" : "/signup";

  return (
    <div className="overflow-x-hidden">
      {/* ---------------- Navigation */}
      <header className="sticky top-0 z-40 border-b border-transparent bg-cream/85 backdrop-blur supports-[backdrop-filter]:bg-cream/70">
        <nav className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="hidden items-center gap-7 text-[15px] font-medium text-ink/80 md:flex">
            <a href="#how" className="hover:text-ink">{t("nav.howItWorks")}</a>
            <a href="#features" className="hover:text-ink">{t("nav.features")}</a>
            <a href="#pricing" className="hover:text-ink">{t("nav.pricing")}</a>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <LanguageSwitcher />
            {user ? (
              <LinkButton href="/dashboard" variant="dark" size="sm">{t("nav.dashboard")}</LinkButton>
            ) : (
              <>
                <LinkButton href="/login" variant="ghost" size="sm">{t("nav.login")}</LinkButton>
                <LinkButton href="/signup" size="sm">{t("nav.startNow")}</LinkButton>
              </>
            )}
          </div>
          <details className="group relative md:hidden">
            <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full border border-line bg-surface" aria-label={t("nav.menu")}>
              <Menu className="size-5" />
            </summary>
            <div className="absolute right-0 top-12 w-64 rounded-card border border-line bg-surface p-3 shadow-lift">
              <a href="#how" className="block rounded-xl px-3 py-2.5 font-medium hover:bg-cream">{t("nav.howItWorks")}</a>
              <a href="#features" className="block rounded-xl px-3 py-2.5 font-medium hover:bg-cream">{t("nav.features")}</a>
              <a href="#pricing" className="block rounded-xl px-3 py-2.5 font-medium hover:bg-cream">{t("nav.pricing")}</a>
              <div className="my-2 border-t border-line" />
              <div className="px-2 py-1"><LanguageSwitcher /></div>
              {user ? (
                <LinkButton href="/dashboard" variant="dark" className="mt-2 w-full">{t("nav.dashboard")}</LinkButton>
              ) : (
                <div className="mt-2 grid gap-2">
                  <LinkButton href="/login" variant="secondary" className="w-full">{t("nav.login")}</LinkButton>
                  <LinkButton href="/signup" className="w-full">{t("nav.startNow")}</LinkButton>
                </div>
              )}
            </div>
          </details>
        </nav>
      </header>

      <main>
        {/* ---------------- Hero */}
        <section className="relative px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] overflow-hidden">
            <div className="absolute left-[8%] top-24 size-56 rounded-full bg-primary-soft blur-3xl" />
            <div className="absolute right-[10%] top-10 size-64 rounded-full bg-lavender blur-3xl" />
            <div className="absolute left-1/2 top-72 size-48 -translate-x-1/2 rounded-full bg-pink blur-3xl" />
          </div>
          <div className="mx-auto max-w-[1240px] text-center">
            <p className="inline-flex items-center gap-2 rounded-pill bg-surface px-4 py-1.5 text-xs font-bold tracking-[0.14em] text-ink shadow-soft ring-1 ring-line">
              <Sparkles className="size-3.5 text-ai-strong" /> {t("landing.eyebrow")}
            </p>
            <h1 className="mx-auto mt-6 max-w-4xl text-[40px] font-extrabold leading-[1.05] tracking-tight sm:text-[64px] lg:text-[78px]">
              {t("landing.heroTitle1")}
              <br />
              <span className="relative inline-block">
                <span className="relative z-10">{t("landing.heroTitle2")}</span>
                <span aria-hidden className="absolute inset-x-0 bottom-1 -z-0 h-4 rounded-full bg-primary/80 sm:bottom-2 sm:h-6" />
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] text-muted sm:text-lg">{t("landing.heroSub")}</p>
            <div className="mt-10">
              <HeroComposer signedIn={Boolean(user)} />
            </div>
          </div>

          {/* Floating product-UI previews (illustrative UI, not customer data) */}
          <div className="relative mx-auto mt-16 hidden max-w-[1100px] lg:block" aria-hidden>
            <div className="grid grid-cols-3 gap-6">
              <MiniStore t={t} />
              <MiniChat t={t} />
              <MiniOrder t={t} locale={locale} />
            </div>
          </div>
        </section>

        {/* ---------------- How it works */}
        <section id="how" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-[1240px]">
            <h2 className="mx-auto max-w-3xl text-center text-3xl font-extrabold tracking-tight sm:text-[44px] sm:leading-[1.1]">{t("landing.howTitle")}</h2>
            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <li key={n} className="rounded-card border border-line bg-surface p-6 shadow-soft">
                  <span className="grid size-10 place-items-center rounded-2xl bg-primary text-lg font-extrabold text-white">{n}</span>
                  <h3 className="mt-5 text-lg font-bold">{t(`landing.how${n}Title`)}</h3>
                  <p className="mt-2 text-[15px] text-muted">{t(`landing.how${n}Body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- Six categories */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-[1240px]">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-[44px]">{t("landing.categoriesTitle")}</h2>
              <p className="mt-3 text-[17px] text-muted">{t("landing.categoriesSub")}</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORIES.map((c) => {
                const Icon = CAT_ICON[c];
                const mode = ENGINES[c].checkout;
                return (
                  <div key={c} className="rounded-card border border-line bg-surface p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                    <div className={`grid size-12 place-items-center rounded-2xl ${CAT_BG[c]}`}>
                      <Icon className="size-6" />
                    </div>
                    <h3 className="mt-5 text-lg font-bold">{t(`categories.${c}`)}</h3>
                    <p className="mt-1.5 text-[15px] text-muted">{t(`categories.${c}Desc`)}</p>
                    <Badge tone={mode === "full" ? "success" : mode === "enquiry" ? "ai" : "neutral"} className="mt-4">
                      {t(`categories.checkout${mode === "full" ? "Full" : mode === "enquiry" ? "Enquiry" : "Unsupported"}`)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------- Feature modules */}
        <section id="features" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-[1240px] gap-6 lg:grid-cols-2">
            <Feature icon={<Wand2 className="size-5" />} bg="bg-lavender" title={t("landing.builderTitle")} body={t("landing.builderBody")}>
              <div className="space-y-2.5">
                {[
                  ["facts.product_name", "Sambal Garing", "statusUser", "neutral"],
                  ["facts.price", "RM19.90", "statusUser", "neutral"],
                  ["facts.usp", "…", "statusAi", "ai"],
                  ["facts.fulfillment", "—", "statusMissing", "warning"],
                ].map(([k, v, s, tone]) => (
                  <div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-cream px-3 py-2 text-sm">
                    <span className="text-muted">{t(k!)}</span>
                    <span className="flex items-center gap-2 font-semibold">
                      {v}
                      <Badge tone={tone as "neutral"}>{t(`onboarding.${s}`)}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            </Feature>
            <Feature icon={<Store className="size-5" />} bg="bg-primary-soft" title={t("landing.storefrontTitle")} body={t("landing.storefrontBody")}>
              <div className="space-y-2">
                {["hero", "benefits", "showcase", "faq", "cta"].map((s, i) => (
                  <div key={s} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                    <span className="grid size-6 place-items-center rounded-lg bg-cream text-xs font-bold text-muted">{i + 1}</span>
                    <span className="flex-1 font-semibold">{t(`storefront.sectionTypes.${s}`)}</span>
                    <span className="h-2 w-16 rounded-full bg-line" />
                  </div>
                ))}
              </div>
            </Feature>
            <Feature icon={<Sparkles className="size-5" />} bg="bg-pink" title={t("landing.creativeTitle")} body={t("landing.creativeBody")}>
              <div className="grid grid-cols-4 gap-2">
                {["1:1", "4:5", "9:16", "16:9"].map((r) => (
                  <div key={r} className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-line bg-cream text-xs font-bold text-muted">
                    {r}
                  </div>
                ))}
              </div>
            </Feature>
            <Feature icon={<Megaphone className="size-5" />} bg="bg-mint" title={t("landing.marketingTitle")} body={t("landing.marketingBody")}>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                {["draft", "approved", "active"].map((s, i) => (
                  <span key={s} className="flex items-center gap-2">
                    <Badge tone={i === 1 ? "success" : i === 2 ? "yellow" : "neutral"}>{t(`marketing.status.${s}`)}</Badge>
                    {i < 2 && <span className="text-muted">→</span>}
                  </span>
                ))}
              </div>
            </Feature>
            <Feature icon={<CreditCard className="size-5" />} bg="bg-lavender" title={t("landing.commerceTitle")} body={t("landing.commerceBody")}>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                {["PENDING", "PROCESSING", "PAID"].map((s, i) => (
                  <span key={s} className="flex items-center gap-2">
                    <Badge tone={s === "PAID" ? "success" : "neutral"}>{t(`orders.status.${s}`)}</Badge>
                    {i < 2 && <span className="text-muted">→</span>}
                  </span>
                ))}
                <ShieldCheck className="ml-1 size-4 text-success" />
              </div>
            </Feature>
            <Feature icon={<BarChart3 className="size-5" />} bg="bg-primary-soft" title={t("landing.dashboardTitle")} body={t("landing.dashboardBody")}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {["kpiRevenue", "kpiOrders", "kpiCustomers", "kpiLeads"].map((k) => (
                  <div key={k} className="rounded-xl bg-cream p-3">
                    <p className="text-[11px] font-semibold text-muted">{t(`dashboard.${k}`)}</p>
                    <div className="mt-2 h-3 w-12 rounded-full bg-line" />
                  </div>
                ))}
              </div>
            </Feature>
          </div>
        </section>

        {/* ---------------- Pricing */}
        <section id="pricing" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-[1240px]">
            <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-[44px]">{t("landing.pricingTitle")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-[15px] text-muted">{t("landing.pricingNote")}</p>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {(["free", "launch", "growth"] as const).map((id) => {
                const p = PLANS[id];
                const key = id === "free" ? "planFree" : id === "launch" ? "planLaunch" : "planGrowth";
                const features = [
                  t("landing.featCredits", { n: p.monthlyCredits }),
                  t("landing.featProducts", { n: p.entitlements.maxProducts }),
                  id === "free" ? t("landing.featPreview") : t("landing.featStorefront"),
                  ...(id !== "free" ? [t("landing.featDashboard"), t("landing.featCustomer")] : []),
                  ...(id === "growth" ? [t("landing.featMarketing"), t("landing.featSalesAI"), t("landing.featAnalytics")] : []),
                ];
                return (
                  <div key={id} className={`relative rounded-card border bg-surface p-7 shadow-soft ${id === "launch" ? "border-ink ring-2 ring-primary" : "border-line"}`}>
                    <h3 className="text-xl font-extrabold">{t(`landing.${key}`)}</h3>
                    <p className="mt-1 text-[15px] text-muted">{t(`landing.${key}Desc`)}</p>
                    <p className="mt-6 text-4xl font-extrabold tracking-tight">
                      {p.priceSen === 0 ? "RM0" : formatMYR(p.priceSen, locale).replace(/\.00$/, "")}
                      <span className="text-base font-medium text-muted">{t("landing.perMonth")}</span>
                    </p>
                    <ul className="mt-6 space-y-2.5 text-[15px]">
                      {features.map((f) => (
                        <li key={f} className="flex gap-2.5">
                          <Check className="mt-0.5 size-4 shrink-0 text-success" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <LinkButton href={startHref} variant={id === "launch" ? "primary" : "secondary"} className="mt-8 w-full">
                      {t("nav.startNow")}
                    </LinkButton>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------- FAQ */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-[44px]">{t("landing.faqTitle")}</h2>
            <div className="mt-10 space-y-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <details key={n} className="group rounded-2xl border border-line bg-surface px-5 py-4 shadow-soft">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                    {t(`landing.faq${n}q`)}
                    <ChevronDown className="size-5 shrink-0 transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-[15px] text-muted">{t(`landing.faq${n}a`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Final CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-[1240px] overflow-hidden rounded-[32px] bg-ink px-6 py-16 text-center text-white sm:px-12">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t("landing.finalTitle")}</h2>
            <LinkButton href={startHref} size="lg" className="mt-8">
              {t("landing.finalCta")}
            </LinkButton>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-muted">{t("common.tagline")} {t("landing.footerMade")}</p>
          </div>
          <p className="text-sm text-muted">© {new Date().getFullYear()} SellNow. {t("landing.footerRights")}</p>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, bg, title, body, children }: { icon: React.ReactNode; bg: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-surface p-6 shadow-soft sm:p-8">
      <div className={`grid size-11 place-items-center rounded-2xl ${bg}`}>{icon}</div>
      <h3 className="mt-5 text-2xl font-extrabold tracking-tight">{title}</h3>
      <p className="mt-2 text-[15px] text-muted">{body}</p>
      <div className="mt-6 rounded-2xl border border-line bg-cream/60 p-4">{children}</div>
    </div>
  );
}

type T = (k: string, p?: Record<string, string | number>) => string;

function MiniStore({ t }: { t: T }) {
  return (
    <div className="-rotate-2 rounded-card border border-line bg-surface p-4 shadow-lift">
      <p className="text-xs font-semibold text-muted">{t("landing.previewStore")}</p>
      <div className="mt-3 h-24 rounded-xl bg-gradient-to-br from-primary-soft to-pink" />
      <div className="mt-3 h-3 w-3/4 rounded-full bg-ink/80" />
      <div className="mt-2 h-2.5 w-1/2 rounded-full bg-line" />
      <div className="mt-4 h-9 rounded-pill bg-primary" />
    </div>
  );
}
function MiniChat({ t }: { t: T }) {
  return (
    <div className="translate-y-6 rounded-card border border-line bg-surface p-4 shadow-lift">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ai-strong">
        <Sparkles className="size-3.5" /> {t("onboarding.assistant")}
      </p>
      <div className="mt-3 space-y-2">
        <div className="ml-auto h-8 w-3/4 rounded-2xl rounded-br-md bg-ink/90" />
        <div className="h-12 w-5/6 rounded-2xl rounded-bl-md bg-lavender" />
        <div className="ml-auto h-6 w-1/2 rounded-2xl rounded-br-md bg-ink/90" />
      </div>
    </div>
  );
}
function MiniOrder({ t }: { t: T; locale: string }) {
  return (
    <div className="rotate-2 rounded-card border border-line bg-surface p-4 shadow-lift">
      <p className="text-xs font-semibold text-muted">{t("landing.previewOrder")}</p>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-3 w-24 rounded-full bg-ink/80" />
        <Badge tone="success">{t("orders.status.PAID")}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-2.5 w-full rounded-full bg-line" />
        <div className="h-2.5 w-2/3 rounded-full bg-line" />
      </div>
      <div className="mt-4 h-10 rounded-xl bg-mint" />
    </div>
  );
}
