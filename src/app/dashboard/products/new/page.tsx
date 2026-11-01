import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { SectionHeader } from "@/components/ui";
import { ProductForm } from "@/components/products/ProductForm";

export default async function NewProduct() {
  const { workspace } = await requireWorkspace("editor");
  const { t } = await getT();
  return (
    <>
      <SectionHeader title={t("products.new")} />
      <ProductForm
        id={null}
        initial={{
          type: workspace.category ?? "physical",
          name: "",
          description: "",
          price: "",
          compareAt: "",
          sku: "",
          weightG: "",
          trackStock: false,
          stock: "",
          status: "draft",
          fulfillment: "shipping",
          shippingFlat: "",
          digitalAssetId: null,
          digitalAssetName: null,
          downloadLimit: "5",
          downloadExpiryDays: "7",
          serviceScope: "",
          serviceDuration: "",
          imageAssetId: null,
          variants: [],
        }}
      />
    </>
  );
}
