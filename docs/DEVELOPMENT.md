# Development guide

Studio Rubina inventory & GST invoicing. One Next.js 16 app (App Router) with API route handlers,
Prisma 7 + PostgreSQL (Supabase in production), Tailwind 4 + shadcn/ui (Radix).

## Running locally

```bash
npm install
npm run db:local        # terminal 1: embedded Postgres on :5433 (no install needed)
npx prisma migrate dev  # apply migrations
npm run db:seed         # roles, settings, admin user, walk-in "Cash" customer
npx next dev -p 3100    # app on http://localhost:3100  (admin / ChangeMe@123)
npm run typecheck
```

## Layout

| Path | What |
|---|---|
| `prisma/schema.prisma` | Data model. Money `Decimal(14,2)`, quantities `Decimal(14,3)`, avg cost `Decimal(14,4)`. |
| `src/lib/db.ts` | `db` Prisma client, `transaction(fn)`, `Prisma`, types `Tx`/`DbOrTx`. |
| `src/lib/http.ts` | `handler()` route wrapper, `AppError`, `body()`, `listQuery()`, `paged()`, `spInt/spBool/spDateRange`, `intParam`. |
| `src/lib/auth.ts` | Sessions (`getSessionUser`), password helpers. |
| `src/lib/permissions.ts` | Permission catalog, default roles, `hasPermission`. ADMIN implicitly has all. |
| `src/lib/settings.ts` / `settings-schema.ts` | Settings groups (company, tax, inventory, invoice, numbering, general, analysis, security). |
| `src/lib/numbering.ts` | `nextDocNumber(tx, key, date)` — gap-free document numbers per financial year. |
| `src/lib/inventory.ts` | `postStock(tx, …)` — **the only way stock changes**; `refreshDisplayStatus`. |
| `src/lib/calc.ts` | Client-safe GST/order maths: `calculateOrder`, `hsnSummary`, `derivePaymentStatus`, `effectivePaymentStatus`, `stockStatus`. |
| `src/lib/audit.ts` | `audit(tx, {...})`, `diff(before, after)`. |
| `src/lib/format.ts` | `formatINR`, `formatAmount`, `formatQty`, `formatDate` (12-Oct-2026), `amountInWords`, `label(ENUM)`. |
| `src/lib/dates.ts` | IST helpers: `todayIST`, `dateFromInput`, `financialYear`, `istDateString`. |
| `src/lib/validators.ts` | Zod schemas for categories, suppliers, customers, products. |
| `src/lib/storage.ts` | `saveUpload(file, folder)` → Supabase Storage or ./uploads. |
| `src/components/common/*` | Shared UI: `DataTable`, `Pagination`, `PageHeader`, `Field/FormGrid/FormSection`, `SimpleSelect`, `EntityPicker`, `SearchInput`, `DateRangeFilter`, `FilterBar`, `ExportMenu`, `StatusBadge`, `useConfirm`, `RequirePermission`, `Money`, `Qty`, `StatCard`, `DetailList`. |
| `src/hooks/*` | `useListState`, `useMeta` (categories, suppliers, users, settings subset), `useDebounced`. |
| `src/app/(app)/products/*` | **Reference module** — copy its patterns. |

## API conventions

```ts
// src/app/api/things/route.ts
export const GET = handler({ permission: "things.view" }, async ({ req, user }) => {
  const lq = listQuery(req, ["name", "createdAt"]);           // page, pageSize ("all" for export), q, sort
  ...
  return paged(rows, total, lq);                               // { data, total, page, pageSize }
});
export const POST = handler({ permission: "things.create" }, async ({ req, user, ip }) => {
  const input = await body(req, schema);                       // zod-validated JSON
  return transaction(async (tx) => { ...; await audit(tx, {...}); return created; });
});
// dynamic segment: handler<{ id: string }>(opts, async ({ params }) => intParam(params.id))
```

- Throw `new AppError(status, message, fieldErrors?)` for user-facing errors; zod/Prisma errors are mapped automatically.
- Return Prisma objects directly — Decimals become numbers, Dates ISO strings.
- Every create/update/delete/cancel of business data writes an audit entry (inside the same transaction).
- Business dates from forms come as `YYYY-MM-DD`; convert with `dateFromInput()`. Filter ranges with `spDateRange(sp)` (IST).
- Document numbers: `await nextDocNumber(tx, "invoice" | "order" | "creditNote" | "payment" | "stockIn" | "adjustment" | "loss" | "display" | "customer", date)` inside the transaction.
- Stock: never write `currentStock`/`onDisplayStock`/`avgCost` directly. Call `postStock(tx, { productId, type, quantity, unitCost?, date, refType, refId, refNo, remarks, userId })`.
  It locks the product row, blocks negative stock (unless enabled in settings), re-averages cost on costed receipts, and appends the ledger row.
- Hide cost data (purchasePrice, avgCost, unitCost, profit) unless `hasPermission(user, "products.viewCost")` / `dashboard.financials` as appropriate.

## UI conventions

- Pages are client components under `src/app/(app)/…`, wrapped in `<RequirePermission permission=…>`.
- Data via TanStack Query + `api.get/post/patch/delete` from `@/lib/api-client`. Query keys: `["<entity>", params]`; invalidate on mutation.
- Lists: `useListState` + `FilterBar` + `DataTable` + `Pagination` + `ExportMenu` (fetch with `pageSize: "all"` for export).
- Forms: `FormSection` + `FormGrid` + `Field` with `error={errors.field}` from `ApiError.fieldErrors`; `toast.success/error` from `sonner`.
- Confirmations: `const confirm = useConfirm(); if (await confirm({ title, destructive: true })) …` (pass `reason` to collect a reason string).
- Use `<Can permission=…>` / `useSession().can()` to hide actions the user can't perform.
- Indian formatting everywhere: `formatINR`, `formatDate`, quantities with `formatQty`.
- Mobile: tables scroll horizontally; forms use `FormGrid` which collapses to one column.
