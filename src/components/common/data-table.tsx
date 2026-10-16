"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type Column<T> = {
  /** Unique key; also the sort field sent to the API when sortable. */
  key: string;
  header: React.ReactNode;
  cell?: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  /** Plain value used by CSV/Excel/PDF export. Defaults to row[key]. Return undefined to skip. */
  exportValue?: (row: T) => string | number | null | undefined;
  /** Header text for exports when `header` is not a string. */
  exportHeader?: string;
  /** Leave this column out of exports (e.g. action buttons). */
  noExport?: boolean;
};

export type SortState = { field: string; dir: "asc" | "desc" } | undefined;

export function sortParam(sort: SortState) {
  return sort ? `${sort.field}:${sort.dir}` : undefined;
}

type Props<T> = {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  rowKey?: (row: T, index: number) => string | number;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  onRowClick?: (row: T) => void;
  emptyText?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  dense?: boolean;
};

const alignClass = (a?: "left" | "right" | "center") =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

export function DataTable<T>({
  columns,
  rows,
  loading,
  rowKey,
  sort,
  onSortChange,
  onRowClick,
  emptyText = "No records found",
  footer,
  className,
  dense,
}: Props<T>) {
  function toggleSort(key: string) {
    if (!onSortChange) return;
    if (sort?.field !== key) onSortChange({ field: key, dir: "asc" });
    else if (sort.dir === "asc") onSortChange({ field: key, dir: "desc" });
    else onSortChange(undefined);
  }

  const cellPad = dense ? "px-2 py-1.5" : "px-3 py-2.5";

  return (
    <div className={cn("overflow-x-auto rounded-lg border bg-card", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="bg-muted/50">
          <tr className="border-b">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "h-9 font-medium whitespace-nowrap text-muted-foreground",
                  cellPad,
                  alignClass(c.align),
                  c.headerClassName,
                )}
              >
                {c.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")}
                  >
                    {c.header}
                    {sort?.field === c.key ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows?.length
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cellPad}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row, i) => (
                <tr
                  key={rowKey ? rowKey(row, i) : i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b transition-colors last:border-0",
                    onRowClick && "cursor-pointer hover:bg-muted/50",
                    loading && "opacity-60",
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn(cellPad, "align-middle", alignClass(c.align), c.className)}>
                      {c.cell ? c.cell(row, i) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
          {!loading && rows && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
        {footer && <tfoot className="border-t bg-muted/30 font-medium">{footer}</tfoot>}
      </table>
    </div>
  );
}
