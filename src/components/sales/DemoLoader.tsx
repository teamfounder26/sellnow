"use client";
import dynamic from "next/dynamic";

/** The demo is code-split and loaded after the page; the placeholder reserves its height (no layout shift). */
const Demo = dynamic(() => import("./InteractiveDemo").then((m) => m.InteractiveDemo), {
  ssr: false,
  loading: () => <div className="min-h-[600px] rounded-[28px] bg-[#0F1A2B]/90" aria-hidden="true" />,
});

export function DemoLoader({ startHref }: { startHref: string }) {
  return <Demo startHref={startHref} />;
}
