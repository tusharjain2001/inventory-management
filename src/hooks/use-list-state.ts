"use client";

import { useCallback, useState } from "react";
import type { SortState } from "@/components/common/data-table";

/**
 * State for a paginated, searchable, filterable list.
 * Any change to search/filters/sort resets to page 1.
 */
export function useListState<F extends Record<string, string>>(initialFilters: F, initialSort?: SortState, pageSize = 25) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [q, setQState] = useState("");
  const [sort, setSortState] = useState<SortState>(initialSort);
  const [filters, setFiltersState] = useState<F>(initialFilters);

  const setQ = useCallback((v: string) => {
    setQState(v);
    setPage(1);
  }, []);
  const setSort = useCallback((s: SortState) => {
    setSortState(s);
    setPage(1);
  }, []);
  const setFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => {
    setFiltersState((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);
  const setFilters = useCallback((patch: Partial<F>) => {
    setFiltersState((f) => ({ ...f, ...patch }));
    setPage(1);
  }, []);
  const setPageSize = useCallback((n: number) => {
    setSize(n);
    setPage(1);
  }, []);

  /** Query params for the list API (without pagination when exporting). */
  const params = {
    page,
    pageSize: size,
    q,
    sort: sort ? `${sort.field}:${sort.dir}` : undefined,
    ...filters,
  };

  return { page, setPage, pageSize: size, setPageSize, q, setQ, sort, setSort, filters, setFilter, setFilters, params };
}
