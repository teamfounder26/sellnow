import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { listProducts } from "@/lib/products/service";
import { formatMYR } from "@/lib/money";
import { Badge, Card, EmptyState, LinkButton, SectionHeader } from "@/components/ui";

export default async function ProductsPage() {
  const { db, workspace } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const prods = await listProducts(db, workspace.id);
  return (
    <>
      <SectionHeader
        title={t("products.title")}
        sub={t("products.sub")}
        action={
          <LinkButton href="/dashboard/products/new">
            <Plus className="size-4" /> {t("products.new")}
          </LinkButton>
        }
      />
      {prods.length === 0 ? (
        <EmptyState icon={<Package className="size-6" />} title={t("products.empty")} body={t("products.emptyBody")} action={<LinkButton href="/onboarding" variant="dark">{t("nav.aiBuilder")}</LinkButton>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {prods.map((p) => (
            <Link key={p.id} href={`/dashboard/products/${p.id}`}>
              <Card className="h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-primary-soft to-pink">
                  {p.imageAssetId ? <img src={`/api/assets/${p.imageAssetId}`} alt="" className="h-full w-full object-cover" /> : <Package className="size-10 text-ink/25" />}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold leading-tight">{p.name}</p>
                    <Badge tone={p.status === "active" ? "success" : p.status === "archived" ? "neutral" : "yellow"}>{t(`products.status${p.status[0]!.toUpperCase()}${p.status.slice(1)}`)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{t(`categories.${p.type}`)}</p>
                  <p className="mt-3 text-lg font-extrabold">{formatMYR(p.priceSen, locale)}</p>
                  {p.trackStock && <p className="mt-1 text-xs text-muted">{p.stock > 0 ? t("products.inStock", { n: p.stock }) : t("products.outOfStock")}</p>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
