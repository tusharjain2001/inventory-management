import { db } from "@/lib/db";
import { badRequest, handler, intParam, notFound } from "@/lib/http";
import { audit } from "@/lib/audit";
import { deleteUpload, saveUpload } from "@/lib/storage";
import { invoiceScope } from "@/lib/sales";

/** Attaches the e-way bill PDF (downloaded from ewaybillgst.gov.in) to the invoice; replaces any earlier file. */
export const POST = handler<{ id: string }>({ permission: "invoices.manage" }, async ({ req, params, user, ip }) => {
  const id = intParam(params.id);
  const inv = await db.invoice.findFirst({ where: { id, ...invoiceScope(user) } });
  if (!inv) throw notFound("Invoice");
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw badRequest("Choose the e-way bill file");

  const saved = await saveUpload(file, "eway-bills");
  const updated = await db.invoice.update({ where: { id }, data: { eWayBillFileUrl: saved.url, eWayBillFilePath: saved.path } });
  await deleteUpload(inv.eWayBillFilePath);
  await audit(db, {
    userId: user.id,
    action: "UPDATE",
    entity: "Invoice",
    entityId: id,
    summary: `${inv.eWayBillFilePath ? "Replaced" : "Uploaded"} the e-way bill file on invoice ${inv.invoiceNo}`,
    ip,
  });
  return { eWayBillFileUrl: updated.eWayBillFileUrl };
});

export const DELETE = handler<{ id: string }>({ permission: "invoices.manage" }, async ({ params, user, ip }) => {
  const id = intParam(params.id);
  const inv = await db.invoice.findFirst({ where: { id, ...invoiceScope(user) } });
  if (!inv) throw notFound("Invoice");
  await db.invoice.update({ where: { id }, data: { eWayBillFileUrl: null, eWayBillFilePath: null } });
  await deleteUpload(inv.eWayBillFilePath);
  await audit(db, { userId: user.id, action: "UPDATE", entity: "Invoice", entityId: id, summary: `Removed the e-way bill file from invoice ${inv.invoiceNo}`, ip });
  return { ok: true };
});
