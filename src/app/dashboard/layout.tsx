import { Suspense } from "react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Bell, Sparkles, LogOut, Coins, Trophy, Palette, Globe, Package, Receipt } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { NavRail, SecondarySidebar, MobileDrawer } from "@/components/dashboard/AppNav";
import { BusinessSwitcher } from "@/components/app/BusinessSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { RewardModal } from "@/components/achievements/RewardModal";
import { logoutAction } from "@/app/actions/auth";
import { markNotificationsReadAction } from "@/app/actions/workspace";
import { notifications } from "@/lib/db/schema";
import { creditBalance } from "@/lib/billing/credits";
import { describeNotification } from "@/lib/notifications";
import { eligibleOrderCount, listUnlocks, pendingRewards } from "@/lib/achievements/service";
import { nextProgress, unlockMessage, unlockTitle } from "@/lib/achievements/view";
import type { AchievementKey } from "@/lib/achievements/definitions";
import { cx } from "@/components/ui";

export const metadata = { title: { default: "Dashboard", template: "%s · SellNow" } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, db, workspace, memberships } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const [notes, credits, rewards, unlocks, orderCount] = await Promise.all([
    db.query.notifications.findMany({ where: eq(notifications.workspaceId, workspace.id), orderBy: desc(notifications.createdAt), limit: 12 }),
    creditBalance(db, workspace.id),
    pendingRewards(db, workspace.id),
    listUnlocks(db, workspace.id),
    eligibleOrderCount(db, workspace.id),
  ]);
  const unread = notes.filter((n) => !n.readAt).length;

  const footer = (
    <div className="space-y-2.5">
      <Link href="/dashboard/settings?tab=billing" className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2.5 text-sm font-semibold ring-1 ring-line hover:ring-primary/30">
        <Coins className="size-4 text-warning" />
        <span className="flex-1">{t("settings.creditBalance")}</span>
        <span className="tabular-nums">{credits}</span>
      </Link>
      <LanguageSwitcher />
    </div>
  );

  const quick = [
    { href: "/dashboard/creative", icon: Palette, k: "creative" },
    { href: "/preview", icon: Globe, k: "website" },
    { href: "/dashboard/products/new", icon: Package, k: "product" },
    { href: "/dashboard/orders", icon: Receipt, k: "orders" },
  ];

  return (
    <div className="ambient flex min-h-dvh">
      <NavRail />
      <Suspense>
        <SecondarySidebar footer={footer} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5">
          <div className="glass flex h-14 items-center gap-2 rounded-[22px] px-2 sm:gap-3 sm:px-3">
            <Suspense>
              <MobileDrawer footer={footer} />
            </Suspense>
            <BusinessSwitcher current={{ id: workspace.id, name: workspace.name }} options={memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role }))} />
            <div className="flex-1" />
            <details className="relative">
              <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-pill bg-gradient-to-r from-primary to-ai px-3 text-sm font-semibold text-white shadow-glow sm:px-4" aria-label={t("dash.aiQuick")}>
                <Sparkles className="size-4" /> <span className="hidden sm:inline">{t("dash.aiQuick")}</span>
              </summary>
              <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl bg-white p-2 shadow-lift ring-1 ring-line">
                <p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wider text-muted">{t("dash.aiQuickTitle")}</p>
                {quick.map((q) => (
                  <Link key={q.k} href={q.href} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-medium hover:bg-primary-soft">
                    <q.icon className="size-4 text-primary" /> {t(`dash.quick.${q.k}`)}
                  </Link>
                ))}
              </div>
            </details>
            <Link href="/dashboard/achievements" className="relative hidden size-10 place-items-center rounded-full bg-white/80 ring-1 ring-line hover:ring-primary/30 sm:grid" aria-label={t("dash.achievements", { n: unlocks.length })}>
              <Trophy className="size-[18px] text-warning" />
              {unlocks.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{unlocks.length}</span>}
            </Link>
            <details className="relative">
              <summary className="relative grid size-10 cursor-pointer list-none place-items-center rounded-full bg-white/80 ring-1 ring-line" aria-label={t("nav.notifications")}>
                <Bell className="size-[18px]" />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{unread}</span>}
              </summary>
              <div className="absolute right-0 top-12 z-40 w-[min(92vw,360px)] rounded-2xl bg-white p-2 shadow-lift ring-1 ring-line">
                <div className="flex items-center justify-between px-2 py-1">
                  <p className="text-sm font-bold">{t("nav.notifications")}</p>
                  {unread > 0 && (
                    <form action={markNotificationsReadAction}>
                      <button className="text-xs font-semibold text-muted hover:text-ink">{t("dash.markRead")}</button>
                    </form>
                  )}
                </div>
                {notes.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted">{t("notifications.empty")}</p>
                ) : (
                  <ul className="max-h-96 overflow-y-auto">
                    {notes.map((n) => {
                      const d = describeNotification(t, n, locale);
                      return (
                        <li key={n.id}>
                          <Link href={d.href ?? "/dashboard"} className={cx("flex gap-2 rounded-xl px-2 py-2 text-sm hover:bg-canvas", !n.readAt && "font-semibold")}>
                            <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", d.tone === "success" ? "bg-success" : d.tone === "warning" ? "bg-warning" : d.tone === "ai" ? "bg-ai" : "bg-line")} />
                            <span className="flex-1">{d.text}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </details>
            <details className="relative">
              <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full bg-gradient-to-br from-primary to-primary-strong text-sm font-extrabold text-white" aria-label={user.name}>
                {user.name.slice(0, 1).toUpperCase()}
              </summary>
              <div className="absolute right-0 top-12 z-40 w-56 rounded-2xl bg-white p-2 shadow-lift ring-1 ring-line">
                <p className="truncate px-2 pt-1 text-sm font-bold">{user.name}</p>
                <p className="truncate px-2 pb-2 text-xs text-muted">{user.email}</p>
                <Link href="/dashboard/settings" className="block rounded-xl px-2 py-2 text-sm hover:bg-canvas">{t("nav.settings")}</Link>
                <Link href="/dashboard/achievements" className="block rounded-xl px-2 py-2 text-sm hover:bg-canvas">{t("nav2.sub.progress")}</Link>
                <form action={logoutAction}>
                  <button className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-danger hover:bg-danger-soft">
                    <LogOut className="size-4" /> {t("nav.logout")}
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        {!user.emailVerifiedAt && (
          <div className="mx-3 mt-3 rounded-2xl bg-primary-soft px-4 py-2 text-center text-sm font-medium ring-1 ring-primary/15 sm:mx-5">
            {t("auth.unverifiedBanner")}{" "}
            <Link href="/dashboard/settings" className="font-bold text-primary-strong underline underline-offset-4">{t("auth.verifyTitle")}</Link>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-3 py-6 sm:px-5 sm:py-8">{children}</main>
      </div>
      <RewardModal
        rewards={rewards.map(({ notification, unlock }) => ({
          notificationId: notification.id,
          key: unlock.key as AchievementKey,
          level: unlock.level,
          title: unlockTitle(t, unlock.key as AchievementKey, unlock.level),
          message: unlockMessage(t, unlock),
          next: unlock.key === "orders" ? nextProgress(t, orderCount) : null,
        }))}
      />
    </div>
  );
}
