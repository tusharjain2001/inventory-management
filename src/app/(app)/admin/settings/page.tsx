"use client";

import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { ErrorBlock, LoadingBlock, RequirePermission } from "@/components/common/misc";
import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api-client";
import type { Settings } from "@/lib/settings-schema";
import { NumberingSettings } from "./numbering";
import {
  AnalysisSettings,
  CompanySettings,
  GeneralSettings,
  InventorySettings,
  InvoiceSettings,
  SecuritySettings,
  TaxSettings,
} from "./sections";

const TABS = [
  { key: "company", label: "Company" },
  { key: "tax", label: "Tax" },
  { key: "inventory", label: "Inventory" },
  { key: "invoice", label: "Invoice" },
  { key: "numbering", label: "Numbering" },
  { key: "general", label: "General" },
  { key: "analysis", label: "Analysis" },
  { key: "security", label: "Security" },
] as const;

export default function SettingsPage() {
  return (
    <RequirePermission permission={["settings.view", "settings.manage"]}>
      <SettingsView />
    </RequirePermission>
  );
}

function SettingsView() {
  const { can } = useSession();
  const { data, isLoading, error } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/api/settings"),
  });

  if (isLoading) return <LoadingBlock rows={8} />;
  if (error || !data) return <ErrorBlock error={error} />;

  // Remount a section when its saved values change so the form starts from them.
  const k = (v: unknown) => JSON.stringify(v);

  return (
    <>
      <PageHeader
        title="Settings"
        description={can("settings.manage") ? "Company details, tax, numbering and system options" : "View only — ask an admin to change settings"}
      />
      <Tabs defaultValue="company">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="px-2.5">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="company" className="mt-3">
          <CompanySettings key={k(data.company)} initial={data.company} />
        </TabsContent>
        <TabsContent value="tax" className="mt-3">
          <TaxSettings key={k(data.tax)} initial={data.tax} />
        </TabsContent>
        <TabsContent value="inventory" className="mt-3">
          <InventorySettings key={k(data.inventory)} initial={data.inventory} />
        </TabsContent>
        <TabsContent value="invoice" className="mt-3">
          <InvoiceSettings key={k(data.invoice)} initial={data.invoice} />
        </TabsContent>
        <TabsContent value="numbering" className="mt-3">
          <NumberingSettings key={k(data.numbering)} initial={data.numbering} />
        </TabsContent>
        <TabsContent value="general" className="mt-3">
          <GeneralSettings key={k(data.general)} initial={data.general} />
        </TabsContent>
        <TabsContent value="analysis" className="mt-3">
          <AnalysisSettings key={k(data.analysis)} initial={data.analysis} />
        </TabsContent>
        <TabsContent value="security" className="mt-3">
          <SecuritySettings key={k(data.security)} initial={data.security} />
        </TabsContent>
      </Tabs>
    </>
  );
}
