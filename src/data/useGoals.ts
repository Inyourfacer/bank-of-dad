import { useMemo } from "react";
import { startOfMonth } from "../engine/dates";
import { splitTakeHome } from "../engine/paycheck";
import { useApp } from "./AppContext";
import { type GoalProjection, jarBalance, projectGoal } from "./goals";
import { paycheckFor } from "./payroll";
import type { Kid, SavingsGoal } from "./types";

export interface GoalWithProjection {
  goal: SavingsGoal;
  projection: GoalProjection;
  /** Same goal if `withdrawCents` were taken out today. */
  afterWithdraw?: GoalProjection;
}

/** A kid's jars, monthly savings from pay, and each goal's projection. */
export function useKidMoney(kid: Pick<Kid, "id" | "account_opened_on">, withdrawCents = 0) {
  const { data, today } = useApp();
  return useMemo(() => {
    if (!data) return null;
    const plan = data.payPlans.find((p) => p.kid_id === kid.id && p.enabled);
    const monthlySaveCents = plan ? splitTakeHome(paycheckFor(plan, data.family.tax_brackets).netCents, plan).saveCents : 0;
    const paidThisMonth = data.payStatements.some((s) => s.kid_id === kid.id && s.pay_month.slice(0, 10) === startOfMonth(today));
    const rates = data.rates.filter((r) => r.kid_id === kid.id);
    const transactions = data.transactions.filter((t) => t.kid_id === kid.id);
    const input = {
      openedOn: kid.account_opened_on,
      rates,
      transactions,
      today,
      monthlySaveCents,
      payDay: plan?.pay_day ?? 1,
      paidThisMonth,
    };
    const goals: GoalWithProjection[] = data.goals
      .filter((g) => g.kid_id === kid.id)
      .map((goal) => ({
        goal,
        projection: projectGoal({ ...input, targetCents: goal.target_cents }),
        afterWithdraw: withdrawCents > 0 ? projectGoal({ ...input, targetCents: goal.target_cents, withdrawCents }) : undefined,
      }));
    return {
      spendCents: jarBalance(data.jarEntries, kid.id, "spend"),
      giveCents: jarBalance(data.jarEntries, kid.id, "give"),
      jarEntries: data.jarEntries.filter((j) => j.kid_id === kid.id),
      monthlySaveCents,
      goals,
    };
  }, [data, today, kid.id, kid.account_opened_on, withdrawCents]);
}
