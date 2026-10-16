"use client";

import { useEffect, useRef } from "react";
import type { HsnRow } from "@/lib/calc";
import { formatAmount } from "@/lib/format";
import { stateByCode } from "@/lib/india";
import type { CompanySnapshot, TaxLine } from "@/app/(app)/sales/types";

// Shared pieces for the Tally-style printable documents (A4 portrait, thin black boxes, Arial).

const CSS = `
@page { size: A4 portrait; margin: 8mm; }
html body { background: #e5e7eb !important; }
@media print { html body { background: #fff !important; } .no-print { display: none !important; } .sheet { margin: 0 !important; box-shadow: none !important; padding: 0 !important; width: auto !important; } }
.print-toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: center; align-items: center; padding: 10px 12px; background: #f9fafb; border-bottom: 1px solid #d1d5db; font: 13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; flex-wrap: wrap; }
.print-toolbar button { font: inherit; padding: 7px 14px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
.print-toolbar button.primary { background: #111827; color: #fff; border-color: #111827; }
.print-toolbar .hint { color: #6b7280; font-size: 12px; }
.sheet { position: relative; width: 210mm; max-width: 100%; box-sizing: border-box; margin: 16px auto; padding: 8mm; background: #fff; color: #000; box-shadow: 0 1px 6px rgba(0,0,0,.18);
  font-family: Arial, Helvetica, "Liberation Sans", sans-serif; font-size: 8.5pt; line-height: 1.28; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet * { box-sizing: border-box; }
.doc-title { position: relative; text-align: center; font-weight: bold; font-size: 11.5pt; margin: 0 0 3px; }
.doc-title .copy { position: absolute; right: 0; top: 3px; font-size: 7.5pt; font-weight: normal; font-style: italic; }
table.box { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: -1px; }
table.box > tbody > tr > td, table.box > thead > tr > th, table.box > tfoot > tr > td { border: 1px solid #000; padding: 2px 4px; vertical-align: top; }
table.inner { width: 100%; height: 100%; border-collapse: collapse; border-style: hidden; table-layout: fixed; }
table.inner td { border: 1px solid #000; padding: 1px 4px 2px; vertical-align: top; height: 25px; }
td.p0 { padding: 0 !important; height: 1px; }
.lbl { font-size: 7.5pt; }
.val { font-weight: bold; min-height: 11px; }
.b { font-weight: bold; } .i { font-style: italic; } .r { text-align: right; } .c { text-align: center; }
.u { text-decoration: underline; }
.small { font-size: 7.5pt; }
.name { font-weight: bold; font-size: 9pt; }
.items > thead > tr > th { font-weight: normal; text-align: center; vertical-align: middle; font-size: 8pt; }
.items > tbody > tr > td { border-top: none !important; border-bottom: none !important; padding-top: 2px; padding-bottom: 2px; }
.items > tbody > tr.first > td { padding-top: 4px; }
.items > tbody > tr.extra > td { font-style: italic; }
.items > tbody > tr.extra td.desc { text-align: right; font-weight: bold; padding-right: 8px; }
.items > tfoot > tr > td { font-weight: bold; vertical-align: middle; }
.items .grand { font-size: 10pt; }
.hsn th, .hsn td { text-align: right; }
.hsn th { font-weight: normal; text-align: center; vertical-align: middle; }
.hsn td.l, .hsn th.l { text-align: left; }
.hsn tfoot td { font-weight: bold; }
.words { padding: 3px 4px 5px !important; }
.sign { height: 70px; display: flex; flex-direction: column; justify-content: space-between; text-align: right; }
.footer-note { text-align: center; font-size: 7.5pt; margin-top: 4px; }
.watermark { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 72pt; font-weight: bold; color: rgba(220, 38, 38, .14); transform: rotate(-24deg); pointer-events: none; letter-spacing: 8px; }
.pre { white-space: pre-line; }
`;

export function PrintStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

/** Visible on screen only. Prints automatically once the document has loaded (add ?noprint=1 to skip). */
export function PrintToolbar({ title, ready }: { title: string; ready: boolean }) {
  const printed = useRef(false);
  useEffect(() => {
    if (!ready) return;
    document.title = title;
    if (printed.current || window.location.search.includes("noprint")) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [ready, title]);
  return (
    <div className="print-toolbar no-print">
      <button type="button" className="primary" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      <button type="button" onClick={() => window.close()}>
        Close
      </button>
      <span className="hint">Choose &quot;Save as PDF&quot; as the printer to download. A4, margins default.</span>
    </div>
  );
}

/** Tally-style amount: 2,900.00 or (-)2,900.00 */
export const amt = (n: number) => (n < 0 ? `(-)${formatAmount(-n)}` : formatAmount(n));
export const rateText = (n: number) => `${Number(n.toFixed(3))} %`;

export function SellerBlock({ c }: { c: CompanySnapshot }) {
  const lines = [c.addressLine1, c.addressLine2, [c.city, c.state, c.pincode].filter(Boolean).join(", ")].filter((l) => l && l.trim());
  return (
    <>
      <div className="name">{c.name}</div>
      {lines.map((l, i) => (
        <div key={i}>{l!.toUpperCase()}</div>
      ))}
      {c.phone && <div>Phone : {c.phone}</div>}
      {c.gstin && <div>GSTIN/UIN : {c.gstin}</div>}
      <div>
        State Name : {c.state}, Code : {c.stateCode}
      </div>
      {c.email && <div>E-Mail : {c.email}</div>}
    </>
  );
}

export function PartyBlock({
  heading,
  name,
  address,
  phone,
  gstin,
  pan,
  stateCode,
  stateName,
  placeOfSupply,
}: {
  heading: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  pan?: string | null;
  stateCode?: string | null;
  stateName?: string | null;
  placeOfSupply?: string | null;
}) {
  const state = stateName || stateByCode(stateCode)?.name;
  return (
    <>
      <div className="lbl">{heading}</div>
      <div className="name">{name}</div>
      {address && <div className="pre">{address}</div>}
      {phone && <div>Mobile : {phone}</div>}
      {gstin && <div>GSTIN/UIN : {gstin}</div>}
      {pan && <div>PAN/IT No : {pan}</div>}
      {state && (
        <div>
          State Name : {state}
          {stateCode ? `, Code : ${stateCode}` : ""}
        </div>
      )}
      {placeOfSupply && <div>Place of Supply : {placeOfSupply}</div>}
    </>
  );
}

/** Pair of label/value cells used in the header grid. */
export function Cell({ label, value, span }: { label: string; value?: React.ReactNode; span: number }) {
  return (
    <td colSpan={span}>
      <div className="lbl">{label}</div>
      <div className="val">{value || " "}</div>
    </td>
  );
}

export function HsnTable({ rows, isInterState }: { rows: HsnRow[]; isInterState: boolean }) {
  const hasCess = rows.some((r) => r.cess > 0);
  const total = rows.reduce(
    (s, r) => ({
      taxable: s.taxable + r.taxableValue,
      cgst: s.cgst + r.cgst,
      sgst: s.sgst + r.sgst,
      igst: s.igst + r.igst,
      cess: s.cess + r.cess,
      tax: s.tax + r.totalTax,
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, tax: 0 },
  );
  const half = (r: number) => Number((r / 2).toFixed(3));
  return (
    <table className="box hsn">
      <thead>
        <tr>
          <th rowSpan={2} className="l" style={{ width: "22%" }}>
            HSN/SAC
          </th>
          <th rowSpan={2}>Taxable Value</th>
          {isInterState ? (
            <th colSpan={2}>Integrated Tax</th>
          ) : (
            <>
              <th colSpan={2}>Central Tax</th>
              <th colSpan={2}>State Tax</th>
            </>
          )}
          {hasCess && <th rowSpan={2}>Cess</th>}
          <th rowSpan={2}>Total Tax Amount</th>
        </tr>
        <tr>
          <th style={{ width: "7%" }}>Rate</th>
          <th>Amount</th>
          {!isInterState && (
            <>
              <th style={{ width: "7%" }}>Rate</th>
              <th>Amount</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.hsnCode}|${r.gstRate}`}>
            <td className="l">{r.hsnCode}</td>
            <td>{amt(r.taxableValue)}</td>
            {isInterState ? (
              <>
                <td>{rateText(r.gstRate)}</td>
                <td>{amt(r.igst)}</td>
              </>
            ) : (
              <>
                <td>{rateText(half(r.gstRate))}</td>
                <td>{amt(r.cgst)}</td>
                <td>{rateText(half(r.gstRate))}</td>
                <td>{amt(r.sgst)}</td>
              </>
            )}
            {hasCess && <td>{amt(r.cess)}</td>}
            <td>{amt(r.totalTax)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="r">Total</td>
          <td>{amt(total.taxable)}</td>
          {isInterState ? (
            <>
              <td />
              <td>{amt(total.igst)}</td>
            </>
          ) : (
            <>
              <td />
              <td>{amt(total.cgst)}</td>
              <td />
              <td>{amt(total.sgst)}</td>
            </>
          )}
          {hasCess && <td>{amt(total.cess)}</td>}
          <td>{amt(total.tax)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Italic tax rows under the items: "CGST OUT PUT 9%    9 %    5,220.00". */
export function TaxRows({ lines, cols }: { lines: TaxLine[]; cols: { before: number; after: number } }) {
  return (
    <>
      {lines.map((t) => (
        <tr key={`${t.head}${t.rate}`} className="extra">
          <td />
          <td className="desc">{t.label}</td>
          {Array.from({ length: cols.before }).map((_, i) => (
            <td key={i} />
          ))}
          <td className="r">{Number(t.rate.toFixed(3))}</td>
          <td>%</td>
          {Array.from({ length: cols.after }).map((_, i) => (
            <td key={i} />
          ))}
          <td className="r b">{amt(t.amount)}</td>
        </tr>
      ))}
    </>
  );
}

export function PrintMessage({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 32, fontFamily: "Arial, sans-serif", fontSize: 14, textAlign: "center" }}>{children}</div>;
}
