"use client";
import { Globe, MoreHorizontal, Package, ThumbsUp, MessageCircle, Share2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { AdCreative } from "@/lib/db/schema";

/** Feed-style preview of how the ad will read. Not a Meta screenshot — Meta renders the final ad. */
export function AdPreview({ pageName, creative, imageAssetId, url }: { pageName: string | null; creative: Partial<AdCreative> | null; imageAssetId: string | null; url: string | null }) {
  const t = useT();
  const host = url ? (() => { try { return new URL(url).host.toUpperCase(); } catch { return ""; } })() : "";
  return (
    <div className="overflow-hidden rounded-2xl bg-white text-[#1c1e21] shadow-soft ring-1 ring-line">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-white">{(pageName ?? "S").slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{pageName ?? t("ads.preview.yourPage")}</p>
          <p className="flex items-center gap-1 text-[11px] text-[#65676b]">{t("ads.preview.sponsored")} · <Globe className="size-3" /></p>
        </div>
        <MoreHorizontal className="size-4 text-[#65676b]" />
      </div>
      <p className="whitespace-pre-line px-3 pb-2 text-[13px] leading-snug">{creative?.primaryText || <span className="text-[#65676b]">{t("ads.preview.textPlaceholder")}</span>}</p>
      <div className="flex aspect-square items-center justify-center bg-[#f0f2f5]">
        {imageAssetId ? <img src={`/api/assets/${imageAssetId}`} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-xs text-[#65676b]"><Package className="size-8" />{t("ads.preview.noImage")}</span>}
      </div>
      <div className="flex items-center gap-3 bg-[#f0f2f5] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] uppercase text-[#65676b]">{host || "SELLNOW"}</p>
          <p className="truncate text-[14px] font-semibold">{creative?.headline || t("ads.preview.headlinePlaceholder")}</p>
          {creative?.description && <p className="truncate text-[12px] text-[#65676b]">{creative.description}</p>}
        </div>
        <span className="shrink-0 rounded-md bg-[#e4e6eb] px-3 py-1.5 text-[13px] font-semibold">{t(`ads.cta.${creative?.cta ?? "learn_more"}`)}</span>
      </div>
      <div className="flex justify-around border-t border-[#e4e6eb] py-1.5 text-[12px] font-semibold text-[#65676b]">
        <span className="flex items-center gap-1"><ThumbsUp className="size-3.5" />{t("ads.preview.like")}</span>
        <span className="flex items-center gap-1"><MessageCircle className="size-3.5" />{t("ads.preview.comment")}</span>
        <span className="flex items-center gap-1"><Share2 className="size-3.5" />{t("ads.preview.share")}</span>
      </div>
    </div>
  );
}
