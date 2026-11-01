"use client";
import { createContext, useCallback, useContext } from "react";
import { dictionaries, interpolate, lookup, type Locale } from "./translate";

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale() {
  return useContext(Ctx);
}

export function useT() {
  const locale = useContext(Ctx);
  return useCallback(
    (key: string, params?: Record<string, string | number>) => interpolate(lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key) ?? key, params),
    [locale],
  );
}
