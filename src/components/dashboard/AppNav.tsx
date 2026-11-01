"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, Menu, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { GlassIcon, cx } from "@/components/ui";
import { Logo } from "@/components/brand/Logo";
import { NAV, sectionFor, subActive } from "./nav";

/** Narrow glass rail with the 11 primary destinations. */
export function NavRail() {
  const t = useT();
  const path = usePathname();
  const active = sectionFor(path);
  return (
    <nav aria-label={t("nav.menu")} className="glass sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-[72px] shrink-0 flex-col items-center rounded-[26px] py-4 lg:flex">
      <Logo href="/dashboard" compact />
      <ul className="mt-6 flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 [scrollbar-width:none]">
        {NAV.map((s) => {
          const on = s.key === active.key;
          const Icon = s.icon;
          return (
            <li key={s.key} className="relative">
              {on && <span className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden />}
              <Link href={s.href} aria-current={on ? "page" : undefined} aria-label={t(`nav2.${s.key}`)} className="group relative block rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
                <GlassIcon active={on}>
                  <Icon />
                </GlassIcon>
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-lift transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  {t(`nav2.${s.key}`)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SubList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const path = usePathname();
  const search = useSearchParams();
  const section = sectionFor(path);
  return (
    <ul className="space-y-0.5">
      {section.items.map((it) => {
        const on = subActive(it, path, search, section.items);
        return (
          <li key={it.key}>
            <Link
              href={it.href}
              onClick={onNavigate}
              aria-current={on ? "page" : undefined}
              className={cx("flex items-center rounded-xl px-3 py-2 text-[14px] font-medium transition", on ? "bg-white text-primary-strong shadow-soft ring-1 ring-primary/10" : "text-ink/70 hover:bg-white/70 hover:text-ink")}
            >
              {on && <span className="mr-2 size-1.5 rounded-full bg-primary" aria-hidden />}
              {t(`nav2.sub.${it.key}`)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Contextual secondary sidebar: changes with the active rail section (client-side, no full reload). Collapsible. */
export function SecondarySidebar({ footer }: { footer?: React.ReactNode }) {
  const t = useT();
  const path = usePathname();
  const section = sectionFor(path);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sn_sidebar") === "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("sn_sidebar", c ? "1" : "0");
      } catch {
        /* ignore */
      }
      return !c;
    });
  if (collapsed) {
    return (
      <div className="sticky top-3 m-3 mr-0 hidden h-fit lg:block">
        <button type="button" onClick={toggle} className="glass grid size-10 place-items-center rounded-xl text-muted hover:text-primary" aria-label={t("nav2.expand")} aria-expanded={false}>
          <ChevronsRight className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <aside className="glass sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-[220px] shrink-0 flex-col rounded-[26px] p-3 lg:flex" aria-label={t(`nav2.${section.key}`)}>
      <div className="flex items-center justify-between px-2 pb-3 pt-1">
        <p className="text-[15px] font-extrabold tracking-tight">{t(`nav2.${section.key}`)}</p>
        <button type="button" onClick={toggle} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white hover:text-primary" aria-label={t("nav2.collapse")} aria-expanded>
          <ChevronsLeft className="size-4" />
        </button>
      </div>
      <SubList />
      <div className="mt-auto">{footer}</div>
    </aside>
  );
}

/** Mobile drawer: primary sections with their contextual submenu. */
export function MobileDrawer({ footer }: { footer?: React.ReactNode }) {
  const t = useT();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = sectionFor(path);
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass grid size-10 place-items-center rounded-full lg:hidden" aria-label={t("nav.menu")} aria-expanded={open}>
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="ambient absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto p-4 shadow-lift animate-rise">
            <div className="mb-4 flex items-center justify-between">
              <Logo href="/dashboard" />
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-white" aria-label={t("common.close")}>
                <X className="size-5" />
              </button>
            </div>
            <ul className="grid grid-cols-4 gap-2">
              {NAV.map((s) => {
                const Icon = s.icon;
                const on = s.key === active.key;
                return (
                  <li key={s.key}>
                    <Link href={s.href} className="group flex flex-col items-center gap-1 rounded-2xl p-2 text-center text-[11px] font-semibold" aria-current={on ? "page" : undefined}>
                      <GlassIcon active={on}>
                        <Icon />
                      </GlassIcon>
                      <span className={on ? "text-primary-strong" : "text-ink/70"}>{t(`nav2.${s.key}`)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="glass mt-4 rounded-2xl p-2">
              <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-muted">{t(`nav2.${active.key}`)}</p>
              <SubList onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-auto pt-4">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
