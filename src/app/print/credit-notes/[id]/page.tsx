"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api-client";
import { formatAmount, formatDate } from "@/lib/format";
import type { CreditNoteDetail } from "@/app/(app)/sales/types";
import { Cell, HsnTable, PartyBlock, PrintMessage, PrintStyles, PrintToolbar, SellerBlock, TaxRows } from "../../_components/print-kit";

export default function PrintCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: cn, error, isLoading } = useQuery({
    queryKey: ["credit-note", Number(id)],
    queryFn: () => api.get<CreditNoteDetail>(`/api/credit-notes/${id}`),
  });
  return (
    <>
      <PrintStyles />
      <PrintToolbar title={cn ? `Credit Note ${cn.creditNoteNo.replace(/\//g, "-")}` : "Credit Note"} ready={!!cn} />
      {isLoading && <PrintMessage>Loading credit note…</PrintMessage>}
      {error && <PrintMessage>{errorMessage(error)}</PrintMessage>}
      {cn && <CreditNoteSheet cn={cn} />}
    </>
  );
}

function CreditNoteSheet({ cn }: { cn: CreditNoteDetail }) {
  const c = cn.invoice.companySnapshot;
  const o = cn.invoice.order;
  const spacer = Math.max(0, 10 - cn.items.length - cn.taxLines.length);
  return (
    <div className="sheet">
      {cn.status === "CANCELLED" && <div className="watermark">CANCELLED</div>}
      <div className="doc-title">Credit Note</div>

      <table className="box">
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td>
              <SellerBlock c={c} />
            </td>
            <td rowSpan={2} className="p0">
              <table className="inner">
                <tbody>
                  <tr>
                    <Cell span={1} label="Credit Note No." value={cn.creditNoteNo} />
                    <Cell span={1} label="Dated" value={formatDate(cn.date)} />
                  </tr>
                  <tr>
                    <Cell span={1} label="Against Invoice No." value={cn.invoice.invoiceNo} />
                    <Cell span={1} label="Invoice Dated" value={formatDate(cn.invoice.invoiceDate)} />
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ height: "auto" }}>
                      <div className="lbl">Reason</div>
                      <div className="val pre">{cn.reason}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <PartyBlock
                heading="Party"
                name={o.customerName}
                address={o.billingAddress}
                phone={o.customerPhone}
                gstin={o.customerGstin}
                pan={cn.customer.pan}
                stateCode={cn.customer.stateCode || o.placeOfSupplyCode}
                placeOfSupply={o.placeOfSupply}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <table className="box items">
        <colgroup>
          <col style={{ width: "5%" }} />
          <col />
          <col style={{ width: "10%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Sl No.</th>
            <th>Particulars</th>
            <th>HSN/SAC</th>
            <th>GST Rate</th>
            <th>Rate</th>
            <th>per</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {cn.items.map((i, idx) => (
            <tr key={i.id} className={idx === 0 ? "first" : undefined}>
              <td className="c">{idx + 1}</td>
              <td>
                <div className="b">{i.description}</div>
                <div className="small i">Price adjustment against {cn.invoice.invoiceNo}</div>
              </td>
              <td>{i.hsnCode}</td>
              <td className="r">{Number(i.gstRate.toFixed(3))} %</td>
              <td />
              <td />
              <td className="r b">{formatAmount(i.taxableValue)}</td>
            </tr>
          ))}
          <TaxRows lines={cn.taxLines} cols={{ before: 2, after: 0 }} />
          {spacer > 0 && (
            <tr>
              {Array.from({ length: 7 }).map((_, i) => (
                <td key={i} style={{ height: `${spacer * 5}mm` }} />
              ))}
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td className="r">Total</td>
            <td />
            <td />
            <td />
            <td />
            <td className="r grand">₹ {formatAmount(cn.total)}</td>
          </tr>
        </tfoot>
      </table>

      <table className="box">
        <tbody>
          <tr>
            <td className="words" style={{ borderBottom: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Amount (in words)</span>
                <span className="i">E. &amp; O.E</span>
              </div>
              <div className="b" style={{ fontSize: "9pt" }}>
                {cn.totalInWords}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <HsnTable rows={cn.hsnRows} isInterState={cn.isInterState} />

      <table className="box">
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} className="words" style={{ borderBottom: "none" }}>
              Tax Amount (in words) : <span className="b">{cn.taxInWords}</span>
            </td>
          </tr>
          <tr>
            <td style={{ borderRight: "none", borderTop: "none", paddingTop: 8 }}>
              {c.pan && (
                <div>
                  Company&apos;s PAN : <span className="b">{c.pan}</span>
                </div>
              )}
            </td>
            <td style={{ borderLeft: "none", borderTop: "none", paddingTop: 8 }}>
              <div style={{ border: "1px solid #000", borderRight: "none", borderBottom: "none", margin: "0 -4px -2px 0", padding: "3px 4px" }}>
                <div className="sign">
                  <div className="b">for {c.name}</div>
                  <div>Authorised Signatory</div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="footer-note">This is a Computer Generated Document</div>
    </div>
  );
}
