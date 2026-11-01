import { getDb } from "@/lib/db";
import { consumeDownload } from "@/lib/commerce/downloads";
import { readAssetBytes } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

/** Protected digital delivery: entitlement + verified PAID order required; usage is counted atomically. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!rateLimit(`dl:${token}`, 20, 60 * 60 * 1000).ok) return new Response("Too many requests", { status: 429 });
  const r = await consumeDownload(await getDb(), token);
  if (!r.ok) return new Response(`Download unavailable (${r.reason})`, { status: r.reason === "invalid" ? 404 : 403 });
  const bytes = await readAssetBytes(r.asset.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": r.asset.mime,
      "Content-Disposition": `attachment; filename="${r.asset.originalName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
