"use client";
import { useEffect, useState } from "react";
import { PartyPopper, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

const COLORS = ["#FFD337", "#FF7A24", "#A78BFA", "#DEF8E9", "#FFE7E5"];

/** One-time celebration for a real milestone notification (shown once per notification id). */
export function Celebration({ id, title, body }: { id: string; title: string; body?: string }) {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const k = `sn_celebrated_${id}`;
      if (!localStorage.getItem(k)) {
        setShow(true);
        localStorage.setItem(k, "1");
      }
    } catch {
      /* storage unavailable: skip celebration */
    }
  }, [id]);
  if (!show) return null;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      {!reduce &&
        Array.from({ length: 70 }).map((_, i) => (
          <span
            key={i}
            className="absolute top-0 block h-3 w-2 rounded-sm"
            style={{
              left: `${(i * 37) % 100}%`,
              background: COLORS[i % COLORS.length],
              animation: `confetti-fall ${2.2 + ((i * 13) % 20) / 10}s ${((i * 7) % 10) / 10}s ease-in forwards`,
              ["--dx" as string]: `${((i * 53) % 120) - 60}px`,
            }}
          />
        ))}
      <div className="pointer-events-auto absolute bottom-6 left-1/2 w-[min(92vw,420px)] -translate-x-1/2 rounded-card border border-line bg-surface p-5 shadow-lift animate-rise">
        <button className="absolute right-3 top-3 rounded-full p-1 text-muted hover:bg-ink/5" onClick={() => setShow(false)} aria-label={t("common.close")}>
          <X className="size-4" />
        </button>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <PartyPopper className="size-4" /> {t("milestones.unlocked")}
        </p>
        <p className="mt-2 text-xl font-extrabold">{title}</p>
        {body && <p className="mt-1 text-[15px] text-muted">{body}</p>}
      </div>
    </div>
  );
}
