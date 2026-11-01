import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_LOCALE, isLocale, translate, type Locale } from "./translate";

export const LOCALE_COOKIE = "sn_locale";

/** Signed-in users: profile setting. Visitors: cookie. Default: English (BM available). */
export const getLocale = cache(async (): Promise<Locale> => {
  const user = await getCurrentUser().catch(() => null);
  if (user && isLocale(user.locale)) return user.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
});

export async function getT() {
  const locale = await getLocale();
  return { locale, t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params) };
}
