import { connection, NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getSessionUser } from "@/lib/auth";
import { hasAnyPermission, type Permission, type SessionUser } from "@/lib/permissions";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, fieldErrors?: Record<string, string[] | undefined>) =>
  new AppError(400, msg, fieldErrors);
export const notFound = (what = "Record") => new AppError(404, `${what} not found`);
export const forbidden = (msg = "You do not have permission to do this") => new AppError(403, msg);

/** Deep-convert Prisma Decimals to numbers and Dates to ISO strings for JSON responses. */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "passwordHash") continue;
      out[k] = toPlain(v);
    }
    return out;
  }
  return value;
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(toPlain(data), init);
}

/** Field name from a unique-violation: Prisma's `target`, or the adapter's index name ("Product_sku_key" → "sku"). */
function uniqueField(meta: Record<string, unknown> | undefined) {
  const target = meta?.target;
  if (Array.isArray(target)) return target.join(", ");
  if (typeof target === "string") return target;
  const cause = (meta?.driverAdapterError as { cause?: { constraint?: { index?: string; fields?: string[] } } })?.cause;
  if (cause?.constraint?.fields?.length) return cause.constraint.fields.join(", ");
  const index = cause?.constraint?.index;
  const m = index?.match(/^[A-Za-z]+_(.+)_key$/);
  return m ? m[1].replace(/_/g, ", ") : undefined;
}

function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message, fieldErrors: err.fieldErrors }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const flat = z.flattenError(err);
    const first = err.issues[0];
    const msg = first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input";
    return NextResponse.json({ error: msg, fieldErrors: flat.fieldErrors }, { status: 400 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const field = uniqueField(err.meta);
      return NextResponse.json(
        {
          error: field ? `A record with this ${field} already exists` : "A record with this value already exists",
          fieldErrors: field ? { [field]: ["Already in use"] } : undefined,
        },
        { status: 409 },
      );
    }
    if (err.code === "P2025") return NextResponse.json({ error: "Record not found" }, { status: 404 });
    if (err.code === "P2003") {
      return NextResponse.json({ error: "This record is in use and cannot be removed" }, { status: 409 });
    }
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export type HandlerCtx<P> = {
  req: NextRequest;
  user: SessionUser;
  params: P;
  ip: string | null;
};

type Options = {
  /** User needs ANY of these permissions. Omit to allow any signed-in user. */
  permission?: Permission | Permission[];
};

/**
 * Wraps a route handler: requires a signed-in user, checks permissions,
 * serialises the result and maps errors to JSON responses.
 */
export function handler<P = Record<string, string>>(
  opts: Options,
  fn: (ctx: HandlerCtx<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    // API responses are always per request; stop build-time prerendering before reading cookies.
    await connection();
    try {
      const user = await getSessionUser();
      if (!user) throw new AppError(401, "Your session has expired. Please sign in again.");
      if (opts.permission) {
        const perms = Array.isArray(opts.permission) ? opts.permission : [opts.permission];
        if (!hasAnyPermission(user, perms)) throw forbidden();
      }
      const params = (context?.params ? await context.params : {}) as P;
      const result = await fn({ req, user, params, ip: clientIp(req) });
      if (result instanceof Response) return result;
      return json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** For unauthenticated endpoints (login, password reset). */
export function publicHandler(fn: (req: NextRequest) => Promise<unknown>) {
  return async (req: NextRequest) => {
    await connection();
    try {
      const result = await fn(req);
      if (result instanceof Response) return result;
      return json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export async function body<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  return schema.parse(raw);
}

export function intParam(value: string | undefined, what = "id") {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${what}`);
  return n;
}

// ───────────── List query helpers ─────────────

export type ListQuery = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  q: string;
  sort?: { field: string; dir: "asc" | "desc" };
  sp: URLSearchParams;
};

/** page (1-based), pageSize (max 500, or "all" for exports up to 20000), q, sort=field:dir */
export function listQuery(req: NextRequest, allowedSort: string[] = []): ListQuery {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const ps = sp.get("pageSize");
  const pageSize = ps === "all" ? 20000 : Math.min(500, Math.max(1, Number(ps) || 25));
  const [field, dir] = (sp.get("sort") ?? "").split(":");
  const sort =
    field && allowedSort.includes(field) ? { field, dir: (dir === "asc" ? "asc" : "desc") as "asc" | "desc" } : undefined;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, q: (sp.get("q") ?? "").trim(), sort, sp };
}

export function paged<T>(data: T[], total: number, lq: ListQuery) {
  return { data, total, page: lq.page, pageSize: lq.pageSize };
}

export function spInt(sp: URLSearchParams, key: string) {
  const v = sp.get(key);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function spBool(sp: URLSearchParams, key: string) {
  const v = sp.get(key);
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

/** Parses from/to (YYYY-MM-DD) into an inclusive Date range in IST. */
export function spDateRange(sp: URLSearchParams, fromKey = "from", toKey = "to") {
  const from = sp.get(fromKey);
  const to = sp.get(toKey);
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00+05:30`);
  if (to) range.lte = new Date(`${to}T23:59:59.999+05:30`);
  return range.gte || range.lte ? range : undefined;
}
