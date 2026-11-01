import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { readAssetBytes } from "@/lib/storage";

/** Serves PUBLIC assets only (product/storefront images). Private digital files are never served here. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await (await getDb()).query.assets.findFirst({ where: eq(assets.id, id) });
  if (!a || a.visibility !== "public" || a.kind !== "image") return new Response("Not found", { status: 404 });
  const bytes = await readAssetBytes(a.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": a.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
