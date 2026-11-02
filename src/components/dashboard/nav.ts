import {
  LayoutDashboard,
  Globe,
  Package,
  Palette,
  Megaphone,
  Users,
  Receipt,
  Wallet,
  BarChart3,
  Plug,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type SubItem = { key: string; href: string };
export type NavSection = { key: string; href: string; icon: LucideIcon; match: string[]; items: SubItem[] };

/**
 * Primary rail + contextual secondary menus. Every sub-item links to functionality that exists;
 * modules that are not built yet (domains, bookings, payouts, WhatsApp…) are deliberately absent.
 */
export const NAV: NavSection[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    match: ["/dashboard$", "/dashboard/achievements"],
    items: [
      { key: "overview", href: "/dashboard" },
      { key: "progress", href: "/dashboard/achievements" },
      { key: "recommendations", href: "/dashboard#recommendations" },
      { key: "activity", href: "/dashboard#activity" },
    ],
  },
  {
    key: "website",
    href: "/dashboard/website",
    icon: Globe,
    match: ["/dashboard/website", "/dashboard/storefront"],
    items: [
      { key: "myWebsites", href: "/dashboard/website" },
      { key: "builder", href: "/dashboard/storefront" },
      { key: "websiteSettings", href: "/dashboard/storefront?tab=policies" },
    ],
  },
  {
    key: "products",
    href: "/dashboard/products",
    icon: Package,
    match: ["/dashboard/products"],
    items: [
      { key: "allProducts", href: "/dashboard/products" },
      { key: "addProduct", href: "/dashboard/products/new" },
    ],
  },
  {
    key: "creative",
    href: "/dashboard/creative",
    icon: Palette,
    match: ["/dashboard/creative"],
    items: [
      { key: "adsOverview", href: "/dashboard/creative" },
      { key: "adsCreate", href: "/dashboard/creative?tab=create" },
      { key: "adsPosters", href: "/dashboard/creative?tab=posters" },
      { key: "adsMine", href: "/dashboard/creative?tab=ads" },
      { key: "adsPerformance", href: "/dashboard/creative?tab=performance" },
      { key: "adsSettings", href: "/dashboard/creative?tab=settings" },
    ],
  },
  { key: "marketing", href: "/dashboard/marketing", icon: Megaphone, match: ["/dashboard/marketing"], items: [{ key: "campaigns", href: "/dashboard/marketing" }] },
  {
    key: "customers",
    href: "/dashboard/customers",
    icon: Users,
    match: ["/dashboard/customers"],
    items: [
      { key: "allCustomers", href: "/dashboard/customers" },
      { key: "leads", href: "/dashboard/customers?tab=leads" },
    ],
  },
  {
    key: "orders",
    href: "/dashboard/orders",
    icon: Receipt,
    match: ["/dashboard/orders"],
    items: [
      { key: "allOrders", href: "/dashboard/orders" },
      { key: "ordersNew", href: "/dashboard/orders?tab=new" },
      { key: "ordersReady", href: "/dashboard/orders?tab=ready" },
      { key: "ordersPending", href: "/dashboard/orders?tab=pending_payment" },
      { key: "ordersShipped", href: "/dashboard/orders?tab=shipped" },
      { key: "ordersDelivered", href: "/dashboard/orders?tab=delivered" },
      { key: "ordersCod", href: "/dashboard/orders?tab=cod" },
      { key: "ordersReturns", href: "/dashboard/orders?tab=returns" },
    ],
  },
  { key: "finances", href: "/dashboard/finances", icon: Wallet, match: ["/dashboard/finances"], items: [{ key: "revenue", href: "/dashboard/finances" }, { key: "earnings", href: "/dashboard/finances#earnings" }] },
  { key: "analytics", href: "/dashboard/analytics", icon: BarChart3, match: ["/dashboard/analytics"], items: [{ key: "businessOverview", href: "/dashboard/analytics" }] },
  {
    key: "integrations",
    href: "/dashboard/integrations",
    icon: Plug,
    match: ["/dashboard/integrations"],
    items: [
      { key: "allIntegrations", href: "/dashboard/integrations" },
      { key: "selltroPay", href: "/dashboard/settings?tab=payments" },
      { key: "couriers", href: "/dashboard/integrations#couriers" },
    ],
  },
  {
    key: "settings",
    href: "/dashboard/settings",
    icon: Settings,
    match: ["/dashboard/settings"],
    items: [
      { key: "profile", href: "/dashboard/settings?tab=profile" },
      { key: "business", href: "/dashboard/settings?tab=workspace" },
      { key: "selltroPay", href: "/dashboard/settings?tab=payments" },
      { key: "paymentMethods", href: "/dashboard/settings?tab=orders" },
      { key: "shippingRates", href: "/dashboard/settings?tab=shipping" },
      { key: "billing", href: "/dashboard/settings?tab=billing" },
      { key: "ai", href: "/dashboard/settings?tab=ai" },
      { key: "discounts", href: "/dashboard/settings?tab=discounts" },
    ],
  },
];

export function sectionFor(pathname: string): NavSection {
  return NAV.find((s) => s.match.some((m) => new RegExp(`^${m}`).test(pathname))) ?? NAV[0]!;
}

/** Sub-item is active when its path matches and every query param in its href is present. */
export function subActive(item: SubItem, pathname: string, search: URLSearchParams, siblings: SubItem[]): boolean {
  const [path, query] = item.href.split("#")[0]!.split("?");
  if (item.href.includes("#")) return false;
  if (path !== pathname && !(pathname.startsWith(`${path}/`) && path !== "/dashboard")) return false;
  const want = new URLSearchParams(query ?? "");
  for (const [k, v] of want) if (search.get(k) !== v) return false;
  if (!query) {
    // A bare link is active only if no more specific sibling matches.
    return !siblings.some((s) => s !== item && s.href.startsWith(`${path}?`) && subActive(s, pathname, search, []));
  }
  return true;
}
