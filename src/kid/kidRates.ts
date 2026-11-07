import type { DadRate } from "../components/RateComparison";
import type { RatePeriodRow } from "../data/types";
import type { ISODate } from "../engine/dates";
import { addDays } from "../engine/dates";
import { formatDay } from "../lib/format";

/** The kid's rate today, plus the next scheduled change if there is one. */
export function kidDadRates(rates: RatePeriodRow[], today: ISODate): DadRate[] {
  const sorted = [...rates].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const current = [...sorted].reverse().find((r) => r.effective_from <= today);
  const next = sorted.find((r) => r.effective_from > today);
  const out: DadRate[] = [];
  if (current) {
    out.push({
      label: "Your rate now",
      short: "You, now",
      detail: next ? `Until ${formatDay(addDays(next.effective_from, -1), true)}` : "Every month",
      monthly: Number(current.monthly_rate),
    });
  }
  if (next) {
    out.push({ label: "Your rate after that", short: "You, later", detail: `From ${formatDay(next.effective_from, true)}`, monthly: Number(next.monthly_rate) });
  }
  return out;
}
