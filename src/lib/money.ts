/** Money helpers. All amounts are integer sen (1 MYR = 100 sen). */

export function parseRinggitToSen(input: string | number): number | null {
  const s = String(input).trim().replace(/^RM\s*/i, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const sen = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(sen) ? sen : null;
}

export function formatMYR(sen: number, locale: "ms" | "en" = "ms"): string {
  return new Intl.NumberFormat(locale === "ms" ? "ms-MY" : "en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(sen / 100);
}

export function senToInput(sen: number | null | undefined): string {
  if (sen == null) return "";
  return (sen / 100).toFixed(2);
}

/** Percentage discount computed in integer math, rounded half-up to the nearest sen. */
export function percentOf(sen: number, percent: number): number {
  return Math.floor((sen * percent + 50) / 100);
}
