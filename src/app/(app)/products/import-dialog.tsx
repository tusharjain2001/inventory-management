"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api-client";

const COLUMNS: { key: string; label: string; note: string; example: string | number }[] = [
  { key: "name", label: "Product Name", note: "Required", example: "GTF 2, Round Table" },
  { key: "sku", label: "SKU", note: "Required, unique", example: "GTF-002" },
  { key: "category", label: "Category", note: "Required; created if new", example: "Furniture" },
  { key: "subCategory", label: "Sub-Category", note: "Optional; created if new", example: "Tables" },
  { key: "material", label: "Material", note: "", example: "Sheesham wood" },
  { key: "size", label: "Size", note: "", example: "90 cm dia" },
  { key: "weight", label: "Weight", note: "Number", example: 18 },
  { key: "weightUnit", label: "Weight Unit", note: "g or kg", example: "kg" },
  { key: "colour", label: "Colour", note: "", example: "Walnut" },
  { key: "description", label: "Description", note: "", example: "" },
  { key: "hsnCode", label: "HSN", note: "", example: "9403" },
  { key: "gstRate", label: "GST %", note: "Blank = default rate", example: 18 },
  { key: "purchasePrice", label: "Purchase Price", note: "Excluding GST", example: 40000 },
  { key: "sellingPrice", label: "Selling Price", note: "Required", example: 58000 },
  { key: "minSellingPrice", label: "Min Selling Price", note: "", example: "" },
  { key: "taxInclusive", label: "Price Includes GST", note: "Yes/No", example: "No" },
  { key: "discountAllowed", label: "Discount Allowed", note: "Yes/No", example: "Yes" },
  { key: "reorderLevel", label: "Reorder Level", note: "", example: 2 },
  { key: "reorderQuantity", label: "Reorder Quantity", note: "", example: 5 },
  { key: "openingStock", label: "Opening Stock", note: "Blank = default", example: 5 },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_MAP = new Map<string, string>();
for (const c of COLUMNS) {
  HEADER_MAP.set(norm(c.label), c.key);
  HEADER_MAP.set(norm(c.key), c.key);
}

async function downloadTemplate() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  ws.addRow(COLUMNS.map((c) => c.label)).font = { bold: true };
  ws.addRow(COLUMNS.map((c) => c.example));
  COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(14, c.label.length + 4);
    if (c.note) ws.getCell(1, i + 1).note = c.note;
  });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "product-import-template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

async function readRows(file: File) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The file has no sheets");
  const headers: (string | undefined)[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = HEADER_MAP.get(norm(String(cell.text ?? "")));
  });
  if (!headers.includes("sku") || !headers.includes("name")) {
    throw new Error("Could not find the 'Product Name' and 'SKU' columns. Please use the template.");
  }
  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const obj: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = headers[col];
      if (key) obj[key] = cell.text;
    });
    rows.push(obj);
  });
  return rows;
}

type Result = { created: number; errors: { row: number; sku: string; message: string }[]; dryRun: boolean };

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setRows(null);
    setFileName("");
    setResult(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const parsed = await readRows(file);
      setRows(parsed);
      setFileName(file.name);
      setResult(await api.post<Result>("/api/products/import", { rows: parsed, dryRun: true }));
    } catch (err) {
      toast.error(errorMessage(err));
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await api.post<Result>("/api/products/import", { rows });
      setResult(res);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
      toast.success(`Imported ${res.created} product(s)`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Products from Excel</DialogTitle>
          <DialogDescription>
            Download the template, fill one product per row, then upload it. Rows are checked before anything is saved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download /> Download Template
          </Button>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 hover:bg-muted/40">
            <FileUp className="size-5 text-muted-foreground" />
            <span>{fileName || "Choose the filled .xlsx file"}</span>
            <input type="file" accept=".xlsx" hidden onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
          </label>
          {busy && <p className="text-muted-foreground">Working…</p>}
          {result && (
            <div className="space-y-2">
              <p>
                {result.dryRun ? (
                  <>
                    <strong>{result.created}</strong> row(s) ready to import
                  </>
                ) : (
                  <>
                    <strong>{result.created}</strong> product(s) imported
                  </>
                )}
                {result.errors.length > 0 && (
                  <>
                    , <strong className="text-destructive">{result.errors.length}</strong> row(s) with problems
                  </>
                )}
                .
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded border bg-muted/30 p-2 text-xs">
                  {result.errors.map((e, i) => (
                    <div key={i}>
                      Row {e.row}
                      {e.sku ? ` (${e.sku})` : ""}: {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {result?.dryRun && result.created > 0 && (
            <Button onClick={runImport} disabled={busy}>
              Import {result.created} product(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
