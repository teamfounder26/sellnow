import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { authAccounts, users } from "@/lib/db/schema";
import { hmacHex, safeEqualHex } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";

/**
 * OAuth 2.0 / OIDC sign-in (authorization code + PKCE + state).
 * Only identity scopes are requested. Facebook Login does NOT grant Pages/Ads access — those need a
 * separate, explicitly authorized connection with their own scopes (see Integrations).
 */
export type OAuthProvider = "google" | "facebook";
export const OAUTH_PROVIDERS: OAuthProvider[] = ["google", "facebook"];

const CONFIG = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    id: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.GOOGLE_CLIENT_SECRET,
  },
  facebook: {
    authorize: "https://www.facebook.com/v21.0/dialog/oauth",
    token: "https://graph.facebook.com/v21.0/oauth/access_token",
    userinfo: "https://graph.facebook.com/v21.0/me?fields=id,name,email",
    scope: "email public_profile",
    id: () => process.env.FACEBOOK_APP_ID,
    secret: () => process.env.FACEBOOK_APP_SECRET,
  },
} as const;

export function isOAuthProvider(v: unknown): v is OAuthProvider {
  return v === "google" || v === "facebook";
}

export function oauthConfigured(p: OAuthProvider) {
  return Boolean(CONFIG[p].id() && CONFIG[p].secret());
}

export type OAuthState = { p: OAuthProvider; s: string; v: string; n: string; exp: number };

/** Signed, short-lived cookie value carrying state + PKCE verifier (never trusted unless the HMAC matches). */
export function sealState(st: OAuthState) {
  const body = Buffer.from(JSON.stringify(st)).toString("base64url");
  return `${body}.${hmacHex(`oauth:${body}`)}`;
}

export function openState(cookie: string | undefined, now = Date.now()): OAuthState | null {
  if (!cookie) return null;
  const [body, mac] = cookie.split(".");
  if (!body || !mac || !safeEqualHex(mac, hmacHex(`oauth:${body}`))) return null;
  try {
    const st = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    return st.exp > now && isOAuthProvider(st.p) ? st : null;
  } catch {
    return null;
  }
}

export function beginOAuth(p: OAuthProvider, redirectUri: string, next: string) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(CONFIG[p].authorize);
  url.search = new URLSearchParams({
    client_id: CONFIG[p].id()!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CONFIG[p].scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(p === "google" ? { prompt: "select_account" } : {}),
  }).toString();
  return { url: url.toString(), cookie: sealState({ p, s: state, v: verifier, n: next, exp: Date.now() + 10 * 60 * 1000 }) };
}

export type OAuthProfile = { provider: OAuthProvider; id: string; email: string | null; emailVerified: boolean; name: string };

let fetchOverride: typeof fetch | null = null;
export function __setOAuthFetchForTests(f: typeof fetch | null) {
  fetchOverride = f;
}

/** Exchanges the code (server-to-server, with the secret and PKCE verifier) and reads the identity. */
export async function completeOAuth(p: OAuthProvider, code: string, verifier: string, redirectUri: string): Promise<OAuthProfile> {
  const f = fetchOverride ?? fetch;
  const tokenRes = await f(CONFIG[p].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: CONFIG[p].id()!, client_secret: CONFIG[p].secret()!, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new AppError("oauth.exchangeFailed");
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new AppError("oauth.exchangeFailed");
  const meRes = await f(CONFIG[p].userinfo, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) });
  if (!meRes.ok) throw new AppError("oauth.profileFailed");
  const me = (await meRes.json()) as { sub?: string; id?: string; email?: string; email_verified?: boolean; name?: string };
  const id = p === "google" ? me.sub : me.id;
  if (!id) throw new AppError("oauth.profileFailed");
  return {
    provider: p,
    id: String(id),
    email: me.email ? me.email.trim().toLowerCase() : null,
    // Google asserts verification explicitly. Facebook gives no verification flag, so it never auto-links.
    emailVerified: p === "google" ? me.email_verified === true : false,
    name: (me.name ?? me.email?.split("@")[0] ?? "SellNow user").slice(0, 80),
  };
}

/**
 * Maps an OAuth identity to a SellNow user without ever creating duplicates or allowing takeover:
 *  1. identity already linked → that user
 *  2. signed in (linking) → link to the current user unless the identity belongs to someone else
 *  3. email matches an existing user → auto-link ONLY if the provider verified the email AND the
 *     existing account's email is verified; otherwise refuse (prevents pre-registration hijacks)
 *  4. otherwise → new user (no password)
 */
export async function resolveOAuthUser(db: DB, profile: OAuthProfile, currentUserId?: string | null): Promise<{ userId: string; created: boolean; linked: boolean }> {
  const existing = await db.query.authAccounts.findFirst({ where: and(eq(authAccounts.provider, profile.provider), eq(authAccounts.providerAccountId, profile.id)) });
  if (existing) {
    if (currentUserId && existing.userId !== currentUserId) throw new AppError("oauth.linkedElsewhere");
    return { userId: existing.userId, created: false, linked: false };
  }
  const link = async (userId: string) => {
    await db.insert(authAccounts).values({ id: newId("oac"), userId, provider: profile.provider, providerAccountId: profile.id, email: profile.email, emailVerified: profile.emailVerified });
    await audit(db, { workspaceId: null, actorUserId: userId, action: "auth.oauth_linked", data: { provider: profile.provider } });
  };
  if (currentUserId) {
    await link(currentUserId);
    return { userId: currentUserId, created: false, linked: true };
  }
  if (profile.email) {
    const byEmail = await db.query.users.findFirst({ where: eq(users.email, profile.email) });
    if (byEmail) {
      if (profile.emailVerified && byEmail.emailVerifiedAt) {
        await link(byEmail.id);
        return { userId: byEmail.id, created: false, linked: true };
      }
      throw new AppError("oauth.accountExists");
    }
  }
  if (!profile.email) throw new AppError("oauth.emailRequired");
  const id = newId("usr");
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, email: profile.email!, name: profile.name, passwordHash: null, emailVerifiedAt: profile.emailVerified ? new Date() : null });
    await tx.insert(authAccounts).values({ id: newId("oac"), userId: id, provider: profile.provider, providerAccountId: profile.id, email: profile.email, emailVerified: profile.emailVerified });
  });
  return { userId: id, created: true, linked: false };
}
