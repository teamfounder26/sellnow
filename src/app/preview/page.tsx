import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getStorefront, markDraftViewed } from "@/lib/storefront/service";
import { appUrl } from "@/lib/http";
import { PreviewShell } from "@/components/website/PreviewShell";

export const metadata = { title: "Website preview" };

/** Draft preview with the SellNow top bar (status, device toggle, edit, publish, dashboard). */
export default async function PreviewPage() {
  const { db, workspace, role } = await requireWorkspace("viewer");
  const sf = await getStorefront(db, workspace.id);
  if (!sf) redirect("/onboarding");
  if (sf.status === "GENERATING" || sf.status === "FAILED") redirect("/onboarding");
  await markDraftViewed(db, workspace.id);
  return (
    <PreviewShell
      status={sf.status}
      hasLive={Boolean(sf.publishedVersionId)}
      liveUrl={`${await appUrl()}/s/${sf.slug}`}
      canPublish={role === "owner" || role === "admin"}
      salesMode={sf.draftContent.salesMode ?? "checkout"}
    />
  );
}
