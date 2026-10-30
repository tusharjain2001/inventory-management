"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api-client";
import { PrintMessage, PrintStyles, PrintToolbar } from "../../_components/print-kit";
import { type Challan, ChallanSheet } from "../../_components/challan-sheet";

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
