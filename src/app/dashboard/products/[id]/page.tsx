import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getProduct } from "@/lib/products/service";
import { assets } from "@/lib/db/schema";
import { senToInput } from "@/lib/money";
import { SectionHeader } from "@/components/ui";
import { ProductForm } from "@/components/products/ProductForm";
import { AppError } from "@/lib/errors";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, workspace } = await requireWorkspace("viewer");
  const { t } = await getT();
  const p = await getProduct(db, workspace.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const file = p.attributes.digitalAssetId ? await db.query.assets.findFirst({ where: eq(assets.id, p.attributes.digitalAssetId) }) : null;
  return (
    <>
      <SectionHeader title={p.name} sub={t(`categories.${p.type}`)} />
      <ProductForm
        id={p.id}
        initial={{
          type: p.type,
          name: p.name,
          description: p.description,
          price: senToInput(p.priceSen),
          compareAt: senToInput(p.compareAtSen),
          sku: p.sku ?? "",
          weightG: p.weightG != null ? String(p.weightG) : "",
          trackStock: p.trackStock,
          stock: String(p.stock),
          status: p.status,
          fulfillment: p.attributes.fulfillment ?? "",
          shippingFlat: senToInput(p.attributes.shippingFlatSen),
          digitalAssetId: p.attributes.digitalAssetId ?? null,
          digitalAssetName: file?.originalName ?? null,
          downloadLimit: String(p.attributes.downloadLimit ?? 5),
          downloadExpiryDays: String(p.attributes.downloadExpiryDays ?? 7),
          serviceScope: p.attributes.serviceScope ?? "",
          serviceDuration: p.attributes.serviceDuration ?? "",
          imageAssetId: p.imageAssetId,
          variants: p.variants.map((x) => ({ id: x.id, name: x.name, sku: x.sku ?? "", price: senToInput(x.priceSen), stock: String(x.stock) })),
        }}
      />
    </>
  );
}
