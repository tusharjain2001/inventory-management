import { z } from "zod";
import { db, Prisma, type Tx } from "@/lib/db";
import { AppError, badRequest, notFound } from "@/lib/http";
import { postStock, refreshDisplayStatus } from "@/lib/inventory";
import { nextDocNumber } from "@/lib/numbering";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import {
  calculateOrder,
  derivePaymentStatus,
  effectivePaymentStatus,
  hsnSummary,
  round2,
  taxes,
  type LineInput,
  type TaxTypeName,
} from "@/lib/calc";
import { ADMIN_ROLE_KEY, hasPermission, type SessionUser } from "@/lib/permissions";
import { addDays, dateFromInput, startOfDayIST, todayIST } from "@/lib/dates";
import { stateByCode } from "@/lib/india";
import { customerStats } from "@/lib/customers";
import { amountInWords, formatAmount, formatINR, formatQty, label } from "@/lib/format";

// Server-side sales service: orders, invoices, payments and credit notes.
// Every function that writes takes the caller's transaction client.

const D = (v: number | string | Prisma.Decimal) => new Prisma.Decimal(v);
// Stored text (audit summaries) avoids the ₹ glyph: some database encodings (e.g. WIN1252) cannot hold it.
const rs = (v: number) => `Rs. ${formatAmount(v)}`;
const n = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : typeof v === "number" ? v : v.toNumber());

// ───────────────────────── Validation ─────────────────────────

const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}/.test(v), "Invalid date");

export const PAYMENT_MODES = [
  "CASH",
  "UPI",
  "BANK_TRANSFER",
  "NEFT",
  "RTGS",
  "IMPS",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CHEQUE",
  "OTHER",
] as const;

export const orderItemSchema = z.object({
  productId: z.coerce.number().int().positive("Choose a product"),
  quantity: z.coerce.number().positive("Quantity must be more than 0"),
  unitPrice: z.coerce.number().min(0, "Price cannot be negative"),
  discountPercent: z.coerce.number().min(0).max(100, "Discount cannot be over 100%").optional().nullable(),
  discountAmount: z.coerce.number().min(0, "Discount cannot be negative").optional().nullable(),
  displayIssueItemId: z.coerce.number().int().positive().optional().nullable(),
});

export const despatchSchema = z.object({
  eWayBillNo: optText(50),
  deliveryNote: optText(100),
  supplierRef: optText(100),
  otherReferences: optText(200),
  buyersOrderNo: optText(100),
  buyersOrderDate: optDate,
  despatchDocNo: optText(100),
  despatchedThrough: optText(100),
  destination: optText(100),
  termsOfDelivery: optText(500),
});

export const invoiceActionSchema = despatchSchema.extend({ invoiceDate: optDate });

export const orderSchema = z.object({
  orderDate: optDate,
  customerId: z.coerce.number({ message: "Choose a customer" }).int().positive("Choose a customer"),
  customerPhone: optText(30),
  billingAddress: optText(1000),
  shippingAddress: optText(1000),
  placeOfSupplyCode: optText(4),
  salespersonId: z.coerce.number().int().positive().optional().nullable(),
  paymentTermsDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  notes: optText(2000),
  invoiceDiscountType: z.enum(["PERCENT", "AMOUNT"]).optional().nullable(),
  invoiceDiscountValue: z.coerce.number().min(0, "Discount cannot be negative").optional().nullable(),
  otherChargesLabel: optText(100),
  otherCharges: z.coerce.number().min(0, "Charges cannot be negative").optional().nullable(),
  otherChargesGstRate: z.coerce.number().min(0).max(100).optional().nullable(),
  displayIssueId: z.coerce.number().int().positive().optional().nullable(),
  items: z.array(orderItemSchema).min(1, "Add at least one item"),
});

export const createOrderSchema = orderSchema.extend({
  action: z.enum(["draft", "invoice"]).default("draft"),
  invoice: invoiceActionSchema.optional().nullable(),
});

export const reasonSchema = z.object({ reason: z.string({ message: "Enter a reason" }).trim().min(1, "Enter a reason").max(500) });

export const paymentSchema = z.object({
  invoiceId: z.coerce.number({ message: "Choose an invoice" }).int().positive("Choose an invoice"),
  type: z.enum(["RECEIPT", "REFUND"]).default("RECEIPT"),
  paymentDate: optDate,
  amount: z.coerce.number({ message: "Enter an amount" }).positive("Amount must be more than 0"),
  mode: z.enum(PAYMENT_MODES, { message: "Choose a payment mode" }),
  reference: optText(100),
  notes: optText(1000),
  receivedById: z.coerce.number().int().positive().optional().nullable(),
});

export const paymentUpdateSchema = paymentSchema.omit({ invoiceId: true, type: true });

export const creditNoteSchema = z.object({
  invoiceId: z.coerce.number({ message: "Choose an invoice" }).int().positive("Choose an invoice"),
  date: optDate,
  reason: z.string().trim().min(1, "Enter a reason").max(500),
  items: z
    .array(
      z.object({
        orderItemId: z.coerce.number().int().positive(),
        taxableValue: z.coerce.number().min(0, "Cannot be negative"),
      }),
    )
    .min(1, "Enter an amount to credit"),
});

export type OrderInput = z.output<typeof orderSchema>;
export type InvoiceActionInput = z.output<typeof invoiceActionSchema>;
export type PaymentInput = z.output<typeof paymentSchema>;
export type CreditNoteInput = z.output<typeof creditNoteSchema>;

// ───────────────────────── Visibility ─────────────────────────

/** Sales staff without sales.viewAll only see orders they sell or created. */
export function orderScope(user: SessionUser): Prisma.SalesOrderWhereInput {
  if (hasPermission(user, "sales.viewAll")) return {};
  return { OR: [{ salespersonId: user.id }, { createdById: user.id }] };
}

/** Accounts users (payments / credit notes) see every invoice; sales staff only their own. */
export function invoiceScope(user: SessionUser): Prisma.InvoiceWhereInput {
  if (hasPermission(user, "sales.viewAll") || hasPermission(user, "payments.view") || hasPermission(user, "creditNotes.manage")) {
    return {};
  }
  return { order: orderScope(user) };
}

/** Removes cost fields from order lines unless the user may see costs. */
export function hideItemCost<T extends { unitCost?: unknown }>(items: T[], user: SessionUser) {
  if (hasPermission(user, "products.viewCost")) return items;
  return items.map((i) => {
    const copy: Record<string, unknown> = { ...i };
    delete copy.unitCost;
    return copy as T;
  });
}

/** OVERDUE is not stored: active, unpaid/partly paid, due before today, with a balance. */
export function overdueWhere(): Prisma.InvoiceWhereInput {
  return {
    status: "ACTIVE",
    paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
    dueDate: { lt: startOfDayIST(todayIST()) },
    balanceDue: { gt: 0 },
  };
}

export function displayStatusOf(inv: {
  paymentStatus: string;
  dueDate: Date;
  balanceDue: Prisma.Decimal | number;
  status: string;
}) {
  return effectivePaymentStatus({
    paymentStatus: inv.paymentStatus as Parameters<typeof effectivePaymentStatus>[0]["paymentStatus"],
    dueDate: inv.dueDate,
    balanceDue: n(inv.balanceDue),
    status: inv.status as "ACTIVE" | "CANCELLED",
  });
}

async function lockRow(tx: Tx, table: "SalesOrder" | "Invoice" | "DisplayIssueItem" | "Payment" | "CreditNote", id: number) {
  // Table names are fixed literals above, never user input.
  await tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id = $1 FOR UPDATE`, id);
}

// ───────────────────────── Order building ─────────────────────────

function joinAddress(parts: (string | null | undefined)[]) {
  const text = parts.filter((p) => p && p.trim()).join(", ");
  return text || null;
}

type OverrideNote = { sku: string; name: string; listPrice: number; unitPrice: number; discount: number; netUnitPrice: number; reasons: string[] };

/**
 * Validates an order and recomputes every amount with calculateOrder() (client totals are ignored).
 * Enforces discount limits, discount-not-allowed products and price-override permission.
 */
async function buildOrder(tx: Tx, input: OrderInput, user: SessionUser) {
  const settings = await getSettings(tx);
  const company = settings.company;
  const warnings: string[] = [];

  const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw badRequest("Customer not found", { customerId: ["Choose a customer"] });
  if (!customer.isActive) throw badRequest(`${customer.name} is marked inactive`, { customerId: ["Customer is inactive"] });

  const posCode = input.placeOfSupplyCode || customer.stateCode || company.stateCode;
  const pos = stateByCode(posCode);
  if (!pos) throw badRequest("Choose a valid place of supply", { placeOfSupplyCode: ["Invalid state"] });
  const isInterState = posCode !== company.stateCode;

  const salespersonId = input.salespersonId ?? user.id;
  if (input.salespersonId) {
    const sp = await tx.user.findUnique({ where: { id: input.salespersonId }, select: { id: true } });
    if (!sp) throw badRequest("Salesperson not found", { salespersonId: ["Choose a salesperson"] });
  }

  const products = await tx.product.findMany({ where: { id: { in: [...new Set(input.items.map((i) => i.productId))] } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Display ("Potential Sales") conversion: lines must belong to the given display issue.
  const displayItemIds = input.items.map((i) => i.displayIssueItemId).filter((v): v is number => !!v);
  if (displayItemIds.length && !input.displayIssueId) throw badRequest("Display issue is missing for display items");
  if (input.displayIssueId) {
    const di = await tx.displayIssue.findUnique({ where: { id: input.displayIssueId }, select: { id: true } });
    if (!di) throw badRequest("Display issue not found");
  }
  const displayItems = displayItemIds.length
    ? new Map((await tx.displayIssueItem.findMany({ where: { id: { in: displayItemIds } } })).map((d) => [d.id, d]))
    : new Map();
  if (new Set(displayItemIds).size !== displayItemIds.length) throw badRequest("A display item appears on more than one line");

  const lineInputs: LineInput[] = input.items.map((it, idx) => {
    const p = byId.get(it.productId);
    if (!p || p.deletedAt) throw badRequest(`Line ${idx + 1}: product not found`);
    if (!p.isActive) throw badRequest(`${p.name} is inactive and cannot be sold`);
    if (!p.discountAllowed && ((it.discountPercent ?? 0) > 0 || (it.discountAmount ?? 0) > 0)) {
      throw badRequest(`Discount is not allowed on ${p.name}`);
    }
    if (it.displayIssueItemId) {
      const d = displayItems.get(it.displayIssueItemId);
      if (!d || d.displayIssueId !== input.displayIssueId || d.productId !== p.id) {
        throw badRequest(`Line ${idx + 1}: display item does not match this display issue`);
      }
    }
    return {
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      taxInclusive: p.taxInclusive,
      discountPercent: it.discountPercent ?? 0,
      discountAmount: it.discountAmount ?? 0,
      gstRate: n(p.gstRate),
      cessRate: n(p.cessRate),
      taxType: p.taxType as TaxTypeName,
      hsnCode: p.hsnCode,
    };
  });

  const discType = input.invoiceDiscountType ?? null;
  const discValue = discType ? (input.invoiceDiscountValue ?? 0) : 0;
  if (discType === "PERCENT" && discValue > 100) throw badRequest("Invoice discount cannot be over 100%", { invoiceDiscountValue: ["Max 100%"] });
  const otherCharges = input.otherCharges ?? 0;
  const otherChargesGstRate = input.otherChargesGstRate ?? settings.tax.otherChargesGstRate;

  const totals = calculateOrder({
    lines: lineInputs,
    isInterState,
    invoiceDiscountType: discType,
    invoiceDiscountValue: discValue,
    otherCharges,
    otherChargesGstRate,
    roundOff: settings.invoice.roundOff,
  });

  const limit = user.roleKey === ADMIN_ROLE_KEY ? 100 : user.maxDiscountPercent;
  const canOverride = hasPermission(user, "sales.priceOverride");
  const overrides: OverrideNote[] = [];

  const items = input.items.map((it, idx) => {
    const p = byId.get(it.productId)!;
    const l = lineInputs[idx];
    const r = totals.lines[idx];

    // Effective discount = item discount + share of the invoice discount, as % of the gross amount.
    if (r.grossAmount > 0) {
      const rate = l.taxType === "GST" ? l.gstRate + (l.cessRate ?? 0) : 0;
      const shareGross = p.taxInclusive ? r.invoiceDiscountShare * (1 + rate / 100) : r.invoiceDiscountShare;
      const effective = ((r.discountAmount + shareGross) / r.grossAmount) * 100;
      if (effective > limit + 0.005) {
        throw new AppError(
          403,
          `Discount on ${p.name} is ${effective.toFixed(2)}%, above your limit of ${limit}%. Ask a manager to apply it.`,
        );
      }
    }

    // Price checks: below minimum selling price, or net (ex-tax) unit price below purchase price.
    const netUnit = it.quantity > 0 ? r.taxableValue / it.quantity : 0;
    const min = p.minSellingPrice ? n(p.minSellingPrice) : 0;
    const purchase = n(p.purchasePrice);
    const reasons: string[] = [];
    if (min > 0 && it.unitPrice < min - 0.005) reasons.push("below minimum selling price");
    if (purchase > 0 && netUnit < purchase - 0.005) reasons.push("below purchase price");
    const priceOverride = reasons.length > 0;
    if (priceOverride) {
      if (!canOverride) {
        throw new AppError(403, `The price for ${p.name} is below the allowed minimum. Only a user with price override permission can sell at this price.`);
      }
      overrides.push({
        sku: p.sku,
        name: p.name,
        listPrice: n(p.sellingPrice),
        unitPrice: it.unitPrice,
        discount: round2(r.discountAmount + r.invoiceDiscountShare),
        netUnitPrice: round2(netUnit),
        reasons,
      });
    }

    if (!it.displayIssueItemId && it.quantity > n(p.currentStock)) {
      warnings.push(`Only ${formatQty(n(p.currentStock))} of ${p.name} in stock (order needs ${formatQty(it.quantity)})`);
    }

    const description = joinAddress([p.material, p.size, p.colour]);
    return {
      productId: p.id,
      sortOrder: idx,
      sku: p.sku,
      name: p.name,
      description,
      hsnCode: p.hsnCode,
      quantity: D(it.quantity),
      listPrice: p.sellingPrice,
      unitPrice: D(it.unitPrice),
      taxInclusive: p.taxInclusive,
      discountPercent: D(r.discountPercent),
      discountAmount: D(r.discountAmount),
      grossAmount: D(r.grossAmount),
      invoiceDiscountShare: D(r.invoiceDiscountShare),
      taxableValue: D(r.taxableValue),
      taxType: p.taxType,
      gstRate: p.gstRate,
      cessRate: p.cessRate,
      cgstAmount: D(r.cgstAmount),
      sgstAmount: D(r.sgstAmount),
      igstAmount: D(r.igstAmount),
      cessAmount: D(r.cessAmount),
      lineTotal: D(r.lineTotal),
      priceOverride,
      overrideById: priceOverride ? user.id : null,
      displayIssueItemId: it.displayIssueItemId ?? null,
    } satisfies Prisma.SalesOrderItemUncheckedCreateWithoutOrderInput;
  });

  // Credit limit: warn only.
  if (customer.creditLimit && !customer.isWalkIn) {
    const stats = (await customerStats([customer.id], tx)).get(customer.id);
    const outstanding = stats?.outstanding ?? 0;
    const limitAmt = n(customer.creditLimit);
    if (outstanding + totals.grandTotal > limitAmt + 0.005) {
      warnings.push(
        `Credit limit exceeded for ${customer.name}: outstanding ${formatINR(outstanding)} + this order ${formatINR(totals.grandTotal)} is above the limit of ${formatINR(limitAmt)}`,
      );
    }
  }

  const header = {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: input.customerPhone ?? customer.mobile,
    customerGstin: customer.gstin,
    billingAddress:
      input.billingAddress ??
      (customer.billingAddress || customer.city ? joinAddress([customer.billingAddress, customer.city, customer.state, customer.pincode]) : null),
    shippingAddress: input.shippingAddress ?? customer.shippingAddress,
    placeOfSupply: pos.name,
    placeOfSupplyCode: pos.code,
    isInterState,
    salespersonId,
    paymentTermsDays: input.paymentTermsDays ?? customer.paymentTermsDays ?? settings.invoice.defaultPaymentTermsDays,
    notes: input.notes,
    subtotal: D(totals.subtotal),
    itemDiscountTotal: D(totals.itemDiscountTotal),
    invoiceDiscountType: discType && discValue > 0 ? discType : null,
    invoiceDiscountValue: D(discType ? discValue : 0),
    invoiceDiscountAmount: D(totals.invoiceDiscountAmount),
    otherChargesLabel: otherCharges > 0 ? (input.otherChargesLabel ?? "Other charges") : null,
    otherCharges: D(totals.otherCharges),
    otherChargesGstRate: D(otherChargesGstRate),
    taxableTotal: D(totals.taxableTotal),
    cgstTotal: D(totals.cgstTotal),
    sgstTotal: D(totals.sgstTotal),
    igstTotal: D(totals.igstTotal),
    cessTotal: D(totals.cessTotal),
    taxTotal: D(totals.taxTotal),
    roundOff: D(totals.roundOff),
    grandTotal: D(totals.grandTotal),
    displayIssueId: input.displayIssueId ?? null,
  };

  return { header, items, overrides, warnings, totals };
}

async function auditOverrides(
  tx: Tx,
  order: { id: number; orderNo: string },
  overrides: OverrideNote[],
  user: SessionUser,
  ip: string | null,
) {
  for (const o of overrides) {
    await audit(tx, {
      userId: user.id,
      action: "OVERRIDE",
      entity: "SalesOrder",
      entityId: order.id,
      summary: `Price override on ${order.orderNo}: ${o.name} (${o.sku}) sold at ${rs(o.unitPrice)} (list ${rs(o.listPrice)}, discount ${rs(o.discount)}, net ${rs(o.netUnitPrice)}/unit) by ${user.name} — ${o.reasons.join(", ")}`,
      after: { ...o, userId: user.id, userName: user.name },
      ip,
    });
  }
}

// ───────────────────────── Orders ─────────────────────────

export async function createOrder(tx: Tx, input: OrderInput, user: SessionUser, ip: string | null) {
  const built = await buildOrder(tx, input, user);
  const orderDate = dateFromInput(input.orderDate);
  const orderNo = await nextDocNumber(tx, "order", orderDate);
  const order = await tx.salesOrder.create({
    data: { ...built.header, orderNo, orderDate, status: "DRAFT", createdById: user.id, items: { create: built.items } },
  });
  await auditOverrides(tx, order, built.overrides, user, ip);
  await audit(tx, {
    userId: user.id,
    action: "CREATE",
    entity: "SalesOrder",
    entityId: order.id,
    summary: `Created order ${orderNo} for ${order.customerName} — ${rs(built.totals.grandTotal)}`,
    after: { ...order, items: built.items },
    ip,
  });
  return { order, warnings: built.warnings };
}

export async function updateOrder(tx: Tx, id: number, input: OrderInput, user: SessionUser, ip: string | null) {
  await lockRow(tx, "SalesOrder", id);
  const before = await tx.salesOrder.findFirst({ where: { id, ...orderScope(user) }, include: { items: true } });
  if (!before) throw notFound("Order");
  if (before.status !== "DRAFT") throw badRequest(`Order ${before.orderNo} is ${label(before.status).toLowerCase()} and can no longer be edited`);
  const built = await buildOrder(tx, input, user);
  await tx.salesOrderItem.deleteMany({ where: { orderId: id } });
  const order = await tx.salesOrder.update({
    where: { id },
    data: {
      ...built.header,
      ...(input.orderDate ? { orderDate: dateFromInput(input.orderDate) } : {}),
      items: { create: built.items },
    },
  });
  await auditOverrides(tx, order, built.overrides, user, ip);
  await audit(tx, {
    userId: user.id,
    action: "UPDATE",
    entity: "SalesOrder",
    entityId: id,
    summary: `Updated draft order ${order.orderNo} — ${rs(built.totals.grandTotal)}`,
    before,
    after: { ...order, items: built.items },
    ip,
  });
  return { order, warnings: built.warnings };
}

/** DRAFT → CONFIRMED: takes the goods out of stock (display lines come back from display first). */
export async function confirmOrder(tx: Tx, id: number, user: SessionUser, ip: string | null) {
  await lockRow(tx, "SalesOrder", id);
  const order = await tx.salesOrder.findFirst({
    where: { id, ...orderScope(user) },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!order) throw notFound("Order");
  if (order.status !== "DRAFT") throw badRequest(`Order ${order.orderNo} is already ${label(order.status).toLowerCase()}`);
  if (!order.items.length) throw badRequest("Add at least one item before confirming");

  const date = order.orderDate;
  const displayIds = new Set<number>();
  for (const item of order.items) {
    const ref = { date, refType: "SalesOrder", refId: order.id, refNo: order.orderNo, userId: user.id };
    if (item.displayIssueItemId) {
      await lockRow(tx, "DisplayIssueItem", item.displayIssueItemId);
      const di = await tx.displayIssueItem.findUniqueOrThrow({
        where: { id: item.displayIssueItemId },
        include: { displayIssue: { select: { displayNo: true } } },
      });
      const outstanding = di.quantity.sub(di.returnedQty).sub(di.soldQty);
      if (item.quantity.gt(outstanding)) {
        throw badRequest(
          `Only ${formatQty(n(outstanding))} of ${item.name} is still out on display ${di.displayIssue.displayNo} (order has ${formatQty(n(item.quantity))})`,
        );
      }
      await postStock(tx, {
        ...ref,
        productId: item.productId,
        type: "DISPLAY_RETURN",
        quantity: item.quantity,
        remarks: `Sold from display ${di.displayIssue.displayNo}`,
      });
      await tx.displayIssueItem.update({ where: { id: di.id }, data: { soldQty: { increment: item.quantity } } });
      displayIds.add(di.displayIssueId);
    }
    const res = await postStock(tx, {
      ...ref,
      productId: item.productId,
      type: "SALE",
      quantity: item.quantity,
      remarks: `Sale to ${order.customerName}`,
    });
    // Consignment goods: remember which supplier is owed for this line.
    const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { sourceType: true, preferredSupplierId: true } });
    await tx.salesOrderItem.update({
      where: { id: item.id },
      data: {
        unitCost: res.unitCost.toDecimalPlaces(4),
        consignmentSupplierId: product.sourceType === "CONSIGNMENT" ? product.preferredSupplierId : null,
      },
    });
  }
  for (const did of displayIds) await refreshDisplayStatus(tx, did);

  const updated = await tx.salesOrder.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: user.id },
  });
  await audit(tx, {
    userId: user.id,
    action: "CONFIRM",
    entity: "SalesOrder",
    entityId: id,
    summary: `Confirmed order ${order.orderNo} (${order.items.length} item${order.items.length === 1 ? "" : "s"} out of stock)`,
    ip,
  });
  return updated;
}

/** Issues the tax invoice for an order (confirming it first if it is still a draft). */
export async function invoiceOrder(tx: Tx, id: number, input: InvoiceActionInput | null | undefined, user: SessionUser, ip: string | null) {
  await lockRow(tx, "SalesOrder", id);
  let order = await tx.salesOrder.findFirst({ where: { id, ...orderScope(user) }, include: { invoice: { select: { id: true } } } });
  if (!order) throw notFound("Order");
  if (order.invoice) throw badRequest(`Order ${order.orderNo} already has an invoice`);
  if (order.status === "DRAFT") {
    await confirmOrder(tx, id, user, ip);
    order = { ...order, status: "CONFIRMED" };
  }
  if (order.status !== "CONFIRMED") throw badRequest(`Order ${order.orderNo} is ${label(order.status).toLowerCase()} and cannot be invoiced`);

  const settings = await getSettings(tx);
  const invoiceDate = dateFromInput(input?.invoiceDate);
  const invoiceNo = await nextDocNumber(tx, "invoice", invoiceDate);
  const status = derivePaymentStatus({ grandTotal: n(order.grandTotal), creditNoteTotal: 0, receipts: 0, refunds: 0, cancelled: false });
  const companySnapshot = {
    ...settings.company,
    termsAndConditions: settings.invoice.termsAndConditions,
    showBankDetails: settings.invoice.showBankDetails,
  };

  const invoice = await tx.invoice.create({
    data: {
      invoiceNo,
      invoiceDate,
      orderId: order.id,
      customerId: order.customerId,
      dueDate: addDays(invoiceDate, order.paymentTermsDays),
      status: "ACTIVE",
      paymentStatus: status.paymentStatus,
      grandTotal: order.grandTotal,
      amountPaid: 0,
      creditNoteTotal: 0,
      balanceDue: D(status.balanceDue),
      companySnapshot,
      eWayBillNo: input?.eWayBillNo ?? null,
      deliveryNote: input?.deliveryNote ?? null,
      supplierRef: input?.supplierRef ?? null,
      otherReferences: input?.otherReferences ?? null,
      buyersOrderNo: input?.buyersOrderNo ?? null,
      buyersOrderDate: input?.buyersOrderDate ? dateFromInput(input.buyersOrderDate) : null,
      despatchDocNo: input?.despatchDocNo ?? null,
      despatchedThrough: input?.despatchedThrough ?? null,
      destination: input?.destination ?? null,
      termsOfDelivery: input?.termsOfDelivery ?? null,
      createdById: user.id,
    },
  });
  await tx.salesOrder.update({ where: { id }, data: { status: "INVOICED" } });
  await audit(tx, {
    userId: user.id,
    action: "INVOICE",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Issued invoice ${invoiceNo} for order ${order.orderNo} — ${order.customerName}, ${rs(n(order.grandTotal))}`,
    after: invoice,
    ip,
  });
  return invoice;
}

/**
 * Cancels an order (and its invoice). Confirmed/invoiced orders put the goods back in stock
 * at the cost they left with; display lines are marked returned to the showroom.
 */
export async function cancelOrder(tx: Tx, id: number, reason: string, user: SessionUser, ip: string | null) {
  await lockRow(tx, "SalesOrder", id);
  const order = await tx.salesOrder.findFirst({
    where: { id, ...orderScope(user) },
    include: { items: true, invoice: true },
  });
  if (!order) throw notFound("Order");
  if (order.status === "CANCELLED") throw badRequest(`Order ${order.orderNo} is already cancelled`);
  if (order.items.some((i) => i.consignmentSettlementId)) {
    throw badRequest(`The consignment supplier has already been paid for items on ${order.orderNo}, so it cannot be cancelled. Issue a credit note instead.`);
  }

  const inv = order.invoice;
  if (inv && inv.status === "ACTIVE") {
    await lockRow(tx, "Invoice", inv.id);
    const net = await netPaid(tx, inv.id);
    if (net > 0.005) {
      throw badRequest(`Invoice ${inv.invoiceNo} has ${formatINR(net)} paid. Record a refund first, then cancel.`);
    }
    const activeCn = await tx.creditNote.count({ where: { invoiceId: inv.id, status: "ACTIVE" } });
    if (activeCn) throw badRequest(`Invoice ${inv.invoiceNo} has credit notes. Cancel them first.`);
  }

  if (order.status === "CONFIRMED" || order.status === "INVOICED") {
    const displayIds = new Set<number>();
    for (const item of order.items) {
      await postStock(tx, {
        productId: item.productId,
        type: "SALE_REVERSAL",
        quantity: item.quantity,
        unitCost: item.unitCost,
        date: new Date(),
        refType: "SalesOrder",
        refId: order.id,
        refNo: order.orderNo,
        remarks: `Cancelled: ${reason}`.slice(0, 300),
        userId: user.id,
        skipNegativeCheck: true,
      });
      if (item.displayIssueItemId) {
        // The goods are back in the showroom, so they count as returned rather than still on display.
        const di = await tx.displayIssueItem.update({
          where: { id: item.displayIssueItemId },
          data: { soldQty: { decrement: item.quantity }, returnedQty: { increment: item.quantity } },
        });
        displayIds.add(di.displayIssueId);
      }
    }
    for (const did of displayIds) await refreshDisplayStatus(tx, did);
  }

  const now = new Date();
  if (inv && inv.status === "ACTIVE") {
    await tx.invoice.update({
      where: { id: inv.id },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: user.id, cancelReason: reason },
    });
    await refreshInvoiceTotals(tx, inv.id);
  }
  const updated = await tx.salesOrder.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: now, cancelledById: user.id, cancelReason: reason },
  });
  await audit(tx, {
    userId: user.id,
    action: "CANCEL",
    entity: inv ? "Invoice" : "SalesOrder",
    entityId: inv ? inv.id : id,
    summary: `Cancelled ${inv ? `invoice ${inv.invoiceNo} / ` : ""}order ${order.orderNo}${order.status !== "DRAFT" ? " — stock returned" : ""}. Reason: ${reason}`,
    before: { status: order.status, invoiceStatus: inv?.status },
    after: { status: "CANCELLED", reason },
    ip,
  });
  return updated;
}

// ───────────────────────── Invoice totals ─────────────────────────

async function netPaid(tx: Tx, invoiceId: number) {
  const rows = await tx.payment.groupBy({ by: ["type"], where: { invoiceId }, _sum: { amount: true } });
  const receipts = n(rows.find((r) => r.type === "RECEIPT")?._sum.amount);
  const refunds = n(rows.find((r) => r.type === "REFUND")?._sum.amount);
  return round2(receipts - refunds);
}

/** Recomputes amountPaid / creditNoteTotal / balanceDue / paymentStatus from payments and active credit notes. */
export async function refreshInvoiceTotals(tx: Tx, invoiceId: number) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const rows = await tx.payment.groupBy({ by: ["type"], where: { invoiceId }, _sum: { amount: true } });
  const cn = await tx.creditNote.aggregate({ where: { invoiceId, status: "ACTIVE" }, _sum: { total: true } });
  const receipts = n(rows.find((r) => r.type === "RECEIPT")?._sum.amount);
  const refunds = n(rows.find((r) => r.type === "REFUND")?._sum.amount);
  const creditNoteTotal = n(cn._sum.total);
  const s = derivePaymentStatus({
    grandTotal: n(inv.grandTotal),
    creditNoteTotal,
    receipts,
    refunds,
    cancelled: inv.status === "CANCELLED",
  });
  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: D(s.amountPaid),
      creditNoteTotal: D(creditNoteTotal),
      balanceDue: D(s.balanceDue),
      paymentStatus: s.paymentStatus,
    },
  });
}

// ───────────────────────── Payments ─────────────────────────

function checkPaymentAmount(
  inv: { invoiceNo: string; status: string; balanceDue: Prisma.Decimal; amountPaid: Prisma.Decimal },
  type: "RECEIPT" | "REFUND",
  amount: number,
  /** Amount of the payment being edited (same type), added back to the limit. */
  previous = 0,
) {
  if (type === "RECEIPT") {
    if (inv.status === "CANCELLED") throw badRequest(`Invoice ${inv.invoiceNo} is cancelled. Only refunds can be recorded.`);
    const max = round2(n(inv.balanceDue) + previous);
    if (amount > max + 0.005) {
      throw badRequest(`Amount is more than the balance due of ${formatINR(Math.max(0, max))}`, { amount: [`Max ${formatINR(Math.max(0, max))}`] });
    }
  } else {
    const max = round2(n(inv.amountPaid) + previous);
    if (amount > max + 0.005) {
      throw badRequest(`Refund is more than the amount paid (${formatINR(Math.max(0, max))})`, { amount: [`Max ${formatINR(Math.max(0, max))}`] });
    }
  }
}

export async function createPayment(tx: Tx, input: PaymentInput, user: SessionUser, ip: string | null) {
  await lockRow(tx, "Invoice", input.invoiceId);
  const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!inv) throw notFound("Invoice");
  checkPaymentAmount(inv, input.type, input.amount);
  const paymentDate = dateFromInput(input.paymentDate);
  const paymentNo = await nextDocNumber(tx, "payment", paymentDate);
  const payment = await tx.payment.create({
    data: {
      paymentNo,
      type: input.type,
      invoiceId: inv.id,
      customerId: inv.customerId,
      paymentDate,
      amount: D(input.amount),
      mode: input.mode,
      reference: input.reference,
      notes: input.notes,
      receivedById: input.receivedById ?? user.id,
      createdById: user.id,
    },
  });
  const updated = await refreshInvoiceTotals(tx, inv.id);
  await audit(tx, {
    userId: user.id,
    action: "CREATE",
    entity: "Payment",
    entityId: payment.id,
    summary: `${input.type === "REFUND" ? "Refund" : "Payment"} ${paymentNo} of ${rs(input.amount)} (${label(input.mode)}) on invoice ${inv.invoiceNo}`,
    after: payment,
    ip,
  });
  return { payment, invoice: updated };
}

export async function updatePayment(
  tx: Tx,
  id: number,
  input: z.output<typeof paymentUpdateSchema>,
  user: SessionUser,
  ip: string | null,
) {
  const before = await tx.payment.findUnique({ where: { id } });
  if (!before) throw notFound("Payment");
  await lockRow(tx, "Invoice", before.invoiceId);
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: before.invoiceId } });
  if (inv.status === "CANCELLED" && before.type === "RECEIPT") throw badRequest(`Invoice ${inv.invoiceNo} is cancelled; its receipts cannot be changed`);
  if (before.type === "RECEIPT") {
    checkPaymentAmount(inv, "RECEIPT", input.amount, n(before.amount));
  } else {
    checkPaymentAmount(inv, "REFUND", input.amount, n(before.amount));
  }
  const payment = await tx.payment.update({
    where: { id },
    data: {
      paymentDate: input.paymentDate ? dateFromInput(input.paymentDate) : before.paymentDate,
      amount: D(input.amount),
      mode: input.mode,
      reference: input.reference,
      notes: input.notes,
      receivedById: input.receivedById ?? before.receivedById,
    },
  });
  await refreshInvoiceTotals(tx, inv.id);
  await audit(tx, {
    userId: user.id,
    action: "UPDATE",
    entity: "Payment",
    entityId: id,
    summary: `Updated ${before.type === "REFUND" ? "refund" : "payment"} ${before.paymentNo} on invoice ${inv.invoiceNo}: ${rs(n(before.amount))} to ${rs(input.amount)}`,
    before,
    after: payment,
    ip,
  });
  return payment;
}

export async function deletePayment(tx: Tx, id: number, user: SessionUser, ip: string | null) {
  const before = await tx.payment.findUnique({ where: { id } });
  if (!before) throw notFound("Payment");
  await lockRow(tx, "Invoice", before.invoiceId);
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: before.invoiceId } });
  if (before.type === "RECEIPT" && n(inv.amountPaid) - n(before.amount) < -0.005) {
    throw badRequest("Delete the refund on this invoice first");
  }
  await tx.payment.delete({ where: { id } });
  await refreshInvoiceTotals(tx, inv.id);
  await audit(tx, {
    userId: user.id,
    action: "DELETE",
    entity: "Payment",
    entityId: id,
    summary: `Deleted ${before.type === "REFUND" ? "refund" : "payment"} ${before.paymentNo} of ${rs(n(before.amount))} on invoice ${inv.invoiceNo}`,
    before,
    ip,
  });
  return { ok: true };
}

// ───────────────────────── Credit notes ─────────────────────────

/** Taxable value already credited per order line (active credit notes only). */
export async function creditedByLine(client: Tx | typeof db, orderItemIds: number[]) {
  const rows = orderItemIds.length
    ? await client.creditNoteItem.groupBy({
        by: ["orderItemId"],
        where: { orderItemId: { in: orderItemIds }, creditNote: { status: "ACTIVE" } },
        _sum: { taxableValue: true },
      })
    : [];
  return new Map(rows.map((r) => [r.orderItemId!, n(r._sum.taxableValue)]));
}

export async function createCreditNote(tx: Tx, input: CreditNoteInput, user: SessionUser, ip: string | null) {
  await lockRow(tx, "Invoice", input.invoiceId);
  const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId }, include: { order: { include: { items: true } } } });
  if (!inv) throw notFound("Invoice");
  if (inv.status !== "ACTIVE") throw badRequest(`Invoice ${inv.invoiceNo} is cancelled`);
  const isInterState = inv.order.isInterState;
  const lines = new Map(inv.order.items.map((i) => [i.id, i]));
  const credited = await creditedByLine(tx, inv.order.items.map((i) => i.id));

  const items: Prisma.CreditNoteItemUncheckedCreateWithoutCreditNoteInput[] = [];
  const sums = { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 };
  const seen = new Set<number>();
  for (const it of input.items) {
    const amount = round2(it.taxableValue);
    if (amount <= 0) continue;
    const line = lines.get(it.orderItemId);
    if (!line) throw badRequest("A credit note line does not belong to this invoice");
    if (seen.has(line.id)) throw badRequest(`${line.name} appears twice`);
    seen.add(line.id);
    const max = round2(n(line.taxableValue) - (credited.get(line.id) ?? 0));
    if (amount > max + 0.005) throw badRequest(`Credit for ${line.name} cannot exceed ${formatINR(Math.max(0, max))} (taxable value not yet credited)`);
    const t = taxes(amount, n(line.gstRate), n(line.cessRate), line.taxType as TaxTypeName, isInterState);
    const total = round2(amount + t.cgst + t.sgst + t.igst + t.cess);
    items.push({
      orderItemId: line.id,
      description: line.name,
      hsnCode: line.hsnCode,
      taxableValue: D(amount),
      gstRate: line.gstRate,
      cessRate: line.cessRate,
      cgstAmount: D(t.cgst),
      sgstAmount: D(t.sgst),
      igstAmount: D(t.igst),
      cessAmount: D(t.cess),
      total: D(total),
    });
    sums.taxable = round2(sums.taxable + amount);
    sums.cgst = round2(sums.cgst + t.cgst);
    sums.sgst = round2(sums.sgst + t.sgst);
    sums.igst = round2(sums.igst + t.igst);
    sums.cess = round2(sums.cess + t.cess);
    sums.total = round2(sums.total + total);
  }
  if (!items.length) throw badRequest("Enter an amount to credit on at least one line");

  const date = dateFromInput(input.date);
  const creditNoteNo = await nextDocNumber(tx, "creditNote", date);
  const cn = await tx.creditNote.create({
    data: {
      creditNoteNo,
      date,
      invoiceId: inv.id,
      customerId: inv.customerId,
      reason: input.reason,
      isInterState,
      status: "ACTIVE",
      taxableTotal: D(sums.taxable),
      cgstTotal: D(sums.cgst),
      sgstTotal: D(sums.sgst),
      igstTotal: D(sums.igst),
      cessTotal: D(sums.cess),
      total: D(sums.total),
      createdById: user.id,
      items: { create: items },
    },
  });
  await refreshInvoiceTotals(tx, inv.id);
  await audit(tx, {
    userId: user.id,
    action: "CREATE",
    entity: "CreditNote",
    entityId: cn.id,
    summary: `Issued credit note ${creditNoteNo} of ${rs(sums.total)} against invoice ${inv.invoiceNo}. Reason: ${input.reason}`,
    after: { ...cn, items },
    ip,
  });
  return cn;
}

export async function cancelCreditNote(tx: Tx, id: number, reason: string, user: SessionUser, ip: string | null) {
  await lockRow(tx, "CreditNote", id);
  const cn = await tx.creditNote.findUnique({ where: { id }, include: { invoice: { select: { id: true, invoiceNo: true } } } });
  if (!cn) throw notFound("Credit note");
  if (cn.status === "CANCELLED") throw badRequest(`Credit note ${cn.creditNoteNo} is already cancelled`);
  await lockRow(tx, "Invoice", cn.invoiceId);
  const updated = await tx.creditNote.update({ where: { id }, data: { status: "CANCELLED" } });
  await refreshInvoiceTotals(tx, cn.invoiceId);
  await audit(tx, {
    userId: user.id,
    action: "CANCEL",
    entity: "CreditNote",
    entityId: id,
    summary: `Cancelled credit note ${cn.creditNoteNo} (${rs(n(cn.total))}) on invoice ${cn.invoice.invoiceNo}. Reason: ${reason}`,
    before: { status: cn.status },
    after: { status: "CANCELLED", reason },
    ip,
  });
  return updated;
}

// ───────────────────────── Invoice view / print ─────────────────────────

type TaxLine = { label: string; head: "CGST" | "SGST" | "IGST" | "CESS"; rate: number; amount: number };

/** Tally-style tax lines under the items: "CGST OUT PUT 9%", grouped by tax head and rate. */
function taxLines(
  items: { gstRate: number; cessRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number; cessAmount: number }[],
  other: { gstRate: number; cgst: number; sgst: number; igst: number },
): TaxLine[] {
  const map = new Map<string, TaxLine>();
  const add = (head: TaxLine["head"], rate: number, amount: number) => {
    if (amount <= 0) return;
    const key = `${head}|${rate}`;
    const row = map.get(key) ?? { head, rate, amount: 0, label: head === "CESS" ? `CESS ${rate}%` : `${head} OUT PUT ${rate}%` };
    row.amount = round2(row.amount + amount);
    map.set(key, row);
  };
  const half = (r: number) => round2(r / 2);
  for (const i of items) {
    add("CGST", half(i.gstRate), i.cgstAmount);
    add("SGST", half(i.gstRate), i.sgstAmount);
    add("IGST", i.gstRate, i.igstAmount);
    add("CESS", i.cessRate, i.cessAmount);
  }
  add("CGST", half(other.gstRate), other.cgst);
  add("SGST", half(other.gstRate), other.sgst);
  add("IGST", other.gstRate, other.igst);
  const order = { CGST: 0, SGST: 1, IGST: 2, CESS: 3 };
  return [...map.values()].sort((a, b) => order[a.head] - order[b.head] || a.rate - b.rate);
}

/** Everything the invoice view and the printable Tax Invoice need. */
export async function getInvoiceDetail(id: number, user: SessionUser) {
  const inv = await db.invoice.findFirst({
    where: { id, ...invoiceScope(user) },
    include: {
      order: {
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          salesperson: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          displayIssue: { select: { id: true, displayNo: true } },
        },
      },
      customer: true,
      payments: {
        orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
        include: { receivedBy: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
      },
      creditNotes: { orderBy: [{ date: "asc" }, { id: "asc" }], include: { items: true, createdBy: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
  });
  if (!inv) throw notFound("Invoice");

  const o = inv.order;
  const plainItems = o.items.map((i) => ({
    hsnCode: i.hsnCode,
    gstRate: n(i.gstRate),
    cessRate: n(i.cessRate),
    taxableValue: n(i.taxableValue),
    cgstAmount: n(i.cgstAmount),
    sgstAmount: n(i.sgstAmount),
    igstAmount: n(i.igstAmount),
    cessAmount: n(i.cessAmount),
  }));
  const ocRate = n(o.otherChargesGstRate);
  const oc = taxes(n(o.otherCharges), ocRate, 0, "GST", o.isInterState);
  const hsnRows = hsnSummary(plainItems, { amount: n(o.otherCharges), gstRate: ocRate, cgst: oc.cgst, sgst: oc.sgst, igst: oc.igst });
  const credited = await creditedByLine(db, o.items.map((i) => i.id));

  const items = hideItemCost(
    o.items.map((i) => ({ ...i, creditedTaxable: credited.get(i.id) ?? 0 })),
    user,
  );

  return {
    ...inv,
    order: { ...o, items },
    displayStatus: displayStatusOf(inv),
    hsnRows,
    taxLines: taxLines(plainItems, { gstRate: ocRate, ...oc }),
    otherChargesTax: oc,
    totalInWords: amountInWords(n(inv.grandTotal)),
    taxInWords: amountInWords(n(o.taxTotal)),
  };
}

export async function getCreditNoteDetail(id: number, user: SessionUser) {
  const cn = await db.creditNote.findFirst({
    where: { id, invoice: invoiceScope(user) },
    include: {
      items: { orderBy: { id: "asc" }, include: { orderItem: { select: { quantity: true, sku: true } } } },
      customer: true,
      createdBy: { select: { name: true } },
      invoice: {
        select: {
          id: true,
          invoiceNo: true,
          invoiceDate: true,
          status: true,
          companySnapshot: true,
          grandTotal: true,
          order: {
            select: {
              id: true,
              orderNo: true,
              customerName: true,
              customerPhone: true,
              customerGstin: true,
              billingAddress: true,
              placeOfSupply: true,
              placeOfSupplyCode: true,
            },
          },
        },
      },
    },
  });
  if (!cn) throw notFound("Credit note");
  const hsnRows = hsnSummary(
    cn.items.map((i) => ({
      hsnCode: i.hsnCode,
      gstRate: n(i.gstRate),
      taxableValue: n(i.taxableValue),
      cgstAmount: n(i.cgstAmount),
      sgstAmount: n(i.sgstAmount),
      igstAmount: n(i.igstAmount),
      cessAmount: n(i.cessAmount),
    })),
  );
  const tl = taxLines(
    cn.items.map((i) => ({
      gstRate: n(i.gstRate),
      cessRate: n(i.cessRate),
      cgstAmount: n(i.cgstAmount),
      sgstAmount: n(i.sgstAmount),
      igstAmount: n(i.igstAmount),
      cessAmount: n(i.cessAmount),
    })),
    { gstRate: 0, cgst: 0, sgst: 0, igst: 0 },
  );
  const taxTotal = round2(n(cn.cgstTotal) + n(cn.sgstTotal) + n(cn.igstTotal) + n(cn.cessTotal));
  return {
    ...cn,
    hsnRows,
    taxLines: tl,
    taxTotal,
    totalInWords: amountInWords(n(cn.total)),
    taxInWords: amountInWords(taxTotal),
  };
}
