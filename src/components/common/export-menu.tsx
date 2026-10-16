"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCsv, exportExcel, exportPdf, printTable, type ExportTable } from "@/lib/export";
import { errorMessage } from "@/lib/api-client";

/**
 * Export button for list pages and reports. `getTable` should fetch ALL rows for the
 * current filters (e.g. call the list API with pageSize=all) and return the table.
 */
export function ExportMenu<T>({
  getTable,
  disabled,
}: {
  getTable: () => Promise<ExportTable<T>> | ExportTable<T>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function run(kind: "csv" | "xlsx" | "pdf" | "print") {
    setBusy(true);
    try {
      const table = await getTable();
      if (kind === "csv") exportCsv(table);
      if (kind === "xlsx") await exportExcel(table);
      if (kind === "pdf") await exportPdf(table);
      if (kind === "print") printTable(table);
    } catch (err) {
      toast.error(`Export failed: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || busy}>
          <Download />
          {busy ? "Preparing…" : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run("xlsx")}>
          <FileSpreadsheet /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("csv")}>
          <Sheet /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("pdf")}>
          <FileText /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("print")}>
          <Printer /> Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
