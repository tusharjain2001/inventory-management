import { z } from "zod";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

const permissionKey = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]], { message: "Unknown permission" });

export const roleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  maxDiscountPercent: z.coerce.number({ message: "Enter a percentage" }).min(0, "Cannot be negative").max(100, "Cannot be above 100%"),
  permissions: z
    .array(permissionKey)
    .default([])
    // Keep catalog order and drop duplicates.
    .transform((list) => ALL_PERMISSIONS.filter((p) => list.includes(p))),
});

/** "Store Manager" → "STORE_MANAGER" */
export function roleKeyFromName(name: string) {
  const key = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return key || "ROLE";
}
