import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AIProviderError, type AIProvider, type StructuredRequest, type StructuredResult } from "./provider";

const DEFAULT_MODEL = "claude-opus-5-5";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model = process.env.SELLNOW_AI_MODEL || DEFAULT_MODEL;
  private client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Explicit base URL so an unrelated ANTHROPIC_BASE_URL in the environment is never picked up.
    baseURL: process.env.SELLNOW_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    timeout: 120_000,
    maxRetries: 2,
  });

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...(req.images ?? []).map(
        (img): Anthropic.Beta.BetaContentBlockParam => ({
          type: "image",
          source: { type: "base64", media_type: img.mime, data: img.base64 },
        }),
      ),
      { type: "text", text: req.prompt },
    ];
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: req.maxTokens ?? 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(req.schema) },
        system: req.system,
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") {
        throw new AIProviderError("ai.refused", "Model declined the request", false);
      }
      if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
        throw new AIProviderError("ai.invalidOutput", `Unparseable output (stop_reason=${response.stop_reason})`, true);
      }
      return {
        data: response.parsed_output as z.infer<T>,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        model: response.model,
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new AIProviderError("ai.authFailed", error.message, false);
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new AIProviderError("ai.rateLimited", error.message, true);
      }
      if (error instanceof Anthropic.BadRequestError) {
        throw new AIProviderError("ai.providerError", error.message, false);
      }
      if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError) {
        throw new AIProviderError("ai.providerError", error.message, true);
      }
      throw new AIProviderError("ai.invalidOutput", String(error), true);
    }
  }
}
