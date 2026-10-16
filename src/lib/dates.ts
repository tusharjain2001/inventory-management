// Client-safe date helpers. The business runs on Indian Standard Time (UTC+05:30).

const IST_OFFSET_MS = 330 * 60 * 1000;

/** YYYY-MM-DD of the given instant in IST. */
export function istDateString(d: Date | string = new Date()) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayIST() {
  return istDateString(new Date());
}

/**
 * Converts a YYYY-MM-DD form value into a stored instant. Today keeps the current time
 * (so documents sort naturally); other days are stored at 12:00 IST.
 */
export function dateFromInput(value: string | Date | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  if (value === todayIST()) return new Date();
  return new Date(`${value}T12:00:00+05:30`);
}

export function startOfDayIST(value: string) {
  return new Date(`${value}T00:00:00+05:30`);
}

export function endOfDayIST(value: string) {
  return new Date(`${value}T23:59:59.999+05:30`);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Indian financial year (April–March), e.g. "2026-27". */
export function financialYear(d: Date = new Date()) {
  const [y, m] = istDateString(d).split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** First day (YYYY-MM-DD) of the IST month containing d. */
export function monthStartIST(d: Date = new Date()) {
  return `${istDateString(d).slice(0, 7)}-01`;
}

export function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}
