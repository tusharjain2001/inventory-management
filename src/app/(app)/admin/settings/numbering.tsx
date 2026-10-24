"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { useSession } from "@/components/session-provider";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import { formatDocNumber, type SeriesKey } from "./format-preview";
import type { NumberingDoc, Settings } from "@/lib/settings-schema";
import { SettingsSection, useSection } from "./fields";

const SERIES: { key: SeriesKey; label: string; note?: string }[] = [
  { key: "invoice", label: "Sales Invoice" },
  { key: "order", label: "Sales Order" },
  { key: "creditNote", label: "Credit Note" },
  { key: "payment", label: "Payment Receipt" },
  { key: "stockIn", label: "Stock-In / Purchase (GRN)" },
  { key: "adjustment", label: "Stock Adjustment" },
  { key: "loss", label: "Damaged / Lost" },
  { key: "display", label: "Display (Potential Sales)" },
  { key: "customer", label: "Customer ID", note: "Does not restart each financial year" },
];

type NextInfo = { key: SeriesKey; financialYear: string; nextNumber: number; started: boolean; preview: string };

export function NumberingSettings({ initial }: { initial: Settings["numbering"] }) {
  const { data: next } = useQuery({
    queryKey: ["settings", "numbering-next"],
    queryFn: () => api.get<{ financialYear: string; data: NextInfo[] }>("/api/settings/numbering/next"),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Format tokens: <code className="text-foreground">{"{PREFIX}"}</code> prefix, <code className="text-foreground">{"{SEQ}"}</code> running
        number (padded with zeros), <code className="text-foreground">{"{FY}"}</code> 2026-27,{" "}
        <code className="text-foreground">{"{FYS}"}</code> 26-27. Numbers restart every financial year (1 April). To continue a Tally series such
        as <span className="font-mono text-foreground">SR/026/26-27</span>: prefix <span className="font-mono">SR</span>, format{" "}
        <span className="font-mono">{"{PREFIX}/{SEQ}/{FYS}"}</span>, padding 3, then set the next number to 27.
      </div>
      <SettingsSection group="numbering" initial={initial}>
        {SERIES.map((s) => (
          <SeriesRow key={s.key} series={s} next={next?.data.find((n) => n.key === s.key)} />
        ))}
      </SettingsSection>
    </div>
  );
}

function SeriesRow({ series, next }: { series: (typeof SERIES)[number]; next?: NextInfo }) {
  const { values, set, errors } = useSection();
  const cfg = values[series.key] as NumberingDoc;
  const err = errors[series.key];
  const update = (patch: Partial<NumberingDoc>) => set(series.key, { ...cfg, ...patch });
  const now = new Date();
  const seq = next?.nextNumber ?? (Number(cfg.startNumber) || 1);
  let preview = "";
  try {
    preview = formatDocNumber({ ...cfg, padding: Number(cfg.padding) || 1 }, seq, now);
  } catch {
    preview = "—";
  }

  return (
    <FormSection title={series.label} description={series.note}>
      <FormGrid cols={4}>
        <Field label="Prefix" htmlFor={`${series.key}-prefix`}>
          <Input id={`${series.key}-prefix`} value={cfg.prefix} onChange={(e) => update({ prefix: e.target.value })} maxLength={20} className="font-mono" />
        </Field>
        <Field label="Format" htmlFor={`${series.key}-format`} required>
          <Input
            id={`${series.key}-format`}
            value={cfg.format}
            onChange={(e) => update({ format: e.target.value })}
            maxLength={60}
            className="font-mono"
            required
          />
        </Field>
        <Field label="Digits (Padding)" htmlFor={`${series.key}-pad`} hint="e.g. 3 → 007">
          <Input
            id={`${series.key}-pad`}
            type="number"
            min={1}
            max={10}
            value={String(cfg.padding)}
            onChange={(e) => update({ padding: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })}
          />
        </Field>
        <Field label="Start Number" htmlFor={`${series.key}-start`} hint="For a new year">
          <Input
            id={`${series.key}-start`}
            type="number"
            min={1}
            value={String(cfg.startNumber)}
            onChange={(e) => update({ startNumber: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) })}
          />
        </Field>
      </FormGrid>
      {err && <p className="mt-2 text-xs text-destructive">{err[0]}</p>}
      {!cfg.format.includes("{SEQ}") && <p className="mt-2 text-xs text-amber-700">The format has no {"{SEQ}"}, so every number would be the same.</p>}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t pt-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Next number: </span>
          <span className="font-mono font-medium">{preview}</span>
          {next && (
            <span className="ml-2 text-xs text-muted-foreground">
              {next.financialYear === "ALL" ? "" : `FY ${next.financialYear}`}
              {!next.started && " · none issued yet"}
            </span>
          )}
        </div>
        {next && <NextNumberEditor seriesKey={series.key} current={next.nextNumber} />}
      </div>
    </FormSection>
  );
}

/** Sets the running number for the current year (separate from saving the format). */
function NextNumberEditor({ seriesKey, current }: { seriesKey: SeriesKey; current: number }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [base, setBase] = useState(current);
  if (base !== current) {
    setBase(current);
    setValue(String(current));
  }
  if (!can("settings.manage")) return null;

  async function apply() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.put<{ preview: string }>("/api/settings/numbering/next", { key: seriesKey, nextNumber: value });
      toast.success(`Next number set: ${res.preview}`);
      qc.invalidateQueries({ queryKey: ["settings", "numbering-next"] });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldErrors?.nextNumber?.[0] ?? err.message) : errorMessage(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label htmlFor={`${seriesKey}-next`} className="text-xs whitespace-nowrap text-muted-foreground">
          Set Next Number
        </label>
        <Input
          id={`${seriesKey}-next`}
          type="number"
          min={1}
          className="h-8 w-28"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={busy || !value || Number(value) === current} onClick={apply}>
          {busy ? "Setting…" : "Set"}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
