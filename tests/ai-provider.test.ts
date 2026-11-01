import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { makeDb, makeSeller } from "./helpers";
import type { DB } from "@/lib/db";
import { TokenPortalProvider, TOKENPORTAL_DEFAULTS } from "@/lib/ai/tokenportal";
import { AIProviderError, __setAIProviderForTests, configuredProviderName, getAIProvider } from "@/lib/ai/provider";
import { extractJsonObject } from "@/lib/ai/json";
import { testAIConnection } from "@/lib/ai/connection-test";
import { runGeneration } from "@/lib/ai/run";
import { aiGenerations } from "@/lib/db/schema";
import { creditBalance } from "@/lib/billing/credits";

const schema = z.object({ status: z.literal("ok"), sum: z.number() });
type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

function mockFetch(responses: (Response | Error | ((c: Call) => Response | Promise<Response>))[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const call = { url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> };
    calls.push(call);
    const r = responses.shift();
    if (!r) throw new Error("unexpected fetch");
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(call) : r;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
const chat = (content: string, usage = { prompt_tokens: 100, completion_tokens: 20 }, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "gpt-6.1-sol", choices: [{ message: { content }, finish_reason: "stop" }], usage, ...extra }), { status: 200 });
const err = (status: number, message: string, headers: Record<string, string> = {}) => new Response(JSON.stringify({ error: { message } }), { status, headers });

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __setAIProviderForTests(undefined);
});

describe("TokenPortal configuration", () => {
  it("uses the documented base URL and exact model id by default, configurable by env", () => {
    vi.stubEnv("TOKENPORTAL_MODEL", "");
    vi.stubEnv("TOKENPORTAL_BASE_URL", "");
    expect(TOKENPORTAL_DEFAULTS).toEqual({ baseUrl: "https://tokenportal.id/v1", model: "gpt-6.1-sol" });
    expect(new TokenPortalProvider("tp-x").model).toBe("gpt-6.1-sol");
    vi.stubEnv("TOKENPORTAL_MODEL", "glm-53-flash");
    expect(new TokenPortalProvider("tp-x").model).toBe("glm-53-flash");
  });

  it("selects TokenPortal as the primary provider when its key is present", async () => {
    vi.stubEnv("TOKENPORTAL_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(configuredProviderName()).toBeNull();
    expect(await getAIProvider()).toBeNull();
    vi.stubEnv("TOKENPORTAL_API_KEY", "tp-test");
    expect(configuredProviderName()).toBe("tokenportal");
    expect((await getAIProvider())?.name).toBe("tokenportal");
  });

  it("fails clearly with missing credentials and never calls the network", async () => {
    const calls = mockFetch([]);
    await expect(new TokenPortalProvider("").generateStructured({ system: "s", prompt: "p", schema })).rejects.toMatchObject({ code: "ai.authFailed" });
    expect(calls).toHaveLength(0);
  });
});

describe("TokenPortal requests", () => {
  it("calls /chat/completions with Bearer auth and validates structured output (incl. fenced JSON)", async () => {
    const calls = mockFetch([chat('Here you go:\n```json\n{"status":"ok","sum":5}\n```')]);
    const r = await new TokenPortalProvider("tp-secret").generateStructured({ system: "sys", prompt: "2+3", schema });
    expect(r.data).toEqual({ status: "ok", sum: 5 });
    expect(r.usage).toMatchObject({ inputTokens: 100, outputTokens: 20 });
    expect(calls[0]!.url).toBe("https://tokenportal.id/v1/chat/completions");
    expect(calls[0]!.headers.Authorization).toBe("Bearer tp-secret");
    expect(calls[0]!.body.model).toBe("gpt-6.1-sol");
    const msgs = calls[0]!.body.messages as { role: string; content: string }[];
    expect(msgs.map((m) => m.role)).toEqual(["user"]); // no system role: avoids TokenPortal's ~18k-token overhead
    expect(msgs[0]!.content).toContain("<instructions>");
    expect(msgs[0]!.content).toContain('"sum"'); // JSON Schema embedded
  });

  it("asks the model to repair invalid output once, then gives up with ai.invalidOutput", async () => {
    let calls = mockFetch([chat('{"status":"ok","sum":"five"}'), chat('{"status":"ok","sum":5}')]);
    const ok = await new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema });
    expect(ok.data.sum).toBe(5);
    expect(ok.usage.inputTokens).toBe(200); // usage accumulated across the repair call
    expect(String((calls[1]!.body.messages as { content: string }[]).at(-1)!.content)).toContain("did not validate");
    calls = mockFetch([chat("not json"), chat("still not json")]);
    await expect(new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema })).rejects.toMatchObject({ code: "ai.invalidOutput" });
    expect(calls).toHaveLength(2);
  });

  it("retries rate limits (honouring Retry-After) and maps auth/model errors", async () => {
    mockFetch([err(429, "slow down", { "retry-after": "0" }), chat('{"status":"ok","sum":5}')]);
    expect((await new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema })).data.sum).toBe(5);
    mockFetch([err(429, "x", { "retry-after": "0" }), err(429, "x", { "retry-after": "0" }), err(429, "x", { "retry-after": "0" })]);
    await expect(new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema })).rejects.toMatchObject({ code: "ai.rateLimited", retryable: true });
    mockFetch([err(401, "invalid api key")]);
    await expect(new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema })).rejects.toMatchObject({ code: "ai.authFailed", retryable: false });
    mockFetch([err(404, "model gpt-x not found")]);
    await expect(new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema })).rejects.toMatchObject({ code: "ai.modelRejected" });
  });

  it("times out instead of hanging", async () => {
    vi.stubEnv("TOKENPORTAL_TIMEOUT_MS", "50");
    const hang = (c: Call) => new Promise<Response>((_, reject) => setTimeout(() => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })), 60));
    mockFetch([hang, hang, hang]);
    const p = new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema });
    await expect(p).rejects.toMatchObject({ code: "ai.timeout" });
  });

  it("sends images as data-URI image_url parts and falls back to text when the model is not vision-capable", async () => {
    const calls = mockFetch([err(400, "This model does not support image input"), chat('{"status":"ok","sum":5}')]);
    const r = await new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema, images: [{ mime: "image/png", base64: "AAAA" }] });
    const first = (calls[0]!.body.messages as { content: unknown }[]).at(-1)!.content as { type: string; image_url?: { url: string } }[];
    expect(first[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
    expect(typeof (calls[1]!.body.messages as { content: unknown }[]).at(-1)!.content).toBe("string");
    expect(r.imagesIgnored).toBe(true);
  });

  it("estimates cost only when prices are configured", async () => {
    mockFetch([chat('{"status":"ok","sum":5}', { prompt_tokens: 1000, completion_tokens: 500 })]);
    expect((await new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema })).usage.estimatedCostMicros).toBeNull();
    vi.stubEnv("TOKENPORTAL_PRICE_IN_USD_PER_MTOK", "2");
    vi.stubEnv("TOKENPORTAL_PRICE_OUT_USD_PER_MTOK", "8");
    mockFetch([chat('{"status":"ok","sum":5}', { prompt_tokens: 1000, completion_tokens: 500 })]);
    expect((await new TokenPortalProvider("tp").generateStructured({ system: "s", prompt: "p", schema })).usage.estimatedCostMicros).toBe(6000);
  });

  it("extracts JSON objects robustly", () => {
    expect(extractJsonObject('prefix {"a":"}{","b":{"c":1}} suffix')).toEqual({ a: "}{", b: { c: 1 } });
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});

describe("connection test", () => {
  it("reports every check from real responses", async () => {
    vi.stubEnv("TOKENPORTAL_API_KEY", "tp-test");
    mockFetch([chat("OK"), chat('{"status":"ok","lang":"en","sum":5}')]);
    const r = await testAIConnection();
    expect(r).toMatchObject({ provider: "tokenportal", model: "gpt-6.1-sol", ok: true });
    expect(r.checks.every((c) => c.ok === true)).toBe(true);
  });
  it("distinguishes missing key, unreachable, bad auth and rejected model", async () => {
    vi.stubEnv("TOKENPORTAL_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await testAIConnection()).checks.find((c) => c.id === "configured")?.ok).toBe(false);
    vi.stubEnv("TOKENPORTAL_API_KEY", "tp-test");
    mockFetch([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")]);
    expect((await testAIConnection()).checks.find((c) => c.id === "reachable")?.ok).toBe(false);
    mockFetch([err(401, "bad key")]);
    const auth = await testAIConnection();
    expect(auth.checks.find((c) => c.id === "authenticated")?.ok).toBe(false);
    expect(auth.ok).toBe(false);
    mockFetch([err(404, "model not found")]);
    expect((await testAIConnection()).checks.find((c) => c.id === "modelAccepted")?.ok).toBe(false);
  });
});

describe("usage & credit tracking through the metered runner", () => {
  it("records tokens/cost on success and refunds credits on provider failure (idempotently)", async () => {
    const s = await makeSeller(db);
    __setAIProviderForTests(new TokenPortalProvider("tp"));
    vi.stubEnv("TOKENPORTAL_PRICE_IN_USD_PER_MTOK", "1");
    vi.stubEnv("TOKENPORTAL_PRICE_OUT_USD_PER_MTOK", "1");
    const before = await creditBalance(db, s.workspaceId);
    mockFetch([chat('{"status":"ok","sum":5}', { prompt_tokens: 300, completion_tokens: 40 })]);
    const ok = await runGeneration(db, { workspaceId: s.workspaceId, userId: s.userId, task: "creative.text", input: {}, request: { system: "s", prompt: "p", schema } });
    const row = (await db.query.aiGenerations.findFirst({ where: eq(aiGenerations.id, ok.generationId) }))!;
    expect(row).toMatchObject({ status: "succeeded", provider: "tokenportal", inputTokens: 300, outputTokens: 40, estimatedCostMicros: 340 });
    expect(await creditBalance(db, s.workspaceId)).toBe(before - 2);

    mockFetch([err(401, "revoked")]);
    await expect(runGeneration(db, { workspaceId: s.workspaceId, userId: s.userId, task: "creative.text", input: {}, request: { system: "s", prompt: "p", schema } })).rejects.toMatchObject({ code: "ai.authFailed" });
    expect(await creditBalance(db, s.workspaceId)).toBe(before - 2); // refunded
  });
});

void AIProviderError;
