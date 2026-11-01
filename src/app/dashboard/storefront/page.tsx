import { eq } from "drizzle-orm";
import { Store, Sparkles } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getStorefront, listVersions } from "@/lib/storefront/service";
import { products, aiGenerations } from "@/lib/db/schema";
import { isAIConfigured } from "@/lib/ai/provider";
import { EmptyState, SectionHeader } from "@/components/ui";
import { StorefrontEditor } from "@/components/storefront/StorefrontEditor";
import { GenerateStoreButtons } from "@/components/storefront/GenerateStoreButtons";
import { appUrl } from "@/lib/http";
import { desc, and } from "drizzle-orm";

export default async function StorefrontPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t } = await getT();
  const [sf, prods, ai] = await Promise.all([getStorefront(db, workspace.id), db.query.products.findMany({ where: eq(products.workspaceId, workspace.id) }), isAIConfigured()]);
  if (!sf) {
    return (
      <>
        <SectionHeader title={t("storefront.title")} sub={t("storefront.sub")} />
        <EmptyState icon={<Store className="size-6" />} title={t("storefront.noStore")} body={prods.length ? t("storefront.noStoreBody") : t("storefront.noProducts")} action={prods.length ? <GenerateStoreButtons ai={ai} /> : undefined} />
      </>
    );
  }
  const versions = await listVersions(db, workspace.id);
  const lastGen = await db.query.aiGenerations.findFirst({ where: and(eq(aiGenerations.workspaceId, workspace.id), eq(aiGenerations.task, "storefront.generate"), eq(aiGenerations.status, "succeeded")), orderBy: desc(aiGenerations.createdAt) });
  return (
    <StorefrontEditor
      initialTab={tab === "policies" ? "policies" : "sections"}
      canPublish={role === "owner" || role === "admin"}
      canEdit={role !== "viewer"}
      aiConfigured={ai}
      generatedByAI={Boolean(lastGen && lastGen.createdAt >= sf.draftUpdatedAt)}
      storefront={{ slug: sf.slug, status: sf.status, publishedVersionId: sf.publishedVersionId, content: sf.draftContent, theme: sf.draftTheme }}
      versions={versions.map((v) => ({ id: v.id, version: v.version, publishedAt: v.publishedAt.toISOString() }))}
      products={prods.map((p) => ({ ...p, createdAt: p.createdAt, updatedAt: p.updatedAt }))}
      businessName={workspace.name}
      baseUrl={await appUrl()}
    />
  );
}
