import { describe, it, expect } from "vitest";
import { isPublicAddress, parsePublicUrl, safeFetch, FetchBlockedError } from "@/lib/ingest/safe-fetch";
import { normalizeLink, detectPlatform, researchLink } from "@/lib/ingest/links";
import { extractPage } from "@/lib/ingest/html";
import { detectDocument } from "@/lib/ingest/documents";
import { detectAudioMime } from "@/lib/storage";
import { makeDocx, makePdf, MP4_VIDEO, WEBM_AUDIO } from "./fixtures";

describe("SSRF protection", () => {
  it("classifies private, loopback, link-local, CGNAT and metadata addresses as non-public", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPublicAddress(ip), ip).toBe(true);
  });

  it("rejects non-http schemes, credentials, odd ports, local names and private IP literals", () => {
    for (const bad of ["file:///etc/passwd", "ftp://x.com", "http://user:pw@example.com", "http://example.com:8080", "http://localhost", "http://intranet", "http://printer.local", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "javascript:alert(1)"]) {
      expect(() => parsePublicUrl(bad), bad).toThrow(FetchBlockedError);
    }
    expect(parsePublicUrl("dapurmakteh.my").toString()).toBe("https://dapurmakteh.my/");
  });

  it("blocks hostnames that resolve to private addresses before connecting", async () => {
    // localhost.localtest.me-style trick: a public-looking name resolving to loopback.
    await expect(safeFetch("http://127.0.0.1.nip.io/")).rejects.toBeInstanceOf(Error);
    const r = await researchLink({ url: "http://10.0.0.5/", platform: "website" });
    expect(r.status).toBe("invalid");
  });
});

describe("link detection", () => {
  it("normalizes and detects platforms", () => {
    expect(normalizeLink("facebook.com/dapurmakteh")).toEqual({ url: "https://facebook.com/dapurmakteh", platform: "facebook" });
    expect(normalizeLink("https://www.tiktok.com/@dapur#x")?.platform).toBe("tiktok");
    expect(detectPlatform(new URL("https://m.facebook.com/x"))).toBe("facebook");
    expect(detectPlatform(new URL("https://instagram.com/x"))).toBe("instagram");
    expect(normalizeLink("not a url")).toBeNull();
  });
  it("never fetches social platforms (requires an authorised connection)", async () => {
    expect((await researchLink({ url: "https://facebook.com/x", platform: "facebook" })).status).toBe("requires_connection");
    expect((await researchLink({ url: "https://tiktok.com/@x", platform: "tiktok" })).status).toBe("requires_connection");
  });
});

describe("public page extraction", () => {
  it("reads title, meta, Open Graph, JSON-LD products/org and visible text — never scripts", () => {
    const html = `<html><head><title>Kek Lapis Sarawak | Mak Nab</title>
      <meta name="description" content="Kek lapis asli &amp; segar">
      <meta property="og:site_name" content="Mak Nab Bakery"><meta property="og:image" content="/img/hero.jpg">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
        {"@type":"Product","name":"Kek Lapis Horlicks","offers":{"price":"45.00","priceCurrency":"MYR"}},
        {"@type":"Bakery","name":"Mak Nab Bakery","telephone":"+6012-345 6789","address":{"addressLocality":"Kuching","addressRegion":"Sarawak"}}]}</script>
      <script>window.secret="do not read"</script><style>.x{}</style></head>
      <body><h1>Kek lapis</h1><p>Hantar seluruh Malaysia</p></body></html>`;
    const p = extractPage(html, "https://maknab.my/");
    expect(p.title).toBe("Kek Lapis Sarawak | Mak Nab");
    expect(p.description).toBe("Kek lapis asli & segar");
    expect(p.siteName).toBe("Mak Nab Bakery");
    expect(p.ogImage).toBe("https://maknab.my/img/hero.jpg");
    expect(p.products).toEqual([{ name: "Kek Lapis Horlicks", description: undefined, price: "45.00", currency: "MYR", image: undefined }]);
    expect(p.organization).toMatchObject({ name: "Mak Nab Bakery", telephone: "+6012-345 6789", address: "Kuching, Sarawak" });
    expect(p.text).toContain("Hantar seluruh Malaysia");
    expect(p.text).not.toContain("do not read");
  });
});

describe("upload content detection", () => {
  it("detects documents by magic bytes, not extension", () => {
    expect(detectDocument(makePdf("x"), "a.pdf")).toBe("pdf");
    expect(detectDocument(makeDocx("x"), "a.docx")).toBe("docx");
    expect(detectDocument(makePdf("x"), "renamed.docx")).toBe("pdf");
    expect(detectDocument(Buffer.from("MZ\x90\x00 exe"), "invoice.pdf")).toBeNull();
    expect(detectDocument(MP4_VIDEO, "x.pdf")).toBeNull();
  });
  it("accepts only audio containers for voice notes", () => {
    expect(detectAudioMime(WEBM_AUDIO, "audio/webm;codecs=opus")).toBe("audio/webm");
    expect(detectAudioMime(WEBM_AUDIO, "video/webm")).toBeNull();
    expect(detectAudioMime(MP4_VIDEO, "video/mp4")).toBeNull();
  });
});
