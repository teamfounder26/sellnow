import "server-only";
import { AIProviderError } from "./provider";
import { detectImageMime, type ImageMime } from "@/lib/storage";

/**
 * Image-generation adapter. TokenPortal exposes no image models (its `/images/generations` answers
 * 404), so posters use a separately configured OpenAI-compatible `/images/generations` service:
 * IMAGE_BASE_URL, IMAGE_API_KEY, IMAGE_MODEL (e.g. gpt-image-1). Without it, AI Poster Studio still
 * produces briefs, prompts and layout posters from the seller's own product photo — never placeholders.
 */
export type GeneratedImage = { bytes: Buffer; mime: ImageMime; model: string };
export type ImageRequest = { prompt: string; ratio: "3:4" | "4:5" | "1:1" | "9:16" };
type Generator = (req: ImageRequest) => Promise<GeneratedImage>;

let override: Generator | null = null;
export function __setImageGeneratorForTests(fn: Generator | null) {
  override = fn;
}

export function imageGenerationConfigured() {
  return override !== null || Boolean(process.env.IMAGE_API_KEY);
}

export function imageProviderInfo() {
  return { name: process.env.IMAGE_PROVIDER_NAME || "openai-compatible", model: process.env.IMAGE_MODEL || "gpt-image-1" };
}

/**
 * Providers only render a few sizes; we request the nearest portrait/square canvas and the poster
 * composer crops to the exact ratio (3:4 → 1200×1600 etc.).
 */
export function providerSize(ratio: ImageRequest["ratio"]) {
  return ratio === "1:1" ? "1024x1024" : "1024x1536";
}

export async function generateImage(req: ImageRequest): Promise<GeneratedImage> {
  if (override) return override(req);
  if (!imageGenerationConfigured()) throw new AIProviderError("ai.providerError", "image generation not configured", false);
  const { model } = imageProviderInfo();
  const base = (process.env.IMAGE_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.IMAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: req.prompt.slice(0, 8000), size: providerSize(req.ratio), n: 1 }),
      signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS) || 180_000),
    });
  } catch (e) {
    throw new AIProviderError(e instanceof Error && e.name === "TimeoutError" ? "ai.timeout" : "ai.unreachable", String(e), true);
  }
  if (res.status === 401 || res.status === 403) throw new AIProviderError("ai.authFailed", `image HTTP ${res.status}`, false, res.status);
  if (res.status === 429) throw new AIProviderError("ai.rateLimited", "image rate limited", true, 429);
  if (res.status === 400) {
    const body = await res.text().catch(() => "");
    throw new AIProviderError(/safety|policy|moderation/i.test(body) ? "ai.refused" : "ai.modelRejected", `image HTTP 400 ${body.slice(0, 300)}`, false, 400);
  }
  if (!res.ok) throw new AIProviderError("ai.providerError", `image HTTP ${res.status}`, res.status >= 500, res.status);
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = json.data?.[0];
  let bytes: Buffer | null = null;
  if (first?.b64_json) bytes = Buffer.from(first.b64_json, "base64");
  else if (first?.url?.startsWith("https://")) {
    const img = await fetch(first.url, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
    if (img.ok) bytes = Buffer.from(await img.arrayBuffer());
  }
  if (!bytes) throw new AIProviderError("ai.invalidOutput", "image provider returned no image", true);
  const mime = detectImageMime(bytes);
  if (!mime) throw new AIProviderError("ai.invalidOutput", "image provider returned an unsupported file", true);
  return { bytes, mime, model };
}
