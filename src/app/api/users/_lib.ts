import { z } from "zod";
import type { DbOrTx } from "@/lib/db";
import { AppError } from "@/lib/http";
import { ADMIN_ROLE_KEY, type SessionUser } from "@/lib/permissions";
import { PASSWORD_RULE } from "@/lib/password";
import { mobileField } from "@/lib/validators";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .max(40)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || /^[a-z0-9._-]{3,40}$/.test(v), "3–40 characters: letters, numbers, dot, dash or underscore")
  .refine((v) => !v || !v.includes("@"), "Username cannot contain @");

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .refine((v) => z.email().safeParse(v).success, "Enter a valid email"),
  username,
  phone: mobileField,
  roleId: z.coerce.number().int().positive("Choose a role"),
  isActive: z.boolean().optional().default(true),
});

export const userCreateSchema = userUpdateSchema.extend({
  password: z.string().min(8, PASSWORD_RULE).max(200),
});

export const passwordSchema = z.object({
  password: z.string().min(8, PASSWORD_RULE).max(200),
});

/** Fields returned for a user (never the password hash). */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  phone: true,
  roleId: true,
  role: { select: { id: true, key: true, name: true } },
  isActive: true,
  failedLoginCount: true,
  lockedUntil: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function withLock<T extends { lockedUntil: Date | null }>(u: T) {
  return { ...u, isLocked: !!u.lockedUntil && u.lockedUntil > new Date() };
}

/** Only an Admin may create, change or reset the password of an Admin account. */
export function assertCanManageAdmin(actor: SessionUser, targetRoleKey: string | undefined) {
  if (targetRoleKey === ADMIN_ROLE_KEY && actor.roleKey !== ADMIN_ROLE_KEY) {
    throw new AppError(403, "Only an Admin can manage Admin accounts");
  }
}

/** Throws if the change would leave no active Admin. */
export async function assertNotLastAdmin(client: DbOrTx, userId: number, message: string) {
  const others = await client.user.count({
    where: { id: { not: userId }, isActive: true, role: { key: ADMIN_ROLE_KEY } },
  });
  if (others === 0) throw new AppError(409, message);
}

/** Friendly field errors for a taken email or username (instead of a generic conflict). */
export async function assertUnique(client: DbOrTx, input: { email: string; username: string | null }, exceptId?: number) {
  const not = exceptId ? { id: { not: exceptId } } : {};
  const [email, username] = await Promise.all([
    client.user.findFirst({ where: { ...not, email: { equals: input.email, mode: "insensitive" } }, select: { id: true } }),
    input.username
      ? client.user.findFirst({ where: { ...not, username: { equals: input.username, mode: "insensitive" } }, select: { id: true } })
      : null,
  ]);
  const fieldErrors: Record<string, string[]> = {};
  if (email) fieldErrors.email = ["Another user has this email"];
  if (username) fieldErrors.username = ["This username is taken"];
  if (Object.keys(fieldErrors).length) throw new AppError(409, Object.values(fieldErrors)[0][0], fieldErrors);
}
