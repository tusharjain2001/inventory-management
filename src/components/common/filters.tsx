"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/common/simple-select";
import { addDays, financialYear, istDateString, monthStartIST, todayIST } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Search box that reports its value after the user stops typing. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  // Follow outside resets (e.g. "clear filters") without an effect.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-9 pr-8 pl-8" />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText("");
            onChange("");
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export type DateRange = { from: string; to: string };

function fyRange(offsetYears = 0): DateRange {
  const fy = financialYear(new Date());
  const start = Number(fy.slice(0, 4)) + offsetYears;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

export const DATE_PRESETS: { key: string; label: string; range: () => DateRange }[] = [
  { key: "today", label: "Today", range: () => ({ from: todayIST(), to: todayIST() }) },
  { key: "7d", label: "Last 7 Days", range: () => ({ from: istDateString(addDays(new Date(), -6)), to: todayIST() }) },
  { key: "month", label: "This Month", range: () => ({ from: monthStartIST(), to: todayIST() }) },
  {
    key: "lastMonth",
    label: "Last Month",
    range: () => {
      const firstThis = new Date(`${monthStartIST()}T12:00:00+05:30`);
      const lastPrev = addDays(firstThis, -1);
      return { from: monthStartIST(lastPrev), to: istDateString(lastPrev) };
    },
  },
  { key: "30d", label: "Last 30 Days", range: () => ({ from: istDateString(addDays(new Date(), -29)), to: todayIST() }) },
  { key: "fy", label: "This Financial Year", range: () => fyRange(0) },
  { key: "lastFy", label: "Last Financial Year", range: () => fyRange(-1) },
];

/** From/to date inputs with quick presets. Empty strings mean "no limit". */
export function DateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
  className?: string;
}) {
  // Show the preset's name while the dates still match it, so the choice stays visible.
  const active = DATE_PRESETS.find((p) => {
    const r = p.range();
    return r.from === value.from && r.to === value.to;
  });
  return (
    <div className={cn("flex w-full flex-wrap items-center gap-2 sm:w-auto", className)}>
      <SimpleSelect
        className="h-9 w-44"
        value={active?.key ?? ""}
        placeholder="Date Preset"
        onChange={(key) => {
          const p = DATE_PRESETS.find((d) => d.key === key);
          if (p) onChange(p.range());
        }}
        options={DATE_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
      />
      {(value.from || value.to) && (
        <Button variant="ghost" size="sm" className="sm:order-last" onClick={() => onChange({ from: "", to: "" })}>
          Clear
        </Button>
      )}
      {/* From and To stay on one row, sharing the width on phones. */}
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Input
          type="date"
          className="h-9 min-w-0 flex-1 sm:w-38 sm:flex-none"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          aria-label="From Date"
        />
        <span className="shrink-0 text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          className="h-9 min-w-0 flex-1 sm:w-38 sm:flex-none"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          aria-label="To Date"
        />
      </div>
    </div>
  );
}

/** Wrapping row for filter controls above a table. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-3 flex flex-wrap items-center gap-2 print:hidden", className)}>{children}</div>;
}

/** Human-readable date range for export subtitles. */
export function describeRange(r: DateRange) {
  if (!r.from && !r.to) return "All Dates";
  return `Period: ${r.from || "start"} to ${r.to || "today"}`;
}
