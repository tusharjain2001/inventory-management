"use client";

import type { Column } from "@/components/common/data-table";

// Exports any table (columns + rows) to CSV, Excel, PDF or the printer.
// Heavy libraries are loaded only when an export is actually requested.

export type ExportTable<T> = {
  title: string;
  /** Lines printed under the title, e.g. the active filters and date range. */
  subtitle?: string[];
  filename: string;
  columns: Column<T>[];
  rows: T[];
  /** Optional totals row: column key → value. */
  totals?: Record<string, string | number>;
};

type Cell = string | number | null | undefined;

function headerText<T>(c: Column<T>) {
  return c.exportHeader ?? (typeof c.header === "string" ? c.header : c.key);
}

function matrix<T>(t: ExportTable<T>) {
  const cols = t.columns.filter((c) => !c.noExport);
  const head = cols.map(headerText);
  const body: Cell[][] = t.rows.map((row) =>
    cols.map((c) => (c.exportValue ? c.exportValue(row) : ((row as Record<string, unknown>)[c.key] as Cell))),
  );
  const foot = t.totals ? [cols.map((c, i) => t.totals?.[c.key] ?? (i === 0 ? "Total" : ""))] : [];
  return { cols, head, body, foot };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportCsv<T>(t: ExportTable<T>) {
  const { head, body, foot } = matrix(t);
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...body, ...foot].map((r) => r.map(esc).join(","));
  download(new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }), `${t.filename}-${stamp()}.csv`);
}

export async function exportExcel<T>(t: ExportTable<T>) {
  const ExcelJS = (await import("exceljs")).default;
  const { cols, head, body, foot } = matrix(t);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.title.slice(0, 31));
  ws.addRow([t.title]).font = { bold: true, size: 14 };
  for (const line of t.subtitle ?? []) ws.addRow([line]).font = { color: { argb: "FF666666" } };
  ws.addRow([]);
  const headerRow = ws.addRow(head);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F1" } };
  body.forEach((r) => ws.addRow(r));
  foot.forEach((r) => (ws.addRow(r).font = { bold: true }));
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    const width = Math.max(headerText(c).length, ...body.slice(0, 200).map((r) => String(r[i] ?? "").length));
    col.width = Math.min(50, Math.max(10, width + 2));
    if (c.align === "right") col.alignment = { horizontal: "right" };
  });
  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${t.filename}-${stamp()}.xlsx`,
  );
}

export async function exportPdf<T>(t: ExportTable<T>) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const { cols, head, body, foot } = matrix(t);
  const doc = new jsPDF({ orientation: cols.length > 7 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(13);
  doc.text(t.title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100);
  (t.subtitle ?? []).forEach((line, i) => doc.text(line, 40, 56 + i * 12));
  // jsPDF's built-in fonts have no ₹ glyph, so amounts are exported as plain numbers.
  const clean = (v: Cell) => String(v ?? "").replace(/₹/g, "Rs.");
  autoTable(doc, {
    startY: 64 + (t.subtitle?.length ?? 0) * 12,
    head: [head],
    body: body.map((r) => r.map(clean)),
    foot: foot.map((r) => r.map(clean)),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [40, 40, 40] },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      cols.map((c, i) => [i, { halign: c.align === "right" ? "right" : c.align === "center" ? "center" : "left" }]),
    ),
  });
  doc.save(`${t.filename}-${stamp()}.pdf`);
}

/** Opens a clean printable copy of the table in a new window and prints it. */
export function printTable<T>(t: ExportTable<T>) {
  const { cols, head, body, foot } = matrix(t);
  const esc = (v: Cell) =>
    String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const align = (i: number) => (cols[i].align === "right" ? ' style="text-align:right"' : "");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:11px;color:#111;margin:24px}
h1{font-size:16px;margin:0 0 4px}.sub{color:#666;margin:0 0 2px}
table{border-collapse:collapse;width:100%;margin-top:12px}
th,td{border:1px solid #ccc;padding:4px 6px;vertical-align:top}
th{background:#f2f2f2;text-align:left}tfoot td{font-weight:600;background:#fafafa}
@page{size:auto;margin:12mm}
</style></head><body>
<h1>${esc(t.title)}</h1>${(t.subtitle ?? []).map((s) => `<p class="sub">${esc(s)}</p>`).join("")}
<table><thead><tr>${head.map((h, i) => `<th${align(i)}>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${body.map((r) => `<tr>${r.map((v, i) => `<td${align(i)}>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
${foot.length ? `<tfoot>${foot.map((r) => `<tr>${r.map((v, i) => `<td${align(i)}>${esc(v)}</td>`).join("")}</tr>`).join("")}</tfoot>` : ""}
</table><script>window.onload=()=>{window.print();}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
