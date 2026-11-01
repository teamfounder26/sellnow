import { ms } from "./dict/ms";
import { en } from "./dict/en";

export type Locale = "ms" | "en";
export const LOCALES: Locale[] = ["ms", "en"];
/** V2 spec: English is the default language; Bahasa Melayu is fully supported (toggle in header/settings). */
export const DEFAULT_LOCALE: Locale = "en";

type Dict = { [k: string]: string | Dict };
export const dictionaries: Record<Locale, Dict> = { ms, en };

export function lookup(dict: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function interpolate(s: string, params?: Record<string, string | number>) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translate with fallback to English, then to the key itself (visible in dev). */
export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const s = lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key);
  if (s === undefined && process.env.NODE_ENV !== "production") console.warn(`[i18n] missing key: ${key}`);
  return interpolate(s ?? key, params);
}

export function isLocale(v: unknown): v is Locale {
  return v === "ms" || v === "en";
}
