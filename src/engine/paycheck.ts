/**
 * Pay stubs: a pretend monthly salary minus taxes (progressive brackets) and
 * living expenses. Only the take-home pay is real money: it's deposited into
 * the kid's account. Pure, so the app, the demo and the daily job agree.
 */

export interface TaxBracket {
  /** Upper edge of this bracket in cents of monthly pay; null = no limit. */
  up_to_cents: number | null;
  /** Rate as a fraction, e.g. 0.15. */
  rate: number;
}

export interface Expense {
  name: string;
  cents: number;
}

export interface PayLine {
  label: string;
  cents: number;
}

export interface Paycheck {
  grossCents: number;
  taxes: PayLine[];
  taxCents: number;
  expenses: PayLine[];
  expenseCents: number;
  /** Take-home pay: never below zero. */
  netCents: number;
}

/** Default brackets: 10% on the first $20, 15% up to $60, 22% above. */
export const DEFAULT_TAX_BRACKETS: TaxBracket[] = [
  { up_to_cents: 2000, rate: 0.1 },
  { up_to_cents: 6000, rate: 0.15 },
  { up_to_cents: null, rate: 0.22 },
];

/** Default bills for a $100 salary, leaving $7.20 to keep. */
export const DEFAULT_EXPENSES: Expense[] = [
  { name: "Rent", cents: 4000 },
  { name: "Groceries", cents: 2000 },
  { name: "Utilities", cents: 1000 },
  { name: "Insurance", cents: 600 },
];

export const DEFAULT_SALARY_CENTS = 10000;

/** The take-home range that keeps the lesson real: a little to spend or save. */
export const TARGET_NET_CENTS = { min: 500, max: 1000 } as const;

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const pct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;

/** Brackets sorted with the open-ended one last. */
export function normalizeBrackets(brackets: TaxBracket[]): TaxBracket[] {
  return [...brackets].sort((a, b) => (a.up_to_cents ?? Infinity) - (b.up_to_cents ?? Infinity));
}

export function computeTax(grossCents: number, brackets: TaxBracket[]): PayLine[] {
  const lines: PayLine[] = [];
  let lower = 0;
  for (const b of normalizeBrackets(brackets)) {
    if (grossCents <= lower) break;
    const upper = b.up_to_cents === null ? grossCents : Math.min(grossCents, b.up_to_cents);
    const taxable = upper - lower;
    if (taxable > 0 && b.rate > 0) {
      const label =
        b.up_to_cents === null
          ? `${pct(b.rate)} on pay above ${dollars(lower)}`
          : lower === 0
            ? `${pct(b.rate)} on the first ${dollars(b.up_to_cents)}`
            : `${pct(b.rate)} on ${dollars(lower)} to ${dollars(b.up_to_cents)}`;
      lines.push({ label, cents: Math.round(taxable * b.rate) });
    }
    if (b.up_to_cents === null) break;
    lower = b.up_to_cents;
  }
  return lines;
}

export function computePaycheck(grossCents: number, brackets: TaxBracket[], expenses: Expense[]): Paycheck {
  const taxes = computeTax(grossCents, brackets);
  const taxCents = taxes.reduce((s, l) => s + l.cents, 0);
  const bills = expenses.filter((e) => e.cents > 0).map((e) => ({ label: e.name, cents: e.cents }));
  const expenseCents = bills.reduce((s, l) => s + l.cents, 0);
  return {
    grossCents,
    taxes,
    taxCents,
    expenses: bills,
    expenseCents,
    netCents: Math.max(0, grossCents - taxCents - expenseCents),
  };
}

export interface Split {
  save_pct: number;
  spend_pct: number;
  give_pct: number;
}

export interface SplitCents {
  saveCents: number;
  spendCents: number;
  giveCents: number;
}

export const DEFAULT_SPLIT: Split = { save_pct: 50, spend_pct: 40, give_pct: 10 };

/** Splits take-home pay into Save / Spend / Give. Savings gets any rounding cent. */
export function splitTakeHome(netCents: number, split: Split): SplitCents {
  const spendCents = Math.round((netCents * split.spend_pct) / 100);
  // Never let rounding take more than what's left after Spend.
  const giveCents = Math.min(Math.round((netCents * split.give_pct) / 100), netCents - spendCents);
  return { saveCents: netCents - spendCents - giveCents, spendCents, giveCents };
}
