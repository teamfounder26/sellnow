import type { z } from "zod";

export type AIImage = { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export type StructuredRequest<T extends z.ZodType> = {
  system: string;
  prompt: string;
  images?: AIImage[];
  schema: T;
  maxTokens?: number;
};

export type AIUsage = { inputTokens: number; outputTokens: number; estimatedCostMicros?: number | null };

export type StructuredResult<T> = {
  data: T;
  usage: AIUsage;
  model: string;
  /** Set when the provider/model rejected image input and the request was answered from text only. */
  imagesIgnored?: boolean;
};

/** Provider-independent contract for structured generation. */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>>;
  /** Plain text completion — used by the connectivity test. Optional for fakes. */
  generateText?(req: { system?: string; prompt: string; maxTokens?: number }): Promise<{ text: string; usage: AIUsage; model: string }>;
}

export type AIErrorCode =
  | "ai.rateLimited"
  | "ai.providerError"
  | "ai.invalidOutput"
  | "ai.refused"
  | "ai.authFailed"
  | "ai.timeout"
  | "ai.modelRejected"
  | "ai.unreachable";

/** Errors a provider may raise, mapped to user-facing i18n keys. */
export class AIProviderError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

let override: AIProvider | null | undefined;

/** Test hook: inject a fake provider (or null to simulate "not configured"). */
export function __setAIProviderForTests(p: AIProvider | null | undefined) {
  override = p;
}

/** Which provider the environment selects. TokenPortal is SellNow's primary provider. */
export function configuredProviderName(): "tokenportal" | "anthropic" | null {
  if (process.env.TOKENPORTAL_API_KEY) return "tokenportal";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export async function getAIProvider(): Promise<AIProvider | null> {
  if (override !== undefined) return override;
  switch (configuredProviderName()) {
    case "tokenportal": {
      const { TokenPortalProvider } = await import("./tokenportal");
      return new TokenPortalProvider();
    }
    case "anthropic": {
      const { AnthropicProvider } = await import("./anthropic");
      return new AnthropicProvider();
    }
    default:
      return null;
  }
}

export async function isAIConfigured(): Promise<boolean> {
  return (await getAIProvider()) !== null;
}
