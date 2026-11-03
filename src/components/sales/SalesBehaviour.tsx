"use client";
import { useEffect } from "react";
import { salesEvent, type SalesEvent } from "./analytics";

/**
 * One tiny client island for the whole page: scroll-reveal, page view, CTA click tracking via
 * `data-track`, FAQ opens and the pricing-in-view event. Everything else stays server-rendered.
 */
export function SalesBehaviour({ variant }: { variant: string }) {
  useEffect(() => {
    const root = document.getElementById("sellnow-sales");
    if (!root) return;
    root.classList.add("sn-js");
    salesEvent("sales_page_view", { variant });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

    const pricing = document.getElementById("pricing");
    const pio = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        salesEvent("pricing_view");
        pio.disconnect();
      }
    }, { threshold: 0.25 });
    if (pricing) pio.observe(pricing);

    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-track]");
      if (!el) return;
      const props = el.dataset.trackProps ? (JSON.parse(el.dataset.trackProps) as Record<string, string>) : {};
      salesEvent(el.dataset.track as SalesEvent, props);
      // Pricing buttons are placeholders until checkout exists (href="#"): don't jump to the top.
      if (el.getAttribute("href") === "#") ev.preventDefault();
    };
    const onToggle = (ev: Event) => {
      const d = ev.target as HTMLDetailsElement;
      if (d.matches?.("details[data-faq]") && d.open) salesEvent("faq_opened", { index: Number(d.dataset.faq) });
    };
    root.addEventListener("click", onClick);
    root.addEventListener("toggle", onToggle, true);
    return () => {
      io.disconnect();
      pio.disconnect();
      root.removeEventListener("click", onClick);
      root.removeEventListener("toggle", onToggle, true);
    };
  }, [variant]);
  return null;
}
