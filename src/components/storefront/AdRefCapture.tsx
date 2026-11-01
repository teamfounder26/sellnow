"use client";
import { useEffect } from "react";

/** Remembers which SellNow ad brought the visitor (?sn_ad=…) for this store, so a later checkout is attributed. */
export function AdRefCapture({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("sn_ad");
      if (ref && /^ad_[a-z0-9]{16}$/.test(ref)) sessionStorage.setItem(`sn_ad_${slug}`, ref);
    } catch {
      /* storage unavailable */
    }
  }, [slug]);
  return null;
}
