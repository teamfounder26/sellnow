import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isLocale } from "@/lib/i18n/translate";
import { LOCALE_COOKIE } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST(req: Request) {
  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  if (!isLocale(locale)) return NextResponse.json({ ok: false }, { status: 400 });
  const user = await getCurrentUser();
  if (user) await (await getDb()).update(users).set({ locale }).where(eq(users.id, user.id));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
