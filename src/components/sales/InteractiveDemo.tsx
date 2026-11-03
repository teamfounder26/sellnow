"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Monitor, RotateCcw, Smartphone, Sparkles } from "lucide-react";
import { cx } from "@/components/ui";
import { DEMO_EXAMPLES, SALES } from "./content";
import { PointerHand } from "./art";
import { salesEvent } from "./analytics";

/**
 * Interactive Sample Preview. Runs entirely in the browser with deterministic steps and SellNow's
 * REAL website templates (/preview/template/[type]). It never calls AI, never spends credits and
 * never publishes — and it says so on screen.
 */
type Kind = "product" | "food" | "beauty" | "digital" | "service" | "booking" | "event" | "membership";
type Style = { type: string; name: string; desc: string };
const STYLES: Record<Kind, [Style, Style]> = {
  product: [{ type: "sales_page", name: "Sales Page", desc: "One page focused on one product." }, { type: "ecommerce", name: "Online Store", desc: "Catalog, product pages and cart." }],
  food: [{ type: "sales_page", name: "Sales Page", desc: "One page focused on your best seller." }, { type: "ecommerce", name: "Online Store", desc: "All your flavours with a cart." }],
  beauty: [{ type: "sales_page", name: "Sales Page", desc: "One page focused on your hero product." }, { type: "ecommerce", name: "Online Store", desc: "Your full range with a cart." }],
  digital: [{ type: "digital_sales", name: "Product Page", desc: "One digital product, instant delivery." }, { type: "digital_store", name: "Digital Store", desc: "Several downloads in one place." }],
  service: [{ type: "service_landing", name: "Service Page", desc: "Your offer, proof and an enquiry form." }, { type: "lead_website", name: "Lead Website", desc: "Built to collect quote requests." }],
  booking: [{ type: "booking_website", name: "Booking Website", desc: "Services with booking requests." }, { type: "booking_page", name: "Booking Page", desc: "One service, one simple page." }],
  event: [{ type: "event_registration", name: "Event Page", desc: "Details and registration." }, { type: "ticketing", name: "Ticketing", desc: "Ticket options for your event." }],
  membership: [{ type: "membership_landing", name: "Membership Page", desc: "Explain the perks, invite people in." }, { type: "membership_portal", name: "Member Portal", desc: "A home for members and content." }],
};
const PRESET: Record<Kind, string> = { product: "modern", food: "food", beauty: "beauty", digital: "education", service: "professional", booking: "beauty", event: "events", membership: "education" };

/** Keyword routing for typed ideas (transparent, deterministic — not AI). */
export function classify(text: string): Kind {
  const s = text.toLowerCase();
  if (/workshop|class|kelas|event|seminar|webinar|bootcamp|course launch/.test(s)) return "event";
  if (/member|community|club|komuniti|subscription box/.test(s)) return "membership";
  if (/book|appointment|facial|salon|spa|massage|clinic|tuition slot|temujanji/.test(s)) return "booking";
  if (/ebook|e-book|template|digital|pdf|preset|online course|download/.test(s)) return "digital";
  if (/service|photograph|consult|design|tutor|clean|repair|freelance|servis|wedding planner/.test(s)) return "service";
  if (/sambal|kuih|cake|kek|food|makan|cookie|biscuit|kopi|coffee|frozen|catering/.test(s)) return "food";
  if (/skin|beauty|serum|soap|sabun|cosmetic|perfume|wangian|lip/.test(s)) return "beauty";
  return "product";
}

type Stage = "idle" | "analyzing" | "pick" | "generating" | "ready" | "preview";
const SECTIONS = ["Hero", "Products", "Benefits", "FAQ", "Call to action"];

function Confetti() {
  const colors = ["#1F83D8", "#FFD76A", "#7C5CE0", "#9BE8C2", "#FF9F7A", "#5BB2F5"];
  const pieces = Array.from({ length: 70 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 10) * 0.06, dx: `${((i * 53) % 60) - 30}vw`, rot: `${(i * 97) % 720}deg`, c: colors[i % colors.length], w: 6 + (i % 3) * 3, round: i % 4 === 0 }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} className="sn-confetti-piece absolute top-0 block" style={{ left: `${p.left}%`, width: p.w, height: p.round ? p.w : p.w * 1.8, background: p.c, borderRadius: p.round ? "50%" : 2, animation: `sn-confetti 2.8s cubic-bezier(.2,.6,.4,1) ${p.delay}s both`, ["--dx" as string]: p.dx, ["--rot" as string]: p.rot }} />
      ))}
      {[18, 50, 82].map((l, i) => <span key={l} className="sn-ribbon absolute top-0 block h-24 w-1.5 rounded-full" style={{ left: `${l}%`, background: `linear-gradient(${colors[i]}, transparent)`, animation: `sn-ribbon 2.4s ease-out ${i * 0.15}s both` }} />)}
      {[[25, 30], [72, 22], [60, 60], [35, 70]].map(([l, t], i) => (
        <svg key={i} viewBox="0 0 24 24" className="sn-spark absolute size-8" style={{ left: `${l}%`, top: `${t}%`, animation: `sn-spark 1.6s ease-out ${0.2 + i * 0.25}s both` }}><path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" fill="#FFD76A" /></svg>
      ))}
    </div>
  );
}

export function InteractiveDemo({ startHref }: { startHref: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>("product");
  const [style, setStyle] = useState<Style | null>(null);
  const [step, setStep] = useState(0);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [touched, setTouched] = useState(false);
  const [started, setStarted] = useState(false);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const begin = () => {
    if (!started) {
      setStarted(true);
      salesEvent("demo_started");
    }
  };

  // Deterministic, honest progress: fixed steps, no fake percentages.
  useEffect(() => {
    if (stage !== "analyzing" && stage !== "generating") return;
    const total = stage === "analyzing" ? 2 : SALES.demo.steps.length;
    if (step >= total) {
      const t = setTimeout(() => setStage(stage === "analyzing" ? "pick" : "ready"), reduce ? 50 : 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), reduce ? 60 : 850);
    return () => clearTimeout(t);
  }, [stage, step, reduce]);

  useEffect(() => {
    if (stage !== "ready") return;
    salesEvent("demo_completed", { kind });
    const t = setTimeout(() => setStage("preview"), reduce ? 400 : 2600);
    return () => clearTimeout(t);
  }, [stage, kind, reduce]);

  useEffect(() => {
    if (stage !== "idle") headRef.current?.focus({ preventScroll: true });
  }, [stage]);

  const submit = (value: string) => {
    const v = value.trim();
    if (v.length < 3) return;
    begin();
    const k = classify(v);
    setText(v);
    setKind(k);
    setStep(0);
    setTouched(true);
    setStage("analyzing");
    salesEvent("demo_prompt_submitted", { kind: k, length: Math.min(200, v.length) });
  };
  const choose = (s: Style) => {
    setStyle(s);
    setStep(0);
    setStage("generating");
    salesEvent("demo_website_selected", { style: s.type });
  };
  const reset = () => {
    setStage("idle");
    setText("");
    setStyle(null);
    setStep(0);
    setTouched(false);
  };

  const status =
    stage === "analyzing" ? SALES.demo.steps[Math.min(step, 1)] : stage === "generating" ? SALES.demo.steps[Math.min(step, SALES.demo.steps.length - 1)] : stage === "ready" ? SALES.demo.ready : stage === "preview" ? "Preview ready." : "";
  useEffect(() => {
    if (liveRef.current) liveRef.current.textContent = status ?? "";
  }, [status]);

  const previewSrc = style ? `/preview/template/${style.type}?preset=${PRESET[kind]}&demo=${kind}` : "";

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[#0F1A2B] p-2 shadow-[0_40px_90px_-30px_rgba(15,40,80,0.55)] sm:p-3">
      {/* device chrome (SVG) */}
      <svg viewBox="0 0 600 24" className="mx-auto mb-2 block h-4 w-40" aria-hidden="true"><rect x="250" y="6" width="100" height="12" rx="6" fill="#26344A" /><circle cx="370" cy="12" r="4" fill="#26344A" /></svg>
      <div className="relative min-h-[560px] overflow-hidden rounded-[20px] bg-gradient-to-b from-[#EEF6FF] via-white to-white">
        <div className="flex items-center justify-between gap-2 border-b border-[#E3ECF6] px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF5D6] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#8A5A00]">{SALES.demo.label}</span>
          <div className="hidden gap-1 sm:flex" aria-hidden="true">{["IDEA", "STYLE", "BUILD", "READY"].map((s, i) => { const idx = ["idle", "analyzing"].includes(stage) ? 0 : stage === "pick" ? 1 : stage === "generating" ? 2 : 3; return <span key={s} className={cx("rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider", i <= idx ? "bg-[#1F83D8] text-white" : "bg-[#E8F0F8] text-[#7A8BA3]")}>{s}</span>; })}</div>
        </div>
        <p ref={liveRef} className="sr-only" role="status" aria-live="polite" />

        {stage === "idle" && (
          <form className="sn-reveal mx-auto max-w-xl px-5 py-12 sm:py-16" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <h3 ref={headRef} tabIndex={-1} className="text-center text-3xl font-extrabold tracking-tight outline-none sm:text-4xl">{SALES.demo.question}</h3>
            <label htmlFor="sn-demo-input" className="sr-only">{SALES.demo.question}</label>
            <div className="relative mt-6">
              <input
                id="sn-demo-input"
                value={text}
                maxLength={200}
                onFocus={begin}
                onChange={(e) => { setText(e.target.value); setTouched(true); }}
                placeholder={SALES.demo.placeholder}
                className="h-14 w-full rounded-2xl border-0 bg-white px-5 text-base shadow-[0_0_0_2px_#1F83D8,0_12px_30px_-10px_rgba(31,131,216,0.45)] outline-none focus-visible:shadow-[0_0_0_4px_#1F83D8]"
              />
              {!touched && <PointerHand className="sn-pointer pointer-events-none absolute right-2 top-1 sm:-right-16 sm:top-0" />}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Try an example">
              {DEMO_EXAMPLES.map((ex) => (
                <button key={ex.label} type="button" onClick={() => submit(ex.prompt)} className="rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-[#1264AC] shadow-[0_0_0_1px_#CFE3F7] transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_#1F83D8]">
                  {ex.label}
                </button>
              ))}
            </div>
            <div className="relative mt-6 flex justify-center">
              <button type="submit" disabled={text.trim().length < 3} className="inline-flex h-13 items-center gap-2 rounded-full bg-[#1F83D8] px-7 py-3.5 text-base font-bold text-white shadow-[0_12px_30px_-10px_rgba(31,131,216,0.8)] transition hover:bg-[#1264AC] disabled:opacity-50">
                <Sparkles className="size-5" aria-hidden="true" /> {SALES.demo.create}
              </button>
              {touched && text.trim().length >= 3 && <PointerHand className="sn-pointer pointer-events-none absolute -right-2 top-8 sm:right-[18%]" />}
            </div>
            <p className="mt-6 text-center text-xs text-[#667085]">{SALES.demo.disclosure}</p>
          </form>
        )}

        {(stage === "analyzing" || stage === "generating") && (
          <div className="mx-auto grid max-w-3xl gap-8 px-5 py-12 sm:grid-cols-2 sm:items-center">
            <div>
              <h3 ref={headRef} tabIndex={-1} className="text-2xl font-extrabold tracking-tight outline-none">{stage === "analyzing" ? "Reading your idea" : `Building your ${style?.name}`}</h3>
              <p className="mt-1 truncate text-sm text-[#667085]">&ldquo;{text}&rdquo;</p>
              <ol className="mt-5 space-y-2.5">
                {(stage === "analyzing" ? SALES.demo.steps.slice(0, 2) : SALES.demo.steps).map((s, i) => (
                  <li key={s} className={cx("flex items-center gap-2.5 text-sm font-semibold transition", i < step ? "text-[#1FA36A]" : i === step ? "text-[#171717]" : "text-[#A6B3C4]")}>
                    <span className={cx("flex size-5 items-center justify-center rounded-full", i < step ? "bg-[#1FA36A] text-white" : i === step ? "bg-[#1F83D8]" : "bg-[#E3ECF6]")}>{i < step ? <Check className="size-3" /> : i === step ? <span className="size-2 animate-ping rounded-full bg-white motion-reduce:animate-none" /> : null}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_20px_50px_-20px_rgba(15,40,80,0.35)]" aria-hidden="true">
              {SECTIONS.map((s, i) => (
                <div key={s} className={cx("relative mb-2.5 overflow-hidden rounded-xl transition-all duration-500", stage === "generating" && i < step + 1 ? "bg-gradient-to-r from-[#E8F4FF] to-[#F0EAFE] opacity-100" : "bg-[#F1F5FA] opacity-60", i === 0 ? "h-20" : "h-9")}>
                  <span className="absolute left-3 top-2 text-[10px] font-bold uppercase tracking-wider text-[#7A8BA3]">{s}</span>
                  {(stage === "analyzing" || i === step) && <span className="sn-shimmer absolute inset-0" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === "pick" && (
          <div className="sn-reveal mx-auto max-w-3xl px-5 py-12">
            <h3 ref={headRef} tabIndex={-1} className="text-center text-2xl font-extrabold tracking-tight outline-none sm:text-3xl">{SALES.demo.pickTitle}</h3>
            <p className="mt-1 text-center text-sm text-[#667085]">Based on &ldquo;{text}&rdquo;</p>
            <div className="relative mt-7 grid gap-4 sm:grid-cols-2">
              {STYLES[kind].map((s, i) => (
                <button key={s.type} type="button" onClick={() => choose(s)} className="group rounded-3xl bg-white p-5 text-left shadow-[0_0_0_1px_#DCE8F5,0_16px_40px_-24px_rgba(15,40,80,0.4)] transition hover:-translate-y-1 hover:shadow-[0_0_0_2px_#1F83D8,0_20px_44px_-20px_rgba(31,131,216,0.5)] focus-visible:shadow-[0_0_0_3px_#1F83D8]">
                  <div className="mb-4 h-28 rounded-2xl bg-gradient-to-br from-[#E8F4FF] to-[#F0EAFE] p-3" aria-hidden="true">
                    <div className="h-8 rounded-lg bg-white/90" />
                    <div className={cx("mt-2 grid gap-2", i === 0 ? "grid-cols-1" : "grid-cols-3")}>{Array.from({ length: i === 0 ? 1 : 3 }, (_, k) => <div key={k} className="h-10 rounded-lg bg-white/70" />)}</div>
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#1F83D8]">Option {i === 0 ? "A" : "B"}</p>
                  <p className="text-lg font-extrabold">{s.name}</p>
                  <p className="text-sm text-[#667085]">{s.desc}</p>
                </button>
              ))}
              <PointerHand className="sn-pointer pointer-events-none absolute -bottom-14 left-1/2 hidden sm:block" />
            </div>
          </div>
        )}

        {stage === "ready" && (
          <div className="sn-reveal relative flex min-h-[500px] flex-col items-center justify-center px-5 text-center">
            {!reduce && <Confetti />}
            <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#5BB2F5] to-[#1264AC] text-white shadow-[0_16px_40px_-10px_rgba(31,131,216,0.7)]"><Check className="size-8" /></span>
            <h3 ref={headRef} tabIndex={-1} className="mt-5 text-3xl font-extrabold tracking-tight outline-none sm:text-4xl">{SALES.demo.ready}</h3>
            <p className="mt-2 text-[#667085]">{SALES.demo.readySub}</p>
          </div>
        )}

        {stage === "preview" && style && (
          <div className="sn-reveal flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <h3 ref={headRef} tabIndex={-1} className="text-base font-extrabold outline-none">{style.name} · sample for &ldquo;{text.length > 40 ? `${text.slice(0, 40)}…` : text}&rdquo;</h3>
              <div className="inline-flex rounded-full bg-[#EEF4FB] p-1" role="group" aria-label="Preview size">
                {(["desktop", "mobile"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cx("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold", view === v ? "bg-white text-[#1264AC] shadow" : "text-[#667085]")}>
                    {v === "desktop" ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />} {v === "desktop" ? "Desktop" : "Mobile"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-center bg-[#E9EFF6] px-2 py-3">
              <iframe key={`${style.type}-${view}`} title={`${style.name} — interactive sample preview`} src={previewSrc} loading="lazy" className="h-[520px] rounded-xl border-0 bg-white shadow-xl transition-all" style={{ width: view === "desktop" ? "100%" : 390, maxWidth: "100%" }} />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-4">
              <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold shadow-[0_0_0_1px_#CFE3F7]"><RotateCcw className="size-4" /> {SALES.demo.again}</button>
              <a href={startHref} data-track="hero_cta_click" data-track-props='{"location":"demo"}' className="inline-flex items-center gap-2 rounded-full bg-[#1F83D8] px-6 py-3 text-sm font-bold text-white shadow-[0_12px_30px_-10px_rgba(31,131,216,0.8)] hover:bg-[#1264AC]">{SALES.hero.primary}</a>
            </div>
            <p className="pb-4 text-center text-xs text-[#667085]">{SALES.demo.disclosure}</p>
          </div>
        )}
      </div>
    </div>
  );
}
