/**
 * Original Fluent-inspired dimensional SVG artwork for the sales page.
 * Shared gradients live once in <SalesDefs/>; every illustration references them by id
 * (no per-illustration filter stacks, no huge path data).
 */
import type { SVGProps } from "react";

export function SalesDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="sn-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5BB2F5" /><stop offset="1" stopColor="#1264AC" /></linearGradient>
        <linearGradient id="sn-blue-soft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#D6EBFF" /></linearGradient>
        <linearGradient id="sn-lav" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C9B6FB" /><stop offset="1" stopColor="#7C5CE0" /></linearGradient>
        <linearGradient id="sn-peach" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFC9A3" /><stop offset="1" stopColor="#F07A3A" /></linearGradient>
        <linearGradient id="sn-mint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9BE8C2" /><stop offset="1" stopColor="#1FA36A" /></linearGradient>
        <linearGradient id="sn-yellow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE9A6" /><stop offset="1" stopColor="#F5B400" /></linearGradient>
        <linearGradient id="sn-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F8D2B4" /><stop offset="1" stopColor="#D99A72" /></linearGradient>
        <linearGradient id="sn-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4A3A3F" /><stop offset="1" stopColor="#1E1518" /></linearGradient>
        <linearGradient id="sn-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity=".75" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></linearGradient>
        <radialGradient id="sn-shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#0B3B6B" stopOpacity=".22" /><stop offset="1" stopColor="#0B3B6B" stopOpacity="0" /></radialGradient>
      </defs>
    </svg>
  );
}

type P = SVGProps<SVGSVGElement> & { title?: string };
const Svg = ({ title, children, ...p }: P) => (
  <svg role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...p}>
    {title && <title>{title}</title>}
    {children}
  </svg>
);

/** A soft 3D "tile": gradient body, top shine, ground shadow. */
function Tile({ x, y, w, h, r = 14, fill }: { x: number; y: number; w: number; h: number; r?: number; fill: string }) {
  return (
    <g>
      <ellipse cx={x + w / 2} cy={y + h + 6} rx={w / 2} ry={7} fill="url(#sn-shadow)" />
      <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h * 0.45} rx={r - 3} fill="url(#sn-shine)" />
    </g>
  );
}

/** Friendly seller figure (head + shoulders), reused in the three problem scenes with different poses. */
function Person({ x, y, s = 1, mood = "worried" }: { x: number; y: number; s?: number; mood?: "worried" | "busy" | "tired" }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="96" rx="46" ry="8" fill="url(#sn-shadow)" />
      <path d="M-44 92c0-30 18-46 44-46s44 16 44 46z" fill="url(#sn-blue)" />
      <path d="M-30 60c8-8 18-12 30-12s22 4 30 12" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" />
      <circle cx="0" cy="18" r="27" fill="url(#sn-skin)" />
      <path d="M-28 16c-2-22 14-34 30-33 18 1 30 14 26 34-6-12-16-17-28-17-12 0-22 6-28 16z" fill="url(#sn-hair)" />
      <circle cx="-9" cy="22" r="2.6" fill="#2B1F22" />
      <circle cx="9" cy="22" r="2.6" fill="#2B1F22" />
      {mood === "worried" && <path d="M-7 35q7-4 14 0" fill="none" stroke="#7A3E2B" strokeWidth="2.4" strokeLinecap="round" />}
      {mood === "busy" && <path d="M-6 34h12" stroke="#7A3E2B" strokeWidth="2.4" strokeLinecap="round" />}
      {mood === "tired" && <path d="M-7 36q7-3 14 0M-13 15l7 2M13 15l-7 2" fill="none" stroke="#7A3E2B" strokeWidth="2.2" strokeLinecap="round" />}
    </g>
  );
}

/** Problem 1 — a seller facing an editor full of code and settings windows. */
export function ArtCode(p: P) {
  return (
    <Svg viewBox="0 0 320 220" {...p}>
      <Tile x={70} y={22} w={200} h={128} r={16} fill="url(#sn-blue-soft)" />
      <rect x="70" y="22" width="200" height="22" rx="16" fill="#CFE6FB" />
      {[0, 1, 2].map((i) => <circle key={i} cx={86 + i * 12} cy={33} r={3.5} fill={["#FF8A80", "#FFD76A", "#7BD8A6"][i]} />)}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={86} y={56 + i * 16} width={14 + (i % 3) * 10} height={7} rx={3.5} fill={["#7C5CE0", "#1F83D8", "#F07A3A", "#1FA36A", "#1F83D8"][i]} opacity=".85" />
          <rect x={110 + (i % 3) * 10} y={56 + i * 16} width={60 + ((i * 23) % 70)} height={7} rx={3.5} fill="#9DB8D3" opacity=".6" />
        </g>
      ))}
      <g className="sn-float-a">
        <Tile x={214} y={98} w={86} h={66} r={12} fill="#FFFFFF" />
        <circle cx="236" cy="120" r="9" fill="url(#sn-lav)" />
        <rect x="252" y="114" width="36" height="6" rx="3" fill="#C9D6E6" />
        <rect x="252" y="126" width="24" height="6" rx="3" fill="#C9D6E6" />
        <rect x="226" y="142" width="62" height="10" rx="5" fill="url(#sn-blue)" opacity=".9" />
      </g>
      <g className="sn-float-b">
        <Tile x={16} y={70} w={70} h={52} r={12} fill="#FFFFFF" />
        <path d="M34 90l-8 7 8 7M56 90l8 7-8 7M50 86l-10 22" fill="none" stroke="#1F83D8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(250 22)">
        <g className="sn-float-a">
          <circle r="17" fill="url(#sn-yellow)" />
          <text y="7" textAnchor="middle" fontSize="20" fontWeight="800" fill="#7A4E00">?</text>
        </g>
      </g>
      <Person x={140} y={118} s={0.92} mood="worried" />
    </Svg>
  );
}

/** Problem 2 — the seller surrounded by disconnected app windows and tangled links. */
export function ArtTools(p: P) {
  const apps = [
    { x: 18, y: 26, f: "url(#sn-blue)", k: "web" },
    { x: 232, y: 18, f: "url(#sn-mint)", k: "pay" },
    { x: 238, y: 118, f: "url(#sn-peach)", k: "ads" },
    { x: 20, y: 128, f: "url(#sn-lav)", k: "box" },
  ];
  return (
    <Svg viewBox="0 0 320 220" {...p}>
      <path d="M70 60C120 40 130 120 160 108S230 30 262 60M74 158c40 20 70-60 90-40s60 40 100 22M60 82c80 60 120-20 200 74" fill="none" stroke="#9DB8D3" strokeWidth="2.5" strokeDasharray="6 7" strokeLinecap="round" />
      {apps.map((a, i) => (
        <g key={a.k} className={i % 2 ? "sn-float-a" : "sn-float-b"}>
          <Tile x={a.x} y={a.y} w={70} h={62} r={14} fill="#FFFFFF" />
          <rect x={a.x + 18} y={a.y + 12} width={34} height={30} rx={10} fill={a.f} />
          <rect x={a.x + 22} y={a.y + 15} width={26} height={9} rx={4} fill="url(#sn-shine)" />
          <rect x={a.x + 16} y={a.y + 48} width={38} height={5} rx={2.5} fill="#C9D6E6" />
        </g>
      ))}
      <g transform="translate(178 74) rotate(-12)">
        <g className="sn-float-b">
          <circle r="13" fill="#FFFFFF" stroke="#FF8A80" strokeWidth="3" />
          <path d="M-6-6l12 12M6-6l-12 12" stroke="#FF6B5E" strokeWidth="3" strokeLinecap="round" />
        </g>
      </g>
      <Person x={150} y={104} s={0.95} mood="busy" />
    </Svg>
  );
}

/** Problem 3 — drafts piling up, a calendar of missed days and a page stuck "in progress". */
export function ArtStuck(p: P) {
  return (
    <Svg viewBox="0 0 320 220" {...p}>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${196 + i * 8} ${36 + i * 10}) rotate(${-8 + i * 7})`}>
          <rect width="88" height="108" rx="12" fill="#FFFFFF" stroke="#DCE8F5" />
          <rect x="12" y="14" width="50" height="7" rx="3.5" fill="#C9D6E6" />
          <rect x="12" y="28" width="64" height="5" rx="2.5" fill="#E2EBF5" />
          <rect x="12" y="38" width="40" height="5" rx="2.5" fill="#E2EBF5" />
          {i === 2 && <path d="M18 66l52 30M70 66l-52 30" stroke="#FFB4A8" strokeWidth="3" strokeLinecap="round" />}
        </g>
      ))}
      <g className="sn-float-a">
        <Tile x={18} y={26} w={96} h={88} r={14} fill="#FFFFFF" />
        <rect x="18" y="26" width="96" height="24" rx="14" fill="url(#sn-peach)" />
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <rect x={30 + (i % 4) * 20} y={58 + Math.floor(i / 4) * 17} width="14" height="12" rx="3" fill={i < 9 ? "#FFE1CF" : "#E8F4FF"} />
            {i < 9 && <path d={`M${33 + (i % 4) * 20} ${61 + Math.floor(i / 4) * 17}l8 6m0-6l-8 6`} stroke="#F07A3A" strokeWidth="1.8" strokeLinecap="round" />}
          </g>
        ))}
      </g>
      <g className="sn-float-b">
        <Tile x={24} y={136} w={110} h={46} r={12} fill="#FFFFFF" />
        <rect x="36" y="150" width="86" height="8" rx="4" fill="#E2EBF5" />
        <rect x="36" y="150" width="34" height="8" rx="4" fill="url(#sn-yellow)" />
        <rect x="36" y="164" width="52" height="5" rx="2.5" fill="#C9D6E6" />
      </g>
      <Person x={168} y={110} s={0.92} mood="tired" />
    </Svg>
  );
}

const ICONS: Record<string, (s: string) => React.ReactNode> = {
  builder: () => (
    <>
      <rect x="8" y="12" width="40" height="32" rx="8" fill="url(#sn-blue)" />
      <rect x="12" y="15" width="32" height="10" rx="5" fill="url(#sn-shine)" />
      <path d="M44 6l2.4 5.6L52 14l-5.6 2.4L44 22l-2.4-5.6L36 14l5.6-2.4z" fill="url(#sn-yellow)" />
      <rect x="15" y="30" width="18" height="4" rx="2" fill="#fff" opacity=".9" />
      <rect x="15" y="37" width="12" height="4" rx="2" fill="#fff" opacity=".6" />
    </>
  ),
  sell: () => (
    <>
      <path d="M12 20h32l-3 26a6 6 0 0 1-6 5H21a6 6 0 0 1-6-5z" fill="url(#sn-mint)" />
      <path d="M21 22v-6a7 7 0 0 1 14 0v6" fill="none" stroke="#147A50" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="16" y="22" width="24" height="9" rx="4" fill="url(#sn-shine)" />
      <circle cx="42" cy="42" r="9" fill="url(#sn-yellow)" />
      <path d="M38 42l3 3 5-6" fill="none" stroke="#7A4E00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  business: () => (
    <>
      <path d="M8 24l20-14 20 14v22a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="url(#sn-lav)" />
      <path d="M6 24l22-16 22 16" fill="none" stroke="#5A3BC4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="22" y="34" width="12" height="16" rx="3" fill="#fff" opacity=".9" />
      <rect x="12" y="28" width="32" height="7" rx="3.5" fill="url(#sn-shine)" />
    </>
  ),
  profile: () => (
    <>
      <rect x="10" y="8" width="36" height="42" rx="8" fill="url(#sn-blue)" />
      <circle cx="28" cy="24" r="7" fill="#fff" opacity=".95" />
      <path d="M17 42c2-7 6-10 11-10s9 3 11 10" fill="#fff" opacity=".85" />
      <path d="M44 6l2 4.5L50 12l-4 1.6L44 18l-2-4.4L38 12l4-1.5z" fill="url(#sn-yellow)" />
    </>
  ),
  creative: () => (
    <>
      <rect x="8" y="12" width="40" height="34" rx="8" fill="url(#sn-peach)" />
      <circle cx="20" cy="24" r="5" fill="#FFF0E5" />
      <path d="M12 42l11-11 7 7 6-5 8 9z" fill="#fff" opacity=".9" />
      <rect x="12" y="15" width="32" height="8" rx="4" fill="url(#sn-shine)" />
    </>
  ),
  pay: () => (
    <>
      <rect x="6" y="14" width="44" height="30" rx="8" fill="url(#sn-blue)" />
      <rect x="6" y="21" width="44" height="6" fill="#0B4F8C" opacity=".55" />
      <rect x="12" y="33" width="14" height="5" rx="2.5" fill="#fff" opacity=".85" />
      <circle cx="42" cy="40" r="9" fill="url(#sn-mint)" />
      <path d="M38 40l3 3 5-6" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  ship: () => (
    <>
      <path d="M8 18l20-10 20 10v22L28 50 8 40z" fill="url(#sn-yellow)" />
      <path d="M8 18l20 10 20-10M28 28v22" fill="none" stroke="#9A6A00" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M18 13l20 10" stroke="#fff" strokeOpacity=".7" strokeWidth="3" />
    </>
  ),
  customers: () => (
    <>
      <circle cx="21" cy="20" r="8" fill="url(#sn-lav)" />
      <circle cx="37" cy="22" r="7" fill="url(#sn-blue)" />
      <path d="M7 44c1-10 7-15 14-15s13 5 14 15z" fill="url(#sn-lav)" />
      <path d="M27 44c1-9 5-13 10-13s10 4 11 13z" fill="url(#sn-blue)" />
    </>
  ),
  dashboard: () => (
    <>
      <rect x="6" y="10" width="44" height="36" rx="8" fill="#FFFFFF" stroke="#CFE6FB" strokeWidth="2" />
      <rect x="13" y="30" width="6" height="10" rx="2" fill="url(#sn-blue)" />
      <rect x="23" y="24" width="6" height="16" rx="2" fill="url(#sn-lav)" />
      <rect x="33" y="18" width="6" height="22" rx="2" fill="url(#sn-mint)" />
    </>
  ),
};

export function FluentIcon({ name, size = 56, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden="true" className={className}>
      <ellipse cx="28" cy="52" rx="18" ry="3.5" fill="url(#sn-shadow)" />
      {ICONS[name]?.(name)}
    </svg>
  );
}

/** Dimensional pointing hand (demo guide). Purely decorative — never required to operate the demo. */
export function PointerHand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 72" width="56" height="63" aria-hidden="true" className={className}>
      <circle className="sn-tap" cx="20" cy="10" r="9" fill="none" stroke="#1F83D8" strokeWidth="2.5" />
      <path d="M17 12a5 5 0 0 1 10 0v20l3-1a5 5 0 0 1 6 3l1-.4a5 5 0 0 1 6 3.4l1-.3a5 5 0 0 1 6 4V52c0 9-7 16-16 16h-6c-6 0-11-3-14-8L7 46a5 5 0 0 1 8-6l2 3z" fill="url(#sn-skin)" stroke="#B9774F" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 14a3 3 0 0 1 4 0v14" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
