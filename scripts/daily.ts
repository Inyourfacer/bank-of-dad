/**
 * Daily Bank of Dad job (run by .github/workflows/daily.yml):
 *   1. Posts any interest Paydays that are due (catching up missed months).
 *   2. Pays this month's salaries on each kid's payday (pay stub + take-home).
 *   3. Touches the database, so a free Supabase project never pauses.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the secret key). The
 * secret key bypasses Row Level Security, so it lives only in GitHub secrets.
 *
 *   npx tsx scripts/daily.ts            # post Paydays
 *   npx tsx scripts/daily.ts --dry-run  # show what would be posted
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { planPaydays } from "../src/data/payday";
import { planPayroll } from "../src/data/payroll";
import type { PayPlan } from "../src/data/types";
import type { TaxBracket } from "../src/engine/paycheck";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

async function fetchAll<T>(db: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from(table).select(columns).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return out;
  }
}

async function main() {
  if (!url || !key) {
    console.log("::notice::SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set yet. Nothing to do.");
    return;
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [families, kids, rates, transactions, plans, statements] = await Promise.all([
    fetchAll<{ id: string; time_zone: string; tax_brackets: TaxBracket[] }>(db, "families", "id, time_zone, tax_brackets"),
    fetchAll<{ id: string; family_id: string; account_opened_on: string | null }>(db, "kids", "id, family_id, account_opened_on"),
    fetchAll(db, "rate_periods", "id, kid_id, effective_from, monthly_rate"),
    fetchAll(db, "transactions", "id, kid_id, kind, amount_cents, occurred_on, note, created_at, period_month"),
    fetchAll<PayPlan>(db, "pay_plans", "kid_id, enabled, salary_cents, pay_day, expenses"),
    fetchAll<{ kid_id: string; pay_month: string }>(db, "pay_statements", "kid_id, pay_month"),
  ]);
  console.log(`Checked ${families.length} famil${families.length === 1 ? "y" : "ies"}, ${kids.length} kid account(s).`);

  const plan = planPaydays({ families, kids, rates: rates as never, transactions: transactions as never });
  for (const m of plan.mismatches) {
    console.log(`::warning::Posted Payday for kid ${m.kid_id} (${m.period_month}) is ${m.posted}¢ but the ledger says ${m.expected}¢.`);
  }

  let posted = 0;
  for (const row of plan.toPost) {
    const label = `kid ${row.kid_id} ${row.period_month.slice(0, 7)}: ${(row.amount_cents / 100).toFixed(2)}`;
    if (dryRun) {
      console.log(`Would post ${label}`);
      continue;
    }
    const { error } = await db.from("transactions").insert(row);
    if (error && error.code === "23505") {
      console.log(`Already posted ${label}`); // another run got there first
    } else if (error) {
      throw new Error(`Posting ${label}: ${error.message}`);
    } else {
      posted++;
      console.log(`Posted ${label}`);
    }
  }
  console.log(dryRun ? `Dry run: ${plan.toPost.length} Payday(s) due.` : `Done: posted ${posted} Payday(s).`);

  // Salaries: this month's pay stub on each kid's payday.
  const payroll = planPayroll({
    families,
    kids,
    plans: plans.map((p) => ({ ...p, salary_cents: Number(p.salary_cents), expenses: p.expenses ?? [] })),
    statements,
  });
  let paid = 0;
  for (const due of payroll) {
    const label = `kid ${due.kid_id} ${due.payMonth.slice(0, 7)}: take-home ${(due.paycheck.netCents / 100).toFixed(2)}`;
    if (dryRun) {
      console.log(`Would pay ${label}`);
      continue;
    }
    const { error } = await db.rpc("post_paycheck", {
      p_kid: due.kid_id,
      p_pay_month: due.payMonth,
      p_paid_on: due.paidOn,
      p_gross_cents: due.paycheck.grossCents,
      p_taxes: due.paycheck.taxes,
      p_expenses: due.paycheck.expenses,
      p_net_cents: due.paycheck.netCents,
    });
    if (error && /already paid/i.test(error.message)) {
      console.log(`Already paid ${label}`);
    } else if (error) {
      throw new Error(`Paying ${label}: ${error.message}`);
    } else {
      paid++;
      console.log(`Paid ${label}`);
    }
  }
  console.log(dryRun ? `Dry run: ${payroll.length} salary payment(s) due.` : `Done: paid ${paid} salary payment(s).`);
}

main().catch((e) => {
  console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
