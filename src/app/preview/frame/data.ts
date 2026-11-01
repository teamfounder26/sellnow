import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { products, productVariants } from "@/lib/db/schema";
import { getStorefront } from "@/lib/storefront/service";

/** The owner's DRAFT (never the published version) with every product it references. */
export async function loadDraft() {
  const { db, workspace } = await requireWorkspace("viewer");
  const sf = await getStorefront(db, workspace.id);
  if (!sf) redirect("/onboarding");
  const ids = sf.draftContent.productIds;
  const prods = ids.length ? await db.query.products.findMany({ where: and(eq(products.workspaceId, workspace.id), inArray(products.id, ids)) }) : [];
  const variants = ids.length ? await db.query.productVariants.findMany({ where: and(eq(productVariants.workspaceId, workspace.id), inArray(productVariants.productId, ids)) }) : [];
  return { db, workspace, sf, products: prods, variants };
}
