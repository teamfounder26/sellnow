import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { track } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http";

const ALLOWED = new Set(["sales_page_view", "hero_cta_click", "demo_started", "demo_prompt_submitted", "demo_website_selected", "demo_completed", "pricing_view", "pricing_plan_selected", "faq_opened", "final_cta_click"]);
const PROP_KEYS = new Set(["kind", "example", "style", "plan", "index", "location", "variant", "length"]);

/** Anonymous sales-page funnel counter. Allowlisted names and props only; no prompt text, no personal data. */
export async function POST(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  if (/bot|crawl|spider|preview|lighthouse/i.test(ua)) return NextResponse.json({ ok: true });
  if (!rateLimit(`sales:${await clientIp()}`, 120, 10 * 60 * 1000).ok) return NextResponse.json({ ok: true });
  const raw = (await req.json().catch(() => null)) as { name?: string; props?: Record<string, unknown> } | null;
  if (!raw?.name || !ALLOWED.has(raw.name)) return NextResponse.json({ ok: false }, { status: 400 });
  const props = Object.fromEntries(Object.entries(raw.props ?? {}).filter(([k, v]) => PROP_KEYS.has(k) && ["string", "number", "boolean"].includes(typeof v)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 40) : v]));
  await track(await getDb(), raw.name, { props });
  return NextResponse.json({ ok: true });
}
