import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { resolveSession, assertMember, listMemberships, type Role } from "./service";

export const SESSION_COOKIE = "sn_session";
export const WORKSPACE_COOKIE = "sn_ws";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(await getDb(), token);
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function setActiveWorkspace(workspaceId: string) {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Resolve the active workspace for the signed-in user and authorize the role on the server.
 * The cookie is only a preference; membership is always re-checked against the database.
 */
export const getWorkspaceContext = cache(async (min: Role = "viewer") => {
  const user = await requireUser();
  const db = await getDb();
  const preferred = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const memberships = await listMemberships(db, user.id);
  if (memberships.length === 0) return { user, db, workspace: null, role: null, memberships } as const;
  const chosen = memberships.find((m) => m.workspace.id === preferred) ?? memberships[0]!;
  const { role, workspace } = await assertMember(db, user.id, chosen.workspace.id, min);
  return { user, db, workspace, role, memberships } as const;
});

/** For pages/actions that need a workspace — redirects to onboarding when the user has none. */
export async function requireWorkspace(min: Role = "viewer") {
  const ctx = await getWorkspaceContext("viewer");
  if (!ctx.workspace || !ctx.role) redirect("/onboarding");
  // Re-check with the requested minimum role.
  const { role } = await assertMember(ctx.db, ctx.user.id, ctx.workspace.id, min);
  return { user: ctx.user, db: ctx.db, workspace: ctx.workspace, role, memberships: ctx.memberships };
}
