import { NextResponse } from "next/server";
import { beginOAuth, isOAuthProvider, oauthConfigured } from "@/lib/auth/oauth";
import { appUrl, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";


function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "";
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = await appUrl();
  if (!isOAuthProvider(provider)) return NextResponse.redirect(`${base}/login?error=oauth.unknown`);
  if (!oauthConfigured(provider)) return NextResponse.redirect(`${base}/login?error=oauth.notConfigured`);
  if (!rateLimit(`oauth:${await clientIp()}`, 30, 10 * 60 * 1000).ok) return NextResponse.redirect(`${base}/login?error=auth.rateLimited`);
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const { url, cookie } = beginOAuth(provider, `${base}/api/auth/${provider}/callback`, next);
  const res = NextResponse.redirect(url);
  res.cookies.set("sn_oauth", cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 600 });
  return res;
}
