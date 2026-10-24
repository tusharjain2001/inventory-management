"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Plus, Save, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { EntityPicker } from "@/components/common/entity-picker";
import { useSession } from "@/components/session-provider";
import type { Meta } from "@/hooks/use-meta";
import { api, errorMessage } from "@/lib/api-client";
import { calculateOrder, round2 } from "@/lib/calc";
import { istDateString, todayIST } from "@/lib/dates";
import { formatAmount, formatINR, formatPercent, formatQty } from "@/lib/format";
import { INDIAN_STATES } from "@/lib/india";
import { cn } from "@/lib/utils";
import { NewCustomerDialog } from "../_components/customer-dialog";
import { DespatchFieldsGrid, despatchPayload, emptyDespatch, type DespatchForm } from "../_components/despatch-dialog";
import { TotalsList } from "../_components/order-summary";
import type { CustomerLite, OrderDetail, ProductLite } from "../types";

type Line = {
  key: number;
  product: ProductLite | null;
  quantity: string;
  unitPrice: string;
  discMode: "PERCENT" | "AMOUNT";
  discount: string;
  displayIssueItemId: number | null;
  outstandingQty: number | null;
};

/** Prefill from a display issue ("Potential Sales" → sale). */
export type DisplayPrefill = {
  id: number;
  displayNo: string;
  customer: CustomerLite | null;
  items: {
    id: number;
    productId: number;
    outstandingQty: number;
    product: Omit<ProductLite, "currentStock" | "discountAllowed"> & Partial<Pick<ProductLite, "currentStock" | "discountAllowed">>;
  }[];
};

let keySeq = 1;
const nextKey = () => keySeq++;
const blankLine = (): Line => ({
  key: nextKey(),
  product: null,
  quantity: "1",
  unitPrice: "",
  discMode: "PERCENT",
  discount: "",
  displayIssueItemId: null,
  outstandingQty: null,
});
const num = (v: string) => Number(v) || 0;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function withTrailingBlank(lines: Line[]) {
  const last = lines[lines.length - 1];
  return last && !last.product ? lines : [...lines, blankLine()];
}

/** Billing address from the customer record; the state alone is not an address. */
function customerAddress(c: CustomerLite) {
  if (!c.billingAddress?.trim() && !c.city?.trim()) return "";
  return [c.billingAddress, c.city, c.state, c.pincode].filter((p) => p && String(p).trim()).join(", ");
}

function focusEl(id: string, selector?: string) {
  setTimeout(() => {
    const el = document.getElementById(id);
    const target = (selector ? el?.querySelector(selector) : el) as HTMLElement | null;
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  }, 30);
}

export function OrderForm({
  meta,
  order,
  display,
  onCancel,
}: {
  meta: Meta;
  /** Editing an existing DRAFT order. */
  order?: OrderDetail;
  display?: DisplayPrefill;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, can } = useSession();
  const company = meta.company;
  const isEdit = !!order;

  const initialCustomer: CustomerLite | null = order
    ? order.customer
    : (display?.customer ?? (meta.walkInCustomer ? { ...meta.walkInCustomer, mobile: null, gstin: null, stateCode: null } : null));

  const [customer, setCustomer] = useState<CustomerLite | null>(initialCustomer);
  const [head, setHead] = useState(() => ({
    orderDate: order ? istDateString(order.orderDate) : todayIST(),
    customerPhone: order ? s(order.customerPhone) : s(initialCustomer?.mobile),
    billingAddress: order ? s(order.billingAddress) : initialCustomer ? customerAddress(initialCustomer) : "",
    shippingAddress: order ? s(order.shippingAddress) : s(initialCustomer?.shippingAddress),
    placeOfSupplyCode: order?.placeOfSupplyCode ?? (initialCustomer?.stateCode || company.stateCode),
    salespersonId: String(order?.salespersonId ?? user.id),
    paymentTermsDays: String(order?.paymentTermsDays ?? initialCustomer?.paymentTermsDays ?? meta.invoice.defaultPaymentTermsDays),
    notes: s(order?.notes),
    invDiscType: (order?.invoiceDiscountType ?? "") as "" | "PERCENT" | "AMOUNT",
    invDiscValue: order?.invoiceDiscountType ? s(order.invoiceDiscountValue) : "",
    otherChargesLabel: s(order?.otherChargesLabel),
    otherCharges: order && order.otherCharges > 0 ? s(order.otherCharges) : "",
    otherChargesGstRate: s(order?.otherChargesGstRate ?? meta.tax.otherChargesGstRate),
  }));
  const [lines, setLines] = useState<Line[]>(() => {
    if (order) {
      return withTrailingBlank(
        order.items.map((i) => ({
          key: nextKey(),
          product: i.product ?? null,
          quantity: s(i.quantity),
          unitPrice: s(i.unitPrice),
          discMode: i.discountPercent > 0 || i.discountAmount === 0 ? "PERCENT" : "AMOUNT",
          discount: i.discountPercent > 0 ? s(i.discountPercent) : i.discountAmount > 0 ? s(i.discountAmount) : "",
          displayIssueItemId: i.displayIssueItemId,
          outstandingQty: null,
        })),
      );
    }
    if (display) {
      return withTrailingBlank(
        display.items
          .filter((i) => i.outstandingQty > 0)
          .map((i) => ({
            key: nextKey(),
            product: { currentStock: 0, discountAllowed: true, ...i.product },
            quantity: s(i.outstandingQty),
            unitPrice: s(i.product.sellingPrice),
            discMode: "PERCENT",
            discount: "",
            displayIssueItemId: i.id,
            outstandingQty: i.outstandingQty,
          })),
      );
    }
    return [blankLine()];
  });
  const [despatch, setDespatch] = useState<DespatchForm>(() => emptyDespatch());
  const [showMore, setShowMore] = useState(isEdit && !!(order?.notes || order?.shippingAddress));
  const [showDespatch, setShowDespatch] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "draft" | "invoice">("");

  const displayIssueId = order?.displayIssueId ?? display?.id ?? null;
  const setH = <K extends keyof typeof head>(k: K, v: (typeof head)[K]) => setHead((h) => ({ ...h, [k]: v }));
  const isInterState = head.placeOfSupplyCode !== company.stateCode;
  const limit = user.roleKey === "ADMIN" ? 100 : user.maxDiscountPercent;

  const filled = lines.filter((l) => l.product);
  const calc = useMemo(
    () =>
      calculateOrder({
        lines: filled.map((l) => ({
          quantity: num(l.quantity),
          unitPrice: num(l.unitPrice),
          taxInclusive: l.product!.taxInclusive,
          discountPercent: l.discMode === "PERCENT" ? num(l.discount) : 0,
          discountAmount: l.discMode === "AMOUNT" ? num(l.discount) : 0,
          gstRate: l.product!.gstRate,
          cessRate: l.product!.cessRate,
          taxType: l.product!.taxType,
          hsnCode: l.product!.hsnCode,
        })),
        isInterState,
        invoiceDiscountType: head.invDiscType || null,
        invoiceDiscountValue: num(head.invDiscValue),
        otherCharges: num(head.otherCharges),
        otherChargesGstRate: num(head.otherChargesGstRate),
        roundOff: meta.invoice.roundOff,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, head, isInterState, meta.invoice.roundOff],
  );
  const resultFor = (key: number) => {
    const idx = filled.findIndex((l) => l.key === key);
    return idx >= 0 ? calc.lines[idx] : null;
  };

  function selectCustomer(c: CustomerLite | null) {
    setCustomer(c);
    if (!c) return;
    setHead((h) => ({
      ...h,
      customerPhone: s(c.mobile),
      billingAddress: customerAddress(c),
      shippingAddress: s(c.shippingAddress),
      placeOfSupplyCode: c.stateCode || company.stateCode,
      paymentTermsDays: String(c.paymentTermsDays ?? meta.invoice.defaultPaymentTermsDays),
    }));
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProduct(key: number, p: ProductLite | null) {
    setLines((ls) =>
      withTrailingBlank(
        ls.map((l) =>
          l.key === key
            ? p
              ? { ...l, product: p, unitPrice: String(p.sellingPrice), quantity: l.quantity || "1", discount: p.discountAllowed ? l.discount : "" }
              : { ...l, product: null }
            : l,
        ),
      ),
    );
    if (p) focusEl(`qty-${key}`);
  }

  function removeLine(key: number) {
    setLines((ls) => withTrailingBlank(ls.filter((l) => l.key !== key)));
  }

  /** Enter in a line's numeric fields jumps to the next line's product picker. */
  function onLineKey(e: React.KeyboardEvent, key: number) {
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const idx = lines.findIndex((l) => l.key === key);
    const next = lines[idx + 1];
    if (next) focusEl(`prod-${next.key}`, "button");
  }

  function payload() {
    return {
      orderDate: head.orderDate,
      customerId: customer?.id,
      customerPhone: head.customerPhone || null,
      billingAddress: head.billingAddress || null,
      shippingAddress: head.shippingAddress || null,
      placeOfSupplyCode: head.placeOfSupplyCode,
      salespersonId: head.salespersonId ? Number(head.salespersonId) : null,
      paymentTermsDays: head.paymentTermsDays === "" ? null : Number(head.paymentTermsDays),
      notes: head.notes || null,
      invoiceDiscountType: head.invDiscType || null,
      invoiceDiscountValue: head.invDiscType ? num(head.invDiscValue) : 0,
      otherChargesLabel: num(head.otherCharges) > 0 ? head.otherChargesLabel || null : null,
      otherCharges: num(head.otherCharges),
      otherChargesGstRate: num(head.otherChargesGstRate),
      displayIssueId,
      items: filled.map((l) => ({
        productId: l.product!.id,
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        discountPercent: l.discMode === "PERCENT" ? num(l.discount) : 0,
        discountAmount: l.discMode === "AMOUNT" ? num(l.discount) : 0,
        displayIssueItemId: l.displayIssueItemId,
      })),
    };
  }

  async function save(action: "draft" | "invoice") {
    if (busy) return;
    if (!customer) return toast.error("Choose a customer");
    if (!filled.length) return toast.error("Add at least one item");
    const bad = filled.find((l) => num(l.quantity) <= 0);
    if (bad) return toast.error(`Enter a quantity for ${bad.product!.name}`);
    setBusy(action);
    const invoice = { ...despatchPayload(despatch), invoiceDate: despatch.invoiceDate };
    try {
      let orderId: number;
      let invoiceId: number | null = null;
      let warnings: string[] = [];
      if (isEdit) {
        const res = await api.patch<{ order: { id: number }; warnings: string[] }>(`/api/sales/orders/${order.id}`, payload());
        orderId = res.order.id;
        warnings = res.warnings;
        if (action === "invoice") {
          const inv = await api.post<{ id: number }>(`/api/sales/orders/${order.id}/invoice`, invoice);
          invoiceId = inv.id;
        }
      } else {
        const res = await api.post<{ order: { id: number; orderNo: string }; invoice: { id: number; invoiceNo: string } | null; warnings: string[] }>(
          "/api/sales/orders",
          { ...payload(), action, invoice: action === "invoice" ? invoice : null },
        );
        orderId = res.order.id;
        invoiceId = res.invoice?.id ?? null;
        warnings = res.warnings;
        toast.success(res.invoice ? `Invoice ${res.invoice.invoiceNo} created` : `Draft ${res.order.orderNo} saved`);
      }
      if (isEdit) toast.success(action === "invoice" ? "Invoice created" : "Draft saved");
      // Stock warnings are only relevant for drafts; the invoice succeeded so stock was available.
      for (const w of warnings) if (action === "draft" || !w.startsWith("Only ")) toast.warning(w, { duration: 8000 });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["sales-order", orderId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["picker"] });
      if (invoiceId) router.push(`/sales/invoices/${invoiceId}`);
      else if (isEdit) onCancel?.();
      else router.push(`/sales/orders/${orderId}`);
    } catch (err) {
      toast.error(errorMessage(err), { duration: 8000 });
    } finally {
      setBusy("");
    }
  }

  function onFormKey(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      save("invoice");
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      save("draft");
    }
  }

  const userOptions = meta.users.map((u) => ({ value: String(u.id), label: u.name }));
  if (!userOptions.some((o) => o.value === String(user.id))) userOptions.unshift({ value: String(user.id), label: user.name });

  return (
    <form onSubmit={(e) => e.preventDefault()} onKeyDown={onFormKey} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {display && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-800">
            Converting display <span className="font-medium">{display.displayNo}</span> to a sale. Lines are prefilled with the quantity still out on display.
          </div>
        )}

        <FormSection title="Customer">
          <FormGrid cols={3}>
            <Field label="Customer" required className="sm:col-span-2">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                <EntityPicker<CustomerLite>
                  endpoint="/api/customers"
                  value={customer?.id}
                  selectedLabel={customer?.name}
                  allowClear={false}
                  placeholder="Choose Customer"
                  searchPlaceholder="Name, mobile, GSTIN…"
                  toOption={(c) => ({
                    value: c.id,
                    label: c.name,
                    sub: [c.mobile, c.gstin, c.city].filter(Boolean).join(" · ") || c.code,
                    raw: c,
                  })}
                  onChange={(o) => selectCustomer(o?.raw ?? null)}
                />
                </div>
                {can("customers.create") && (
                  <Button type="button" variant="outline" onClick={() => setNewCustomerOpen(true)} className="shrink-0">
                    <UserPlus /> <span className="hidden sm:inline">New</span>
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Mobile" hint="Optional">
              <Input value={head.customerPhone} onChange={(e) => setH("customerPhone", e.target.value)} inputMode="tel" />
            </Field>
            <Field
              label="Place of Supply"
              hint={isInterState ? "Inter-state: IGST" : "Intra-state: CGST + SGST"}
              className="sm:col-span-2 lg:col-span-1"
            >
              <SimpleSelect
                value={head.placeOfSupplyCode}
                onChange={(v) => setH("placeOfSupplyCode", v)}
                options={INDIAN_STATES.map((st) => ({ value: st.code, label: `${st.name} (${st.code})` }))}
              />
            </Field>
            <Field label="Order Date">
              <Input type="date" value={head.orderDate} max={todayIST()} onChange={(e) => setH("orderDate", e.target.value)} />
            </Field>
            <Field label="Salesperson">
              <SimpleSelect value={head.salespersonId} onChange={(v) => setH("salespersonId", v)} options={userOptions} />
            </Field>
          </FormGrid>
          {customer?.gstin && <p className="mt-2 text-xs text-muted-foreground">GSTIN {customer.gstin}</p>}
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Address, payment terms, notes
          </button>
          {showMore && (
            <FormGrid cols={3} className="mt-3">
              <Field label="Billing Address" className="sm:col-span-2 lg:col-span-1">
                <Textarea rows={2} value={head.billingAddress} onChange={(e) => setH("billingAddress", e.target.value)} />
              </Field>
              <Field label="Shipping Address" className="sm:col-span-2 lg:col-span-1">
                <Textarea rows={2} value={head.shippingAddress} onChange={(e) => setH("shippingAddress", e.target.value)} placeholder="Same as billing" />
              </Field>
              <Field label="Payment Terms (Days)" hint="0 = due on invoice date">
                <Input type="number" min="0" step="1" value={head.paymentTermsDays} onChange={(e) => setH("paymentTermsDays", e.target.value)} />
              </Field>
              <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
                <Textarea rows={2} value={head.notes} onChange={(e) => setH("notes", e.target.value)} />
              </Field>
            </FormGrid>
          )}
        </FormSection>

        <FormSection title="Items">
          <div className="hidden grid-cols-[minmax(0,1fr)_64px_100px_120px_100px_28px] gap-2 px-0.5 pb-1.5 text-xs font-medium text-muted-foreground sm:grid">
            <span>Product</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate (₹)</span>
            <span>Discount</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <div className="space-y-2">
            {lines.map((l, idx) => {
              const p = l.product;
              const r = resultFor(l.key);
              const qty = num(l.quantity);
              const lowStock = p && !l.displayIssueItemId && qty > p.currentStock;
              const overDisplay = l.outstandingQty !== null && qty > l.outstandingQty;
              let effective = 0;
              if (r && r.grossAmount > 0) {
                const rate = p!.taxType === "GST" ? p!.gstRate + p!.cessRate : 0;
                const share = p!.taxInclusive ? r.invoiceDiscountShare * (1 + rate / 100) : r.invoiceDiscountShare;
                effective = ((r.discountAmount + share) / r.grossAmount) * 100;
              }
              const overLimit = effective > limit + 0.005;
              return (
                <div
                  key={l.key}
                  className={cn(
                    "grid grid-cols-6 items-start gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_64px_100px_120px_100px_28px] sm:border-0 sm:p-0",
                    !p && "opacity-90",
                  )}
                >
                  <div className="col-span-6 min-w-0 sm:col-span-1" id={`prod-${l.key}`}>
                    <EntityPicker<ProductLite>
                      endpoint="/api/products"
                      params={{ active: "true" }}
                      value={p?.id}
                      selectedLabel={p ? `${p.name} (${p.sku})` : undefined}
                      disabled={!!l.displayIssueItemId}
                      allowClear={false}
                      placeholder={idx === lines.length - 1 ? "Add product…" : "Choose Product"}
                      searchPlaceholder="Name, SKU or HSN"
                      toOption={(row) => ({
                        value: row.id,
                        label: row.name,
                        sub: `${row.sku} · ${formatINR(row.sellingPrice)} · Stock ${formatQty(row.currentStock)}`,
                        raw: row,
                      })}
                      onChange={(o) => pickProduct(l.key, o?.raw ?? null)}
                    />
                    {p && (
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span>HSN {p.hsnCode ?? "—"}</span>
                        <span>{p.taxType === "GST" ? `GST ${formatPercent(p.gstRate)}` : p.taxType}</span>
                        {p.taxInclusive && <span>price incl. tax</span>}
                        {l.displayIssueItemId ? (
                          <span className={cn("text-violet-700", overDisplay && "font-medium text-red-600")}>
                            From display · {formatQty(l.outstandingQty)} out
                          </span>
                        ) : (
                          <span className={cn(lowStock && "font-medium text-amber-700")}>
                            {lowStock ? `Only ${formatQty(p.currentStock)} in stock` : `Stock ${formatQty(p.currentStock)}`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={cn("col-span-2 sm:col-span-1", !p && "hidden sm:block")}>
                    <span className="mb-1 block text-[11px] text-muted-foreground sm:hidden">Qty</span>
                    <Input
                      id={`qty-${l.key}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={l.quantity}
                      disabled={!p}
                      onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                      onKeyDown={(e) => onLineKey(e, l.key)}
                      aria-invalid={lowStock || overDisplay || undefined}
                      className="text-right"
                    />
                  </div>
                  <div className={cn("col-span-2 sm:col-span-1", !p && "hidden sm:block")}>
                    <span className="mb-1 block text-[11px] text-muted-foreground sm:hidden">Rate (₹)</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={l.unitPrice}
                      disabled={!p}
                      onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                      onKeyDown={(e) => onLineKey(e, l.key)}
                      className="text-right"
                    />
                    {p && num(l.unitPrice) !== p.sellingPrice && (
                      <div className="mt-1 text-right text-[11px] text-muted-foreground">List {formatAmount(p.sellingPrice)}</div>
                    )}
                  </div>
                  <div className={cn("col-span-2 sm:col-span-1", !p && "hidden sm:block")}>
                    <span className="mb-1 block text-[11px] text-muted-foreground sm:hidden">Discount</span>
                    <div className="flex">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={l.discount}
                        disabled={!p || !p.discountAllowed}
                        placeholder={p && !p.discountAllowed ? "Not allowed" : "0"}
                        onChange={(e) => updateLine(l.key, { discount: e.target.value })}
                        onKeyDown={(e) => onLineKey(e, l.key)}
                        aria-invalid={overLimit || undefined}
                        className="rounded-r-none text-right"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-10 shrink-0 rounded-l-none border-l-0 px-0"
                        disabled={!p || !p.discountAllowed}
                        onClick={() => updateLine(l.key, { discMode: l.discMode === "PERCENT" ? "AMOUNT" : "PERCENT", discount: "" })}
                        title="Switch between % and ₹"
                      >
                        {l.discMode === "PERCENT" ? "%" : "₹"}
                      </Button>
                    </div>
                    {overLimit && <div className="mt-1 text-[11px] font-medium text-red-600">{effective.toFixed(1)}% · your limit {limit}%</div>}
                  </div>
                  <div className={cn("col-span-5 text-right sm:col-span-1", !p && "hidden sm:block")}>
                    <span className="mb-1 block text-[11px] text-muted-foreground sm:hidden">Amount</span>
                    <div className="flex h-9 items-center justify-end font-medium tabular-nums">
                      {r ? formatAmount(round2(r.taxableValue + r.invoiceDiscountShare)) : "—"}
                    </div>
                    {r && r.lineTotal > 0 && <div className="text-[11px] text-muted-foreground">incl. GST {formatAmount(r.lineTotal)}</div>}
                  </div>
                  <div className="col-span-1 flex justify-end sm:pt-0.5">
                    {p && (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(l.key)} aria-label="Remove line">
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {filled.length} item{filled.length === 1 ? "" : "s"} · Enter moves to the next line
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
              <Plus /> Add Line
            </Button>
          </div>
        </FormSection>

        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <button
            type="button"
            className="flex w-full items-center gap-1 text-left text-sm font-semibold"
            onClick={() => setShowDespatch((v) => !v)}
          >
            {showDespatch ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Invoice details
            <span className="ml-1 hidden text-xs font-normal text-muted-foreground sm:inline">(invoice date, e-Way bill, despatch — optional)</span>
          </button>
          {showDespatch && (
            <div className="mt-4">
              <DespatchFieldsGrid form={despatch} onChange={setDespatch} withDate />
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-3 self-start lg:sticky lg:top-20">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label="Invoice Discount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={head.invDiscValue}
                onChange={(e) => {
                  setH("invDiscValue", e.target.value);
                  if (!head.invDiscType && e.target.value) setH("invDiscType", "PERCENT");
                }}
                placeholder="0"
                className="text-right"
              />
            </Field>
            <SimpleSelect
              className="w-20"
              value={head.invDiscType || "PERCENT"}
              onChange={(v) => setH("invDiscType", v as "PERCENT" | "AMOUNT")}
              options={[
                { value: "PERCENT", label: "%" },
                { value: "AMOUNT", label: "₹" },
              ]}
            />
          </div>
          <div className="mb-1.5 text-[13px] font-medium">Other Charges</div>
          <div className="mb-3 grid grid-cols-[1fr_88px_72px] items-end gap-2">
            <Input
              value={head.otherChargesLabel}
              onChange={(e) => setH("otherChargesLabel", e.target.value)}
              placeholder="e.g. Delivery"
              aria-label="Other Charges Label"
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={head.otherCharges}
              onChange={(e) => setH("otherCharges", e.target.value)}
              placeholder="₹ 0"
              className="text-right"
              aria-label="Other Charges Amount"
            />
            <SimpleSelect
              value={head.otherChargesGstRate}
              onChange={(v) => setH("otherChargesGstRate", v)}
              options={meta.tax.gstSlabs.map((r) => ({ value: String(r), label: `${r}%` }))}
            />
          </div>
          <div className="border-t pt-2">
            <TotalsList
              t={{
                ...calc,
                otherChargesLabel: head.otherChargesLabel,
                isInterState,
                invoiceDiscountLabel: head.invDiscType === "PERCENT" ? `Invoice discount (${formatPercent(num(head.invDiscValue))})` : undefined,
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isInterState ? "Inter-state supply — IGST" : "Intra-state supply — CGST + SGST"} · Place of supply{" "}
            {INDIAN_STATES.find((st) => st.code === head.placeOfSupplyCode)?.name}
          </p>
        </div>
        <div className="grid gap-2">
          <Button type="button" size="lg" onClick={() => save("invoice")} disabled={!!busy} className="h-11">
            <FileText /> {busy === "invoice" ? "Creating invoice…" : "Save & Invoice"}
          </Button>
          <Button type="button" variant="outline" onClick={() => save("draft")} disabled={!!busy}>
            <Save /> {busy === "draft" ? "Saving…" : isEdit ? "Save Changes" : "Save Draft"}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={!!busy}>
              Cancel
            </Button>
          )}
          <p className="hidden text-center text-[11px] text-muted-foreground sm:block">Ctrl+Enter: Save &amp; Invoice · Ctrl+S: Save draft</p>
        </div>
      </aside>

      <NewCustomerDialog
        open={newCustomerOpen}
        onOpenChange={setNewCustomerOpen}
        defaultStateCode={company.stateCode}
        onCreated={(c) => {
          selectCustomer(c);
          qc.invalidateQueries({ queryKey: ["picker", "/api/customers"] });
        }}
      />
    </form>
  );
}
