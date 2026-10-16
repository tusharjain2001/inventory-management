import { z } from "zod";
import type { Tx } from "@/lib/db";
import { AppError } from "@/lib/http";
import { todayIST } from "@/lib/dates";
import { ADMIN_ROLE_KEY, hasAnyPermission, type SessionUser } from "@/lib/permissions";

// Helpers shared by the inventory API routes (not a route itself).

export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Business date (YYYY-MM-DD), not in the future. */
export const pastDate = (what = "Date") =>
  z
    .string({ message: `${what} is required` })
    .regex(isoDate, `Enter a valid ${what.toLowerCase()}`)
    .refine((v) => v <= todayIST(), `${what} cannot be in the future`);

/** Optional YYYY-MM-DD; empty string becomes null. */
export const optDate = (what = "Date") =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isoDate.test(v), `Enter a valid ${what.toLowerCase()}`);

export const qtyField = z.coerce
  .number({ message: "Enter a quantity" })
  .positive("Quantity must be more than zero")
  .max(1_000_000_000, "Quantity is too large");

export const idField = (message: string) => z.coerce.number({ message }).int(message).positive(message);

/** Optional id; "", 0, null and undefined all mean "none". */
export const optId = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === "" || v === 0) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      ctx.addIssue({ code: "custom", message: "Invalid selection" });
      return z.NEVER;
    }
    return n;
  });

/** Cost figures (purchase amounts, unit costs) are shown only to these users. */
export const canSeePurchaseCost = (user: SessionUser) => hasAnyPermission(user, ["products.viewCost", "purchases.view"]);

/** Reads an enum value from the query string, ignoring anything not in the list. */
export function spEnum<T extends string>(sp: URLSearchParams, key: string, values: readonly T[]): T | undefined {
  const v = sp.get(key);
  return v && (values as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Locks a product row for the rest of the transaction and returns it (must exist and not be deleted). */
export async function lockProduct(tx: Tx, productId: number) {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(404, "Product not found", { productId: ["Choose a product"] });
  if (product.deletedAt) {
    throw new AppError(400, `${product.name} (${product.sku}) has been deleted`, { productId: ["This product has been deleted"] });
  }
  return product;
}

/** The approver must be an active user who is an admin or has the inventory.approve permission. */
export async function assertApprover(tx: Tx, approvedById: number) {
  const approver = await tx.user.findUnique({
    where: { id: approvedById },
    select: { id: true, name: true, isActive: true, role: { select: { key: true, permissions: true } } },
  });
  const ok =
    approver?.isActive &&
    (approver.role.key === ADMIN_ROLE_KEY || approver.role.permissions.includes("inventory.approve"));
  if (!approver || !ok) {
    throw new AppError(400, "The selected approver cannot approve stock changes", {
      approvedById: ["Choose an active user who can approve"],
    });
  }
  return approver;
}
