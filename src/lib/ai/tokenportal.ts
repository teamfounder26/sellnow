import "server-only";
import type { z } from "zod";
import { AIProviderError, type AIImage, type AIProvider, type AIUsage, type StructuredRequest, type StructuredResult } from "./provider";
import { extractJsonObject, schemaForPrompt } from "./json";
import { log } from "@/lib/log";

/**
 * TokenPortal (https://tokenportal.id) — OpenAI-compatible Chat Completions.
 * Verified against the provider docs (2026-11-01):
 *   - POST {base}/chat/completions, `Authorization: Bearer tp-…`
 *   - images via `image_url` parts (data: URIs allowed) on vision-tagged models; non-vision models answer 400, uncharged
 *   - no documented json_schema response format → we embed the JSON Schema in the prompt and validate with Zod
 *   - no documented audio transcription or image generation (handled by separate adapters)
 *   - measured 2026-11-01: any `system` message raises billed prompt tokens from ~4.2k to ~22.4k per call
 *     (provider-side overhead), so instructions are sent as a tagged block in the first user message.
 *     Set TOKENPORTAL_SYSTEM_ROLE=true to use the system role instead.
 * The API key is read server-side only and never logged.
 */
export const TOKENPORTAL_DEFAULTS = { baseUrl: "https://tokenportal.id/v1", model: "gpt-6.1-sol" } as const;

type ChatContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
type ChatMessage = { role: "system" | "user" | "assistant"; content: ChatContent };
type ChatResponse = {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string; code?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TokenPortalProvider implements AIProvider {
  readonly name = "tokenportal";
  readonly model = process.env.TOKENPORTAL_MODEL || TOKENPORTAL_DEFAULTS.model;
  private readonly baseUrl = (process.env.TOKENPORTAL_BASE_URL || TOKENPORTAL_DEFAULTS.baseUrl).replace(/\/$/, "");
  private readonly timeoutMs = Number(process.env.TOKENPORTAL_TIMEOUT_MS) || 90_000;
  private readonly maxRetries = 2;
  /** Set TOKENPORTAL_VISION=false when the configured model is not vision-tagged. */
  private readonly vision = process.env.TOKENPORTAL_VISION !== "false";
  /** Optional: "json_object" sends response_format for models tagged "json". Default relies on prompt + validation. */
  private readonly jsonMode = process.env.TOKENPORTAL_JSON_MODE === "json_object";
  private readonly systemRole = process.env.TOKENPORTAL_SYSTEM_ROLE === "true";

  constructor(private readonly apiKey = process.env.TOKENPORTAL_API_KEY ?? "") {}

  private estimateCost(u: { inputTokens: number; outputTokens: number }) {
    const pin = Number(process.env.TOKENPORTAL_PRICE_IN_USD_PER_MTOK);
    const pout = Number(process.env.TOKENPORTAL_PRICE_OUT_USD_PER_MTOK);
    if (!pin || !pout) return null;
    return Math.round(u.inputTokens * pin + u.outputTokens * pout); // USD per Mtok == micro-USD per token
  }

  /** One HTTP call with timeout, retry on 429/5xx/network (honouring Retry-After), and error mapping. */
  private async call(body: Record<string, unknown>): Promise<ChatResponse> {
    if (!this.apiKey) throw new AIProviderError("ai.authFailed", "TOKENPORTAL_API_KEY is not set", false);
    let lastError: AIProviderError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        });
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        lastError = new AIProviderError(timeout ? "ai.timeout" : "ai.unreachable", timeout ? `No response within ${this.timeoutMs}ms` : String(e), true);
        if (attempt < this.maxRetries) await sleep(800 * 2 ** attempt);
        continue;
      }
      const text = await res.text();
      let json: ChatResponse = {};
      try {
        json = text ? (JSON.parse(text) as ChatResponse) : {};
      } catch {
        /* non-JSON error page */
      }
      if (res.ok) return json;
      const msg = (json.error?.message ?? text.slice(0, 300)) || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new AIProviderError("ai.authFailed", msg, false, res.status);
      if (res.status === 404 || /model/i.test(json.error?.code ?? "") || /model.*(not|invalid|unknown|unsupported)/i.test(msg)) {
        throw new AIProviderError("ai.modelRejected", msg, false, res.status);
      }
      if (res.status === 400 || res.status === 422) throw new AIProviderError("ai.providerError", msg, false, res.status);
      lastError = new AIProviderError(res.status === 429 ? "ai.rateLimited" : "ai.providerError", msg, true, res.status);
      if (attempt < this.maxRetries) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 20) * 1000 : 1000 * 2 ** attempt);
      }
    }
    throw lastError ?? new AIProviderError("ai.providerError", "unknown error", true);
  }

  private usageOf(r: ChatResponse): AIUsage {
    const u = { inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0 };
    return { ...u, estimatedCostMicros: this.estimateCost(u) };
  }

  /** Builds the opening messages; instructions go in the user turn unless the system role is enabled. */
  private opening(system: string | undefined, prompt: string, images: AIImage[]): ChatMessage[] {
    if (!system) return [{ role: "user", content: this.content(prompt, images) }];
    if (this.systemRole) return [{ role: "system", content: system }, { role: "user", content: this.content(prompt, images) }];
    return [{ role: "user", content: this.content(`<instructions>\n${system}\n</instructions>\n\n${prompt}`, images) }];
  }

  private content(prompt: string, images: AIImage[]): ChatContent {
    if (!images.length) return prompt;
    return [{ type: "text", text: prompt }, ...images.map((i) => ({ type: "image_url" as const, image_url: { url: `data:${i.mime};base64,${i.base64}` } }))];
  }

  async generateText(req: { system?: string; prompt: string; maxTokens?: number }) {
    const messages = this.opening(req.system, req.prompt, []);
    const r = await this.call({ model: this.model, messages, max_tokens: req.maxTokens ?? 200 });
    return { text: r.choices?.[0]?.message?.content ?? "", usage: this.usageOf(r), model: r.model ?? this.model };
  }

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>> {
    const system = `${req.system}

Output format: reply with ONE JSON object and nothing else (no prose, no markdown). It must validate against this JSON Schema:
${schemaForPrompt(req.schema)}`;
    let images = this.vision ? (req.images ?? []) : [];
    let imagesIgnored = Boolean(req.images?.length) && !this.vision;
    const messages: ChatMessage[] = this.opening(system, req.prompt, images);
    const base = { model: this.model, max_tokens: req.maxTokens ?? 8000, ...(this.jsonMode ? { response_format: { type: "json_object" } } : {}) };
    const usage: AIUsage = { inputTokens: 0, outputTokens: 0, estimatedCostMicros: null };
    const add = (u: AIUsage) => {
      usage.inputTokens += u.inputTokens;
      usage.outputTokens += u.outputTokens;
      usage.estimatedCostMicros = u.estimatedCostMicros != null ? (usage.estimatedCostMicros ?? 0) + u.estimatedCostMicros : usage.estimatedCostMicros;
    };

    let r: ChatResponse;
    try {
      r = await this.call({ ...base, messages });
    } catch (e) {
      // Non-vision model: the provider rejects image parts with 400 (uncharged). Retry text-only and say so.
      if (images.length && e instanceof AIProviderError && e.httpStatus === 400 && /image|vision|multimodal/i.test(e.message)) {
        log("warn", "ai.tokenportal.vision_rejected", { model: this.model });
        images = [];
        imagesIgnored = true;
        messages.splice(0, messages.length, ...this.opening(system, req.prompt, []));
        r = await this.call({ ...base, messages });
      } else throw e;
    }
    add(this.usageOf(r));

    // Validate; on failure give the model exactly one chance to repair its own output.
    for (let attempt = 0; attempt < 2; attempt++) {
      const choice = r.choices?.[0];
      if (choice?.message?.refusal) throw new AIProviderError("ai.refused", choice.message.refusal, false);
      const raw = choice?.message?.content ?? "";
      let problem: string;
      try {
        const parsed = req.schema.safeParse(extractJsonObject(raw));
        if (parsed.success) return { data: parsed.data, usage, model: r.model ?? this.model, imagesIgnored };
        problem = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e);
      }
      if (choice?.finish_reason === "length" || attempt === 1) throw new AIProviderError("ai.invalidOutput", `Invalid structured output: ${problem}`, true);
      messages.push({ role: "assistant", content: raw.slice(0, 20_000) }, { role: "user", content: `That reply did not validate (${problem}). Reply again with only the corrected JSON object.` });
      r = await this.call({ ...base, messages });
      add(this.usageOf(r));
    }
    throw new AIProviderError("ai.invalidOutput", "unreachable", true);
  }
}
