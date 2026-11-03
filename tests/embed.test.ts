import { describe, it, expect } from "vitest";
import { safeEmbedUrl, embedDocument, storefrontCsp, SANDBOX_HTML } from "@/lib/storefront/embed";
import { contentSchema } from "@/lib/storefront/sections";

describe("safe embeds", () => {
  it("allows only https URLs from allowlisted providers and paths", () => {
    expect(safeEmbedUrl("https://www.youtube.com/embed/abc123")).toBe("https://www.youtube.com/embed/abc123");
    expect(safeEmbedUrl("https://calendly.com/mak-teh/30min")).toBe("https://calendly.com/mak-teh/30min");
    expect(safeEmbedUrl("http://www.youtube.com/embed/abc")).toBeNull(); // not https
    expect(safeEmbedUrl("https://www.youtube.com/watch?v=abc")).toBeNull(); // not an embed path
    expect(safeEmbedUrl("https://evil.example.com/embed")).toBeNull();
    expect(safeEmbedUrl("https://www.google.com/search?q=x")).toBeNull(); // Google only for maps embeds
    expect(safeEmbedUrl("javascript:alert(1)")).toBeNull();
  });
  it("HTML snippets are isolated: no allow-same-origin, base-uri locked, size capped", () => {
    expect(SANDBOX_HTML).not.toContain("allow-same-origin");
    expect(SANDBOX_HTML).not.toContain("allow-top-navigation");
    const doc = embedDocument("<p>Hi</p>" + "x".repeat(30_000));
    expect(doc).toContain("base-uri 'none'");
    expect(doc.length).toBeLessThan(21_000);
    expect(storefrontCsp()).toContain("object-src 'none'");
  });
  it("the website schema accepts embed sections with bounded height", () => {
    const ok = contentSchema.safeParse({ sections: [{ id: "sec_1", type: "embed", visible: true, props: { mode: "html", html: "<b>x</b>", height: 400 } }], productIds: [] });
    expect(ok.success).toBe(true);
  });
});
