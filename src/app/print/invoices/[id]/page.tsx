"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api-client";
import { round2 } from "@/lib/calc";
import { formatAmount, formatDate, formatPercent, formatQty, label } from "@/lib/format";
import type { InvoiceDetail } from "@/app/(app)/sales/types";
import { Cell, HsnTable, PartyBlock, PrintMessage, PrintStyles, PrintToolbar, SellerBlock, TaxRows, amt } from "../../_components/print-kit";

/** Tally-style A4 Tax Invoice. Company details come from the snapshot stored on the invoice. */
export default function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: inv, error, isLoading } = useQuery({
    queryKey: ["invoice", Number(id)],
    queryFn: () => api.get<InvoiceDetail>(`/api/invoices/${id}`),
  });

  return (
    <>
      <PrintStyles />
      <PrintToolbar title={inv ? `Invoice ${inv.invoiceNo.replace(/\//g, "-")}` : "Invoice"} ready={!!inv} />
      {isLoading && <PrintMessage>Loading invoice…</PrintMessage>}
      {error && <PrintMessage>{errorMessage(error)}</PrintMessage>}
      {inv && <InvoiceSheet inv={inv} />}
    </>
  );
}

const MIN_BODY_ROWS = 14;

function InvoiceSheet({ inv }: { inv: InvoiceDetail }) {
  const c = inv.companySnapshot;
  const o = inv.order;
  const items = o.items;
  const hasDisc = items.some((i) => i.discountAmount > 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const receiptModes = [...new Set(inv.payments.filter((p) => p.type === "RECEIPT").map((p) => label(p.mode)))];
  const terms = [o.paymentTermsDays ? `${o.paymentTermsDays} Days` : "", receiptModes.join(" / ")].filter(Boolean).join(" · ");

  const extras: { label: string; amount: number }[] = [];
  if (o.invoiceDiscountAmount > 0) {
    extras.push({
      label: `Less : Discount${o.invoiceDiscountType === "PERCENT" ? ` @ ${formatPercent(o.invoiceDiscountValue)}` : ""}`,
      amount: -o.invoiceDiscountAmount,
    });
  }
  if (o.otherCharges > 0) extras.push({ label: o.otherChargesLabel || "Other Charges", amount: o.otherCharges });
  const roundRow = Math.abs(o.roundOff) > 0.001 ? { label: "Round Off", amount: o.roundOff } : null;

  // Rows that are used, so the item area keeps a steady height like Tally's form.
  const usedRows = items.length * 1.6 + extras.length + inv.taxLines.length + (roundRow ? 1 : 0);
  const spacer = Math.max(0, MIN_BODY_ROWS - usedRows);
  const extraCols = { before: 3, after: hasDisc ? 1 : 0 };
  const exRate = (unitPrice: number, inclusive: boolean, rate: number) => (inclusive ? round2(unitPrice / (1 + rate / 100)) : unitPrice);

  const buyerStateCode = inv.customer.stateCode || o.placeOfSupplyCode;
  const terms_ = c.termsAndConditions?.trim();

  return (
    <div className="sheet">
      {inv.status === "CANCELLED" && <div className="watermark">CANCELLED</div>}
      <div className="doc-title">
        Tax Invoice
        <span className="copy">(ORIGINAL FOR RECIPIENT)</span>
      </div>

      {/* Header: seller + buyer (left), reference grid (right) */}
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
            <td rowSpan={o.shippingAddress ? 3 : 2} className="p0">
              <table className="inner">
                <colgroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <col key={i} style={{ width: `${100 / 6}%` }} />
                  ))}
                </colgroup>
                <tbody>
                  <tr>
                    <Cell span={2} label="Invoice No." value={inv.invoiceNo} />
                    <Cell span={2} label="e-Way Bill No." value={inv.eWayBillNo} />
                    <Cell span={2} label="Dated" value={formatDate(inv.invoiceDate)} />
                  </tr>
                  <tr>
                    <Cell span={3} label="Delivery Note" value={inv.deliveryNote} />
                    <Cell span={3} label="Mode/Terms of Payment" value={terms} />
                  </tr>
                  <tr>
                    <Cell span={3} label="Supplier's Ref." value={inv.supplierRef} />
                    <Cell span={3} label="Other Reference(s)" value={inv.otherReferences} />
                  </tr>
                  <tr>
                    <Cell span={3} label="Buyer's Order No." value={inv.buyersOrderNo} />
                    <Cell span={3} label="Dated" value={formatDate(inv.buyersOrderDate)} />
                  </tr>
                  <tr>
                    <Cell span={3} label="Despatch Document No." value={inv.despatchDocNo} />
                    <Cell span={3} label="Delivery Note Date" value={undefined} />
                  </tr>
                  <tr>
                    <Cell span={3} label="Despatched through" value={inv.despatchedThrough} />
                    <Cell span={3} label="Destination" value={inv.destination} />
                  </tr>
                  <tr>
                    <td colSpan={6} style={{ height: "auto" }}>
                      <div className="lbl">Terms of Delivery</div>
                      <div className="val pre">{inv.termsOfDelivery || " "}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          {o.shippingAddress && (
            <tr>
              <td>
                <PartyBlock heading="Consignee (Ship to)" name={o.customerName} address={o.shippingAddress} />
              </td>
            </tr>
          )}
          <tr>
            <td>
              <PartyBlock
                heading={o.shippingAddress ? "Buyer (Bill to)" : "Buyer"}
                name={o.customerName}
                address={o.billingAddress}
                phone={o.customerPhone}
                gstin={o.customerGstin}
                pan={inv.customer.pan}
                stateCode={buyerStateCode}
                placeOfSupply={o.placeOfSupply}
              />
            </td>
          </tr>
        </tbody>
      </table>

      {/* Items */}
      <table className="box items">
        <colgroup>
          <col style={{ width: "5%" }} />
          <col />
          <col style={{ width: "9%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "5%" }} />
          {hasDisc && <col style={{ width: "7%" }} />}
          <col style={{ width: "13%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Sl No.</th>
            <th>Description of Goods</th>
            <th>HSN/SAC</th>
            <th>GST Rate</th>
            <th>Quantity</th>
            <th>Rate</th>
            <th>per</th>
            {hasDisc && <th>Disc.</th>}
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, idx) => {
            const rate = i.taxType === "GST" ? i.gstRate + i.cessRate : 0;
            return (
              <tr key={i.id} className={idx === 0 ? "first" : undefined}>
                <td className="c">{idx + 1}</td>
                <td>
                  <div className="b">{i.name}</div>
                  {(i.description || i.sku) && <div className="small i">{[i.sku, i.description].filter(Boolean).join(" · ")}</div>}
                </td>
                <td>{i.hsnCode}</td>
                <td className="r">{i.taxType === "GST" ? `${Number(i.gstRate.toFixed(3))} %` : label(i.taxType)}</td>
                <td className="r b">{formatQty(i.quantity)} Nos</td>
                <td className="r">{formatAmount(exRate(i.unitPrice, i.taxInclusive, rate))}</td>
                <td>Nos</td>
                {hasDisc && (
                  <td className="r">
                    {i.discountAmount > 0 ? (i.discountPercent > 0 ? `${Number(i.discountPercent.toFixed(3))} %` : formatAmount(i.discountAmount)) : ""}
                  </td>
                )}
                <td className="r b">{formatAmount(round2(i.taxableValue + i.invoiceDiscountShare))}</td>
              </tr>
            );
          })}
          {extras.map((e) => (
            <ExtraRow key={e.label} label={e.label} amount={e.amount} cols={extraCols} />
          ))}
          <TaxRows lines={inv.taxLines} cols={extraCols} />
          {roundRow && <ExtraRow label={roundRow.label} amount={roundRow.amount} cols={extraCols} />}
          {spacer > 0 && (
            <tr>
              {Array.from({ length: 8 + (hasDisc ? 1 : 0) }).map((_, i) => (
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
            <td className="r">{formatQty(totalQty)} Nos</td>
            <td />
            <td />
            {hasDisc && <td />}
            <td className="r grand">₹ {formatAmount(inv.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <table className="box">
        <tbody>
          <tr>
            <td className="words" style={{ borderBottom: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Amount Chargeable (in words)</span>
                <span className="i">E. &amp; O.E</span>
              </div>
              <div className="b" style={{ fontSize: "9pt" }}>
                {inv.totalInWords}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <HsnTable rows={inv.hsnRows} isInterState={o.isInterState} />

      <table className="box">
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} className="words" style={{ borderBottom: "none" }}>
              Tax Amount (in words) : <span className="b">{inv.taxInWords}</span>
            </td>
          </tr>
          <tr>
            <td style={{ borderRight: "none", borderTop: "none", paddingTop: 8 }}>
              {c.pan && (
                <div>
                  Company&apos;s PAN : <span className="b">{c.pan}</span>
                </div>
              )}
              {c.declaration && (
                <div style={{ marginTop: 6 }}>
                  <div className="u">Declaration</div>
                  <div>{c.declaration}</div>
                </div>
              )}
              {terms_ && (
                <div style={{ marginTop: 6 }}>
                  <div className="u">Terms &amp; Conditions</div>
                  <div className="pre small">{terms_}</div>
                </div>
              )}
              {o.notes && (
                <div style={{ marginTop: 6 }}>
                  <div className="u">Remarks</div>
                  <div className="pre">{o.notes}</div>
                </div>
              )}
            </td>
            <td style={{ borderLeft: "none", borderTop: "none", paddingTop: 8 }}>
              {c.showBankDetails !== false && (c.bankName || c.bankAccountNo) && (
                <div style={{ marginBottom: 6 }}>
                  <div>Company&apos;s Bank Details</div>
                  <BankRow label="Bank Name" value={c.bankName} />
                  <BankRow label="A/c No." value={c.bankAccountNo} />
                  <BankRow label="Branch & IFS Code" value={[c.bankBranch, c.bankIfsc].filter(Boolean).join(" & ")} />
                </div>
              )}
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
      <div className="footer-note">This is a Computer Generated Invoice</div>
    </div>
  );
}

function ExtraRow({ label: text, amount, cols }: { label: string; amount: number; cols: { before: number; after: number } }) {
  return (
    <tr className="extra">
      <td />
      <td className="desc">{text}</td>
      {Array.from({ length: cols.before + 2 + cols.after }).map((_, i) => (
        <td key={i} />
      ))}
      <td className="r b">{amt(amount)}</td>
    </tr>
  );
}

function BankRow({ label: text, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "38% 1fr" }}>
      <span>{text}</span>
      <span className="b">: {value}</span>
    </div>
  );
}
