import { ArrowRight, Check, Minus, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cx } from "@/components/ui";
import { CATEGORIES, FAQ, PRICING, SALES } from "./content";
import { ArtCode, ArtStuck, ArtTools, FluentIcon } from "./art";
import { Device } from "./devices";
import { BuilderScreen, CatScreen, DashboardScreen, StoreScreen } from "./screens";
import { TOUR_MOCKS } from "./tour-mocks";

const CTA = "inline-flex items-center justify-center gap-2 rounded-full bg-[#1F83D8] px-7 py-4 text-base font-bold text-white shadow-[0_16px_36px_-14px_rgba(31,131,216,0.9)] transition hover:-translate-y-0.5 hover:bg-[#1264AC] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1F83D8]/30";
const GHOST = "inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-[#171717] shadow-[0_0_0_1px_#DCE6F1] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1F83D8]/30";
const WRAP = "mx-auto max-w-[1200px] px-4 sm:px-6";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#1F83D8]">{children}</p>;
}
function SectionHead({ id, eyebrow, title, sub, center = true }: { id: string; eyebrow?: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={cx("max-w-3xl", center && "mx-auto text-center")} data-reveal>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="mt-3 text-balance text-[2.1rem] font-extrabold leading-[1.08] tracking-[-0.02em] text-[#171717] sm:text-5xl">{title}</h2>
      {sub && <p className="mt-4 text-pretty text-lg text-[#4B5565]">{sub}</p>}
    </div>
  );
}

export function SalesHeader({ startHref, loggedIn }: { startHref: string; loggedIn: boolean }) {
  return (
    <>
      <div className="bg-[#171717] px-4 py-2.5 text-center text-[13px] font-semibold text-white sm:text-sm">
        <span className="mr-2 inline-block size-1.5 -translate-y-0.5 rounded-full bg-[#FFD76A] align-middle" aria-hidden="true" />
        {SALES.audience}
      </div>
      <header className="sticky top-0 z-40 border-b border-[#EEF2F7]/80 bg-white/80 backdrop-blur-md">
        <nav className={cx(WRAP, "flex h-16 items-center justify-between")} aria-label="Main">
          <Logo />
          <div className="hidden items-center gap-7 text-[15px] font-medium text-[#3B4452] md:flex">
            <a href="#demo" className="hover:text-[#171717]">Live demo</a>
            <a href="#tour" className="hover:text-[#171717]">Features</a>
            <a href="#features" className="hover:text-[#171717]">Who it&apos;s for</a>
            <a href="#pricing" className="hover:text-[#171717]">Pricing</a>
            <a href="#faq" className="hover:text-[#171717]">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            {!loggedIn && <a href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-[#3B4452] hover:text-[#171717] sm:inline-flex">Log in</a>}
            <a href={startHref} data-track="hero_cta_click" data-track-props='{"location":"nav"}' className="inline-flex items-center rounded-full bg-[#171717] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1264AC]">{loggedIn ? "Open dashboard" : "Start free"}</a>
          </div>
        </nav>
      </header>
    </>
  );
}

function FeatureCard({ icon, title, body, className }: { icon: string; title: string; body: string; className?: string }) {
  return (
    <div className={cx("flex items-center gap-3 rounded-2xl bg-white/85 p-3 pr-4 shadow-[0_18px_40px_-18px_rgba(15,40,80,0.35)] ring-1 ring-white backdrop-blur-md", className)}>
      <FluentIcon name={icon} size={44} />
      <div>
        <p className="text-sm font-extrabold text-[#171717]">{title}</p>
        <p className="text-xs text-[#5B6574]">{body}</p>
      </div>
    </div>
  );
}

export function Hero({ startHref }: { startHref: string }) {
  const h = SALES.hero.variants[SALES.hero.active];
  const [c1, c2, c3] = SALES.hero.cards;
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="sn-glow absolute -left-40 -top-40 size-[640px] rounded-full bg-[radial-gradient(circle,#CFE6FB_0%,transparent_65%)]" />
        <div className="sn-glow absolute -right-32 top-20 size-[560px] rounded-full bg-[radial-gradient(circle,#EDE4FF_0%,transparent_65%)]" style={{ animationDelay: "2s" }} />
        <div className="absolute bottom-0 left-1/3 size-[420px] rounded-full bg-[radial-gradient(circle,#FFF0E5_0%,transparent_65%)]" />
      </div>
      <div className={cx(WRAP, "grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[1fr_1.05fr] lg:pt-20")}>
        <div className="text-center lg:text-left">
          <h1 id="hero-title" className="text-balance text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-[#171717] sm:text-6xl lg:text-[4.1rem]">
            {h.line1}{" "}
            <span className="bg-gradient-to-r from-[#1F83D8] via-[#4E8FF0] to-[#7C5CE0] bg-clip-text text-transparent">{h.line2}</span>
          </h1>
          <p className="sn-in sn-in-1 mx-auto mt-6 max-w-xl text-pretty text-lg text-[#4B5565] lg:mx-0">{SALES.hero.sub}</p>
          <div className="sn-in sn-in-2 mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a href={startHref} className={CTA} data-track="hero_cta_click" data-track-props='{"location":"hero"}'>{SALES.hero.primary} <ArrowRight className="size-5" aria-hidden="true" /></a>
            <a href="#demo" className={GHOST}>{SALES.hero.secondary}</a>
          </div>
          <p className="sn-in sn-in-3 mt-4 flex items-center justify-center gap-2 text-sm text-[#5B6574] lg:justify-start"><Check className="size-4 text-[#1FA36A]" aria-hidden="true" /> {SALES.hero.micro}</p>
        </div>

        {/* Device composition: desktop dashboard · tablet store · phone builder */}
        <div className="relative mx-auto w-full max-w-[640px] lg:max-w-none">
          <div className="relative aspect-[1.25/1] w-full">
            <div className="sn-in absolute right-0 top-[4%] w-[86%] [transform:perspective(1600px)_rotateY(-9deg)_rotateX(2deg)]">
              <div className="sn-float"><Device kind="desktop" label="SellNow dashboard"><DashboardScreen /></Device></div>
            </div>
            <div className="sn-in sn-in-2 absolute bottom-[2%] left-0 w-[50%]" style={{ animationName: "sn-rise-rot" }}>
              <div className="sn-float" style={{ animationDelay: "1.2s" }}><Device kind="tablet" label="A sample website built with SellNow" className="drop-shadow-[0_30px_40px_rgba(15,40,80,0.28)]"><StoreScreen /></Device></div>
            </div>
            <div className="sn-in sn-in-3 absolute bottom-[-2%] right-[2%] w-[27%] [transform:rotate(5deg)]">
              <div className="sn-float" style={{ animationDelay: "2.2s" }}><Device kind="phone" label="SellNow website builder on a phone" className="drop-shadow-[0_30px_40px_rgba(15,40,80,0.35)]"><BuilderScreen /></Device></div>
            </div>
            <FeatureCard {...c1!} className="sn-float absolute -left-2 top-[2%] hidden sm:flex" />
            <FeatureCard {...c2!} className="sn-float absolute -left-6 top-[29%] hidden max-w-[240px] md:flex" />
            <FeatureCard {...c3!} className="sn-float absolute bottom-[-9%] left-[16%] hidden sm:flex" />
          </div>
          {/* Mobile: cards as a clean row under the composition (never overlapping the devices). */}
          <div className="mt-10 grid gap-3 sm:hidden">{SALES.hero.cards.map((c) => <FeatureCard key={c.title} {...c} />)}</div>
        </div>
      </div>
    </section>
  );
}

const PROBLEM_ART = { code: ArtCode, tools: ArtTools, stuck: ArtStuck } as const;
export function Problems() {
  const p = SALES.problems;
  return (
    <section className="bg-[#FFFBF5] py-24" aria-labelledby="problems-title">
      <div className={WRAP}>
        <SectionHead id="problems-title" eyebrow={p.eyebrow} title={p.title} sub={p.sub} />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {p.items.map((it, i) => {
            const Art = PROBLEM_ART[it.art as keyof typeof PROBLEM_ART];
            return (
              <article key={it.title} data-reveal style={{ transitionDelay: `${i * 120}ms` }} className="flex flex-col rounded-[28px] bg-white p-6 shadow-[0_24px_60px_-36px_rgba(80,50,20,0.35)] ring-1 ring-[#F4E9DC]">
                <div className="rounded-2xl bg-gradient-to-br from-[#FFF6EC] to-[#F2F7FD] p-3"><Art className="h-auto w-full" title={it.title} /></div>
                <h3 className="mt-6 text-xl font-extrabold tracking-tight text-[#171717]">{it.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#5B6574]">{it.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function WhySellNow() {
  const w = SALES.why;
  return (
    <section className="py-24" aria-labelledby="why-title">
      <div className={WRAP}>
        <SectionHead id="why-title" eyebrow={w.eyebrow} title={w.title} sub={w.sub} />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {w.points.map((pt, i) => (
            <div key={pt.title} data-reveal style={{ transitionDelay: `${i * 100}ms` }} className="rounded-3xl bg-gradient-to-b from-[#F4F9FF] to-white p-6 ring-1 ring-[#E3EEF9]">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-[#1F83D8] text-lg font-black text-white shadow-[0_10px_24px_-10px_rgba(31,131,216,0.9)]">{i + 1}</span>
              <h3 className="mt-4 text-lg font-extrabold text-[#171717]">{pt.title}</h3>
              <p className="mt-1.5 text-[15px] text-[#5B6574]">{pt.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-2" data-reveal>
          <div className="rounded-[28px] bg-[#F5F6F8] p-7 ring-1 ring-[#E7EAF0]">
            <p className="text-sm font-extrabold uppercase tracking-wider text-[#7A8494]">{w.traditional.title}</p>
            <ol className="mt-5 space-y-3">
              {w.traditional.steps.map((s) => <li key={s} className="flex items-center gap-3 text-[15px] text-[#5B6574]"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-[#DDE2EA]"><Minus className="size-3.5" aria-hidden="true" /></span>{s}</li>)}
            </ol>
          </div>
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1F83D8] to-[#1264AC] p-7 text-white shadow-[0_30px_70px_-30px_rgba(31,131,216,0.8)]">
            <div className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10" aria-hidden="true" />
            <p className="text-sm font-extrabold uppercase tracking-wider text-white/80">{w.sellnow.title}</p>
            <ol className="relative mt-5 space-y-3">
              {w.sellnow.steps.map((s) => <li key={s} className="flex items-center gap-3 text-[15px] font-semibold"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-[#1F83D8]"><Check className="size-3.5" aria-hidden="true" /></span>{s}</li>)}
            </ol>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-[#7A8494]">A workflow comparison — not a claim about any specific product.</p>
      </div>
    </section>
  );
}

export function DemoSection({ children }: { children: React.ReactNode }) {
  const d = SALES.demo;
  return (
    <section id="demo" className="scroll-mt-20 bg-gradient-to-b from-white via-[#F2F8FF] to-white py-24" aria-labelledby="demo-title">
      <div className={WRAP}>
        <div className="mx-auto max-w-3xl text-center" data-reveal>
          <Eyebrow>{d.eyebrow}</Eyebrow>
          <h2 id="demo-title" className="mt-3 text-balance text-[2.1rem] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-5xl">{d.title}</h2>
          <p className="mt-4 text-lg text-[#4B5565]">{d.sub}</p>
        </div>
        <div className="mx-auto mt-12 max-w-5xl">{children}</div>
      </div>
    </section>
  );
}

export function Categories() {
  const c = SALES.categories;
  return (
    <section id="features" className="scroll-mt-20 py-24" aria-labelledby="cat-title">
      <div className={WRAP}>
        <SectionHead id="cat-title" eyebrow={c.eyebrow} title={c.title} sub={c.sub} />
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {CATEGORIES.map((cat, i) => (
            <article key={cat.id} data-reveal className={cx("group relative grid overflow-hidden rounded-[32px] bg-gradient-to-br p-7 ring-1 ring-[#E6EDF5] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_-36px_rgba(15,40,80,0.4)] sm:grid-cols-[1fr_0.9fr] sm:gap-6", cat.tone, i % 2 === 1 && "sm:grid-cols-[0.9fr_1fr]")}>
              <div className={cx("relative z-10", i % 2 === 1 && "sm:order-2")}>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#1F83D8]">{cat.name}</p>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-[#171717]">{cat.title}</h3>
                <p className="mt-2 text-[15px] text-[#4B5565]">{cat.benefit}</p>
                <ul className="mt-4 space-y-2">
                  {cat.features.map((f) => <li key={f} className="flex items-center gap-2 text-sm font-semibold text-[#2B3340]"><span className="flex size-5 items-center justify-center rounded-full bg-[#1F83D8] text-white"><Check className="size-3" aria-hidden="true" /></span>{f}</li>)}
                </ul>
                {cat.show_value && cat.value_rm != null && <p className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1264AC] ring-1 ring-[#CFE3F7]">{cat.value_label} · RM{cat.value_rm}</p>}
              </div>
              <div className={cx("relative mt-6 flex items-end justify-center sm:mt-0", i % 2 === 1 && "sm:order-1")}>
                <div className="absolute inset-x-6 bottom-0 top-8 rounded-full bg-white/60 blur-2xl" aria-hidden="true" />
                <Device kind={cat.mock} label={`Sample ${cat.name.toLowerCase()} website`} className={cx("relative transition duration-500 group-hover:-translate-y-1", cat.mock === "phone" ? "w-[46%] max-w-[190px] rotate-[-3deg]" : "w-full max-w-[340px] rotate-[2deg]")}>
                  <CatScreen id={cat.id} />
                </Device>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const h = SALES.how;
  return (
    <section className="border-y border-[#EEF2F7] bg-[#F8FBFF] py-16" aria-labelledby="how-title">
      <div className={WRAP}>
        <div className="text-center" data-reveal>
          <Eyebrow>{h.eyebrow}</Eyebrow>
          <h2 id="how-title" className="mt-3 text-balance text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">{h.title}</h2>
        </div>
        <ol className="relative mt-10 grid gap-6 md:grid-cols-3">
          <span className="absolute left-[16%] right-[16%] top-6 hidden h-px bg-gradient-to-r from-transparent via-[#BFDDF7] to-transparent md:block" aria-hidden="true" />
          {h.steps.map((s, i) => (
            <li key={s.title} data-reveal style={{ transitionDelay: `${i * 120}ms` }} className="relative text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-lg font-black text-[#1F83D8] shadow-[0_12px_28px_-14px_rgba(31,131,216,0.8)] ring-1 ring-[#D7E8F8]">{i + 1}</span>
              <h3 className="mt-4 text-lg font-extrabold">{s.title}</h3>
              <p className="mx-auto mt-1.5 max-w-xs text-[15px] text-[#5B6574]">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const TOUR_ICON: Record<string, string> = { builder: "profile", website: "builder", pay: "pay", ship: "ship", market: "creative", grow: "dashboard" };
export function FeatureTour({ startHref }: { startHref: string }) {
  const t = SALES.tour;
  return (
    <section id="tour" className="scroll-mt-20 bg-gradient-to-b from-white via-[#F7FAFE] to-white py-24" aria-labelledby="tour-title">
      <div className={WRAP}>
        <SectionHead id="tour-title" eyebrow={t.eyebrow} title={t.title} sub={t.sub} />
        <div className="mt-16 space-y-20 lg:space-y-28">
          {t.items.map((it, i) => {
            const Mock = TOUR_MOCKS[it.id]!;
            const flip = i % 2 === 1;
            return (
              <article key={it.id} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16" aria-labelledby={`tour-${it.id}`}>
                <div className={cx(flip && "lg:order-2")} data-reveal>
                  <div className="flex items-center gap-3">
                    <FluentIcon name={TOUR_ICON[it.id]!} size={44} />
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#1F83D8]">{it.eyebrow}</p>
                  </div>
                  <h3 id={`tour-${it.id}`} className="mt-4 text-balance text-3xl font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[2.6rem]">{it.title}</h3>
                  <p className="mt-4 text-pretty text-lg text-[#4B5565]">{it.body}</p>
                  <ul className="mt-6 space-y-3">
                    {it.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-[15px] font-semibold text-[#2B3340]">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#1F83D8] text-white"><Check className="size-3" aria-hidden="true" /></span>
                        {b}
                      </li>
                    ))}
                  </ul>
                  {it.note && <p className="mt-5 border-l-2 border-[#BFDDF7] pl-3 text-sm text-[#6B7585]">{it.note}</p>}
                </div>
                <div className={cx("relative mx-auto w-full max-w-[480px]", flip && "lg:order-1")} data-reveal>
                  <div className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_30%_20%,#E8F4FF,transparent_60%),radial-gradient(circle_at_80%_80%,#F0EAFE,transparent_55%)]" aria-hidden="true" />
                  <div className="text-[#171717]" role="img" aria-label={`${it.eyebrow}: sample SellNow screen`}><Mock /></div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-20 text-center" data-reveal>
          <a href={startHref} className={CTA} data-track="hero_cta_click" data-track-props='{"location":"tour"}'>{t.cta} <ArrowRight className="size-5" aria-hidden="true" /></a>
          <p className="mt-3 text-sm text-[#5B6574]">{t.ctaNote}</p>
        </div>
      </div>
    </section>
  );
}

export function MadeForMalaysia() {
  const l = SALES.local;
  return (
    <section className="bg-[#171717] py-24 text-white" aria-labelledby="local-title">
      <div className={WRAP}>
        <div className="mx-auto max-w-3xl text-center" data-reveal>
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#FFD76A]">{l.eyebrow}</p>
          <h2 id="local-title" className="mt-3 text-balance text-[2.1rem] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-5xl">{l.title}</h2>
          <p className="mt-4 text-lg text-white/70">{l.sub}</p>
        </div>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {l.items.map((it, i) => (
            <li key={it.title} data-reveal style={{ transitionDelay: `${i * 70}ms` }} className="flex items-start gap-4 rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/10">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#1F83D8] text-white"><Check className="size-4" aria-hidden="true" /></span>
              <div>
                <h3 className="text-lg font-extrabold">{it.title}</h3>
                <p className="mt-1 text-[15px] text-white/70">{it.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Pricing() {
  const p = SALES.pricing;
  const rm = (n: number) => `RM${n.toLocaleString("en-MY")}`;
  return (
    <section id="pricing" className="scroll-mt-20 py-24" aria-labelledby="pricing-title">
      <div className={WRAP}>
        <div className="mx-auto max-w-3xl text-center" data-reveal>
          <Eyebrow>{p.eyebrow}</Eyebrow>
          <h2 id="pricing-title" className="mt-3 text-balance text-[2.1rem] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-5xl">{p.title}</h2>
          <p className="mt-4 text-lg text-[#4B5565]">{p.sub}</p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PRICING.map((plan) => (
            <article key={plan.id} className={cx("relative flex flex-col rounded-[28px] p-6", plan.highlight ? "bg-gradient-to-b from-[#1F83D8] to-[#1264AC] text-white shadow-[0_34px_70px_-30px_rgba(31,131,216,0.9)] lg:-my-3 lg:py-9" : "bg-white ring-1 ring-[#E3EAF3]")}>
              {plan.ribbon_text && <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#FFD76A] px-3.5 py-1 text-[11px] font-extrabold tracking-wider text-[#5A3E00] shadow">{plan.ribbon_text}</span>}
              <h3 className={cx("text-lg font-extrabold", !plan.highlight && "text-[#171717]")}>{plan.name}</h3>
              <p className={cx("mt-1 min-h-10 text-sm", plan.highlight ? "text-white/80" : "text-[#5B6574]")}>{plan.tagline}</p>
              <div className="mt-4 flex items-end gap-2">
                {plan.original_price_rm != null && plan.original_price_rm > plan.price_rm && <s className={cx("pb-1.5 text-lg", plan.highlight ? "text-white/60" : "text-[#98A2B3]")}>{rm(plan.original_price_rm)}</s>}
                <span className="text-5xl font-extrabold tracking-tight tabular-nums">{rm(plan.price_rm)}</span>
              </div>
              {plan.promotion_label && <p className="mt-1 text-xs font-bold">{plan.promotion_label}</p>}
              <p className={cx("mt-3 rounded-xl px-3 py-2 text-sm font-bold", plan.highlight ? "bg-white/15" : "bg-[#F2F8FF] text-[#1264AC]")}>{plan.message_credits.toLocaleString("en-MY")} Message Credits</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.included_features.map((f) => <li key={f} className={cx("flex items-start gap-2 text-sm", plan.highlight ? "text-white/90" : "text-[#3B4452]")}><Check className={cx("mt-0.5 size-4 shrink-0", plan.highlight ? "text-[#FFD76A]" : "text-[#1F83D8]")} aria-hidden="true" />{f}</li>)}
              </ul>
              <a href={plan.cta_href} data-track="pricing_plan_selected" data-track-props={JSON.stringify({ plan: plan.id })} className={cx("mt-6 inline-flex h-12 items-center justify-center rounded-full text-sm font-bold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4", plan.highlight ? "bg-white text-[#1264AC] focus-visible:ring-white/40" : "bg-[#171717] text-white hover:bg-[#1264AC] focus-visible:ring-[#1F83D8]/30")}>
                {plan.cta_label}
              </a>
            </article>
          ))}
        </div>
        <details className="mx-auto mt-10 max-w-2xl rounded-2xl bg-[#F6F9FD] p-5 ring-1 ring-[#E3EEF9]">
          <summary className="cursor-pointer font-bold text-[#171717]">{p.creditQ}</summary>
          <p className="mt-2 text-[15px] text-[#4B5565]">{p.creditA}</p>
        </details>
        <p className="mt-3 text-center text-xs text-[#7A8494]">{p.note}</p>
      </div>
    </section>
  );
}

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20 bg-[#FFFBF5] py-24" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 id="faq-title" className="text-center text-[2.1rem] font-extrabold tracking-[-0.02em] sm:text-5xl" data-reveal>{SALES.faqTitle}</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((f, i) => (
            <details key={f.q} data-faq={i} className="group rounded-2xl bg-white p-5 ring-1 ring-[#F1E6D8] open:ring-[#1F83D8]/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-bold text-[#171717] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#F2F8FF] text-[#1F83D8] transition group-open:rotate-45" aria-hidden="true"><X className="size-4 rotate-45" /></span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-[#4B5565]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ startHref }: { startHref: string }) {
  const f = SALES.final;
  return (
    <section className="px-4 py-20 sm:px-6" aria-labelledby="final-title">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[40px] bg-gradient-to-br from-[#1264AC] via-[#1F83D8] to-[#7C5CE0] px-6 py-20 text-center text-white sm:px-16">
        <div className="sn-glow pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
        <div className="sn-glow pointer-events-none absolute -bottom-28 -right-20 size-96 rounded-full bg-[#F0EAFE]/25 blur-2xl" style={{ animationDelay: "3s" }} aria-hidden="true" />
        <div className="sn-float pointer-events-none absolute left-[6%] top-[18%] hidden rounded-2xl bg-white/15 p-2 backdrop-blur lg:block" aria-hidden="true"><FluentIcon name="builder" size={48} /></div>
        <div className="sn-float pointer-events-none absolute bottom-[16%] right-[7%] hidden rounded-2xl bg-white/15 p-2 backdrop-blur lg:block" style={{ animationDelay: "2s" }} aria-hidden="true"><FluentIcon name="sell" size={48} /></div>
        <h2 id="final-title" className="relative text-balance text-4xl font-extrabold tracking-[-0.02em] sm:text-6xl" data-reveal>{f.title}</h2>
        <p className="relative mx-auto mt-5 max-w-2xl text-lg text-white/85">{f.body}</p>
        <a href={startHref} data-track="final_cta_click" className="relative mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-extrabold text-[#1264AC] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.5)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50">
          {f.cta} <ArrowRight className="size-5" aria-hidden="true" />
        </a>
        <p className="relative mt-4 text-sm text-white/80">{f.note}</p>
      </div>
    </section>
  );
}

export function SalesFooter() {
  return (
    <footer className="border-t border-[#EEF2F7] py-10">
      <div className={cx(WRAP, "flex flex-col items-center justify-between gap-4 text-sm text-[#5B6574] sm:flex-row")}>
        <div className="flex items-center gap-3"><Logo /><span>From Idea to Sales.</span></div>
        <nav className="flex gap-5" aria-label="Footer"><a href="#pricing" className="hover:text-[#171717]">Pricing</a><a href="#faq" className="hover:text-[#171717]">FAQ</a><a href="/login" className="hover:text-[#171717]">Log in</a></nav>
        <p>© {new Date().getFullYear()} SellNow</p>
      </div>
    </footer>
  );
}
