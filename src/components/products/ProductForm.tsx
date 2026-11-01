"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Notice, Select, Textarea, Badge } from "@/components/ui";
import { FileUploader } from "@/components/FileUploader";
import { useT } from "@/lib/i18n/client";
import { saveProductAction } from "@/app/actions/products";
import { CATEGORIES, ENGINES, type Category } from "@/lib/categories";

export type ProductFormValue = {
  type: Category;
  name: string;
  description: string;
  price: string;
  compareAt: string;
  sku: string;
  weightG: string;
  trackStock: boolean;
  stock: string;
  status: "draft" | "active" | "archived";
  fulfillment: "" | "shipping" | "pickup" | "both";
  shippingFlat: string;
  digitalAssetId: string | null;
  digitalAssetName: string | null;
  downloadLimit: string;
  downloadExpiryDays: string;
  serviceScope: string;
  serviceDuration: string;
  imageAssetId: string | null;
  variants: { id?: string; name: string; sku: string; price: string; stock: string }[];
};

export function ProductForm({ id, initial }: { id: string | null; initial: ProductFormValue }) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof ProductFormValue>(k: K, val: ProductFormValue[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setSaved(false);
  };
  const fe = (k: string) => (fieldErrors[k] ? t(fieldErrors[k]!) : undefined);
  const mode = ENGINES[v.type].checkout;

  const submit = () =>
    start(async () => {
      setError(null);
      setFieldErrors({});
      const r = await saveProductAction(id, {
        type: v.type,
        name: v.name,
        description: v.description,
        price: v.price,
        compareAt: v.compareAt || undefined,
        sku: v.sku || undefined,
        weightG: v.weightG || undefined,
        trackStock: v.trackStock,
        stock: v.stock || undefined,
        status: v.status,
        fulfillment: v.fulfillment || undefined,
        shippingFlat: v.shippingFlat || undefined,
        digitalAssetId: v.digitalAssetId ?? undefined,
        downloadLimit: v.downloadLimit || undefined,
        downloadExpiryDays: v.downloadExpiryDays || undefined,
        serviceScope: v.serviceScope || undefined,
        serviceDuration: v.serviceDuration || undefined,
        imageAssetId: v.imageAssetId ?? undefined,
        variants: v.variants.map((x) => ({ id: x.id, name: x.name, sku: x.sku || undefined, price: x.price, stock: x.stock || undefined })),
      });
      if (r.ok) {
        setSaved(true);
        if (!id) router.push(`/dashboard/products/${r.data.id}`);
        else router.refresh();
      } else {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {error && <Notice tone="danger">{t(error, { max: 3 })}</Notice>}
        <Card className="space-y-4 p-5 sm:p-6">
          <Field label={t("products.type")} required>
            <Select value={v.type} disabled={Boolean(id)} onChange={(e) => set("type", e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`categories.${c}`)}</option>
              ))}
            </Select>
          </Field>
          <Notice tone={mode === "full" ? "success" : mode === "enquiry" ? "ai" : "warning"}>
            {t("products.checkoutMode")}: <b>{t(`categories.checkout${mode === "full" ? "Full" : mode === "enquiry" ? "Enquiry" : "Unsupported"}`)}</b>
          </Notice>
          <Field label={t("products.name")} required error={fe("name")} htmlFor="p-name">
            <Input id="p-name" value={v.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={t("products.description")} htmlFor="p-desc">
            <Textarea id="p-desc" rows={5} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("products.price")} required error={fe("price")} htmlFor="p-price">
              <Input id="p-price" inputMode="decimal" placeholder="19.90" value={v.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label={t("products.compareAt")} hint={t("products.compareAtHelp")} error={fe("compareAt")} htmlFor="p-cmp">
              <Input id="p-cmp" inputMode="decimal" value={v.compareAt} onChange={(e) => set("compareAt", e.target.value)} />
            </Field>
          </div>
        </Card>

        {v.type === "physical" && (
          <Card className="space-y-4 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("products.fulfillment")} required error={fe("fulfillment")}>
                <Select value={v.fulfillment} onChange={(e) => set("fulfillment", e.target.value as ProductFormValue["fulfillment"])}>
                  <option value="">—</option>
                  <option value="shipping">{t("facts.fulfillmentShipping")}</option>
                  <option value="pickup">{t("facts.fulfillmentPickup")}</option>
                  <option value="both">{t("facts.fulfillmentBoth")}</option>
                </Select>
              </Field>
              <Field label={t("products.shippingFlat")} error={fe("shippingFlat")}>
                <Input inputMode="decimal" value={v.shippingFlat} onChange={(e) => set("shippingFlat", e.target.value)} />
              </Field>
              <Field label={t("products.weight")} error={fe("weightG")}>
                <Input inputMode="numeric" value={v.weightG} onChange={(e) => set("weightG", e.target.value)} />
              </Field>
              <Field label={t("products.sku")}>
                <Input value={v.sku} onChange={(e) => set("sku", e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={v.trackStock} onChange={(e) => set("trackStock", e.target.checked)} className="size-4 accent-ink" />
              {t("products.trackStock")}
            </label>
            {v.trackStock && v.variants.length === 0 && (
              <Field label={t("products.stock")} error={fe("stock")}>
                <Input inputMode="numeric" value={v.stock} onChange={(e) => set("stock", e.target.value)} />
              </Field>
            )}
            <div>
              <p className="text-sm font-semibold">{t("products.variants")}</p>
              <p className="text-[13px] text-muted">{t("products.variantsHelp")}</p>
              <div className="mt-3 space-y-2">
                {v.variants.map((x, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_80px_auto] gap-2">
                    <Input placeholder={t("products.variantName")} value={x.name} onChange={(e) => set("variants", v.variants.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                    <Input placeholder="RM" inputMode="decimal" value={x.price} onChange={(e) => set("variants", v.variants.map((y, j) => (j === i ? { ...y, price: e.target.value } : y)))} />
                    <Input placeholder={t("products.stock")} inputMode="numeric" value={x.stock} onChange={(e) => set("variants", v.variants.map((y, j) => (j === i ? { ...y, stock: e.target.value } : y)))} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => set("variants", v.variants.filter((_, j) => j !== i))} aria-label={t("common.remove")}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                {fe("variants") && <p className="text-sm text-danger">{fe("variants")}</p>}
                <Button type="button" variant="secondary" size="sm" onClick={() => set("variants", [...v.variants, { name: "", sku: "", price: v.price, stock: "0" }])}>
                  <Plus className="size-4" /> {t("products.addVariant")}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {v.type === "digital" && (
          <Card className="space-y-4 p-5 sm:p-6">
            <Field label={t("products.digitalFile")} hint={t("products.digitalFileHelp")} error={fe("digitalAssetId")}>
              <FileUploader
                kind="digital_file"
                accept="application/pdf,application/zip,application/epub+zip,audio/mpeg,video/mp4"
                value={v.digitalAssetId}
                label={v.digitalAssetName}
                onChange={(id2, name) => {
                  set("digitalAssetId", id2);
                  set("digitalAssetName", name ?? null);
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("products.downloadLimit")}>
                <Input inputMode="numeric" value={v.downloadLimit} onChange={(e) => set("downloadLimit", e.target.value)} />
              </Field>
              <Field label={t("products.downloadExpiry")}>
                <Input inputMode="numeric" value={v.downloadExpiryDays} onChange={(e) => set("downloadExpiryDays", e.target.value)} />
              </Field>
            </div>
          </Card>
        )}

        {v.type !== "physical" && v.type !== "digital" && (
          <Card className="space-y-4 p-5 sm:p-6">
            <Field label={t("products.serviceScope")} required={v.type === "service"} error={fe("serviceScope")}>
              <Textarea value={v.serviceScope} onChange={(e) => set("serviceScope", e.target.value)} />
            </Field>
            <Field label={t("products.serviceDuration")}>
              <Input value={v.serviceDuration} onChange={(e) => set("serviceDuration", e.target.value)} />
            </Field>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card className="space-y-4 p-5">
          <Field label={t("products.status")}>
            <Select value={v.status} onChange={(e) => set("status", e.target.value as ProductFormValue["status"])}>
              <option value="draft">{t("products.statusDraft")}</option>
              <option value="active">{t("products.statusActive")}</option>
              <option value="archived">{t("products.statusArchived")}</option>
            </Select>
          </Field>
          <Field label={t("products.image")}>
            <FileUploader kind="image" accept="image/jpeg,image/png,image/webp" value={v.imageAssetId} onChange={(id2) => set("imageAssetId", id2)} />
          </Field>
          <Button className="w-full" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("common.save")}
          </Button>
          {saved && <Badge tone="success">{id ? t("products.updated") : t("products.created")}</Badge>}
        </Card>
      </div>
    </div>
  );
}
