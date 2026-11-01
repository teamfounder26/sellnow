"use client";
import { Sparkles } from "lucide-react";
import clsx from "clsx";

/** Indeterminate AI progress: soft gradient pulse + skeleton lines. */
export function GenerationProgress({ label, className }: { label: string; className?: string }) {
  return (
    <div className={clsx("ai-glow rounded-2xl border border-ai/30 p-4", className)} role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold text-ai-strong">
        <Sparkles className="size-4 animate-pulse-soft" /> {label}
      </p>
      <div className="mt-3 space-y-2">
        <div className="skeleton h-3 w-11/12" />
        <div className="skeleton h-3 w-9/12" />
        <div className="skeleton h-3 w-10/12" />
      </div>
    </div>
  );
}
