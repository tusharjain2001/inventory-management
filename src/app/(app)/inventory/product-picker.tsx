"use client";

import { EntityPicker, type PickerOption } from "@/components/common/entity-picker";
import { formatQty } from "@/lib/format";
import type { ProductRow } from "@/app/(app)/products/types";

/** Product search for inventory forms; the dropdown shows SKU and showroom stock. */
export function ProductPicker({
  value,
  selected,
  onChange,
  invalid,
  disabled,
}: {
  value: number | null;
  selected: ProductRow | null;
  onChange: (product: ProductRow | null) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <EntityPicker<ProductRow>
      endpoint="/api/products"
      params={{ active: "true" }}
      value={value}
      selectedLabel={selected ? `${selected.name} (${selected.sku})` : undefined}
      onChange={(o: PickerOption<ProductRow> | null) => onChange(o?.raw ?? null)}
      toOption={(p) => ({
        value: p.id,
        label: p.name,
        sub: `${p.sku} · Stock ${formatQty(p.currentStock)}${p.onDisplayStock > 0 ? ` (+${formatQty(p.onDisplayStock)} on display)` : ""}`,
        raw: p,
      })}
      placeholder="Choose product"
      searchPlaceholder="Search name or SKU…"
      invalid={invalid}
      disabled={disabled}
    />
  );
}

/** Source of a ledger row → link to the document page, when there is one. */
export function refHref(refType: string | null, refId: number | null) {
  if (!refType || !refId) return null;
  if (refType === "StockIn") return `/inventory/stock-in/${refId}`;
  if (refType === "DisplayIssue") return `/inventory/display/${refId}`;
  if (refType === "SalesOrder") return `/sales/orders/${refId}`;
  return null;
}
