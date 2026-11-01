/**
 * Minimal, dependency-free extraction of public page metadata: title, meta/OG tags, JSON-LD
 * (schema.org Product / Organization / LocalBusiness) and visible text. Output is untrusted data.
 */
export type PageExtract = {
  title?: string;
  description?: string;
  siteName?: string;
  ogImage?: string;
  products: { name: string; description?: string; price?: string; currency?: string; image?: string }[];
  organization?: { name?: string; telephone?: string; email?: string; address?: string };
  text: string;
};

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

function meta(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(":", "\\:")}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content).trim().slice(0, 500) : undefined;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

export function extractPage(html: string, baseUrl: string): PageExtract {
  const out: PageExtract = { products: [], text: "" };
  out.title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 200) || meta(html, "og:title");
  out.description = meta(html, "description") ?? meta(html, "og:description");
  out.siteName = meta(html, "og:site_name");
  const img = meta(html, "og:image");
  if (img) {
    try {
      out.ogImage = new URL(img, baseUrl).toString();
    } catch {
      /* ignore */
    }
  }

  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]!.trim());
      const nodes = asArray<Record<string, unknown>>(data["@graph"] ?? data);
      for (const n of nodes) {
        const type = asArray(n["@type"] as string | string[]).join(",");
        if (/Product/.test(type) && typeof n.name === "string") {
          const offer = asArray(n.offers as Record<string, unknown> | Record<string, unknown>[])[0];
          out.products.push({
            name: n.name.slice(0, 200),
            description: typeof n.description === "string" ? n.description.slice(0, 600) : undefined,
            price: offer?.price != null ? String(offer.price) : undefined,
            currency: typeof offer?.priceCurrency === "string" ? offer.priceCurrency : undefined,
            image: typeof n.image === "string" ? n.image : undefined,
          });
        } else if (/Organization|LocalBusiness|Store|Restaurant|Bakery|Shop|Cafe|Salon|Service/.test(type) || ((n.telephone || n.address) && typeof n.name === "string")) {
          // schema.org has hundreds of LocalBusiness subtypes; any named node with contact details qualifies.
          const addr = n.address as Record<string, string> | string | undefined;
          out.organization = {
            name: typeof n.name === "string" ? n.name : undefined,
            telephone: typeof n.telephone === "string" ? n.telephone : undefined,
            email: typeof n.email === "string" ? n.email : undefined,
            address: typeof addr === "string" ? addr : addr ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(", ") : undefined,
          };
        }
      }
    } catch {
      /* malformed JSON-LD is ignored */
    }
  }
  out.products = out.products.slice(0, 20);

  out.text = decode(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 8000);
  return out;
}
