import { Globe, Palette, Megaphone, ShoppingBag, Trophy, Crown, Gem, Rocket, Star } from "lucide-react";
import type { AchievementKey, Tier } from "@/lib/achievements/definitions";
import { tierFor } from "@/lib/achievements/definitions";

/** Tier palettes: [highlight, mid, deep, rim]. Higher tiers get metallic/prismatic treatments. */
const TIERS: Record<Tier, { stops: [string, string, string]; rim: string; glow: string }> = {
  blue: { stops: ["#8FD0FF", "#1F83D8", "#0E4F8F"], rim: "#CDEBFF", glow: "#1F83D8" },
  silver: { stops: ["#FFFFFF", "#C7CFDA", "#7D8898"], rim: "#EEF2F6", glow: "#9AA6B6" },
  gold: { stops: ["#FFF0B3", "#F2B630", "#A8650A"], rim: "#FFE7A3", glow: "#F2B630" },
  purple: { stops: ["#E6D9FF", "#8B5CF6", "#4C1FB8"], rim: "#EDE4FF", glow: "#8B5CF6" },
  platinum: { stops: ["#FFFFFF", "#BCD3E4", "#5E7F99"], rim: "#F2F8FC", glow: "#7FB6DA" },
  diamond: { stops: ["#E8FDFF", "#67D4FB", "#5B4BE0"], rim: "#F0FCFF", glow: "#7C83FD" },
};

function Glyph({ k, level }: { k: AchievementKey; level: number }) {
  const p = { x: 34, y: 30, width: 52, height: 52, color: "#fff", strokeWidth: 2.1 } as const;
  if (k === "website_creator") return <Globe {...p} />;
  if (k === "creative_star") return <Palette {...p} />;
  if (k === "marketing_starter") return <Megaphone {...p} />;
  if (level <= 1) return <ShoppingBag {...p} />;
  if (level === 2) return <Rocket {...p} />;
  if (level === 3) return <Star {...p} />;
  if (level <= 5) return <Trophy {...p} />;
  if (level <= 8) return <Crown {...p} />;
  return <Gem {...p} />;
}

/**
 * Original illustrated collectible sticker (pure SVG, no external assets):
 * die-cut white outline · tier gradient body · inner bevel ring · glossy highlight · icon · level ribbon.
 * `locked` renders a muted silhouette for the collection page.
 */
export function Sticker({ achievement, level, size = 120, locked = false, className }: { achievement: AchievementKey; level: number; size?: number; locked?: boolean; className?: string }) {
  const tier = tierFor(achievement, level);
  const c = TIERS[tier];
  const id = `stk-${achievement}-${level}-${locked ? "l" : "u"}`;
  const high = tier === "platinum" || tier === "diamond";
  return (
    <svg viewBox="0 0 120 132" width={size} height={(size * 132) / 120} className={className} role="img" aria-hidden style={locked ? { filter: "grayscale(1)", opacity: 0.35 } : undefined}>
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={c.stops[0]} />
          <stop offset="0.5" stopColor={c.stops[1]} />
          <stop offset="1" stopColor={c.stops[2]} />
        </linearGradient>
        <radialGradient id={`${id}-gloss`} cx="0.35" cy="0.2" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {high && (
          <linearGradient id={`${id}-prism`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#B8F3FF" stopOpacity="0.4" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        )}
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor={c.glow} floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={locked ? undefined : `url(#${id}-shadow)`}>
        {/* die-cut sticker outline */}
        <path d="M60 4 L104 20 Q112 23 112 31 L112 72 Q112 104 60 124 Q8 104 8 72 L8 31 Q8 23 16 20 Z" fill="#fff" />
        {/* body */}
        <path d="M60 11 L100 25 Q105 27 105 33 L105 72 Q105 99 60 117 Q15 99 15 72 L15 33 Q15 27 20 25 Z" fill={`url(#${id}-body)`} />
        {/* bevel ring */}
        <path d="M60 18 L95 30 Q98 31 98 35 L98 71 Q98 94 60 109 Q22 94 22 71 L22 35 Q22 31 25 30 Z" fill="none" stroke={c.rim} strokeOpacity="0.55" strokeWidth="1.5" />
        {/* gloss */}
        <path d="M60 11 L100 25 Q105 27 105 33 L105 52 Q70 62 15 46 L15 33 Q15 27 20 25 Z" fill={`url(#${id}-gloss)`} />
        {high && <path d="M15 40 L105 86 L105 96 L15 50 Z" fill={`url(#${id}-prism)`} />}
        <Glyph k={achievement} level={level} />
        {/* level ribbon */}
        <path d="M26 92 H94 L88 101 L94 110 H26 L32 101 Z" fill="#fff" />
        <path d="M29 94.5 H91 L86.5 101 L91 107.5 H29 L33.5 101 Z" fill={c.stops[2]} />
        <text x="60" y="104.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" fontFamily="var(--font-jakarta), system-ui, sans-serif" letterSpacing="0.5">
          LV {level}
        </text>
        {high &&
          [
            [18, 18, 3],
            [104, 14, 2.4],
            [110, 60, 2],
          ].map(([x, y, r], i) => <path key={i} d={`M${x} ${y! - r! * 2} L${x! + r! * 0.6} ${y! - r! * 0.6} L${x! + r! * 2} ${y} L${x! + r! * 0.6} ${y! + r! * 0.6} L${x} ${y! + r! * 2} L${x! - r! * 0.6} ${y! + r! * 0.6} L${x! - r! * 2} ${y} L${x! - r! * 0.6} ${y! - r! * 0.6} Z`} fill="#fff" />)}
      </g>
    </svg>
  );
}
