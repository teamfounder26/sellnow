"use client";
import Script from "next/script";
import { useEffect } from "react";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] };
declare global {
  interface Window {
    fbq?: Fbq;
  }
}

/**
 * Meta Pixel for the seller's own pixel (selected in AI Ads Studio). Fires standard events so
 * Sales/Leads campaigns can optimise. Purchase carries eventID = order id for deduplication.
 */
export function MetaPixel({ pixelId, event }: { pixelId: string; event?: { name: "ViewContent" | "InitiateCheckout" | "Purchase" | "Lead"; value?: number; currency?: string; eventId?: string } }) {
  useEffect(() => {
    if (!event) return;
    const fire = () => window.fbq?.("track", event.name, { ...(event.value != null ? { value: event.value, currency: event.currency ?? "MYR" } : {}) }, event.eventId ? { eventID: event.eventId } : undefined);
    if (window.fbq) fire();
    else {
      const h = setInterval(() => window.fbq && (clearInterval(h), fire()), 300);
      return () => clearInterval(h);
    }
  }, [event]);
  if (!/^\d{5,20}$/.test(pixelId)) return null;
  return (
    <Script id={`meta-pixel-${pixelId}`} strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`}
    </Script>
  );
}

/** Fire a Lead from client code (enquiry form) when the pixel is present. */
export function trackLead() {
  window.fbq?.("track", "Lead");
}
