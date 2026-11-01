import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { listCampaigns, listCreatives, metaStatus } from "@/lib/marketing/service";
import { products } from "@/lib/db/schema";
import { getPlan } from "@/lib/billing/plans";
import { Notice, SectionHeader } from "@/components/ui";
import { CampaignManager } from "@/components/marketing/CampaignManager";

export default async function MarketingPage() {
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t } = await getT();
  const [prods, camps, crs, meta] = await Promise.all([db.query.products.findMany({ where: eq(products.workspaceId, workspace.id) }), listCampaigns(db, workspace.id), listCreatives(db, workspace.id), metaStatus(db, workspace.id)]);
  return (
    <>
      <SectionHeader title={t("marketing.title")} sub={t("marketing.sub")} />
      {!getPlan(workspace.plan).entitlements.marketing && <Notice tone="yellow" className="mb-4">{t("marketing.lockedPlan")}</Notice>}
      <CampaignManager
        canEdit={role !== "viewer"}
        canApprove={role === "owner" || role === "admin"}
        meta={meta}
        products={prods.map((p) => ({ id: p.id, name: p.name }))}
        creatives={crs.filter((c) => c.status === "approved").map((c) => ({ id: c.id, label: `${c.type} · ${c.createdAt.toISOString().slice(0, 10)}`, productId: c.productId }))}
        campaigns={camps.map((c) => ({ id: c.id, name: c.name, objective: c.objective, status: c.status, dailyBudgetSen: c.dailyBudgetSen, durationDays: c.durationDays, approvedBudgetSen: c.approvedBudgetSen, lastError: c.lastError }))}
      />
    </>
  );
}
