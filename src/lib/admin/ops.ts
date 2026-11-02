import { and, count, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { platformAdmins, tenantNotes, users, workspaces, type AdminRole } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit, notify } from "@/lib/audit";
import { confirmIdentity } from "@/lib/auth/stepup";

export async function suspendTenant(db: DB, adminId: string, workspaceId: string, reason: string, password: string) {
  await confirmIdentity(db, adminId, password);
  if (reason.trim().length < 5) throw new AppError("settlement.noteRequired");
  await db.update(workspaces).set({ suspendedAt: new Date(), suspendedReason: reason.trim() }).where(eq(workspaces.id, workspaceId));
  await audit(db, { workspaceId, actorUserId: adminId, action: "admin.tenant.suspended", data: { reason } });
  await notify(db, workspaceId, "tenant.suspended", {});
}
export async function unsuspendTenant(db: DB, adminId: string, workspaceId: string, password: string) {
  await confirmIdentity(db, adminId, password);
  await db.update(workspaces).set({ suspendedAt: null, suspendedReason: null }).where(eq(workspaces.id, workspaceId));
  await audit(db, { workspaceId, actorUserId: adminId, action: "admin.tenant.unsuspended" });
}
export async function addTenantNote(db: DB, adminId: string, workspaceId: string, kind: "note" | "risk_flag" | "support", body: string) {
  if (body.trim().length < 2) throw new AppError("errors.validation");
  await db.insert(tenantNotes).values({ id: newId("tnt"), workspaceId, kind, body: body.trim().slice(0, 2000), authorId: adminId });
  await audit(db, { workspaceId, actorUserId: adminId, action: `admin.tenant.${kind}` });
}

/** Admin role assignment (owner only, password re-check). The last owner can't be removed. */
export async function setAdminRole(db: DB, actorId: string, email: string, role: AdminRole | "remove", password: string) {
  await confirmIdentity(db, actorId, password);
  const u = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
  if (!u) throw new AppError("admin.userNotFound");
  const cur = await db.query.platformAdmins.findFirst({ where: eq(platformAdmins.userId, u.id) });
  if (cur?.role === "owner" && role !== "owner") {
    const [c] = await db.select({ n: count() }).from(platformAdmins).where(and(eq(platformAdmins.role, "owner"), eq(platformAdmins.status, "active")));
    if (Number(c?.n ?? 0) <= 1) throw new AppError("admin.lastOwner");
  }
  if (role === "remove") await db.update(platformAdmins).set({ status: "disabled", updatedAt: new Date() }).where(eq(platformAdmins.userId, u.id));
  else if (cur) await db.update(platformAdmins).set({ role, status: "active", updatedAt: new Date() }).where(eq(platformAdmins.userId, u.id));
  else await db.insert(platformAdmins).values({ userId: u.id, role, createdBy: actorId });
  await audit(db, { workspaceId: null, actorUserId: actorId, action: "admin.role_assigned", entity: "user", entityId: u.id, data: { role, from: cur?.role ?? null } });
}
