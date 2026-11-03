"use client";

/** Sales-page events. Provider-neutral: a DOM event + optional dataLayer + SellNow's own counter. Never sends prompt text. */
export const SALES_EVENTS = ["sales_page_view", "hero_cta_click", "demo_started", "demo_prompt_submitted", "demo_website_selected", "demo_completed", "pricing_view", "pricing_plan_selected", "faq_opened", "final_cta_click"] as const;
export type SalesEvent = (typeof SALES_EVENTS)[number];

export function salesEvent(name: SalesEvent, props: Record<string, string | number | boolean> = {}) {
  try {
    window.dispatchEvent(new CustomEvent("sellnow:analytics", { detail: { name, props } }));
    (window as unknown as { dataLayer?: unknown[] }).dataLayer?.push({ event: name, ...props });
    const body = JSON.stringify({ name, props });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track/sales", new Blob([body], { type: "application/json" }));
    else void fetch("/api/track/sales", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {
    /* analytics must never break the page */
  }
}
