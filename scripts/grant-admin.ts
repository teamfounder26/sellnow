/**
 * Grant a platform admin role from the command line (first owner, or recovery):
 *   npx tsx --conditions=react-server scripts/grant-admin.ts owner@example.com owner
 *   (set PGLITE_DIR / DATABASE_URL to target the right database; stop a running PGlite dev server first)
 * Roles: owner | finance | operations | support | analyst | technical
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { platformAdmins, users } from "../src/lib/db/schema";
import { audit } from "../src/lib/audit";

const [email, role] = process.argv.slice(2);
const ROLES = ["owner", "finance", "operations", "support", "analyst", "technical"];
if (!email || !role || !ROLES.includes(role)) {
  console.error("usage: tsx scripts/grant-admin.ts <email> <owner|finance|operations|support|analyst|technical>");
  process.exit(1);
}
const db = await getDb();
const u = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
if (!u) {
  console.error("No user with that email — register in the app first.");
  process.exit(1);
}
await db.insert(platformAdmins).values({ userId: u.id, role: role as "owner", createdBy: "cli" }).onConflictDoUpdate({ target: platformAdmins.userId, set: { role: role as "owner", status: "active", updatedAt: new Date() } });
await audit(db, { workspaceId: null, actorUserId: null, action: "admin.role_assigned_cli", entity: "user", entityId: u.id, data: { role } });
console.log(`${email} is now a platform ${role}.`);
process.exit(0);
