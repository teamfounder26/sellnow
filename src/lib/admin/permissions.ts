import type { AdminRole } from "@/lib/db/schema";

/**
 * Platform permissions. Granular on purpose: a Support Admin can inspect a payment but can't
 * approve a payout; an Analyst sees aggregate reports but changes nothing.
 */
export const PERMISSIONS = [
  "overview.view",
  "tenants.view",
  "tenants.viewSensitive",
  "tenants.notes",
  "tenants.suspend",
  "tenants.planOverride",
  "admins.manage",
  "packages.view",
  "packages.edit",
  "payments.view",
  "payments.refresh",
  "payments.reviewSellers",
  "settlements.view",
  "settlements.approve",
  "settlements.execute",
  "settlements.hold",
  "settlements.adjust",
  "couriers.view",
  "couriers.manage",
  "reports.view",
  "reports.export",
  "reports.exportPersonal",
  "health.view",
  "audit.view",
  "settings.edit",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);
const ROLE_PERMS: Record<AdminRole, Set<Permission>> = {
  owner: ALL,
  finance: new Set(["overview.view", "tenants.view", "tenants.viewSensitive", "tenants.notes", "packages.view", "payments.view", "payments.refresh", "payments.reviewSellers", "settlements.view", "settlements.approve", "settlements.execute", "settlements.hold", "settlements.adjust", "couriers.view", "reports.view", "reports.export", "reports.exportPersonal", "audit.view"]),
  operations: new Set(["overview.view", "tenants.view", "tenants.notes", "tenants.suspend", "packages.view", "payments.view", "payments.reviewSellers", "settlements.view", "couriers.view", "couriers.manage", "reports.view", "reports.export", "health.view"]),
  support: new Set(["overview.view", "tenants.view", "tenants.notes", "packages.view", "payments.view", "settlements.view", "couriers.view", "audit.view"]),
  analyst: new Set(["overview.view", "tenants.view", "packages.view", "payments.view", "settlements.view", "couriers.view", "reports.view", "reports.export"]),
  technical: new Set(["overview.view", "tenants.view", "payments.view", "payments.refresh", "couriers.view", "couriers.manage", "health.view", "audit.view"]),
};

export function can(role: AdminRole, p: Permission) {
  return ROLE_PERMS[role].has(p);
}
export const ADMIN_ROLES: AdminRole[] = ["owner", "finance", "operations", "support", "analyst", "technical"];
