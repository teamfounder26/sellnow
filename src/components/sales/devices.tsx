import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * Device frames: an SVG bezel with a live HTML screen on top. The screen is a size container whose
 * font-size is a fixed fraction of its width, so screen content laid out in `em` scales crisply
 * at any size (no bitmaps, no transforms that blur text).
 */
type Kind = "desktop" | "tablet" | "phone";
const GEO: Record<Kind, { ratio: string; screen: { l: number; t: number; w: number; h: number; r: string }; em: number }> = {
  // percentages of the frame box; `em` = screen width in em units
  desktop: { ratio: "1000 / 720", screen: { l: 3.2, t: 4.4, w: 93.6, h: 77, r: "0.6%" }, em: 80 },
  tablet: { ratio: "1000 / 760", screen: { l: 4.6, t: 6, w: 90.8, h: 88, r: "1.6%" }, em: 64 },
  phone: { ratio: "460 / 940", screen: { l: 5.2, t: 2.6, w: 89.6, h: 94.8, r: "9%" }, em: 36 },
};

function Bezel({ kind }: { kind: Kind }) {
  if (kind === "desktop")
    return (
      <svg viewBox="0 0 1000 720" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="sn-bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2A2F38" /><stop offset="1" stopColor="#14171C" /></linearGradient>
          <linearGradient id="sn-stand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E7EBF1" /><stop offset="1" stopColor="#B9C2CE" /></linearGradient>
        </defs>
        <path d="M430 590h140l18 96h-176z" fill="url(#sn-stand)" />
        <rect x="350" y="680" width="300" height="18" rx="9" fill="url(#sn-stand)" />
        <rect x="0" y="0" width="1000" height="600" rx="22" fill="url(#sn-bezel)" />
        <rect x="0" y="574" width="1000" height="26" rx="0" fill="#E3E8EF" />
        <path d="M0 574h1000v4a22 22 0 0 1-22 22H22A22 22 0 0 1 0 578z" fill="#D5DCE5" />
        <circle cx="500" cy="16" r="4" fill="#3C434E" />
      </svg>
    );
  if (kind === "tablet")
    return (
      <svg viewBox="0 0 1000 760" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <rect x="0" y="0" width="1000" height="760" rx="46" fill="#1B1F26" />
        <rect x="6" y="6" width="988" height="748" rx="41" fill="none" stroke="#3A414D" strokeWidth="3" />
        <circle cx="500" cy="24" r="5" fill="#333A45" />
      </svg>
    );
  return (
    <svg viewBox="0 0 460 940" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <rect x="0" y="0" width="460" height="940" rx="66" fill="#1B1F26" />
      <rect x="5" y="5" width="450" height="930" rx="61" fill="none" stroke="#3A414D" strokeWidth="3" />
      <rect x="170" y="34" width="120" height="30" rx="15" fill="#0B0D11" />
    </svg>
  );
}

export function Device({ kind, children, className, label }: { kind: Kind; children: ReactNode; className?: string; label: string }) {
  const g = GEO[kind];
  return (
    <figure className={cx("relative m-0", className)} style={{ aspectRatio: g.ratio }} aria-label={label}>
      <Bezel kind={kind} />
      <div
        className="sn-screen absolute overflow-hidden bg-white"
        style={{ left: `${g.screen.l}%`, top: `${g.screen.t}%`, width: `${g.screen.w}%`, height: `${g.screen.h}%`, borderRadius: g.screen.r, ["--sn-em" as string]: g.em }}
      >
        <div className="sn-screen-inner h-full w-full">{children}</div>
      </div>
    </figure>
  );
}
