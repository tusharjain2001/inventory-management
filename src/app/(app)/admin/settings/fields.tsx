"use client";

import { createContext, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/common/form-field";
import { SimpleSelect, type Option } from "@/components/common/simple-select";
import { useSession } from "@/components/session-provider";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import type { Settings, SettingsGroup } from "@/lib/settings-schema";

type Values = Record<string, unknown>;

type SectionCtx = {
  values: Values;
  set: (key: string, value: unknown) => void;
  setMany: (patch: Values) => void;
  errors: Record<string, string[] | undefined>;
  readOnly: boolean;
};

const Ctx = createContext<SectionCtx | null>(null);

export function useSection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSection must be used inside <SettingsSection>");
  return ctx;
}

/** Form for one settings group: holds the values, saves with PUT /api/settings/[group]. */
export function SettingsSection<G extends SettingsGroup>({
  group,
  initial,
  children,
  prepare,
}: {
  group: G;
  initial: Settings[G];
  children: React.ReactNode;
  /** Adjust values before saving (e.g. sort a list). */
  prepare?: (values: Values) => Values;
}) {
  const qc = useQueryClient();
  const { can } = useSession();
  const readOnly = !can("settings.manage");
  const [values, setValues] = useState<Values>(() => structuredClone(initial) as Values);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));
  const setMany = (patch: Values) => setValues((v) => ({ ...v, ...patch }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.put(`/api/settings/${group}`, prepare ? prepare(values) : values);
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ctx.Provider value={{ values, set, setMany, errors, readOnly }}>
      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset disabled={readOnly} className="space-y-4">
          {children}
        </fieldset>
        {readOnly ? (
          <p className="text-xs text-muted-foreground">You can view these settings but not change them.</p>
        ) : (
          <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-2 bg-background/90 px-1 py-2 backdrop-blur">
            {dirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved Changes</span>}
            <Button type="button" variant="outline" disabled={!dirty || busy} onClick={() => setValues(structuredClone(initial) as Values)}>
              Discard
            </Button>
            <Button type="submit" disabled={!dirty || busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </form>
    </Ctx.Provider>
  );
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

type Base = { name: string; label: React.ReactNode; hint?: React.ReactNode; required?: boolean; className?: string };

export function TextF({ name, label, hint, required, className, ...rest }: Base & Omit<React.ComponentProps<typeof Input>, "name">) {
  const { values, set, errors } = useSection();
  return (
    <Field label={label} htmlFor={`s-${name}`} hint={hint} required={required} error={errors[name]} className={className}>
      <Input id={`s-${name}`} value={str(values[name])} onChange={(e) => set(name, e.target.value)} required={required} {...rest} />
    </Field>
  );
}

export function NumF({
  name,
  label,
  hint,
  required,
  className,
  suffix,
  min = 0,
  max,
  step = 1,
}: Base & { suffix?: string; min?: number; max?: number; step?: number | string }) {
  const { values, set, errors } = useSection();
  return (
    <Field label={label} htmlFor={`s-${name}`} hint={hint} required={required} error={errors[name]} className={className}>
      <div className="flex items-center gap-2">
        <Input
          id={`s-${name}`}
          type="number"
          inputMode="decimal"
          value={str(values[name])}
          min={min}
          max={max}
          step={step}
          required={required}
          onChange={(e) => set(name, e.target.value === "" ? "" : Number(e.target.value))}
        />
        {suffix && <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </Field>
  );
}

export function AreaF({ name, label, hint, className, rows = 4 }: Base & { rows?: number }) {
  const { values, set, errors } = useSection();
  return (
    <Field label={label} htmlFor={`s-${name}`} hint={hint} error={errors[name]} className={className}>
      <Textarea id={`s-${name}`} rows={rows} value={str(values[name])} onChange={(e) => set(name, e.target.value)} />
    </Field>
  );
}

export function SwitchF({ name, label, hint, className }: Base) {
  const { values, set, errors, readOnly } = useSection();
  return (
    <Field label={label} hint={hint} error={errors[name]} className={className}>
      <div className="flex h-9 items-center">
        <Switch checked={!!values[name]} onCheckedChange={(v) => set(name, v)} disabled={readOnly} />
      </div>
    </Field>
  );
}

export function SelectF({ name, label, hint, className, options, disabled }: Base & { options: Option[]; disabled?: boolean }) {
  const { values, set, errors, readOnly } = useSection();
  return (
    <Field label={label} hint={hint} error={errors[name]} className={className}>
      <SimpleSelect value={str(values[name])} onChange={(v) => set(name, v)} options={options} disabled={disabled || readOnly} />
    </Field>
  );
}
