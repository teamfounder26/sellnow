"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export function CopyLink({ url }: { url: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url).catch(() => null);
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
      className="inline-flex items-center gap-1 rounded-pill bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary-strong"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {t(done ? "publishFlow.copied" : "publishFlow.copy")}
    </button>
  );
}
