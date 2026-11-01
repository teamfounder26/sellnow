import "server-only";
import { z } from "zod";
import { AIProviderError, configuredProviderName, getAIProvider } from "./provider";

export type CheckId = "configured" | "reachable" | "authenticated" | "modelAccepted" | "textResponse" | "structuredOutput";
export type Check = { id: CheckId; ok: boolean | null; detail?: string };
export type ConnectionReport = { provider: string | null; model: string | null; ok: boolean; checks: Check[]; latencyMs?: number; testedAt: string };

const probeSchema = z.object({ status: z.literal("ok"), lang: z.enum(["en", "ms"]), sum: z.number() });

/**
 * Real end-to-end connectivity test (server-side). Every check is derived from an actual provider
 * response — nothing is marked as passing unless the provider answered. Spends a few tokens.
 */
export async function testAIConnection(): Promise<ConnectionReport> {
  const testedAt = new Date().toISOString();
  const providerName = configuredProviderName();
  const checks: Check[] = [
    { id: "configured", ok: null },
    { id: "reachable", ok: null },
    { id: "authenticated", ok: null },
    { id: "modelAccepted", ok: null },
    { id: "textResponse", ok: null },
    { id: "structuredOutput", ok: null },
  ];
  const set = (id: CheckId, ok: boolean, detail?: string) => Object.assign(checks.find((c) => c.id === id)!, { ok, detail });
  const provider = await getAIProvider();
  if (!provider) {
    set("configured", false, "TOKENPORTAL_API_KEY is not set on the server");
    return { provider: providerName, model: null, ok: false, checks, testedAt };
  }
  set("configured", true, provider.name);

  const started = Date.now();
  try {
    if (!provider.generateText) throw new Error("provider has no text endpoint");
    const r = await provider.generateText({ prompt: "Reply with exactly the word OK.", maxTokens: 20 });
    set("reachable", true);
    set("authenticated", true);
    set("modelAccepted", true, r.model);
    set("textResponse", /\bok\b/i.test(r.text), r.text.slice(0, 80) || "(empty reply)");
  } catch (e) {
    const err = e instanceof AIProviderError ? e : null;
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    if (!err || err.code === "ai.unreachable" || err.code === "ai.timeout") set("reachable", false, detail);
    else {
      set("reachable", true);
      if (err.code === "ai.authFailed") set("authenticated", false, detail);
      else {
        set("authenticated", true);
        if (err.code === "ai.modelRejected") set("modelAccepted", false, `${provider.model}: ${detail}`);
        else set("textResponse", false, detail);
      }
    }
    return { provider: provider.name, model: provider.model, ok: false, checks, latencyMs: Date.now() - started, testedAt };
  }

  try {
    const s = await provider.generateStructured({
      system: "You are a connectivity probe.",
      // Wording matters on TokenPortal: an earlier phrasing was consistently billed ~22.5k prompt tokens vs ~4.3k for this one.
      prompt: 'Return status "ok", lang "en", and the sum of 2 and 3.',
      schema: probeSchema,
      maxTokens: 200,
    });
    set("structuredOutput", s.data.sum === 5, `sum=${s.data.sum}, tokens in/out ${s.usage.inputTokens}/${s.usage.outputTokens}`);
  } catch (e) {
    set("structuredOutput", false, (e instanceof Error ? e.message : String(e)).slice(0, 200));
  }
  return { provider: provider.name, model: provider.model, ok: checks.every((c) => c.ok === true), checks, latencyMs: Date.now() - started, testedAt };
}
