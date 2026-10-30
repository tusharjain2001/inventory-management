"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api-client";
import { PrintMessage, PrintStyles, PrintToolbar } from "../../_components/print-kit";
import { type Challan, ChallanSheet } from "../../_components/challan-sheet";

const COPIES = ["ORIGINAL FOR CONSIGNOR", "DUPLICATE FOR CLIENT"];

/** Tally-style A4 Inward Challan for display stock returned to the showroom. */
export default function PrintInwardChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [copies, setCopies] = useState(2);
  const { data, error, isLoading } = useQuery({
    queryKey: ["display-return-challan", Number(id)],
    queryFn: () => api.get<Challan>(`/api/inventory/display/returns/${id}/challan`),
  });

  return (
    <>
      <PrintStyles />
      <PrintToolbar title={data ? `Inward Challan ${data.challanNo.replace(/\//g, "-")}` : "Inward Challan"} ready={!!data}>
        <select value={copies} onChange={(e) => setCopies(Number(e.target.value))} aria-label="Copies">
          <option value={1}>1 copy (office)</option>
          <option value={2}>2 copies (office + client)</option>
        </select>
      </PrintToolbar>
      {isLoading && <PrintMessage>Loading challan…</PrintMessage>}
      {error && <PrintMessage>{errorMessage(error)}</PrintMessage>}
      {data && COPIES.slice(0, copies).map((label) => <ChallanSheet key={label} ch={data} copyLabel={label} />)}
    </>
  );
}
