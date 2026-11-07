/**
 * Turns database rows into what the screens show, using the same interest
 * engine as the simulator. Interest is always derived from the ledger and rate
 * schedule; the database rules guarantee past months never change.
 */

import { type ISODate, endOfMonth, startOfMonth } from "../engine/dates";
import { type LedgerEntry, runAccount } from "../engine/interest";
import type { Kid, RatePeriodRow, TransactionRow, TxnKind } from "./types";

export interface ActivityItem {
  id: string;
  date: ISODate;
  kind: TxnKind;
  amountCents: number;
  note: string | null;
  /** Running balance after this item, when known. */
  balanceAfterCents?: number;
  /** Whether the database rules allow deleting it now. */
  deletable: boolean;
}

export interface KidAccount {
  opened: boolean;
  balanceCents: number;
  contributedCents: number;
  interestPaidCents: number;
  /** Interest earned so far this month, rounded to the cent (paid on `nextPayday`). */
  accruingCents: number;
  nextPayday: ISODate | null;
  /** Newest first. */
  activity: ActivityItem[];
}

export function computeKidAccount(
  kid: Pick<Kid, "account_opened_on">,
  rates: RatePeriodRow[],
  transactions: TransactionRow[],
  today: ISODate,
): KidAccount {
  const ledger = transactions.filter((t) => t.kind !== "interest");
  const monthStart = startOfMonth(today);
  const opened = kid.account_opened_on !== null && kid.account_opened_on <= today;

  const activity: ActivityItem[] = ledger.map((t) => ({
    id: t.id,
    date: t.occurred_on,
    kind: t.kind,
    amountCents: t.amount_cents,
    note: t.note,
    deletable: !opened || t.occurred_on >= monthStart,
  }));

  if (!opened) {
    const total = ledger.reduce((s, t) => s + t.amount_cents, 0);
    return {
      opened: false,
      balanceCents: total,
      contributedCents: total,
      interestPaidCents: 0,
      accruingCents: 0,
      nextPayday: null,
      activity: sortActivity(activity),
    };
  }

  const entries: LedgerEntry[] = ledger.map((t) => ({
    date: t.occurred_on,
    amountCents: t.amount_cents,
    kind: t.kind as LedgerEntry["kind"],
    note: t.note ?? undefined,
  }));
  const state = runAccount({
    openedOn: kid.account_opened_on!,
    rates: rates.map((r) => ({ effectiveFrom: r.effective_from, monthlyRate: Number(r.monthly_rate) })),
    entries,
    asOf: today,
  });

  for (const p of state.paydays) {
    activity.push({
      id: `payday-${p.month}`,
      date: p.date,
      kind: "interest",
      amountCents: p.amountCents,
      note: "Payday",
      balanceAfterCents: p.balanceAfterCents,
      deletable: false,
    });
  }

  const paidToday = state.paydays.some((p) => p.date === today);
  return {
    opened: true,
    balanceCents: state.balanceCents,
    contributedCents: state.contributedCents,
    interestPaidCents: state.interestPaidCents,
    accruingCents: paidToday ? 0 : Math.max(0, Math.round(state.accruedCents + state.carryCents)),
    nextPayday: endOfMonth(today),
    activity: sortActivity(activity),
  };
}

/** Newest first; on the same day, Payday comes last in time so it sorts first. */
function sortActivity(items: ActivityItem[]): ActivityItem[] {
  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind === "interest") return -1;
    if (b.kind === "interest") return 1;
    return 0;
  });
}
