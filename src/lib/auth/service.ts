import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { users, sessions, emailVerificationTokens, workspaceMembers, workspaces, passwordResetTokens } from "@/lib/db/schema";
import { hashPassword, verifyPassword, sha256 } from "@/lib/crypto";
import { newId, randomToken } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { z } from "zod";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  locale: z.enum(["ms", "en"]).default("en"),
});

export async function registerUser(db: DB, input: z.input<typeof registerSchema>) {
  const data = registerSchema.parse(input);
  const existing = await db.query.users.findFirst({ where: eq(users.email, data.email) });
  if (existing) throw new AppError("auth.emailTaken");
  const id = newId("usr");
  await db.insert(users).values({
    id,
    email: data.email,
    name: data.name,
    passwordHash: await hashPassword(data.password),
    locale: data.locale,
  });
  return { id, email: data.email, name: data.name };
}

export async function authenticate(db: DB, email: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
  // Always run a hash comparison to reduce user-enumeration timing differences.
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!user || !ok) throw new AppError("auth.invalidCredentials");
  return user;
}

export async function createSession(db: DB, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: newId("ses"), userId, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt };
}

export async function resolveSession(db: DB, token: string | undefined) {
  if (!token) return null;
  const row = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row[0]?.user ?? null;
}

export async function destroySession(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function createEmailVerification(db: DB, userId: string): Promise<string> {
  const token = randomToken(24);
  await db.insert(emailVerificationTokens).values({
    id: newId("evt"),
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });
  return token;
}

export async function consumeEmailVerification(db: DB, token: string): Promise<boolean> {
  const row = await db.query.emailVerificationTokens.findFirst({
    where: and(
      eq(emailVerificationTokens.tokenHash, sha256(token)),
      isNull(emailVerificationTokens.usedAt),
      gt(emailVerificationTokens.expiresAt, new Date()),
    ),
  });
  if (!row) return false;
  await db.transaction(async (tx) => {
    await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, row.id));
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  });
  return true;
}

// ---------------------------------------------------------------- Roles
export type Role = "owner" | "admin" | "editor" | "viewer";
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: Role, min: Role) {
  return RANK[role] >= RANK[min];
}

/** Server-side tenant authorization. Throws if the user is not a member with at least `min` role. */
export async function assertMember(db: DB, userId: string, workspaceId: string, min: Role = "viewer") {
  const m = await db
    .select({ role: workspaceMembers.role, workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  const row = m[0];
  if (!row) throw new AppError("errors.forbidden");
  if (!roleAtLeast(row.role, min)) throw new AppError("errors.permissionDenied", { role: min });
  return { role: row.role as Role, workspace: row.workspace };
}

export async function listMemberships(db: DB, userId: string) {
  return db
    .select({ role: workspaceMembers.role, workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.createdAt);
}

// ---------------------------------------------------------------- Password reset
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Always behaves the same whether or not the email exists (no account enumeration). Returns the raw token for delivery. */
export async function createPasswordReset(db: DB, email: string): Promise<{ token: string; userId: string } | null> {
  const user = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
  if (!user) return null;
  const token = randomToken(32);
  await db.insert(passwordResetTokens).values({ id: newId("prt"), userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
  return { token, userId: user.id };
}

/** Single-use: sets the new password, marks the token used and signs the user out everywhere. */
export async function resetPassword(db: DB, token: string, newPassword: string) {
  if (newPassword.length < 8 || newPassword.length > 200) throw new AppError("errors.validation");
  const row = await db.query.passwordResetTokens.findFirst({
    where: and(eq(passwordResetTokens.tokenHash, sha256(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())),
  });
  if (!row) throw new AppError("auth.resetInvalid");
  const hash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    const used = await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt))).returning({ id: passwordResetTokens.id });
    if (!used.length) throw new AppError("auth.resetInvalid");
    // Resetting via the emailed link also proves control of the address.
    await tx.update(users).set({ passwordHash: hash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, row.userId));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });
  return row.userId;
}
