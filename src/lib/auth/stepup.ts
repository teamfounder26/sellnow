import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/crypto";
import { AppError } from "@/lib/errors";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map<string, { n: number; since: number }>();

/**
 * Re-authentication for sensitive actions (bank changes, payout approval, role changes).
 * Only failed attempts count toward the lockout. Google/Facebook-only accounts have no password
 * and must set one (password reset) first.
 */
export async function confirmIdentity(db: DB, userId: string, password: string | undefined | null) {
  const f = failures.get(userId);
  if (f && Date.now() - f.since < WINDOW_MS && f.n >= MAX_FAILURES) throw new AppError("errors.rateLimited");
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u?.passwordHash) throw new AppError("auth.stepUpNeedsPassword");
  if (!password || !(await verifyPassword(password, u.passwordHash))) {
    const cur = f && Date.now() - f.since < WINDOW_MS ? f : { n: 0, since: Date.now() };
    failures.set(userId, { n: cur.n + 1, since: cur.since });
    throw new AppError("auth.stepUpFailed");
  }
  failures.delete(userId);
}
