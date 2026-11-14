import { cdStatus } from "../engine/cd";
import { addMonths } from "../engine/dates";
import { kidWhatIf } from "./kidProjection";
import type { FamilyData, Kid, RatePeriodRow } from "./types";

export const FORECAST_YEARS = [1, 3, 5] as const;

export interface KidForecast {
  kid: Kid;
  nowCents: number;
  /** Balance after each of FORECAST_YEARS, with no money added or taken out. */
  futureCents: number[];
}

/** An unopened account's rates as if it opened today (its first login). */
function ratesFor(kid: Kid, rates: RatePeriodRow[], today: string): RatePeriodRow[] {
  if (kid.account_opened_on) return rates.filter((r) => r.kid_id === kid.id);
  const out: RatePeriodRow[] = [];
  if (kid.intro_months > 0) out.push({ id: "intro", kid_id: kid.id, effective_from: today, monthly_rate: kid.intro_monthly_rate });
  out.push({ id: "ongoing", kid_id: kid.id, effective_from: addMonths(today, kid.intro_months), monthly_rate: kid.ongoing_monthly_rate });
  return out;
}

/** What the Bank of Dad will owe each kid in 1, 3 and 5 years at today's rates. */
export function forecastLiability(data: FamilyData, today: string): KidForecast[] {
  return data.kids.map((kid) => {
    const rates = ratesFor(kid, data.rates, today);
    const transactions = data.transactions.filter((t) => t.kid_id === kid.id);
    const run = (months: number) =>
      kidWhatIf({ kid: { account_opened_on: kid.account_opened_on ?? today }, rates, transactions, today, months, bankApy: 0 });
    // Spend and Give jars are owed too; they don't earn interest.
    const jars = (data.jarEntries ?? []).filter((j) => j.kid_id === kid.id).reduce((t, j) => t + j.amount_cents, 0);
    // Open CDs: what's locked now, and what they pay at maturity (back into savings).
    const cds = (data.cds ?? []).filter((c) => c.kid_id === kid.id && c.status === "open");
    const locked = cds.reduce((t, c) => t + c.principal_cents, 0);
    const maturing = cds.reduce((t, c) => t + cdStatus(c, c.matures_on).maturityCents, 0);
    return {
      kid,
      nowCents: run(1).now.balanceCents + jars + locked,
      futureCents: FORECAST_YEARS.map((y) => run(y * 12).scenario.balanceCents + jars + maturing),
    };
  });
}
