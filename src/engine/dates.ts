/**
 * Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings and all
 * arithmetic is done in UTC so results never shift with the user's time zone.
 */

export type ISODate = string;

const MS_PER_DAY = 86_400_000;

function parts(d: ISODate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Invalid date: ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Days since 1970-01-01. */
export function toDayNumber(d: ISODate): number {
  const [y, m, day] = parts(d);
  return Date.UTC(y, m - 1, day) / MS_PER_DAY;
}

export function fromDayNumber(n: number): ISODate {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromDayNumber(toDayNumber(d) + n);
}

/** Number of days in a month; `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Same day-of-month `n` months later, clamped to the end of shorter months
 * (Jan 31 + 1 month = Feb 28 or 29).
 */
export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = parts(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(day, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function isLastDayOfMonth(d: ISODate): boolean {
  const [y, m, day] = parts(d);
  return day === daysInMonth(y, m);
}

export function endOfMonth(d: ISODate): ISODate {
  const [y, m] = parts(d);
  return `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

export function firstOfNextMonth(d: ISODate): ISODate {
  return addDays(endOfMonth(d), 1);
}

/** `YYYY-MM` */
export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

/** Today's date in the user's local time zone. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's date in an IANA time zone (falls back to local time if unknown). */
export function todayInZone(timeZone: string, now: Date = new Date()): ISODate {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return todayISO(now);
  }
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}
