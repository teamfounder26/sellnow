import { describe, it, expect } from "vitest";
import { ms } from "@/lib/i18n/dict/ms";
import { en } from "@/lib/i18n/dict/en";
import { translate } from "@/lib/i18n/translate";
import { formatMYR, parseRinggitToSen, percentOf } from "@/lib/money";
import { productInputSchema } from "@/lib/products/service";

function keys(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : keys(v as object, `${prefix}${k}.`)));
}

describe("localization", () => {
  it("has identical key sets for BM and English", () => {
    expect(keys(en).sort()).toEqual(keys(ms).sort());
  });
  it("defaults to BM and interpolates params", () => {
    expect(translate("ms", "credits.balance", { n: 5 })).toBe("5 kredit");
    expect(translate("en", "credits.balance", { n: 5 })).toBe("5 credits");
  });
  it("formats MYR for both locales", () => {
    expect(formatMYR(1990, "ms")).toMatch(/RM\s?19\.90/);
    expect(formatMYR(123456, "en")).toMatch(/RM\s?1,234\.56/);
  });
  it("formats dates in Malaysia time", () => {
    const d = new Date("2026-11-01T16:30:00Z");
    expect(new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hour12: false }).format(d)).toBe("00");
  });
});

describe("money precision", () => {
  it("parses ringgit to integer sen without float errors", () => {
    expect(parseRinggitToSen("19.90")).toBe(1990);
    expect(parseRinggitToSen("RM 1,234.5")).toBe(123450);
    expect(parseRinggitToSen("0.1")).toBe(10);
    expect(parseRinggitToSen("19.999")).toBeNull();
    expect(parseRinggitToSen("-5")).toBeNull();
    expect(percentOf(5970, 10)).toBe(597);
    expect(percentOf(995, 15)).toBe(149); // 149.25 → 149
  });
});

describe("product validation", () => {
  it("enforces category-specific rules", () => {
    expect(productInputSchema.safeParse({ type: "physical", name: "Sambal", price: "19.90" }).success).toBe(false); // fulfillment required
    expect(productInputSchema.safeParse({ type: "physical", name: "Sambal", price: "19.90", fulfillment: "shipping", compareAt: "10.00" }).success).toBe(false);
    expect(productInputSchema.safeParse({ type: "digital", name: "Ebook", price: "10", status: "active" }).success).toBe(false); // file required to activate
    expect(productInputSchema.safeParse({ type: "digital", name: "Ebook", price: "10", variants: [{ name: "A", price: "1" }] }).success).toBe(false);
    expect(productInputSchema.safeParse({ type: "service", name: "Logo", price: "100" }).success).toBe(false); // scope required
    expect(productInputSchema.safeParse({ type: "physical", name: "Sambal", price: "19.90", fulfillment: "both" }).success).toBe(true);
  });
});
