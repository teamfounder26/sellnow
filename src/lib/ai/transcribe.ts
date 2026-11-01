import "server-only";
import { AIProviderError } from "./provider";

/**
 * Speech-to-text adapter. TokenPortal does not document an audio endpoint and the primary model is
 * not assumed to transcribe audio, so voice notes use a separately configured OpenAI-compatible
 * `/audio/transcriptions` service (e.g. Whisper-class): STT_BASE_URL, STT_API_KEY, STT_MODEL.
 * When it is not configured the seller can still record, play back and type instead.
 */
let override: ((audio: Buffer, mime: string, locale: "en" | "ms") => Promise<string>) | null = null;

export function transcriptionConfigured() {
  return override !== null || Boolean(process.env.STT_BASE_URL && process.env.STT_API_KEY);
}
export function __setTranscriberForTests(fn: typeof override) {
  override = fn;
}

export async function transcribeAudio(audio: Buffer, mime: string, locale: "en" | "ms"): Promise<string> {
  if (override) return override(audio, mime, locale);
  if (!transcriptionConfigured()) throw new AIProviderError("ai.providerError", "transcription not configured", false);
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(audio)], { type: mime }), `voice.${ext}`);
  form.set("model", process.env.STT_MODEL || "whisper-1");
  form.set("language", locale);
  form.set("response_format", "json");
  const res = await fetch(`${process.env.STT_BASE_URL!.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STT_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 401 || res.status === 403) throw new AIProviderError("ai.authFailed", `STT HTTP ${res.status}`, false, res.status);
  if (res.status === 429) throw new AIProviderError("ai.rateLimited", "STT rate limited", true, 429);
  if (!res.ok) throw new AIProviderError("ai.providerError", `STT HTTP ${res.status}`, res.status >= 500, res.status);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}
