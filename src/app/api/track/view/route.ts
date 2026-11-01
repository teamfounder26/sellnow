import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { storefronts } from "@/lib/db/schema";
import { track } from "@/lib/audit";
import { randomToken } from "@/lib/ids";
import { sha256 } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";

const VISITOR_COOKIE = "sn_vid";

export async function POST(req: Request) {
  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string };
  if (!slug) return NextResponse.json({ ok: false }, { status: 400 });
  const ua = req.headers.get("user-agent") ?? "";
  if (/bot|crawl|spider|preview/i.test(ua)) return NextResponse.json({ ok: true });
  const db = await getDb();
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.slug, slug) });
  if (!sf || sf.status !== "PUBLISHED") return NextResponse.json({ ok: false }, { status: 404 });
  const jar = await cookies();
  let vid = jar.get(VISITOR_COOKIE)?.value;
  const res = NextResponse.json({ ok: true });
  if (!vid) {
    vid = randomToken(16);
    res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  if (!rateLimit(`view:${vid}:${slug}`, 30, 60 * 60 * 1000).ok) return res;
  // Store a per-workspace hash so visitor ids can't be correlated across stores.
  await track(db, "storefront_view", { workspaceId: sf.workspaceId, props: { visitor: sha256(`${sf.workspaceId}:${vid}`).slice(0, 24) } });
  return res;
}
