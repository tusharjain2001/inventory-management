"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Settings } from "@/lib/settings-schema";

export type Meta = {
  categories: { id: number; name: string; subCategories: { id: number; name: string }[] }[];
  suppliers: { id: number; name: string; gstin: string | null; stateCode: string | null }[];
  users: { id: number; name: string; roleKey: string; roleName: string; canApprove: boolean }[];
  walkInCustomer: { id: number; name: string } | null;
  company: { name: string; state: string; stateCode: string; gstin: string };
  tax: Settings["tax"];
  inventory: Settings["inventory"];
  invoice: { defaultPaymentTermsDays: number; roundOff: boolean };
  general: Settings["general"];
};

/** Dropdown options and a few settings, cached for the session. Invalidate ["meta"] after changing masters. */
export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/meta"), staleTime: 5 * 60_000 });
}
