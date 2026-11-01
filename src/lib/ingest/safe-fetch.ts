import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

/**
 * SSRF-hardened HTTP GET for seller-provided links.
 *  - http/https only, default ports only, no credentials in URL
 *  - every hostname is resolved and ALL addresses must be public; the validated address is pinned
 *    for the actual connection (prevents DNS-rebinding between check and connect)
 *  - redirects are followed manually (max 4) and each hop is re-validated
 *  - timeout, response size cap, and content-type allow-list
 */
export class FetchBlockedError extends Error {
  constructor(public readonly reason: "invalid_url" | "private_address" | "bad_port" | "too_many_redirects" | "unsupported_type" | "too_large") {
    super(reason);
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const ALLOWED_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

function v4ToInt(ip: string) {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export function isPublicAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = v4ToInt(ip);
    return !V4_BLOCKS.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (fam === 6) {
    const l = ip.toLowerCase();
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]!);
    if (l === "::" || l === "::1") return false;
    if (/^f[cd]/.test(l)) return false; // fc00::/7 unique-local
    if (/^fe[89ab]/.test(l)) return false; // fe80::/10 link-local
    if (/^ff/.test(l)) return false; // multicast
    if (l.startsWith("64:ff9b:") || l.startsWith("2001:db8") || l.startsWith("2002:")) return false;
    return true;
  }
  return false;
}

export function parsePublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new FetchBlockedError("invalid_url");
  }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new FetchBlockedError("invalid_url");
  if (u.port && !["80", "443"].includes(u.port)) throw new FetchBlockedError("bad_port");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !isIP(host)) throw new FetchBlockedError("invalid_url");
  if (/\.(local|internal|localhost|lan|home|corp)$/i.test(host) || host === "localhost") throw new FetchBlockedError("private_address");
  if (isIP(host) && !isPublicAddress(host)) throw new FetchBlockedError("private_address");
  return u;
}

async function resolvePublic(host: string): Promise<{ address: string; family: number }> {
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) return { address: bare, family: isIP(bare) };
  const addrs = await lookup(bare, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => !isPublicAddress(a.address))) throw new FetchBlockedError("private_address");
  return addrs[0]!;
}

export type FetchResult = { finalUrl: string; status: number; contentType: string; body: string };

function getOnce(u: URL, pinned: { address: string; family: number }): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const mod = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: "GET",
        headers: { "User-Agent": "SellNowBot/1.0 (+business profile import; seller-requested)", Accept: "text/html,application/xhtml+xml", "Accept-Encoding": "identity" },
        // Connect only to the address we validated (TLS SNI/Host still use the hostname).
        lookup: (_h, opts, cb) => {
          if ((opts as { all?: boolean }).all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [pinned]);
          else cb(null, pinned.address, pinned.family);
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: "" });
        }
        const type = String(res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
        if (status < 400 && !ALLOWED_TYPES.includes(type)) {
          res.destroy();
          return reject(new FetchBlockedError("unsupported_type"));
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            res.destroy();
            reject(new FetchBlockedError("too_large"));
          } else chunks.push(c);
        });
        res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetch(raw: string): Promise<FetchResult> {
  let u = parsePublicUrl(raw);
  for (let hop = 0; hop <= 4; hop++) {
    const pinned = await resolvePublic(u.hostname);
    const r = await getOnce(u, pinned);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      u = parsePublicUrl(new URL(r.headers.location, u).toString());
      continue;
    }
    return { finalUrl: u.toString(), status: r.status, contentType: String(r.headers["content-type"] ?? ""), body: r.body };
  }
  throw new FetchBlockedError("too_many_redirects");
}
