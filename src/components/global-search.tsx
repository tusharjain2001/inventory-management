"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { api } from "@/lib/api-client";
import { useDebounced } from "@/hooks/use-debounced";

type Hit = { id: number; title: string; subtitle?: string; href: string };
type SearchResult = { groups: { label: string; hits: Hit[] }[] };

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => api.get<SearchResult>("/api/search", { q: debounced }),
    enabled: open && debounced.trim().length >= 2,
  });

  return (
    <>
      <Button
        variant="outline"
        className="h-9 min-w-0 flex-1 justify-start gap-2 overflow-hidden text-muted-foreground sm:max-w-md"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="truncate sm:hidden">Search…</span>
        <span className="hidden truncate sm:inline">Search products, SKU, customers, invoices…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ("");
        }}
        title="Search"
        description="Search products, customers, invoices, orders and suppliers"
      >
        {/* Results come from the server, so cmdk's own filtering is off. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type at least 2 characters…" value={q} onValueChange={setQ} />
          <CommandList>
            {debounced.trim().length >= 2 && !isFetching && <CommandEmpty>No results found.</CommandEmpty>}
            {data?.groups
              .filter((g) => g.hits.length)
              .map((g) => (
                <CommandGroup key={g.label} heading={g.label}>
                  {g.hits.map((h) => (
                    <CommandItem
                      key={`${g.label}-${h.id}`}
                      value={`${g.label}-${h.id}-${h.title}`}
                      onSelect={() => {
                        setOpen(false);
                        setQ("");
                        router.push(h.href);
                      }}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{h.title}</span>
                        {h.subtitle && <span className="truncate text-xs text-muted-foreground">{h.subtitle}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
