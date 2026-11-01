import { z } from "zod";

/**
 * Pulls the first JSON object out of a model reply. Models sometimes wrap JSON in ``` fences or add
 * a sentence before it; anything else is rejected rather than guessed.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  if (start < 0) throw new Error("no JSON object in reply");
  // Walk braces (respecting strings) to find the matching close.
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(candidate.slice(start, i + 1));
  }
  throw new Error("unterminated JSON object in reply");
}

/** JSON Schema for a Zod schema, embedded in prompts for providers without native structured output. */
export function schemaForPrompt(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }));
}
