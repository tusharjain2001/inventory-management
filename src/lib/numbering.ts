import type { Tx } from "@/lib/db";
import { financialYear } from "@/lib/dates";
import { getSettingsGroup } from "@/lib/settings";
import { formatDocNumber, type SeriesKey } from "@/lib/doc-number";

export { formatDocNumber, type SeriesKey };

/** Series that never reset by financial year. */
const NON_FY_SERIES: SeriesKey[] = ["customer"];

function seriesYear(key: SeriesKey, date: Date) {
  return NON_FY_SERIES.includes(key) ? "ALL" : financialYear(date);
}

/**
 * Allocates the next number for a document inside the caller's transaction.
 * The UPDATE ... RETURNING row lock makes numbers unique and gap-free: if the
 * transaction rolls back, the number is not consumed.
 */
export async function nextDocNumber(tx: Tx, key: SeriesKey, date: Date = new Date()) {
  const numbering = await getSettingsGroup("numbering", tx);
  const cfg = numbering[key];
  const fy = seriesYear(key, date);
  await tx.$executeRaw`
    INSERT INTO "NumberSeries" ("key", "financialYear", "nextNumber")
    VALUES (${key}, ${fy}, ${cfg.startNumber})
    ON CONFLICT ("key", "financialYear") DO NOTHING`;
  const rows = await tx.$queryRaw<{ n: number }[]>`
    UPDATE "NumberSeries" SET "nextNumber" = "nextNumber" + 1
    WHERE "key" = ${key} AND "financialYear" = ${fy}
    RETURNING "nextNumber" - 1 AS n`;
  return formatDocNumber(cfg, Number(rows[0].n), date);
}

/** Next number that would be issued (for display in settings), without consuming it. */
export async function peekNextNumber(tx: Tx, key: SeriesKey, date: Date = new Date()) {
  const numbering = await getSettingsGroup("numbering", tx);
  const row = await tx.numberSeries.findUnique({
    where: { key_financialYear: { key, financialYear: seriesYear(key, date) } },
  });
  return row?.nextNumber ?? numbering[key].startNumber;
}

/** Sets the next sequence number for the current financial year (e.g. to continue an existing series). */
export async function setNextNumber(tx: Tx, key: SeriesKey, next: number, date: Date = new Date()) {
  const fy = seriesYear(key, date);
  await tx.numberSeries.upsert({
    where: { key_financialYear: { key, financialYear: fy } },
    create: { key, financialYear: fy, nextNumber: next },
    update: { nextNumber: next },
  });
}
