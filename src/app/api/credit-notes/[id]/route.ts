import { handler, intParam } from "@/lib/http";
import { getCreditNoteDetail } from "@/lib/sales";

export const GET = handler<{ id: string }>({ permission: ["creditNotes.manage", "invoices.view"] }, async ({ params, user }) =>
  getCreditNoteDetail(intParam(params.id), user),
);
