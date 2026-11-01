import { desc, eq, and } from "drizzle-orm";
import { ExternalLink, Eye, Pencil, RefreshCw, Globe } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getStorefront, listVersions } from "@/lib/storefront/service";
import { aiJobs } from "@/lib/db/schema";
import { appUrl } from "@/lib/http";
import { Badge, Card, EmptyState, LinkButton } from "@/components/ui";
import { CopyLink } from "@/components/website/CopyLink";

export const metadata = { title: "My website" };

export default async function WebsitePage() {
  const { db, workspace } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const sf = await getStorefront(db, workspace.id);
  if (!sf)
    return (
      <EmptyState icon={<Globe className="size-5" />} title={t("websitePage.emptyTitle")} body={t("websitePage.emptyBody")} action={<LinkButton href="/onboarding">{t("dash.website.create")}</LinkButton>} />
    );
  const [versions, lastJob, base] = await Promise.all([
    listVersions(db, workspace.id),
    db.query.aiJobs.findFirst({ where: and(eq(aiJobs.workspaceId, workspace.id), eq(aiJobs.kind, "website.generate")), orderBy: desc(aiJobs.createdAt) }),
    appUrl(),
  ]);
  const url = `${base}/s/${sf.slug}`;
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: workspace.timezone });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("websitePage.title")}</h1>
        <p className="mt-1 text-muted">{t("websitePage.sub")}</p>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="grid gap-0 md:grid-cols-[280px_1fr]">
          <div className="relative min-h-44 p-5" style={{ background: sf.draftTheme.background }} aria-hidden>
            <div className="h-2.5 w-20 rounded-full" style={{ background: sf.draftTheme.text, opacity: 0.2 }} />
            <div className="mt-4 h-16 rounded-xl" style={{ background: `linear-gradient(120deg, ${sf.draftTheme.primary}66, ${sf.draftTheme.accent}aa)` }} />
            <div className="mt-3 h-6 w-24 rounded-full" style={{ background: sf.draftTheme.primary }} />
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-extrabold">{workspace.name}</p>
              <Badge tone={sf.publishedVersionId ? "success" : "warning"}>{t(`website.status.${sf.status}`)}</Badge>
              {sf.websiteType && <Badge tone="blue">{t(`website.types.${sf.websiteType}.name`)}</Badge>}
              {sf.draftContent.salesMode === "enquiry" && <Badge tone="neutral">{t("publishFlow.mode.enquiry")}</Badge>}
            </div>
            {sf.publishedVersionId ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a href={url} target="_blank" rel="noreferrer" className="truncate font-mono text-sm text-primary-strong hover:underline">
                  {url}
                </a>
                <CopyLink url={url} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("websitePage.notLive")}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <LinkButton href="/preview" size="sm">
                <Eye className="size-4" /> {t("dash.website.preview")}
              </LinkButton>
              <LinkButton href="/dashboard/storefront" variant="secondary" size="sm">
                <Pencil className="size-4" /> {t("websitePage.edit")}
              </LinkButton>
              {sf.publishedVersionId && (
                <LinkButton href={url} target="_blank" variant="ghost" size="sm">
                  <ExternalLink className="size-4" /> {t("preview.viewLive")}
                </LinkButton>
              )}
              <LinkButton href="/onboarding" variant="ghost" size="sm">
                <RefreshCw className="size-4" /> {t("websitePage.changeFormat")}
              </LinkButton>
            </div>
            {lastJob?.status === "FAILED" && <p className="mt-3 text-sm text-danger">{t("websitePage.lastFailed")}</p>}
          </div>
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
        <p className="font-bold">{t("websitePage.versions")}</p>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("websitePage.noVersions")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2.5">
                <span className="font-semibold">v{v.version}</span>
                <span className="text-muted">{fmt.format(v.publishedAt)}</span>
                {v.id === sf.publishedVersionId ? <Badge tone="success">{t("websitePage.live")}</Badge> : <span />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
