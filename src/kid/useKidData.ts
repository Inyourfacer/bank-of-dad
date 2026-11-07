import { useMemo } from "react";
import { useApp } from "../data/AppContext";
import type { Kid } from "../data/types";
import { useAccounts } from "../data/useAccounts";

/** Everything one kid's screens need, computed as of today. */
export function useKidData(kid: Kid) {
  const { data, today } = useApp();
  const accounts = useAccounts();
  return useMemo(() => {
    const rates = data?.rates.filter((r) => r.kid_id === kid.id) ?? [];
    const transactions = data?.transactions.filter((t) => t.kid_id === kid.id) ?? [];
    const requests = data?.withdrawalRequests.filter((r) => r.kid_id === kid.id) ?? [];
    const pending = requests.filter((r) => r.status === "pending");
    const pendingCents = pending.reduce((s, r) => s + r.amount_cents, 0);
    const account = accounts.get(kid.id)!;
    return {
      today,
      rates,
      transactions,
      requests,
      pending,
      pendingCents,
      account,
      availableCents: Math.max(0, account.balanceCents - pendingCents),
      bankApy: data?.family.regular_bank_apy ?? 0.005,
    };
  }, [data, accounts, kid.id, today]);
}
