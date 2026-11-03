/**
 * Safe embeds for seller websites.
 *  - URL mode: only allowlisted providers, rendered in an iframe on THEIR origin.
 *  - HTML mode: the seller's snippet runs in a sandboxed `srcdoc` iframe WITHOUT allow-same-origin,
 *    so it gets an opaque origin — it can't read SellNow cookies, storage or the page DOM, and
 *    can't navigate the top window.
 */
export const EMBED_HOSTS = [
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "calendly.com",
  "docs.google.com",
  "www.google.com",
  "open.spotify.com",
  "www.instagram.com",
  "www.facebook.com",
  "tally.so",
  "forms.office.com",
] as const;

/** Allowed path prefixes per host (Google only for Forms/Maps embeds, etc.). */
const PATHS: Partial<Record<(typeof EMBED_HOSTS)[number], RegExp>> = {
  "www.youtube.com": /^\/embed\//,
  "www.youtube-nocookie.com": /^\/embed\//,
  "docs.google.com": /^\/forms\//,
  "www.google.com": /^\/maps\/embed/,
  "open.spotify.com": /^\/embed\//,
  "www.instagram.com": /^\/p\/[^/]+\/embed/,
  "www.facebook.com": /^\/plugins\//,
};

export function safeEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    if (!(EMBED_HOSTS as readonly string[]).includes(u.hostname)) return null;
    const re = PATHS[u.hostname as (typeof EMBED_HOSTS)[number]];
    if (re && !re.test(u.pathname)) return null;
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return null;
  }
}

export const EMBED_HTML_MAX = 20_000;
export const SANDBOX_HTML = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
export const SANDBOX_URL = "allow-scripts allow-same-origin allow-forms allow-popups allow-presentation";

/** Wraps a snippet as an isolated document (responsive, no base-tag hijacking). */
export function embedDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="base-uri 'none'"><style>html,body{margin:0;font-family:system-ui,sans-serif}img,video,iframe{max-width:100%;height:auto}</style></head><body>${html.slice(0, EMBED_HTML_MAX)}</body></html>`;
}

/** Storefront CSP: frames only from the allowlist; no plugins; no base-tag hijacking. */
export function storefrontCsp() {
  return `frame-src 'self' ${EMBED_HOSTS.map((h) => `https://${h}`).join(" ")}; object-src 'none'; base-uri 'self'`;
}
