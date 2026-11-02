import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import type { Permission } from "@/lib/admin/permissions";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = { title: { default: "Superadmin", template: "%s · SellNow Superadmin" }, robots: { index: false } };

const MENU: { href: string; label: string; p: Permission }[] = [
  { href: "/admin", label: "Overview", p: "overview.view" },
  { href: "/admin/tenants", label: "Tenants", p: "tenants.view" },
  { href: "/admin/users", label: "Users & Access", p: "overview.view" },
  { href: "/admin/packages", label: "Subscriptions & Packages", p: "packages.view" },
  { href: "/admin/payments", label: "Payments", p: "payments.view" },
  { href: "/admin/settlements", label: "Settlements", p: "settlements.view" },
  { href: "/admin/orders", label: "Orders", p: "tenants.view" },
  { href: "/admin/couriers", label: "Courier Management", p: "couriers.view" },
  { href: "/admin/websites", label: "Websites", p: "tenants.view" },
  { href: "/admin/ai", label: "AI Usage & Credits", p: "overview.view" },
  { href: "/admin/integrations", label: "Marketing & Integrations", p: "overview.view" },
  { href: "/admin/finance", label: "Revenue & Finance", p: "reports.view" },
  { href: "/admin/reports", label: "Reports & Analytics", p: "reports.view" },
  { href: "/admin/health", label: "System Health", p: "health.view" },
  { href: "/admin/audit", label: "Support & Audit", p: "audit.view" },
  { href: "/admin/settings", label: "Platform Settings", p: "settings.edit" },
];

/** Platform administration — separate from every tenant permission (platform_admins only). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin("overview.view");
  const items = MENU.filter((m) => a.can(m.p));
  return (
    <div className="min-h-dvh bg-[radial-gradient(1200px_400px_at_10%_-10%,rgb(31_131_216/0.18),transparent),linear-gradient(180deg,#eef5fc,#f7f9fc_320px)]">
      <div className="mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[230px_minmax(0,1fr)] lg:p-6">
        <aside className="h-fit rounded-3xl bg-white/60 p-3 shadow-sm ring-1 ring-white/70 backdrop-blur-xl lg:sticky lg:top-6">
          <Link href="/admin" className="mb-3 flex items-center gap-2 px-2 py-1.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white"><ShieldCheck className="size-5" /></span>
            <span>
              <span className="block text-sm font-extrabold leading-tight">SellNow</span>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-primary">Superadmin</span>
            </span>
          </Link>
          <AdminNav items={items.map(({ href, label }) => ({ href, label }))} />
          <p className="mt-4 border-t border-line px-2 pt-3 text-[11px] text-muted">{a.user.email}<br /><span className="font-bold uppercase">{a.role}</span> · <Link href="/dashboard" className="underline">Seller app</Link></p>
        </aside>
        <main className="min-w-0 space-y-4">{children}</main>
      </div>
    </div>
  );
}
