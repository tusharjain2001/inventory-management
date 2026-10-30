"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { useSession } from "@/components/session-provider";
import { useMeta } from "@/hooks/use-meta";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/format";
import { PendingPhotos, ProductPhotos, uploadProductPhotos } from "./product-photos";
import type { ProductDetail } from "./types";

type FormState = {
  name: string;
  sku: string;
  categoryId: string;
  subCategoryId: string;
  material: string;
  size: string;
  weight: string;
  weightUnit: string;
  colour: string;
  description: string;
  purchasePrice: string;
  sellingPrice: string;
  minSellingPrice: string;
  discountAllowed: boolean;
  hsnCode: string;
  taxType: string;
  gstRate: string;
  cessRate: string;
  taxInclusive: boolean;
  reorderLevel: string;
  reorderQuantity: string;
  preferredSupplierId: string;
  sourceType: "PURCHASED" | "CONSIGNMENT";
  isActive: boolean;
  openingStock: string;
  openingUnitCost: string;
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function ProductForm({ product }: { product?: ProductDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const { data: meta } = useMeta();
  const isEdit = !!product;
  const canViewCost = can("products.viewCost");
  const canEditCost = can("products.editCost") || !isEdit;
  const readOnly = isEdit ? !can("products.edit") : !can("products.create");

  const [form, setForm] = useState<FormState>(() => ({
    name: s(product?.name),
    sku: s(product?.sku),
    categoryId: s(product?.categoryId),
    subCategoryId: s(product?.subCategoryId),
    material: s(product?.material),
    size: s(product?.size),
    weight: s(product?.weight),
    weightUnit: s(product?.weightUnit) || "kg",
    colour: s(product?.colour),
    description: s(product?.description),
    purchasePrice: s(product?.purchasePrice ?? ""),
    sellingPrice: s(product?.sellingPrice ?? ""),
    minSellingPrice: s(product?.minSellingPrice),
    discountAllowed: product?.discountAllowed ?? true,
    hsnCode: s(product?.hsnCode),
    taxType: product?.taxType ?? "GST",
    gstRate: s(product?.gstRate ?? ""),
    cessRate: s(product?.cessRate ?? 0),
    taxInclusive: product?.taxInclusive ?? false,
    reorderLevel: s(product?.reorderLevel ?? ""),
    reorderQuantity: s(product?.reorderQuantity ?? 0),
    preferredSupplierId: s(product?.preferredSupplierId),
    sourceType: product?.sourceType ?? "PURCHASED",
    isActive: product?.isActive ?? true,
    openingStock: "",
    openingUnitCost: "",
  }));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const consignment = form.sourceType === "CONSIGNMENT";

  // Fill defaults from settings once they load (new products only).
  const [defaultsApplied, setDefaultsApplied] = useState(isEdit);
  if (!defaultsApplied && meta) {
    setDefaultsApplied(true);
    setForm((f) => ({
      ...f,
      gstRate: f.gstRate || String(meta.tax.defaultGstRate),
      taxInclusive: meta.tax.pricesTaxInclusive,
      reorderLevel: f.reorderLevel || String(meta.inventory.defaultReorderLevel),
      openingStock: String(meta.inventory.defaultOpeningStock),
    }));
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const subCategories = meta?.categories.find((c) => String(c.id) === form.categoryId)?.subCategories ?? [];
  const gst = Number(form.gstRate) || 0;
  const purchase = Number(form.purchasePrice) || 0;
  const selling = Number(form.sellingPrice) || 0;
  const margin = selling > 0 && purchase > 0 ? ((selling - purchase) / selling) * 100 : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      ...form,
      categoryId: form.categoryId,
      subCategoryId: form.subCategoryId || null,
      preferredSupplierId: form.preferredSupplierId || null,
      weight: form.weight || null,
      weightUnit: form.weight ? form.weightUnit : null,
      minSellingPrice: form.minSellingPrice || null,
      purchasePrice: form.purchasePrice || 0,
      reorderLevel: form.reorderLevel || 0,
      reorderQuantity: form.reorderQuantity || 0,
      cessRate: form.cessRate || 0,
      gstRate: form.taxType === "GST" ? form.gstRate || 0 : 0,
      openingStock: form.openingStock || 0,
      openingUnitCost: form.openingUnitCost || null,
    };
    try {
      if (isEdit) {
        await api.patch(`/api/products/${product.id}`, payload);
        toast.success("Product updated");
        qc.invalidateQueries({ queryKey: ["product", product.id] });
        qc.invalidateQueries({ queryKey: ["products"] });
      } else {
        const created = await api.post<{ id: number }>("/api/products", payload);
        if (photos.length) {
          try {
            await uploadProductPhotos(created.id, photos);
          } catch (err) {
            toast.error(`Product saved, but the photos did not upload: ${errorMessage(err)}. Add them again on the product page.`);
          }
        }
        toast.success("Product created");
        qc.invalidateQueries({ queryKey: ["products"] });
        router.push(`/products/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset disabled={readOnly} className="space-y-4">
        <FormSection title="Basic Information">
          <FormGrid>
            <Field label="Product Name" required htmlFor="name" error={errors.name} className="sm:col-span-2">
              <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required />
            </Field>
            <Field label="SKU / Product Code" required htmlFor="sku" error={errors.sku} hint="Must be unique">
              <Input id="sku" value={form.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} required className="font-mono" />
            </Field>
            <Field label="Category" required error={errors.categoryId}>
              <SimpleSelect
                value={form.categoryId}
                onChange={(v) => setForm((f) => ({ ...f, categoryId: v, subCategoryId: "" }))}
                options={(meta?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Choose Category"
                invalid={!!errors.categoryId}
              />
            </Field>
            <Field label="Sub-Category" error={errors.subCategoryId}>
              <SimpleSelect
                value={form.subCategoryId}
                onChange={(v) => set("subCategoryId", v)}
                options={subCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder={subCategories.length ? "Choose Sub-Category" : "None available"}
                clearLabel="None"
                disabled={!subCategories.length}
              />
            </Field>
            <Field label="Material" htmlFor="material">
              <Input id="material" value={form.material} onChange={(e) => set("material", e.target.value)} placeholder="e.g. Sheesham wood" />
            </Field>
            <Field label="Size" htmlFor="size">
              <Input id="size" value={form.size} onChange={(e) => set("size", e.target.value)} placeholder="e.g. 120 × 60 × 75 cm" />
            </Field>
            <Field label="Weight" error={errors.weight}>
              <div className="flex gap-2">
                <Input type="number" step="0.001" min="0" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
                <SimpleSelect
                  className="w-20"
                  value={form.weightUnit}
                  onChange={(v) => set("weightUnit", v)}
                  options={[
                    { value: "g", label: "g" },
                    { value: "kg", label: "kg" },
                  ]}
                />
              </div>
            </Field>
            <Field label="Colour" htmlFor="colour">
              <Input id="colour" value={form.colour} onChange={(e) => set("colour", e.target.value)} />
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2 lg:col-span-3">
              <Textarea id="description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Photos">{isEdit ? <ProductPhotos product={product} /> : <PendingPhotos files={photos} onChange={setPhotos} />}</FormSection>

        <FormSection title="Pricing" description="Selling below the minimum price (or below cost) needs a user with price-override permission.">
          <FormGrid cols={4}>
            {canViewCost && (
              <Field
                label={consignment ? "Supplier Price (₹)" : "Purchase Price (₹)"}
                required
                error={errors.purchasePrice}
                hint={!canEditCost ? "You cannot change this" : consignment ? "Paid to the supplier per piece sold" : undefined}
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.purchasePrice}
                  onChange={(e) => set("purchasePrice", e.target.value)}
                  disabled={!canEditCost}
                />
              </Field>
            )}
            <Field label="Selling Price (₹)" required error={errors.sellingPrice} hint={margin !== null && canViewCost ? `Margin ${margin.toFixed(1)}%` : undefined}>
              <Input type="number" step="0.01" min="0" value={form.sellingPrice} onChange={(e) => set("sellingPrice", e.target.value)} required />
            </Field>
            {canViewCost && (
              <Field label="Minimum Selling Price (₹)" error={errors.minSellingPrice}>
                <Input type="number" step="0.01" min="0" value={form.minSellingPrice} onChange={(e) => set("minSellingPrice", e.target.value)} />
              </Field>
            )}
            <Field label="Discount Allowed">
              <div className="flex h-9 items-center">
                <Switch checked={form.discountAllowed} onCheckedChange={(v) => set("discountAllowed", v)} />
              </div>
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="GST / Tax">
          <FormGrid cols={4}>
            <Field label="HSN / SAC Code" htmlFor="hsn" error={errors.hsnCode}>
              <Input id="hsn" value={form.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} placeholder="e.g. 9403" />
            </Field>
            <Field label="Tax Type">
              <SimpleSelect
                value={form.taxType}
                onChange={(v) => set("taxType", v)}
                options={[
                  { value: "GST", label: "GST" },
                  { value: "EXEMPT", label: "Exempt" },
                  { value: "NIL_RATED", label: "Nil Rated" },
                  { value: "ZERO_RATED", label: "Zero Rated" },
                ]}
              />
            </Field>
            {form.taxType === "GST" && (
              <>
                <Field
                  label="GST Rate"
                  error={errors.gstRate}
                  hint={`CGST ${gst / 2}% + SGST ${gst / 2}% within state, or IGST ${gst}% outside`}
                >
                  <SimpleSelect
                    value={form.gstRate}
                    onChange={(v) => set("gstRate", v)}
                    options={(meta?.tax.gstSlabs ?? [0, 5, 18, 40]).map((r) => ({ value: String(r), label: `${r}%` }))}
                  />
                </Field>
                <Field label="Cess %" error={errors.cessRate}>
                  <Input type="number" step="0.01" min="0" value={form.cessRate} onChange={(e) => set("cessRate", e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Prices Include GST" hint="Selling price already includes tax">
              <div className="flex h-9 items-center">
                <Switch checked={form.taxInclusive} onCheckedChange={(v) => set("taxInclusive", v)} />
              </div>
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Stock">
          <FormGrid cols={4}>
            {!isEdit && (
              <>
                <Field label="Opening Stock" error={errors.openingStock} hint="Quantity in hand today">
                  <Input type="number" step="1" min="0" value={form.openingStock} onChange={(e) => set("openingStock", e.target.value)} />
                </Field>
                {canViewCost && (
                  <Field label="Opening Cost per Unit (₹)" hint="Defaults to the purchase price">
                    <Input type="number" step="0.01" min="0" value={form.openingUnitCost} onChange={(e) => set("openingUnitCost", e.target.value)} />
                  </Field>
                )}
              </>
            )}
            <Field label="Reorder Level" error={errors.reorderLevel} hint="Low-stock alert at or below this">
              <Input type="number" step="1" min="0" value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} />
            </Field>
            <Field label="Reorder Quantity" error={errors.reorderQuantity} hint="Suggested quantity to buy">
              <Input type="number" step="1" min="0" value={form.reorderQuantity} onChange={(e) => set("reorderQuantity", e.target.value)} />
            </Field>
            <Field label="Stock Type" hint={consignment ? "Supplier is paid after it sells" : "Bought and owned by the showroom"}>
              <SimpleSelect
                value={form.sourceType}
                onChange={(v) => set("sourceType", v as FormState["sourceType"])}
                options={[
                  { value: "PURCHASED", label: "Purchased" },
                  { value: "CONSIGNMENT", label: "Consignment" },
                ]}
              />
            </Field>
            <Field label={consignment ? "Consignment Supplier" : "Preferred Supplier"} required={consignment} error={errors.preferredSupplierId}>
              <SimpleSelect
                value={form.preferredSupplierId}
                onChange={(v) => set("preferredSupplierId", v)}
                options={(meta?.suppliers ?? []).map((sp) => ({ value: String(sp.id), label: sp.name }))}
                clearLabel={consignment ? undefined : "None"}
                placeholder={consignment ? "Choose Supplier" : "None"}
                invalid={!!errors.preferredSupplierId}
              />
            </Field>
            {isEdit && (
              <Field label="Active" hint="Inactive products cannot be sold">
                <div className="flex h-9 items-center">
                  <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
                </div>
              </Field>
            )}
          </FormGrid>
          {isEdit && (
            <p className="mt-3 text-xs text-muted-foreground">
              Stock quantities change only through stock-in, sales, adjustments and damaged/lost entries, so every change is on record.
            </p>
          )}
        </FormSection>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isEdit && selling > 0 && (
            <span className="mr-auto text-sm text-muted-foreground">
              Price with GST: {formatINR(form.taxInclusive ? selling : selling * (1 + gst / 100))}
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save Changes" : "Create Product"}
          </Button>
        </div>
      )}
    </form>
  );
}
