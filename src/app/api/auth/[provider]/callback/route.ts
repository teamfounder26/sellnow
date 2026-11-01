import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { completeOAuth, isOAuthProvider, openState, resolveOAuthUser } from "@/lib/auth/oauth";
import { createSession, listMemberships } from "@/lib/auth/service";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth/session";
import { safeEqualHex, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { track } from "@/lib/audit";
import { log } from "@/lib/log";

const OAUTH_COOKIE = "sn_oauth";

/** OAuth callback: validates state (signed cookie, single use), exchanges the code server-side, signs in. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = await appUrl();
  const url = new URL(req.url);
  const jar = await cookies();
  const st = openState(jar.get(OAUTH_COOKIE)?.value);
  const fail = (code: string) => {
    const r = NextResponse.redirect(`${base}/login?error=${encodeURIComponent(code)}`);
    r.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
    return r;
  };
  if (!isOAuthProvider(provider)) return fail("oauth.unknown");
  if (url.searchParams.get("error")) return fail("oauth.cancelled"); // user declined or provider error
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!st || st.p !== provider || !code || !safeEqualHex(sha256(state), sha256(st.s))) return fail("oauth.invalidState");

  try {
    const db = await getDb();
    const profile = await completeOAuth(provider, code, st.v, `${base}/api/auth/${provider}/callback`);
    const current = await getCurrentUser();
    const r = await resolveOAuthUser(db, profile, current?.id);
    const { token, expiresAt } = await createSession(db, r.userId);
    await track(db, r.created ? "signup_completed" : "login_completed", { userId: r.userId, props: { method: provider } });
    const hasWorkspace = (await listMemberships(db, r.userId)).length > 0;
    const dest = st.n || (hasWorkspace ? "/dashboard" : "/onboarding");
    const res = NextResponse.redirect(`${base}${dest}`);
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
    return res;
  } catch (e) {
    if (e instanceof AppError) return fail(e.code);
    log("error", "oauth.callback_failed", { provider, error: e instanceof Error ? e.message : String(e) });
    return fail("oauth.exchangeFailed");
  }
}
