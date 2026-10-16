"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, type Paged } from "@/lib/api-client";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/utils";

export type PickerOption<T> = { value: number; label: string; sub?: string; raw: T };

/**
 * Searchable dropdown backed by a list endpoint that accepts `q` and returns Paged<T>.
 * Example: <EntityPicker endpoint="/api/products" toOption={(p) => ({ value: p.id, label: p.name, sub: p.sku, raw: p })} />
 */
export function EntityPicker<T>({
  endpoint,
  params,
  toOption,
  value,
  selectedLabel,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  className,
  disabled,
  allowClear = true,
  invalid,
}: {
  endpoint: string;
  params?: Record<string, string | number | boolean | undefined>;
  toOption: (row: T) => PickerOption<T>;
  value: number | null | undefined;
  /** Label to show for the current value (the picker does not refetch it). */
  selectedLabel?: string;
  onChange: (option: PickerOption<T> | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);
  const { data, isFetching } = useQuery({
    queryKey: ["picker", endpoint, params, debounced],
    queryFn: () => api.get<Paged<T>>(endpoint, { ...params, q: debounced, pageSize: 20 }),
    enabled: open,
  });
  const options = (data?.data ?? []).map(toOption);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn("h-9 w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{value ? (selectedLabel ?? `#${value}`) : placeholder}</span>
          <span className="flex items-center gap-1">
            {value && allowClear && !disabled && (
              <X
                className="size-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={q} onValueChange={setQ} />
          <CommandList>
            {!isFetching && <CommandEmpty>No matches.</CommandEmpty>}
            {isFetching && !options.length && <div className="p-3 text-sm text-muted-foreground">Searching…</div>}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={String(o.value)}
                  onSelect={() => {
                    onChange(o);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <Check className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.sub && <span className="truncate text-xs text-muted-foreground">{o.sub}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
