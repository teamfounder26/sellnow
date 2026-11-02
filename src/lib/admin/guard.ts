import "server-only";
import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { platformAdmins } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { can, type Permission } from "./permissions";

/**
 * Superadmin access. Platform staff are rows in platform_admins — never inferred from a tenant
 * role. Non-admins get a 404 (the admin area isn't advertised). First-run bootstrap: if NO admin
 * exists yet, the user whose email equals SUPERADMIN_BOOTSTRAP_EMAIL becomes the platform owner.
 */
export async function getAdmin() {
  const user = await requireUser();
  const db = await getDb();
  let row = await db.query.platformAdmins.findFirst({ where: eq(platformAdmins.userId, user.id) });
  const boot = process.env.SUPERADMIN_BOOTSTRAP_EMAIL?.toLowerCase();
  if (!row && boot && boot === user.email.toLowerCase()) {
    const [c] = await db.select({ n: count() }).from(platformAdmins);
    if (Number(c?.n ?? 0) === 0) {
      [row] = await db.insert(platformAdmins).values({ userId: user.id, role: "owner", createdBy: "bootstrap" }).onConflictDoNothing().returning();
      await audit(db, { workspaceId: null, actorUserId: user.id, action: "admin.bootstrap_owner" });
    }
  }
  if (!row || row.status !== "active") return null;
  return { user, db, role: row.role, can: (p: Permission) => can(row!.role, p) };
}

export async function requireAdmin(p: Permission = "overview.view") {
  const a = await getAdmin();
  if (!a) notFound();
  if (!a.can(p)) notFound();
  return a;
}

/** For server actions: throws instead of rendering a 404. */
export async function adminAction(p: Permission) {
  const a = await getAdmin();
  if (!a || !a.can(p)) throw new AppError("errors.permissionDenied");
  return a;
}
