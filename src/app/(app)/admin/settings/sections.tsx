"use client";

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormGrid, FormSection } from "@/components/common/form-field";
import { SimpleSelect } from "@/components/common/simple-select";
import { api, errorMessage } from "@/lib/api-client";
import { compressImage } from "@/lib/image";
import { INDIAN_STATES, stateByCode, stateCodeFromGstin } from "@/lib/india";
import type { Settings } from "@/lib/settings-schema";
import { AreaF, NumF, SelectF, SettingsSection, SwitchF, TextF, useSection } from "./fields";

// ───────────── Company ─────────────

export function CompanySettings({ initial }: { initial: Settings["company"] }) {
  return (
    <SettingsSection group="company" initial={initial}>
      <FormSection title="Business" description="Printed on invoices and documents">
        <FormGrid>
          <TextF name="name" label="Company Name" required />
          <CompanyGstin />
          <TextF name="pan" label="PAN" className="[&_input]:font-mono [&_input]:uppercase" maxLength={10} />
          <TextF name="phone" label="Phone" type="tel" />
          <TextF name="email" label="Email" type="email" />
          <TextF name="website" label="Website" />
        </FormGrid>
      </FormSection>
      <FormSection title="Logo">
        <LogoField />
      </FormSection>
      <FormSection title="Address">
        <FormGrid>
          <TextF name="addressLine1" label="Address Line 1" className="sm:col-span-2 lg:col-span-3" />
          <TextF name="addressLine2" label="Address Line 2" className="sm:col-span-2 lg:col-span-3" />
          <TextF name="city" label="City" />
          <CompanyState />
          <TextF name="pincode" label="PIN Code" inputMode="numeric" maxLength={10} />
        </FormGrid>
      </FormSection>
      <FormSection title="Bank Details" description="Shown on invoices when enabled in Invoice settings">
        <FormGrid cols={4}>
          <TextF name="bankName" label="Bank Name" />
          <TextF name="bankAccountNo" label="Account Number" />
          <TextF name="bankIfsc" label="IFSC" className="[&_input]:uppercase" />
          <TextF name="bankBranch" label="Branch" />
        </FormGrid>
      </FormSection>
      <FormSection title="Declaration">
        <AreaF name="declaration" label="Invoice Declaration" rows={3} />
      </FormSection>
    </SettingsSection>
  );
}

function CompanyGstin() {
  const { values, setMany, errors } = useSection();
  return (
    <Field label="GSTIN" htmlFor="s-gstin" error={errors.gstin} hint="Fills the state automatically">
      <Input
        id="s-gstin"
        className="font-mono uppercase"
        maxLength={15}
        value={String(values.gstin ?? "")}
        onChange={(e) => {
          const gstin = e.target.value.toUpperCase().replace(/\s/g, "");
          const code = stateCodeFromGstin(gstin);
          setMany({ gstin, ...(code ? { stateCode: code, state: stateByCode(code)?.name } : {}) });
        }}
      />
    </Field>
  );
}

function CompanyState() {
  const { values, setMany, errors, readOnly } = useSection();
  return (
    <Field label="State" required error={errors.state ?? errors.stateCode} hint={values.stateCode ? `State code ${String(values.stateCode)}` : undefined}>
      <SimpleSelect
        value={String(values.stateCode ?? "")}
        onChange={(code) => setMany({ stateCode: code, state: stateByCode(code)?.name ?? "" })}
        options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }))}
        placeholder="Choose State"
        disabled={readOnly}
      />
    </Field>
  );
}

function LogoField() {
  const { values, set, readOnly } = useSection();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = String(values.logoUrl ?? "");

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      // PNG keeps transparency; other formats are resized like product photos.
      const toSend = file.type === "image/png" ? file : await compressImage(file);
      const res = await api.upload(toSend, "company", file.name);
      set("logoUrl", res.url);
      toast.success("Logo uploaded. Save to apply.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Company Logo" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">No logo</span>
        )}
      </div>
      {!readOnly && (
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={uploading}>
              <ImagePlus /> {uploading ? "Uploading…" : url ? "Change Logo" : "Upload Logo"}
            </Button>
            {url && (
              <Button type="button" variant="ghost" onClick={() => set("logoUrl", "")}>
                <Trash2 /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG with a transparent background works best.</p>
        </div>
      )}
    </div>
  );
}

// ───────────── Tax ─────────────

export function TaxSettings({ initial }: { initial: Settings["tax"] }) {
  return (
    <SettingsSection
      group="tax"
      initial={initial}
      prepare={(v) => ({ ...v, gstSlabs: [...new Set((v.gstSlabs as number[]).map(Number))].sort((a, b) => a - b) })}
    >
      <FormSection title="GST Rates" description="Rates offered when adding products">
        <SlabEditor />
      </FormSection>
      <FormSection title="Defaults">
        <FormGrid>
          <SlabSelect name="defaultGstRate" label="Default GST Rate for New Products" />
          <SlabSelect name="otherChargesGstRate" label="GST on Other Charges" hint="Freight, packing etc. on invoices" />
          <SwitchF name="pricesTaxInclusive" label="Prices Include GST by Default" hint="For new products" />
        </FormGrid>
      </FormSection>
    </SettingsSection>
  );
}

function SlabEditor() {
  const { values, set, errors, readOnly } = useSection();
  const slabs = (values.gstSlabs as number[]) ?? [];
  const [text, setText] = useState("");
  const add = () => {
    const n = Number(text);
    if (text === "" || !Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Enter a rate between 0 and 100");
      return;
    }
    if (!slabs.includes(n)) set("gstSlabs", [...slabs, n].sort((a, b) => a - b));
    setText("");
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {slabs.map((r) => (
          <span key={r} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pr-1.5 pl-3 text-sm tabular-nums">
            {r}%
            {!readOnly && (
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => set("gstSlabs", slabs.filter((x) => x !== r))}
                aria-label={`Remove ${r}%`}
                disabled={slabs.length <= 1}
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="flex max-w-xs gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            placeholder="Rate %"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={add}>
            <Plus /> Add
          </Button>
        </div>
      )}
      {errors.gstSlabs && <p className="text-xs text-destructive">{errors.gstSlabs[0]}</p>}
    </div>
  );
}

function SlabSelect({ name, label, hint }: { name: string; label: string; hint?: string }) {
  const { values, set, errors, readOnly } = useSection();
  const slabs = (values.gstSlabs as number[]) ?? [];
  const current = Number(values[name]);
  const options = [...new Set([...slabs, current])].sort((a, b) => a - b).map((r) => ({ value: String(r), label: `${r}%` }));
  return (
    <Field label={label} hint={hint} error={errors[name]}>
      <SimpleSelect value={String(current)} onChange={(v) => set(name, Number(v))} options={options} disabled={readOnly} />
    </Field>
  );
}

// ───────────── Inventory ─────────────

export function InventorySettings({ initial }: { initial: Settings["inventory"] }) {
  return (
    <SettingsSection group="inventory" initial={initial}>
      <FormSection title="Stock">
        <FormGrid>
          <SwitchF name="allowNegativeStock" label="Allow Negative Stock" hint="When off, a sale or issue cannot take stock below zero" />
          <NumF name="defaultReorderLevel" label="Default Reorder Level" hint="For new products" step="any" />
          <NumF name="defaultOpeningStock" label="Default Opening Stock" hint="Pre-filled when adding a product" step="any" />
          <SelectF
            name="costingMethod"
            label="Costing Method"
            options={[{ value: "WEIGHTED_AVERAGE", label: "Weighted Average" }]}
            hint="Stock is valued at the weighted average purchase cost"
            disabled
          />
        </FormGrid>
      </FormSection>
    </SettingsSection>
  );
}

// ───────────── Invoice ─────────────

export function InvoiceSettings({ initial }: { initial: Settings["invoice"] }) {
  return (
    <SettingsSection group="invoice" initial={initial}>
      <FormSection title="Invoice">
        <FormGrid>
          <NumF name="defaultPaymentTermsDays" label="Default Payment Terms" suffix="days" hint="0 = due on the invoice date" />
          <SwitchF name="roundOff" label="Round Off the Total" hint="To the nearest rupee" />
          <SwitchF name="showBankDetails" label="Show Bank Details on Invoices" />
          <SelectF name="template" label="Invoice Layout" options={[{ value: "TALLY_CLASSIC", label: "Tally Classic" }]} disabled />
        </FormGrid>
      </FormSection>
      <FormSection title="Terms & Conditions" description="Printed at the bottom of every invoice">
        <AreaF name="termsAndConditions" label="Terms & Conditions" rows={6} />
      </FormSection>
    </SettingsSection>
  );
}

// ───────────── General ─────────────

export function GeneralSettings({ initial }: { initial: Settings["general"] }) {
  return (
    <SettingsSection group="general" initial={initial}>
      <FormSection title="General">
        <FormGrid cols={4}>
          <TextF name="currency" label="Currency" required maxLength={10} />
          <SelectF
            name="dateFormat"
            label="Date Format"
            options={[
              { value: "DD-MM-YYYY", label: "16-10-2026" },
              { value: "DD/MM/YYYY", label: "16/10/2026" },
              { value: "DD-MMM-YYYY", label: "16-Oct-2026" },
              { value: "YYYY-MM-DD", label: "2026-10-16" },
            ]}
          />
          <SelectF name="timeZone" label="Time Zone" options={[{ value: "Asia/Kolkata", label: "India (IST, UTC+05:30)" }]} />
          <NumF name="decimalPrecision" label="Decimal Places" min={0} max={4} />
        </FormGrid>
      </FormSection>
    </SettingsSection>
  );
}

// ───────────── Analysis ─────────────

export function AnalysisSettings({ initial }: { initial: Settings["analysis"] }) {
  return (
    <SettingsSection group="analysis" initial={initial}>
      <FormSection title="Stock Movement Analysis" description="Used by the fast / slow-moving and dead-stock reports">
        <FormGrid cols={4}>
          <NumF name="analysisPeriodDays" label="Analysis Period" suffix="days" min={1} required />
          <NumF name="fastMovingThreshold" label="Fast-Moving at or Above" suffix="units/day" step="any" required />
          <NumF name="slowMovingThreshold" label="Slow-Moving Below" suffix="units/day" step="any" required />
          <NumF name="deadStockDays" label="Dead Stock After" suffix="days unsold" min={1} required />
        </FormGrid>
      </FormSection>
    </SettingsSection>
  );
}

// ───────────── Security ─────────────

export function SecuritySettings({ initial }: { initial: Settings["security"] }) {
  return (
    <SettingsSection group="security" initial={initial}>
      <FormSection title="Sign-In and Sessions">
        <FormGrid cols={4}>
          <NumF name="sessionTimeoutMinutes" label="Sign Out After Inactivity" suffix="minutes" min={5} max={1440} required />
          <NumF name="maxFailedAttempts" label="Failed Attempts Before Lock" min={1} max={50} required />
          <NumF name="lockoutMinutes" label="Lock Duration" suffix="minutes" min={1} max={1440} required />
          <NumF name="rememberMeDays" label="“Remember Me” Lasts" suffix="days" min={1} max={365} required />
        </FormGrid>
      </FormSection>
    </SettingsSection>
  );
}
