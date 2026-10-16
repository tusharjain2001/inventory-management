"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export type Option = { value: string; label: string };

/**
 * Thin wrapper over the shadcn Select taking plain string options.
 * Empty string means "nothing selected"; pass `clearLabel` to offer a "none/all" choice.
 */
export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  clearLabel,
  className,
  disabled,
  id,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  clearLabel?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
}) {
  return (
    <Select value={value === "" ? (clearLabel ? NONE : "") : value} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {clearLabel && <SelectItem value={NONE}>{clearLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
