import { eq } from "drizzle-orm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { businessProfiles, products, workspaces } from "@/lib/db/schema";
import { getOrCreateWizard, listInputs, listSources, wizardJob, profileCategory, foundProducts, CRITICAL_FIELDS } from "@/lib/onboarding/wizard";
import { getPlan } from "@/lib/billing/plans";
import { getStorefront } from "@/lib/storefront/service";
import { isAIConfigured } from "@/lib/ai/provider";
import { transcriptionConfigured } from "@/lib/ai/transcribe";
import { creditBalance } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { websiteTypesFor, recommendWebsiteType, WEBSITE_TYPES, isWebsiteType } from "@/lib/website/types";
import { detectDesignPreset } from "@/lib/website/design";
import { OnboardingWizard, type WizardProps } from "@/components/onboarding/OnboardingWizard";
import { EnsureWorkspace } from "@/components/onboarding/EnsureWorkspace";
import { Logo } from "@/components/brand/Logo";

export const metadata = { title: "Build your business" };

export default async function OnboardingPage() {
  const ctx = await getWorkspaceContext("viewer");
  const locale = await getLocale();
  if (!ctx.workspace) {
    return (
      <div className="ambient min-h-dvh">
        <header className="flex h-16 items-center px-4 sm:px-6">
          <Logo href="/" />
        </header>
        <EnsureWorkspace />
      </div>
    );
  }
  const { db, workspace, user } = ctx;
  const c = { db, workspaceId: workspace.id, userId: user.id, locale };
  const s = await getOrCreateWizard(c);
  const [inputs, sources, profile, prods, storefront, aiConfigured, credits, research, generation, ws] = await Promise.all([
    listInputs(db, workspace.id, s.id),
    listSources(db, workspace.id, s.id),
    db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, workspace.id) }),
    db.query.products.findMany({ where: eq(products.workspaceId, workspace.id) }),
    getStorefront(db, workspace.id),
    isAIConfigured(),
    creditBalance(db, workspace.id),
    wizardJob(c, s, "research"),
    wizardJob(c, s, "generation"),
    db.query.workspaces.findFirst({ where: eq(workspaces.id, workspace.id) }),
  ]);

  const found = await foundProducts(c, s);
  const category = ws?.category ?? (profile ? profileCategory(profile.fields) : null);
  const recommendedOut = (research?.output.prepare_profile as { recommended?: { type: string; reason: string } | null } | undefined)?.recommended ?? null;
  let options: WizardProps["store"] = null;
  if (category) {
    const rule = recommendWebsiteType(category, prods.filter((p) => p.status !== "archived").length);
    const aiPick = recommendedOut && isWebsiteType(recommendedOut.type) && WEBSITE_TYPES[recommendedOut.type].categories.includes(category) ? recommendedOut : null;
    const f = profile?.fields ?? {};
    const nicheText = [f.business_name?.value, f.short_description?.value, f.product_name?.value, f.description?.value].filter(Boolean).join(" ");
    options = {
      category,
      recommended: aiPick ? { id: aiPick.type, reason: aiPick.reason, byAI: true } : { id: rule.id, reasonKey: rule.reasonKey, byAI: false },
      types: websiteTypesFor(category).map((t) => ({ id: t.id, layout: t.layout, modules: t.modules, availability: t.availability })),
      preset: detectDesignPreset(category, nicheText),
    };
  }

  const jobView = (j: typeof research) => (j ? { id: j.id, status: j.status, stage: j.stage, stages: j.stages, error: j.error } : null);

  return (
    <OnboardingWizard
      session={{ id: s.id, stage: s.stage, ideaText: s.ideaText, links: s.links.map((l) => l.url), noLinks: s.noLinks, websiteType: s.websiteType, lastError: s.lastError, suggestedCategory: s.suggestedCategory, question: s.pendingQuestions[0]?.question ?? null }}
      inputs={inputs.map((i) => ({ id: i.id, kind: i.kind, status: i.status, name: String(i.meta.name ?? ""), text: i.text, error: i.error, assetId: i.kind === "image" ? i.assetId : null, durationSec: typeof i.meta.durationSec === "number" ? i.meta.durationSec : undefined }))}
      sources={sources.map((x) => ({ url: x.url, platform: x.platform, status: x.status, title: x.title }))}
      profile={profile ? { fields: profile.fields, faq: profile.faq.map(({ q, a }) => ({ q, a })), confirmed: Boolean(profile.confirmedAt) } : null}
      critical={CRITICAL_FIELDS}
      found={{ products: found, maxProducts: getPlan(ws?.plan ?? "free").entitlements.maxProducts, existing: prods.filter((p) => p.status !== "archived").map((p) => p.name) }}
      store={options}
      storefront={storefront ? { slug: storefront.slug, status: storefront.status } : null}
      jobs={{ research: jobView(research), generation: jobView(generation) }}
      ai={{ configured: aiConfigured, stt: transcriptionConfigured(), credits, costs: { research: CREDIT_COSTS["onboarding.identify"] + CREDIT_COSTS["onboarding.profileGen"], website: CREDIT_COSTS["storefront.generate"] } }}
      userName={user.name.split(" ")[0] ?? user.name}
    />
  );
}
