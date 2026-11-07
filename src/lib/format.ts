const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** $1,234.56 */
export const formatCents = (cents: number) => usd.format(cents / 100);

/** $1,235 — for axes and tight spaces. */
export const formatDollarsWhole = (dollars: number) => usdWhole.format(dollars);

/** 2% · 1.5% · 0.25% */
export const formatPercent = (fraction: number, maxDigits = 2) =>
  `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: maxDigits })}%`;

/** 8 months · 1 year · 2 years 3 months */
export function formatDuration(months: number): string {
  const m = Math.round(months);
  const y = Math.floor(m / 12);
  const r = m % 12;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (y === 0) return part(r, "month");
  if (r === 0) return part(y, "year");
  return `${part(y, "year")} ${part(r, "month")}`;
}

/** "Jan 2027" from an ISO date. */
export function formatMonthYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Parses a user-typed dollar amount into cents (invalid → 0). */
export function dollarsToCents(text: string): number {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** Parses a user-typed percent ("2" → 0.02). Invalid or negative → 0. */
export function percentToFraction(text: string): number {
  const n = Number(text.replace(/[%\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n / 100 : 0;
}
