"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Superadmin" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cx("whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition", active ? "bg-primary text-white shadow-glow" : "text-ink/70 hover:bg-white/70 hover:text-ink")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
