"use client";
import { useEffect, useRef } from "react";
import { cx } from "@/components/ui";
import { drawPoster, type PosterSpec } from "./render";
import { RATIO_PX } from "@/lib/posters/options";

/** Live preview of a composed poster. `scale` < 1 keeps thumbnails cheap. */
export function PosterCanvas({ spec, scale = 0.5, className, label }: { spec: PosterSpec; scale?: number; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    if (ref.current) void drawPoster(ref.current, spec, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scale]);
  const { w, h } = RATIO_PX[spec.ratio];
  return <canvas ref={ref} role="img" aria-label={label} className={cx("block h-auto w-full rounded-2xl bg-white shadow-sm ring-1 ring-line", className)} style={{ aspectRatio: `${w} / ${h}` }} />;
}
