"use client";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./Sidebar";
import { useT } from "@/lib/i18n/client";
import { Logo } from "@/components/brand/Logo";

export function MobileNav({ footer }: { footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-full border border-line bg-surface lg:hidden" aria-label={t("nav.menu")}>
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-cream p-4 shadow-lift animate-rise">
            <div className="mb-4 flex items-center justify-between">
              <Logo href="/dashboard" />
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-ink/5" aria-label={t("common.close")}>
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setOpen(false)} />
            <div className="mt-auto">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
