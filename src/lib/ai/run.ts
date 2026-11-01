import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { DB } from "@/lib/db";
import { aiGenerations, aiCreditLedger } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { CREDIT_COSTS, type AITask } from "@/lib/billing/plans";
import { creditBalance, lockWorkspace, refundGeneration } from "@/lib/billing/credits";
import { getAIProvider, AIProviderError, type StructuredRequest } from "./provider";

export type GenerationOutcome<T> = { generationId: string; data: T; model: string; imagesIgnored?: boolean };

/**
 * Runs one metered, recorded AI generation:
 *  1. reserve credits atomically (row lock + ledger debit),
 *  2. call the provider with a schema-validated structured output,
 *  3. persist the output (versioned by generation id) or refund on failure.
 * Callers receive validated data and must still apply it through a draft → review → approve flow.
 */
export async function runGeneration<S extends z.ZodType>(
  db: DB,
  opts: { workspaceId: string; userId: string; task: AITask; input: Record<string, unknown>; request: StructuredRequest<S> },
): Promise<GenerationOutcome<z.infer<S>>> {
  const provider = await getAIProvider();
  if (!provider) throw new AppError("ai.notConfigured");
  const cost = CREDIT_COSTS[opts.task];
  const generationId = newId("gen");

  await db.transaction(async (tx) => {
    await lockWorkspace(tx, opts.workspaceId);
    const balance = await creditBalance(tx, opts.workspaceId);
    if (balance < cost) throw new AppError("credits.insufficient", { balance, cost });
    await tx.insert(aiGenerations).values({
      id: generationId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      task: opts.task,
      provider: provider.name,
      model: provider.model,
      input: opts.input,
      credits: cost,
    });
    await tx.insert(aiCreditLedger).values({
      id: newId("crd"),
      workspaceId: opts.workspaceId,
      delta: -cost,
      reason: "generation",
      generationId,
    });
  });

  try {
    const result = await provider.generateStructured(opts.request);
    // Defense in depth: validate again even though the provider parsed against the schema.
    const parsed = opts.request.schema.safeParse(result.data);
    if (!parsed.success) throw new AIProviderError("ai.invalidOutput", parsed.error.message, true);
    await db
      .update(aiGenerations)
      .set({
        status: "succeeded",
        output: parsed.data as Record<string, unknown>,
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCostMicros: result.usage.estimatedCostMicros ?? null,
        completedAt: new Date(),
      })
      .where(eq(aiGenerations.id, generationId));
    log("info", "ai.generation.succeeded", { generationId, task: opts.task, workspaceId: opts.workspaceId, provider: provider.name, ...result.usage });
    return { generationId, data: parsed.data, model: result.model, imagesIgnored: result.imagesIgnored };
  } catch (error) {
    const code = error instanceof AIProviderError ? error.code : "ai.providerError";
    await db
      .update(aiGenerations)
      .set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 1000) : String(error), completedAt: new Date() })
      .where(eq(aiGenerations.id, generationId));
    await refundGeneration(db, opts.workspaceId, generationId, cost);
    log("warn", "ai.generation.failed", { generationId, task: opts.task, code });
    throw new AppError(code);
  }
}
