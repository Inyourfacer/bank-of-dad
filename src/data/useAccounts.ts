import { useMemo } from "react";
import { type KidAccount, computeKidAccount } from "./account";
import { useApp } from "./AppContext";

/** Every kid's account, computed from the ledger as of today. */
export function useAccounts(): Map<string, KidAccount> {
  const { data, today } = useApp();
  return useMemo(() => {
    const out = new Map<string, KidAccount>();
    if (!data) return out;
    for (const k of data.kids) {
      out.set(
        k.id,
        computeKidAccount(
          k,
          data.rates.filter((r) => r.kid_id === k.id),
          data.transactions.filter((t) => t.kid_id === k.id),
          today,
        ),
      );
    }
    return out;
  }, [data, today]);
}
