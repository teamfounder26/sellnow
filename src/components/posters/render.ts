"use client";
import type { PosterCopy, PosterRatio, PosterTheme } from "@/lib/db/schema";
import { RATIO_PX } from "@/lib/posters/options";

/**
 * Poster composer. Image models misspell words, so SellNow draws the approved headline, body and
 * CTA itself on top of the artwork (AI image or the seller's product photo). Because text is a
 * separate layer, wording can change without regenerating — and exports are pixel-exact.
 */
export type PosterSpec = {
  ratio: PosterRatio;
  theme: PosterTheme;
  copy: PosterCopy;
  kind: "ai_image" | "layout";
  textMode: "overlay" | "in_image";
  artUrl: string | null;
  logoUrl?: string | null;
  brandColors: string[];
  priceLabel: string | null;
  productName: string;
  testimonial?: { quote: string; author: string } | null;
};

const INK = "#0F172A";
const MUTED = "#475569";

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1]!, 16) : 0x1f83d8;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** Text colour on `bg`. All poster text on colour is large and bold, so white needs WCAG 3:1. */
export function onColor(bg: string) {
  return 1.05 / (luminance(bg) + 0.05) >= 3 ? "#FFFFFF" : INK;
}
function tint(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  if (!imageCache.has(url))
    imageCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      }),
    );
  return imageCache.get(url)!;
}

function fontFamily() {
  if (typeof document === "undefined") return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size (≤ max) that fits the text into `maxLines` lines of `maxW`. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number, max: number, min: number, weight: number, fam: string) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${fam}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { size, lines };
  }
  ctx.font = `${weight} ${min}px ${fam}`;
  return { size: min, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, mode: "cover" | "contain") {
  const s = mode === "cover" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export async function drawPoster(canvas: HTMLCanvasElement, spec: PosterSpec, scale = 1) {
  const { w: W, h: H } = RATIO_PX[spec.ratio];
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (typeof document !== "undefined" && document.fonts) await document.fonts.ready;
  const fam = fontFamily();
  const [art, logo] = await Promise.all([loadImage(spec.artUrl), loadImage(spec.logoUrl)]);
  const brand = spec.brandColors[0] && /^#[0-9a-f]{6}$/i.test(spec.brandColors[0]) ? spec.brandColors[0] : "#1F83D8";
  const accent = spec.brandColors[1] && /^#[0-9a-f]{6}$/i.test(spec.brandColors[1]) ? spec.brandColors[1] : brand;
  const pad = W * 0.07;
  const u = W / 1200;

  // ---- background / artwork
  if (spec.kind === "ai_image" && art) {
    drawCover(ctx, art, 0, 0, W, H, "cover");
    if (spec.textMode === "in_image") return; // the model drew the text; nothing to overlay
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.36);
    top.addColorStop(0, "rgba(255,255,255,0.92)");
    top.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H * 0.36);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, tint(brand, 0.1));
    bg.addColorStop(1, "#FFFFFF");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = tint(accent, 0.12);
    ctx.beginPath();
    ctx.arc(W * 0.86, H * 0.5, W * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tint(brand, 0.08);
    ctx.beginPath();
    ctx.arc(W * 0.1, H * 0.86, W * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- logo + price badge
  let y = pad;
  if (logo) {
    const lh = 64 * u;
    const lw = Math.min((logo.width / logo.height) * lh, 260 * u);
    ctx.drawImage(logo, pad, y, lw, lh);
    y += lh + 24 * u;
  } else if (spec.kind === "layout") {
    ctx.font = `700 ${30 * u}px ${fam}`;
    ctx.fillStyle = brand;
    ctx.fillText(spec.productName.toUpperCase().slice(0, 40), pad, y + 30 * u);
    y += 56 * u;
  }
  if (spec.priceLabel) {
    ctx.font = `800 ${38 * u}px ${fam}`;
    const tw = ctx.measureText(spec.priceLabel).width;
    const bw = tw + 52 * u;
    const bh = 72 * u;
    roundRect(ctx, W - pad - bw, pad - 6 * u, bw, bh, bh / 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = onColor(accent);
    ctx.textBaseline = "middle";
    ctx.fillText(spec.priceLabel, W - pad - bw + 26 * u, pad - 6 * u + bh / 2);
    ctx.textBaseline = "alphabetic";
  }

  // ---- headline (layer 1: attention)
  if (spec.priceLabel) y = Math.max(y, pad + 84 * u); // keep the headline clear of the price badge
  const maxW = W - pad * 2;
  const hl = fit(ctx, spec.copy.headline, maxW, 3, Math.round(100 * u), Math.round(52 * u), 800, fam);
  ctx.fillStyle = INK;
  ctx.font = `800 ${hl.size}px ${fam}`;
  const lh = hl.size * 1.12;
  for (const line of hl.lines) {
    y += lh;
    ctx.fillText(line, pad, y);
  }
  y += 28 * u;

  // ---- CTA (layer 4: action) — fixed at the bottom
  ctx.font = `800 ${42 * u}px ${fam}`;
  const ctaW = Math.min(W - pad * 2, ctx.measureText(spec.copy.cta).width + 120 * u);
  const ctaH = 104 * u;
  const ctaY = H - pad - ctaH;
  const bodyBottom = ctaY - 36 * u;

  // ---- hero + body (layers 2–3)
  const body = spec.copy.body.slice(0, 4);
  if (spec.kind === "layout") {
    const heroTop = y;
    const listH = spec.theme === "usp" ? 0 : body.length * 96 * u;
    const heroH = Math.max(H * 0.18, bodyBottom - heroTop - listH - (spec.theme === "testimonial" ? H * 0.2 : 0) - 24 * u);
    if (art) {
      ctx.save();
      roundRect(ctx, pad, heroTop, W - pad * 2, heroH, 36 * u);
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(15,23,42,0.12)";
      ctx.shadowBlur = 40 * u;
      ctx.shadowOffsetY = 16 * u;
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(ctx, pad, heroTop, W - pad * 2, heroH, 36 * u);
      ctx.clip();
      drawCover(ctx, art, pad + 24 * u, heroTop + 24 * u, W - pad * 2 - 48 * u, heroH - 48 * u, "contain");
      ctx.restore();
    }
    y = heroTop + (art ? heroH + 28 * u : 0);
  } else {
    y = Math.max(y, bodyBottom - body.length * 96 * u - (spec.theme === "testimonial" ? H * 0.22 : 0));
  }

  if (spec.theme === "testimonial" && spec.testimonial) {
    const cardH = Math.min(H * 0.24, bodyBottom - y - body.length * 60 * u);
    roundRect(ctx, pad, y, W - pad * 2, cardH, 32 * u);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
    ctx.fillStyle = tint(brand, 0.9);
    ctx.font = `800 ${120 * u}px Georgia, serif`;
    ctx.fillText("“", pad + 28 * u, y + 108 * u);
    const q = fit(ctx, spec.testimonial.quote, W - pad * 2 - 120 * u, 4, Math.round(44 * u), Math.round(28 * u), 600, fam);
    ctx.fillStyle = INK;
    ctx.font = `italic 600 ${q.size}px ${fam}`;
    let qy = y + 56 * u;
    for (const line of q.lines) {
      qy += q.size * 1.3;
      ctx.fillText(line, pad + 96 * u, qy);
    }
    ctx.fillStyle = MUTED;
    ctx.font = `700 ${28 * u}px ${fam}`;
    ctx.fillText(`— ${spec.testimonial.author}`, pad + 96 * u, Math.min(qy + 52 * u, y + cardH - 24 * u));
    y += cardH + 20 * u;
  }

  if (spec.theme === "usp" && body.length) {
    const [main, ...rest] = body;
    const m = fit(ctx, main!, W - pad * 2, 2, Math.round(54 * u), Math.round(34 * u), 800, fam);
    ctx.fillStyle = brand;
    ctx.font = `800 ${m.size}px ${fam}`;
    for (const line of m.lines) {
      y += m.size * 1.15;
      if (y < bodyBottom) ctx.fillText(line, pad, y);
    }
    y += 20 * u;
    let x = pad;
    ctx.font = `700 ${28 * u}px ${fam}`;
    for (const r of rest) {
      const tw = Math.min(ctx.measureText(r).width + 48 * u, W - pad * 2);
      if (x + tw > W - pad) {
        x = pad;
        y += 72 * u;
      }
      if (y + 60 * u > bodyBottom) break;
      roundRect(ctx, x, y, tw, 60 * u, 30 * u);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.strokeStyle = tint(brand, 0.35);
      ctx.lineWidth = 2 * u;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textBaseline = "middle";
      ctx.fillText(r, x + 24 * u, y + 30 * u, tw - 48 * u);
      ctx.textBaseline = "alphabetic";
      x += tw + 14 * u;
    }
  } else if (body.length) {
    const rowH = Math.min(84 * u, (bodyBottom - y) / body.length - 12 * u);
    body.forEach((b, i) => {
      const ry = y + i * (rowH + 12 * u);
      roundRect(ctx, pad, ry, W - pad * 2, rowH, rowH / 2.4);
      ctx.fillStyle = "rgba(255,255,255,0.93)";
      ctx.fill();
      const cx = pad + rowH / 2;
      const cy = ry + rowH / 2;
      ctx.fillStyle = brand;
      ctx.beginPath();
      ctx.arc(cx, cy, rowH * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = onColor(brand);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      if (spec.theme === "educate") {
        ctx.font = `800 ${rowH * 0.34}px ${fam}`;
        ctx.fillText(String(i + 1), cx, cy + 1);
      } else {
        ctx.strokeStyle = onColor(brand);
        ctx.lineWidth = rowH * 0.07;
        ctx.beginPath();
        ctx.moveTo(cx - rowH * 0.13, cy);
        ctx.lineTo(cx - rowH * 0.03, cy + rowH * 0.1);
        ctx.lineTo(cx + rowH * 0.15, cy - rowH * 0.1);
        ctx.stroke();
      }
      ctx.textAlign = "left";
      const t = fit(ctx, b, W - pad * 2 - rowH * 1.3, 1, Math.round(Math.min(34 * u, rowH * 0.42)), Math.round(20 * u), 700, fam);
      ctx.fillStyle = INK;
      ctx.font = `700 ${t.size}px ${fam}`;
      ctx.fillText(t.lines[0] ?? b, pad + rowH * 1.05, cy + 1);
      ctx.textBaseline = "alphabetic";
    });
  }

  roundRect(ctx, (W - ctaW) / 2, ctaY, ctaW, ctaH, ctaH / 2);
  ctx.fillStyle = brand;
  ctx.shadowColor = tint(brand, 0.35);
  ctx.shadowBlur = 30 * u;
  ctx.shadowOffsetY = 12 * u;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = onColor(brand);
  ctx.font = `800 ${42 * u}px ${fam}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.copy.cta, W / 2, ctaY + ctaH / 2 + 1, ctaW - 40 * u);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export async function posterBlob(spec: PosterSpec, type: "image/png" | "image/jpeg") {
  const c = document.createElement("canvas");
  await drawPoster(c, spec, 1);
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), type, 0.92));
}

export async function downloadPoster(spec: PosterSpec, type: "image/png" | "image/jpeg", name: string) {
  const blob = await posterBlob(spec, type);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.${type === "image/png" ? "png" : "jpg"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
