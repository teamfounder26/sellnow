"use client";
import { useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Monitor, Pencil, Rocket, Smartphone, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Logo } from "@/components/brand/Logo";
import { Badge, Button, cx } from "@/components/ui";
import { PublishDialog } from "./PublishDialog";

export function PreviewShell({ status, hasLive, liveUrl, canPublish, salesMode }: { status: string; hasLive: boolean; liveUrl: string; canPublish: boolean; salesMode: "checkout" | "enquiry" }) {
  const t = useT();
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [publishing, setPublishing] = useState(false);
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <header className="glass-strong z-20 flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-5">
        <Logo href="/dashboard" compact />
        <Badge tone={hasLive ? "success" : "warning"} className="ml-1">
          {hasLive ? t("preview.draftOfLive") : t("preview.draft")}
        </Badge>
        <div className="mx-auto inline-flex rounded-pill bg-canvas p-1 ring-1 ring-line">
          {(["desktop", "mobile"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d} className={cx("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-sm font-semibold sm:px-3", device === d ? "bg-white text-primary-strong shadow-soft" : "text-muted")}>
              {d === "desktop" ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}
              <span className="hidden sm:inline">{t(`preview.${d}`)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {hasLive && (
            <a href={liveUrl} target="_blank" rel="noreferrer" className="hidden h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold text-muted hover:text-ink lg:inline-flex">
              <ExternalLink className="size-4" /> {t("preview.viewLive")}
            </a>
          )}
          <Link href="/dashboard/storefront" className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold hover:bg-primary-soft">
            <Pencil className="size-4" /> <span className="hidden sm:inline">{t("common.edit")}</span>
          </Link>
          <Link href="/dashboard" className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line bg-white px-3 text-sm font-semibold hover:border-primary/40">
            <LayoutDashboard className="size-4" /> <span className="hidden md:inline">{t("preview.toDashboard")}</span>
          </Link>
          {canPublish && (
            <Button size="sm" onClick={() => setPublishing(true)}>
              <Rocket className="size-4" /> {t(hasLive ? "preview.publishChanges" : "preview.publish")}
            </Button>
          )}
        </div>
      </header>
      <div className="flex flex-1 justify-center overflow-hidden p-2 sm:p-4">
        <iframe src="/preview/frame" title={t("preview.frameTitle")} className={cx("h-full rounded-2xl bg-white shadow-lift ring-1 ring-line transition-all duration-300", device === "mobile" ? "w-[390px] max-w-full" : "w-full")} />
      </div>
      {publishing && <PublishDialog onClose={() => setPublishing(false)} liveUrl={liveUrl} initialSalesMode={salesMode} />}
    </div>
  );
}
