"use client";
import { useEffect, useState } from "react";

const COLORS = ["#1F83D8", "#8FD0FF", "#8B5CF6", "#F2B630", "#FF7A45", "#E8F8F0"];

/**
 * Premium, restrained celebration: confetti, ribbon bursts and sparkles. Purely decorative,
 * pointer-events none (never blocks actions), and skipped entirely under prefers-reduced-motion.
 */
export function Celebrate({ intensity = "normal", sound = false }: { intensity?: "normal" | "big"; sound?: boolean }) {
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    setReduce(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    if (sound) {
      try {
        const ctx = new AudioContext();
        [523.25, 659.25, 783.99].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.09);
          g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + i * 0.09 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.5);
          o.connect(g).connect(ctx.destination);
          o.start(ctx.currentTime + i * 0.09);
          o.stop(ctx.currentTime + i * 0.09 + 0.55);
        });
      } catch {
        /* audio unavailable */
      }
    }
  }, [sound]);
  if (reduce) return null;
  const n = intensity === "big" ? 110 : 64;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={`c${i}`}
          className="absolute top-0 block rounded-[2px]"
          style={{
            left: `${(i * 37) % 100}%`,
            width: i % 3 === 0 ? 6 : 8,
            height: i % 3 === 0 ? 14 : 8,
            background: COLORS[i % COLORS.length],
            animation: `confetti-fall ${2.4 + ((i * 13) % 20) / 10}s ${((i * 7) % 12) / 10}s cubic-bezier(.2,.6,.4,1) forwards`,
            ["--dx" as string]: `${((i * 53) % 160) - 80}px`,
          }}
        />
      ))}
      {Array.from({ length: intensity === "big" ? 14 : 8 }).map((_, i) => (
        <span
          key={`r${i}`}
          className="absolute left-1/2 top-[38%] block h-1.5 w-28 origin-left rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${COLORS[i % COLORS.length]})`,
            animation: `ribbon 1.3s ${0.1 + i * 0.03}s ease-out forwards`,
            opacity: 0,
            ["--rot" as string]: `${(360 / (intensity === "big" ? 14 : 8)) * i}deg`,
            ["--len" as string]: "60px",
          }}
        />
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={`s${i}`}
          className="absolute block size-3"
          style={{
            left: `${15 + ((i * 61) % 70)}%`,
            top: `${12 + ((i * 29) % 50)}%`,
            animation: `sparkle 1.6s ${0.3 + (i % 6) * 0.25}s ease-in-out 2`,
            opacity: 0,
            background: "radial-gradient(circle, #fff 0 30%, rgba(143,208,255,.8) 31% 45%, transparent 46%)",
          }}
        />
      ))}
    </div>
  );
}
