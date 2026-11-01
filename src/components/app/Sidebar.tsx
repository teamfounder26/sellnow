"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wand2, Package, Store, Sparkles, Megaphone, Users, Receipt, BarChart3, Settings } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/lib/i18n/client";

export const NAV = [
  { href: "/dashboard", key: "home", icon: Home, exact: true },
  { href: "/onboarding", key: "aiBuilder", icon: Wand2 },
  { href: "/dashboard/products", key: "products", icon: Package },
  { href: "/dashboard/storefront", key: "storefront", icon: Store },
  { href: "/dashboard/creative", key: "creative", icon: Sparkles },
  { href: "/dashboard/marketing", key: "marketing", icon: Megaphone },
  { href: "/dashboard/customers", key: "customers", icon: Users },
  { href: "/dashboard/orders", key: "orders", icon: Receipt },
  { href: "/dashboard/analytics", key: "analytics", icon: BarChart3 },
  { href: "/dashboard/settings", key: "settings", icon: Settings },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label={t("nav.menu")}>
      {NAV.map((n) => {
        const active = "exact" in n && n.exact ? path === n.href : path.startsWith(n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition",
              active ? "bg-ink text-white" : "text-ink/75 hover:bg-ink/5 hover:text-ink",
            )}
          >
            <Icon className={clsx("size-[18px]", n.key === "aiBuilder" && !active && "text-ai-strong")} />
            {t(`nav.${n.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
