import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { integrations } from "@/lib/db/schema";

/** The seller's selected Meta Pixel id (public by design) for storefront tracking, if any. */
export async function storefrontPixelId(db: DB, workspaceId: string): Promise<string | null> {
  const row = await db.query.integrations.findFirst({ where: and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, "meta")) });
  const id = (row?.publicConfig as { pixelId?: string } | undefined)?.pixelId;
  return id && /^\d{5,20}$/.test(id) ? id : null;
}
