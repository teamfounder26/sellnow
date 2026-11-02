import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { posterProjects, posters, products } from "@/lib/db/schema";
import { isAIConfigured } from "@/lib/ai/provider";
import { imageGenerationConfigured } from "@/lib/ai/image";
import { creditBalance } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { availableObjectives, confirmedTestimonials } from "@/lib/ads/strategy";
import { formatMYR } from "@/lib/money";
import { POSTER_OBJECTIVES } from "./options";
import { libraryView, projectView } from "./service";
import { getActiveJob } from "@/lib/jobs/runner";
import { asset, specFor, type PosterData, type ProductOpt, type ProjectData, type StudioEnv } from "@/components/posters/types";
import type { LibraryRow } from "@/components/posters/PosterLibrary";

/** Everything the Poster Studio tab renders, shaped for the client components. */
export async function posterStudioData(db: DB, workspaceId: string, locale: "ms" | "en", q: { project?: string; product?: string; theme?: string; status?: string }) {
  const [prods, ai, credits, quotes] = await Promise.all([
    db.query.products.findMany({ where: and(eq(products.workspaceId, workspaceId), ne(products.status, "archived")) }),
    isAIConfigured(),
    creditBalance(db, workspaceId),
    confirmedTestimonials(db, workspaceId),
  ]);
  const productOpts: ProductOpt[] = await Promise.all(
    prods.map(async (p) => {
      const avail = await availableObjectives(db, workspaceId, p);
      return { id: p.id, name: p.name, priceSen: p.priceSen, description: p.description ?? "", imageAssetId: p.imageAssetId, allowed: POSTER_OBJECTIVES.filter((o) => (o === "sales" ? avail.sales : o === "traffic" || o === "leads" ? avail.live : true)) };
    }),
  );
  const env: Omit<StudioEnv, "canEdit"> = { aiConfigured: ai, imageConfigured: imageGenerationConfigured(), credits, costs: { brief: CREDIT_COSTS["poster.brief"], image: CREDIT_COSTS["poster.image"] }, testimonials: quotes.length, locale };

  let project: ProjectData | null = null;
  if (q.project) {
    const v = await projectView(db, workspaceId, q.project).catch(() => null);
    if (v) {
      project = {
        id: v.project.id,
        productId: v.project.productId,
        status: v.project.status,
        briefBy: v.project.briefBy,
        settings: v.project.settings,
        intel: v.project.intel,
        brief: v.project.brief,
        posters: v.posters.map(
          (p): PosterData => ({
            id: p.id,
            idx: p.idx,
            theme: p.theme,
            angle: p.angle,
            style: p.style,
            ratio: p.ratio,
            status: p.status,
            copy: p.copy,
            prompt: p.prompt,
            promptEdited: p.promptEdited,
            currentVersionId: p.currentVersionId,
            adId: p.adId,
            adStatus: p.adId ? (v.ads[p.adId] ?? null) : null,
            versions: v.versions.filter((x) => x.posterId === p.id).map((x) => ({ id: x.id, version: x.version, kind: x.kind, textMode: x.textMode, status: x.status, artAssetId: x.artAssetId, imageAssetId: x.imageAssetId, copy: x.copy, style: x.style, error: x.error, credits: x.credits, createdAt: x.createdAt.toISOString() })),
          }),
        ),
      };
    }
  }

  const rows = await libraryView(db, workspaceId, { productId: q.product, theme: q.theme, status: q.status });
  const projIds = [...new Set(rows.map((r) => r.poster.projectId))];
  const projects = projIds.length ? await db.query.posterProjects.findMany({ where: and(eq(posterProjects.workspaceId, workspaceId), inArray(posterProjects.id, projIds)) }) : [];
  const library: LibraryRow[] = rows.map((r) => {
    const pr = projects.find((x) => x.id === r.poster.projectId);
    const v = r.current;
    const spec =
      pr && v && !v.imageAssetId
        ? specFor(
            { id: pr.id, productId: pr.productId, status: pr.status, briefBy: pr.briefBy, settings: pr.settings, intel: pr.intel, brief: pr.brief, posters: [] },
            { idx: r.poster.idx, ratio: r.poster.ratio, theme: r.poster.theme } as PosterData,
            { id: v.id, version: v.version, kind: v.kind, textMode: v.textMode, status: v.status, artAssetId: v.artAssetId, imageAssetId: v.imageAssetId, copy: v.copy, style: v.style, error: v.error, credits: v.credits, createdAt: v.createdAt.toISOString() },
            formatMYR(pr.brief.product.priceSen, locale),
            r.product?.name ?? "",
          )
        : null;
    return {
      id: r.poster.id,
      projectId: r.poster.projectId,
      productName: r.product?.name ?? "—",
      theme: r.poster.theme,
      status: r.status as LibraryRow["status"],
      ratio: r.poster.ratio,
      headline: (v?.copy ?? r.poster.copy).headline,
      createdAt: r.poster.createdAt.toISOString(),
      versionCount: r.versionCount,
      promptEdited: r.poster.promptEdited,
      imageUrl: asset(v?.imageAssetId),
      spec,
      adId: r.poster.adId,
      performance: r.performance,
    };
  });
  const hasAny = Boolean(library.length || q.product || q.theme || q.status) || Boolean((await db.select({ id: posters.id }).from(posters).where(eq(posters.workspaceId, workspaceId)).limit(1)).length);
  const active = await getActiveJob(db, workspaceId, "poster.brief");
  const jobIn = active?.input as { projectId?: string; mode?: "create" | "regenerate" } | undefined;
  // Resume polling after a refresh: on the project page only for that project; on the start page only for a new project.
  const activeJob = active && jobIn?.projectId && (q.project ? jobIn.projectId === q.project : jobIn.mode === "create") ? { id: active.id, projectId: jobIn.projectId, mode: jobIn.mode ?? "create" } : null;
  return { env, products: productOpts, project, library, hasAny, activeJob };
}
