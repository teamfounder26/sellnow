import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getWorkspaceContext } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/auth/service";
import { hmacHex } from "@/lib/crypto";
import { appUrl } from "@/lib/http";
import { metaAppConfigured, metaAuthorizeUrl } from "@/lib/ads/meta";

/** Starts "Connect Meta Business" (ads permissions). State is bound to the workspace + user and signed. */
export async function GET() {
  const base = await appUrl();
  const back = (err: string) => NextResponse.redirect(`${base}/dashboard/creative?tab=settings&error=${err}`);
  const ctx = await getWorkspaceContext("viewer");
  if (!ctx.workspace || !ctx.role || !roleAtLeast(ctx.role, "admin")) return back("errors.permissionDenied");
  if (!metaAppConfigured()) return back("meta.appNotConfigured");
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${ctx.workspace.id}.${ctx.user.id}.${Date.now() + 600_000}.${nonce}`;
  const state = `${payload}.${hmacHex(`meta:${payload}`)}`;
  const res = NextResponse.redirect(metaAuthorizeUrl(`${base}/api/integrations/meta/callback`, state));
  res.cookies.set("sn_meta_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations/meta", maxAge: 600 });
  return res;
}
