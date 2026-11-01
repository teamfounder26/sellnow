import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export { clsx as cx };

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ai" | "dark";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-strong shadow-[0_8px_20px_-10px_rgb(31_131_216/0.8),inset_0_1px_0_rgb(255_255_255/0.25)]",
  secondary: "bg-surface text-ink border border-line hover:border-primary/40 hover:text-primary-strong",
  ghost: "text-ink hover:bg-primary-soft",
  danger: "bg-danger text-white hover:bg-danger/90",
  ai: "bg-gradient-to-r from-primary to-ai text-white hover:brightness-105 shadow-glow",
  dark: "bg-ink text-white hover:bg-ink/85",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-13 px-7 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center rounded-pill font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("rounded-card border border-line bg-surface shadow-soft", className)} {...props} />;
}

export function SectionHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {sub ? <p className="mt-1 text-[15px] text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "success" | "danger" | "warning" | "ai" | "yellow" | "blue";
const tones: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  ai: "bg-lavender text-ai-strong",
  yellow: "bg-primary-soft text-primary-strong",
  blue: "bg-primary-soft text-primary-strong",
};
export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} {...props} />;
}

const inputBase =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:bg-cream";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(inputBase, "h-11", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={clsx(inputBase, "py-2.5 min-h-24", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={clsx(inputBase, "h-11 pr-8", className)} {...props} />;
}

export function Field({ label, hint, error, required, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </label>
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      {icon ? <div className="glass-icon mb-4 grid size-12 place-items-center rounded-2xl text-primary">{icon}</div> : null}
      <h3 className="text-lg font-bold">{title}</h3>
      {body ? <p className="mt-1 max-w-md text-[15px] text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const bg: Record<Tone, string> = {
    neutral: "bg-surface border-line",
    success: "bg-success-soft border-success/20",
    danger: "bg-danger-soft border-danger/20",
    warning: "bg-warning-soft border-warning/20",
    ai: "bg-lavender border-ai/30",
    yellow: "bg-primary-soft border-primary/30",
    blue: "bg-primary-soft border-primary/30",
  };
  return <div className={clsx("rounded-2xl border px-4 py-3 text-[14px] leading-relaxed", bg[tone], className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden />;
}

/**
 * Unified "subtle glass" icon container used for navigation and widgets.
 * Lucide geometry, translucent tile, faint blue tint, soft glow on hover/active.
 */
export function GlassIcon({ children, active, size = "md", className }: { children: ReactNode; active?: boolean; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "size-8 rounded-[10px] [&_svg]:size-4", md: "size-10 rounded-xl [&_svg]:size-[18px]", lg: "size-12 rounded-2xl [&_svg]:size-5" }[size];
  return (
    <span
      className={clsx(
        "grid shrink-0 place-items-center transition-all duration-200",
        s,
        active ? "bg-primary text-white shadow-glow" : "glass-icon text-primary-strong group-hover:shadow-glow group-hover:text-primary",
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, max = 100, className, label }: { value: number; max?: number; className?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={clsx("h-2 overflow-hidden rounded-full bg-primary-soft", className)} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-ai transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}
