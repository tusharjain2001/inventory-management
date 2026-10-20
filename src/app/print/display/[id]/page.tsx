"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api-client";
import { formatAmount, formatDate, formatQty } from "@/lib/format";
import type { Settings } from "@/lib/settings-schema";
import { Cell, PartyBlock, PrintMessage, PrintStyles, PrintToolbar, SellerBlock } from "../../_components/print-kit";

type Challan = {
  id: number;
  challanNo: string;
  date: string;
  status: string;
  expectedReturnDate: string | null;
  locationName: string;
  address: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  remarks: string | null;
  customer: {
    name: string;
    companyName: string | null;
    mobile: string | null;
    gstin: string | null;
    billingAddress: string | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    pincode: string | null;
  } | null;
  company: Settings["company"];
  items: { id: number; name: string; sku: string; hsnCode: string | null; gstRate: number; quantity: number; rate: number; value: number }[];
  totalQty: number;
  totalValue: number;
  totalInWords: string;
};

// GST rule 55: a challan is made in triplicate.
const COPIES = ["ORIGINAL FOR CONSIGNEE", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR CONSIGNOR"];

/** Tally-style A4 Delivery Challan for stock sent to a client's place for display (Potential Sales). */
export default function PrintChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [copies, setCopies] = useState(2);
  const { data, error, isLoading } = useQuery({
    queryKey: ["display-challan", Number(id)],
    queryFn: () => api.get<Challan>(`/api/inventory/display/${id}/challan`),
  });

  return (
    <>
      <PrintStyles />
      <PrintToolbar title={data ? `Challan ${data.challanNo.replace(/\//g, "-")}` : "Delivery Challan"} ready={!!data}>
        <select value={copies} onChange={(e) => setCopies(Number(e.target.value))} aria-label="Copies">
          <option value={1}>1 copy (consignee)</option>
          <option value={2}>2 copies (consignee + office)</option>
          <option value={3}>3 copies (+ transporter)</option>
        </select>
      </PrintToolbar>
      {isLoading && <PrintMessage>Loading challan…</PrintMessage>}
      {error && <PrintMessage>{errorMessage(error)}</PrintMessage>}
      {data &&
        copyLabels(copies).map((label) => <ChallanSheet key={label} ch={data} copyLabel={label} />)}
    </>
  );
}

function copyLabels(n: number) {
  if (n === 1) return [COPIES[0]];
  if (n === 2) return [COPIES[0], COPIES[2]];
  return COPIES;
}

const MIN_BODY_ROWS = 14;

function ChallanSheet({ ch, copyLabel }: { ch: Challan; copyLabel: string }) {
  const c = ch.company;
  const cust = ch.customer;
  const spacer = Math.max(0, MIN_BODY_ROWS - ch.items.length * 1.6);
  const deliverTo = [ch.locationName, ch.address, ch.contactPerson && `Contact : ${ch.contactPerson}${ch.contactPhone ? `, ${ch.contactPhone}` : ""}`]
    .filter(Boolean)
    .join("\n");
  const custAddress = cust ? [cust.billingAddress, [cust.city, cust.pincode].filter(Boolean).join(" - ")].filter(Boolean).join("\n") : null;

  return (
    <div className="sheet">
      <div className="doc-title">
        Delivery Challan
        <span className="copy">({copyLabel})</span>
      </div>

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
                <colgroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <col key={i} style={{ width: `${100 / 6}%` }} />
                  ))}
                </colgroup>
                <tbody>
                  <tr>
                    <Cell span={3} label="Challan No." value={ch.challanNo} />
                    <Cell span={3} label="Dated" value={formatDate(ch.date)} />
                  </tr>
                  <tr>
                    <Cell span={3} label="Purpose" value="Sent for display / on approval" />
                    <Cell span={3} label="Expected Return By" value={ch.expectedReturnDate ? formatDate(ch.expectedReturnDate) : undefined} />
                  </tr>
                  <tr>
                    <Cell span={3} label="Despatched through" value={undefined} />
                    <Cell span={3} label="Vehicle No." value={undefined} />
                  </tr>
                  <tr>
                    <td colSpan={6} style={{ height: "auto" }}>
                      <div className="lbl">Deliver to</div>
                      <div className="val pre">{deliverTo}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              {cust ? (
                <PartyBlock
                  heading="Consignee"
                  name={cust.companyName || cust.name}
                  address={custAddress}
                  phone={cust.mobile}
                  gstin={cust.gstin}
                  stateCode={cust.stateCode}
                  stateName={cust.state}
                />
              ) : (
                <PartyBlock heading="Consignee" name={ch.locationName} address={ch.address} phone={ch.contactPhone} />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="box items">
        <colgroup>
          <col style={{ width: "5%" }} />
          <col />
          <col style={{ width: "9%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "14%" }} />
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
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {ch.items.map((i, idx) => (
            <tr key={i.id} className={idx === 0 ? "first" : undefined}>
              <td className="c">{idx + 1}</td>
              <td>
                <div className="b">{i.name}</div>
                <div className="small i">{i.sku}</div>
              </td>
              <td>{i.hsnCode}</td>
              <td className="r">{Number(i.gstRate.toFixed(3))} %</td>
              <td className="r b">{formatQty(i.quantity)} Nos</td>
              <td className="r">{formatAmount(i.rate)}</td>
              <td>Nos</td>
              <td className="r b">{formatAmount(i.value)}</td>
            </tr>
          ))}
          {spacer > 0 && (
            <tr>
              {Array.from({ length: 8 }).map((_, i) => (
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
            <td className="r">{formatQty(ch.totalQty)} Nos</td>
            <td />
            <td />
            <td className="r grand">₹ {formatAmount(ch.totalValue)}</td>
          </tr>
        </tfoot>
      </table>

      <table className="box">
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} className="words" style={{ borderBottom: "none" }}>
              <div>Value of Goods (in words)</div>
              <div className="b" style={{ fontSize: "9pt" }}>
                {ch.totalInWords}
              </div>
            </td>
          </tr>
          <tr>
            <td style={{ borderRight: "none", borderTop: "none", paddingTop: 8 }}>
              <div className="u">Note</div>
              <div>
                Goods sent for display / on approval only. This is not a sale and no tax is charged on this challan. The goods remain the
                property of {c.name} until invoiced, and are to be returned in good condition if not purchased.
              </div>
              {ch.remarks && (
                <div style={{ marginTop: 6 }}>
                  <div className="u">Remarks</div>
                  <div className="pre">{ch.remarks}</div>
                </div>
              )}
              <div style={{ marginTop: 18 }}>Received the above goods in good condition.</div>
              <div style={{ marginTop: 26 }}>Receiver&apos;s Signature, Name &amp; Date</div>
            </td>
            <td style={{ borderLeft: "none", borderTop: "none", paddingTop: 8, verticalAlign: "bottom" }}>
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
      <div className="footer-note">This is a Computer Generated Challan</div>
    </div>
  );
}
