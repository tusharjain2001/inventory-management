"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/common/simple-select";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm text-muted-foreground">
      <div>
        {from}–{to} of {total.toLocaleString("en-IN")}
      </div>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <SimpleSelect
            className="h-8 w-20"
            value={String(pageSize)}
            onChange={(v) => onPageSizeChange(Number(v))}
            options={[25, 50, 100, 200].map((n) => ({ value: String(n), label: String(n) }))}
          />
        )}
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
