/**
 * Daily Bank of Dad job (run by .github/workflows/daily.yml):
 *   1. Posts any Paydays that are due (catching up missed months).
 *   2. Touches the database, so a free Supabase project never pauses.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the secret key). The
 * secret key bypasses Row Level Security, so it lives only in GitHub secrets.
 *
 *   npx tsx scripts/daily.ts            # post Paydays
 *   npx tsx scripts/daily.ts --dry-run  # show what would be posted
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { planPaydays } from "../src/data/payday";

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

  const [families, kids, rates, transactions] = await Promise.all([
    fetchAll<{ id: string; time_zone: string }>(db, "families", "id, time_zone"),
    fetchAll<{ id: string; family_id: string; account_opened_on: string | null }>(db, "kids", "id, family_id, account_opened_on"),
    fetchAll(db, "rate_periods", "id, kid_id, effective_from, monthly_rate"),
    fetchAll(db, "transactions", "id, kid_id, kind, amount_cents, occurred_on, note, created_at, period_month"),
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
}

main().catch((e) => {
  console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
