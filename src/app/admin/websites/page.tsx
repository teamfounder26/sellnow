import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { storefronts, workspaces } from "@/lib/db/schema";
import { Panel, Status, Table, dt } from "@/components/admin/ui";

export const metadata = { title: "Websites" };

export default async function WebsitesAdmin() {
  const a = await requireAdmin("tenants.view");
  const rows = await a.db.select({ s: storefronts, name: workspaces.name }).from(storefronts).innerJoin(workspaces, eq(workspaces.id, storefronts.workspaceId)).orderBy(desc(storefronts.publishedAt)).limit(300);
  return (
    <Panel title={`Websites (${rows.length}) · ${rows.filter((r) => r.s.publishedVersionId).length} published`}>
      <Table minWidth={900} head={["Tenant", "Store", "Status", "Type", "Domain", "Published", "Last visit"]} rows={rows.map(({ s, name }) => [<Link key="t" className="text-primary" href={`/admin/tenants/${s.workspaceId}`}>{name}</Link>, <a key="s" className="text-primary" href={`/s/${s.slug}`} target="_blank" rel="noreferrer">/s/{s.slug}</a>, <Status key="st" v={s.publishedVersionId ? "published" : s.status} />, s.draftContent.websiteType ?? "—", s.customDomain ?? "—", dt(s.publishedAt), dt(s.viewedAt)])} />
    </Panel>
  );
}
