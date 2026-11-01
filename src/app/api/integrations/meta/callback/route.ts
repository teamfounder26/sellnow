import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWorkspaceContext } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/auth/service";
import { hmacHex, safeEqualHex } from "@/lib/crypto";
import { appUrl } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { MetaApi, exchangeMetaCode } from "@/lib/ads/meta";
import { saveMetaToken } from "@/lib/ads/service";

export async function GET(req: Request) {
  const base = await appUrl();
  const url = new URL(req.url);
  const back = (q: string) => {
    const r = NextResponse.redirect(`${base}/dashboard/creative?tab=settings&${q}`);
    r.cookies.delete({ name: "sn_meta_state", path: "/api/integrations/meta" });
    return r;
  };
  if (url.searchParams.get("error")) return back("error=meta.cancelled");
  const state = url.searchParams.get("state") ?? "";
  const cookie = (await cookies()).get("sn_meta_state")?.value ?? "";
  const parts = state.split(".");
  const mac = parts.pop() ?? "";
  const payload = parts.join(".");
  const [wsId, userId, exp] = parts;
  if (!state || state !== cookie || !safeEqualHex(mac, hmacHex(`meta:${payload}`)) || Number(exp) < Date.now()) return back("error=oauth.invalidState");
  const ctx = await getWorkspaceContext("viewer");
  if (!ctx.workspace || ctx.workspace.id !== wsId || ctx.user.id !== userId || !ctx.role || !roleAtLeast(ctx.role, "admin")) return back("error=errors.permissionDenied");
  try {
    const { accessToken, expiresAt } = await exchangeMetaCode(url.searchParams.get("code") ?? "", `${base}/api/integrations/meta/callback`);
    const me = await new MetaApi(accessToken).me();
    await saveMetaToken(ctx.db, { workspaceId: wsId!, userId: userId! }, accessToken, expiresAt, me.name);
    return back("connected=1");
  } catch (e) {
    return back(`error=${e instanceof AppError ? e.code : "meta.apiError"}`);
  }
}
