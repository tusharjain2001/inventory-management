import { financialYear } from "@/lib/dates";
import type { NumberingDoc, Settings } from "@/lib/settings-schema";

// Client-safe document number formatting (used by the server allocator and the settings preview).

export type SeriesKey = keyof Settings["numbering"];

export function formatDocNumber(cfg: NumberingDoc, seq: number, date: Date) {
  const fy = financialYear(date);
  const [a, b] = fy.split("-");
  return cfg.format
    .replaceAll("{PREFIX}", cfg.prefix)
    .replaceAll("{SEQ}", String(seq).padStart(cfg.padding, "0"))
    .replaceAll("{FY}", fy)
    .replaceAll("{FYS}", `${a.slice(2)}-${b}`);
}
