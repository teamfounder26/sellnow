"use client";
import { useEffect } from "react";

const sent = new Set<string>();

/** Records an anonymous storefront view (first-party, no PII). Once per page load. */
export function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    if (sent.has(slug)) return;
    sent.add(slug);
    void fetch("/api/track/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }), keepalive: true }).catch(() => {});
  }, [slug]);
  return null;
}
