import "server-only";
import type { OnboardingLink } from "@/lib/db/schema";
import { extractPage, type PageExtract } from "./html";
import { FetchBlockedError, parsePublicUrl, safeFetch } from "./safe-fetch";

export function detectPlatform(url: URL): OnboardingLink["platform"] {
  const h = url.hostname.replace(/^(www|m|web|mobile)\./, "").toLowerCase();
  if (h === "facebook.com" || h === "fb.com" || h === "fb.me" || h.endsWith(".facebook.com")) return "facebook";
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "instagram.com" || h.endsWith(".instagram.com")) return "instagram";
  return "website";
}

/** Normalizes and classifies a seller-typed link. Returns null for anything we will not fetch. */
export function normalizeLink(raw: string): OnboardingLink | null {
  try {
    const u = parsePublicUrl(raw);
    u.hash = "";
    return { url: u.toString(), platform: detectPlatform(u) };
  } catch {
    return null;
  }
}

export type LinkResearch = {
  url: string;
  platform: OnboardingLink["platform"];
  status: "fetched" | "blocked" | "unreachable" | "requires_connection" | "invalid";
  httpStatus?: number;
  page?: PageExtract;
  error?: string;
};

/**
 * Researches one link. Websites are fetched through the SSRF-safe client. Facebook, TikTok and
 * Instagram are NOT scraped: their content needs an authorized connection through the official APIs,
 * which is not yet available — so we record the link (as a contact reference) and say so honestly.
 */
export async function researchLink(link: OnboardingLink): Promise<LinkResearch> {
  if (link.platform !== "website") return { ...link, status: "requires_connection" };
  try {
    const r = await safeFetch(link.url);
    if (r.status === 401 || r.status === 403 || r.status === 429) return { ...link, status: "blocked", httpStatus: r.status };
    if (r.status >= 400) return { ...link, status: "unreachable", httpStatus: r.status };
    return { url: r.finalUrl, platform: link.platform, status: "fetched", httpStatus: r.status, page: extractPage(r.body, r.finalUrl) };
  } catch (e) {
    if (e instanceof FetchBlockedError) return { ...link, status: e.reason === "invalid_url" || e.reason === "private_address" || e.reason === "bad_port" ? "invalid" : "blocked", error: e.reason };
    return { ...link, status: "unreachable", error: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
}
