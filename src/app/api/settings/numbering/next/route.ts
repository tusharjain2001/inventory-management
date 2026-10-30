import { z } from "zod";
import { db, transaction, type DbOrTx } from "@/lib/db";
import { AppError, body, handler } from "@/lib/http";
import { audit } from "@/lib/audit";
import { financialYear } from "@/lib/dates";
import { getSettingsGroup } from "@/lib/settings";
import { formatDocNumber, peekNextNumber, setNextNumber, type SeriesKey } from "@/lib/numbering";

const SERIES: SeriesKey[] = ["invoice", "order", "creditNote", "payment", "stockIn", "adjustment", "loss", "display", "displayReturn", "customer"];

/** Series that run across financial years (mirrors numbering.ts). */
const yearOf = (key: SeriesKey, date: Date) => (key === "customer" ? "ALL" : financialYear(date));

/** Which of these document numbers already exist for the series. */
async function existingNumbers(client: DbOrTx, key: SeriesKey, nos: string[]): Promise<string[]> {
  const where = { in: nos };
  switch (key) {
    case "invoice":
      return (await client.invoice.findMany({ where: { invoiceNo: where }, select: { invoiceNo: true } })).map((r) => r.invoiceNo);
    case "order":
      return (await client.salesOrder.findMany({ where: { orderNo: where }, select: { orderNo: true } })).map((r) => r.orderNo);
    case "creditNote":
      return (await client.creditNote.findMany({ where: { creditNoteNo: where }, select: { creditNoteNo: true } })).map((r) => r.creditNoteNo);
    case "payment":
      return (await client.payment.findMany({ where: { paymentNo: where }, select: { paymentNo: true } })).map((r) => r.paymentNo);
    case "stockIn":
      return (await client.stockIn.findMany({ where: { stockInNo: where }, select: { stockInNo: true } })).map((r) => r.stockInNo);
    case "adjustment":
      return (await client.stockAdjustment.findMany({ where: { adjustmentNo: where }, select: { adjustmentNo: true } })).map((r) => r.adjustmentNo);
    case "loss":
      return (await client.stockLoss.findMany({ where: { lossNo: where }, select: { lossNo: true } })).map((r) => r.lossNo);
    case "display":
      return (await client.displayIssue.findMany({ where: { displayNo: where }, select: { displayNo: true } })).map((r) => r.displayNo);
    case "displayReturn":
      return (await client.displayReturn.findMany({ where: { returnNo: where }, select: { returnNo: true } })).map((r) => r.returnNo);
    case "customer":
      return (await client.customer.findMany({ where: { code: where }, select: { code: true } })).map((r) => r.code);
  }
}

/** Next number (current financial year) and a preview of the formatted number, per series. */
export const GET = handler({ permission: ["settings.view", "settings.manage"] }, async () => {
  const now = new Date();
  const numbering = await getSettingsGroup("numbering");
  const rows = await db.numberSeries.findMany({ where: { financialYear: { in: [financialYear(now), "ALL"] } } });
  const data = await Promise.all(
    SERIES.map(async (key) => {
      const next = await peekNextNumber(db, key, now);
      const started = rows.some((r) => r.key === key && r.financialYear === yearOf(key, now));
      return {
        key,
        financialYear: yearOf(key, now),
        nextNumber: next,
        started,
        preview: formatDocNumber(numbering[key], next, now),
      };
    }),
  );
  return { financialYear: financialYear(now), data };
});

const putSchema = z.object({
  key: z.enum(SERIES as [SeriesKey, ...SeriesKey[]]),
  nextNumber: z.coerce.number({ message: "Enter a number" }).int("Whole numbers only").min(1, "Must be 1 or more").max(99_999_999),
});

/**
 * Sets the next number for the current financial year, e.g. to continue an existing (Tally) series.
 * Lowering it is allowed only while none of the skipped-back numbers have been issued.
 */
export const PUT = handler({ permission: "settings.manage" }, async ({ req, user, ip }) => {
  const { key, nextNumber } = await body(req, putSchema);
  const now = new Date();
  return transaction(async (tx) => {
    const fy = yearOf(key, now);
    // Lock the counter row so a document cannot take a number while we change it.
    await tx.$queryRaw`SELECT 1 FROM "NumberSeries" WHERE "key" = ${key} AND "financialYear" = ${fy} FOR UPDATE`;
    const numbering = await getSettingsGroup("numbering", tx);
    const cfg = numbering[key];
    const current = await peekNextNumber(tx, key, now);
    if (nextNumber === current) return { key, nextNumber, preview: formatDocNumber(cfg, nextNumber, now) };

    const lo = Math.min(nextNumber, current);
    const hi = nextNumber < current ? current - 1 : nextNumber;
    if (hi - lo > 20_000) {
      throw new AppError(400, "That is too far back to check. Set a number at or above the current next number.", {
        nextNumber: [`Must be ${current} or more`],
      });
    }
    const seqs = nextNumber < current ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : [nextNumber];
    const candidates = seqs.map((n) => formatDocNumber(cfg, n, now));
    const used = new Set(await existingNumbers(tx, key, candidates));
    if (used.size) {
      const highest = Math.max(...seqs.filter((_, i) => used.has(candidates[i])));
      throw new AppError(409, `${formatDocNumber(cfg, highest, now)} has already been issued. Choose ${highest + 1} or higher.`, {
        nextNumber: [`Must be ${highest + 1} or more`],
      });
    }

    await setNextNumber(tx, key, nextNumber, now);
    await audit(tx, {
      userId: user.id,
      action: "SETTINGS",
      entity: "NumberSeries",
      entityId: `${key}:${fy}`,
      summary: `Set next ${key} number to ${formatDocNumber(cfg, nextNumber, now)} (${fy === "ALL" ? "all years" : `FY ${fy}`})`,
      before: { nextNumber: current },
      after: { nextNumber },
      ip,
    });
    return { key, nextNumber, preview: formatDocNumber(cfg, nextNumber, now) };
  });
});
