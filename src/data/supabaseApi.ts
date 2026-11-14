import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { ApiError, type BankApi } from "./api";
import { DEFAULT_TAX_BRACKETS } from "../engine/paycheck";
import type {
  FamilyData,
  JarEntry,
  Kid,
  Member,
  PayPlan,
  PayStatement,
  PinStatus,
  RatePeriodRow,
  SavingsGoal,
  TransactionRow,
  WithdrawalRequest,
} from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

/** Unwraps a Supabase result, turning database errors into readable messages. */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message;
    if (/row-level security|permission denied/i.test(msg)) throw new ApiError("You don't have permission to do that.");
    if (/duplicate key.*kids_family_id_name/i.test(msg)) throw new ApiError("There's already a kid with that name.");
    throw new ApiError(msg);
  }
  return res.data;
}

const num = (v: unknown) => Number(v);

export function createSupabaseApi(): BankApi {
  if (!url || !anonKey) throw new Error("Supabase is not configured");
  const db: SupabaseClient = createClient(url, anonKey, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  return {
    kind: "supabase",

    async currentUser() {
      const { data } = await db.auth.getSession();
      const u = data.session?.user;
      return u ? { id: u.id, email: u.email ?? "" } : null;
    },

    onAuthChange(cb) {
      const { data } = db.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },

    async sendEmailCode(email) {
      const redirect = window.location.origin + window.location.pathname;
      const { error } = await db.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: redirect },
      });
      if (error) {
        throw new ApiError(
          /signups not allowed|not found/i.test(error.message)
            ? "That email isn't set up for the Bank of Dad. Ask a parent to add you."
            : /not authorized/i.test(error.message)
              ? "Email sign-in isn't set up yet (see docs/SETUP.md, step 3c). Use your password instead."
              : error.message,
        );
      }
    },

    async verifyEmailCode(email, code) {
      const { error } = await db.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      if (error) throw new ApiError("That code didn't work. Check it, or send a new one.");
    },

    async signInWithPassword(email, password) {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw new ApiError("Wrong email or password.");
    },

    async changePassword(newPassword) {
      const { error } = await db.auth.updateUser({ password: newPassword });
      if (error) throw new ApiError(error.message);
    },

    async signOut() {
      await db.auth.signOut();
    },

    async loadFamily() {
      const { data: auth } = await db.auth.getUser();
      if (!auth.user) return null;
      const members = check(await db.from("members").select("*")) as Member[];
      const me = members.find((m) => m.user_id === auth.user!.id);
      if (!me) return null;

      const [family, kids, rates, transactions, withPin, requests, plans, statements, jars, goals] = await Promise.all([
        db.from("families").select("*").single(),
        db.from("kids").select("*").order("created_at"),
        db.from("rate_periods").select("id, kid_id, effective_from, monthly_rate").order("effective_from"),
        db.from("transactions").select("id, kid_id, kind, amount_cents, occurred_on, note, created_at").order("occurred_on"),
        db.rpc("kids_with_pin"),
        db
          .from("withdrawal_requests")
          .select("id, kid_id, amount_cents, reason, status, decided_at, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        db.from("pay_plans").select("kid_id, enabled, salary_cents, pay_day, expenses, save_pct, spend_pct, give_pct"),
        db
          .from("pay_statements")
          .select("id, kid_id, pay_month, paid_on, gross_cents, taxes, expenses, net_cents, save_cents, spend_cents, give_cents, created_at")
          .order("pay_month", { ascending: false })
          .limit(500),
        db.from("jar_entries").select("id, kid_id, jar, amount_cents, occurred_on, note, statement_id, created_at").order("occurred_on"),
        db.from("savings_goals").select("id, kid_id, name, emoji, target_cents, created_at").order("created_at"),
      ]);
      const f = check(family) as FamilyData["family"];
      return {
        me,
        members,
        family: {
          ...f,
          regular_bank_apy: num(f.regular_bank_apy),
          cd_bonus_monthly_rate: num(f.cd_bonus_monthly_rate),
          loan_monthly_rate: num(f.loan_monthly_rate),
          tax_brackets: Array.isArray(f.tax_brackets) ? f.tax_brackets : DEFAULT_TAX_BRACKETS,
        },
        kids: (check(kids) as Kid[]).map((k) => ({
          ...k,
          intro_monthly_rate: num(k.intro_monthly_rate),
          ongoing_monthly_rate: num(k.ongoing_monthly_rate),
        })),
        rates: (check(rates) as RatePeriodRow[]).map((r) => ({ ...r, monthly_rate: num(r.monthly_rate) })),
        transactions: (check(transactions) as TransactionRow[]).map((t) => ({ ...t, amount_cents: num(t.amount_cents) })),
        kidsWithPin: (check(withPin) as string[]) ?? [],
        withdrawalRequests: (check(requests) as WithdrawalRequest[]).map((r) => ({ ...r, amount_cents: num(r.amount_cents) })),
        payPlans: (check(plans) as PayPlan[]).map((p) => ({ ...p, salary_cents: num(p.salary_cents), expenses: p.expenses ?? [] })),
        payStatements: (check(statements) as PayStatement[]).map((s) => ({
          ...s,
          gross_cents: num(s.gross_cents),
          net_cents: num(s.net_cents),
          save_cents: s.save_cents === null ? null : num(s.save_cents),
          spend_cents: s.spend_cents === null ? null : num(s.spend_cents),
          give_cents: s.give_cents === null ? null : num(s.give_cents),
        })),
        jarEntries: (check(jars) as JarEntry[]).map((j) => ({ ...j, amount_cents: num(j.amount_cents) })),
        goals: (check(goals) as SavingsGoal[]).map((g) => ({ ...g, target_cents: num(g.target_cents) })),
      };
    },

    async createFamily(name, displayName, timeZone) {
      check(await db.rpc("create_family", { p_name: name, p_display_name: displayName, p_time_zone: timeZone }));
    },
    async updateFamily(familyId, settings) {
      check(await db.from("families").update(settings).eq("id", familyId));
    },
    async addMember(email, role, displayName) {
      check(await db.rpc("add_family_member", { p_email: email, p_role: role, p_display_name: displayName }));
    },
    async removeMember(userId) {
      check(await db.rpc("remove_family_member", { p_user_id: userId }));
    },

    async addKid(familyId, kid) {
      check(await db.from("kids").insert({ family_id: familyId, ...kid }));
    },
    async updateKid(kidId, changes) {
      check(await db.from("kids").update(changes).eq("id", kidId));
    },
    async deleteKid(kidId) {
      check(await db.from("kids").delete().eq("id", kidId));
    },
    async setKidPin(kidId, pin) {
      check(await db.rpc("set_kid_pin", { p_kid: kidId, p_pin: pin }));
    },

    async addTransaction(t) {
      check(await db.from("transactions").insert(t));
    },
    async deleteTransaction(id) {
      check(await db.from("transactions").delete().eq("id", id));
    },
    async addRatePeriod(kidId, effectiveFrom, monthlyRate) {
      check(await db.from("rate_periods").insert({ kid_id: kidId, effective_from: effectiveFrom, monthly_rate: monthlyRate }));
    },
    async deleteRatePeriod(id) {
      check(await db.from("rate_periods").delete().eq("id", id));
    },

    async kidSignIn(kidId, pin) {
      const r = check(await db.rpc("kid_sign_in", { p_kid: kidId, p_pin: pin })) as { status: PinStatus; first_login: boolean };
      return { status: r.status, firstLogin: r.first_login };
    },
    async requestWithdrawal(kidId, pin, amountCents, reason) {
      const r = check(
        await db.rpc("request_withdrawal", { p_kid: kidId, p_pin: pin, p_amount_cents: amountCents, p_reason: reason }),
      ) as { status: PinStatus };
      return r.status;
    },
    async cancelWithdrawal(kidId, pin, requestId) {
      return check(await db.rpc("cancel_withdrawal", { p_kid: kidId, p_pin: pin, p_request: requestId })) as PinStatus;
    },
    async decideWithdrawal(requestId, approve) {
      check(await db.rpc("decide_withdrawal", { p_request: requestId, p_approve: approve }));
    },
    async savePayPlan(plan) {
      check(await db.from("pay_plans").upsert({ ...plan, updated_at: new Date().toISOString() }, { onConflict: "kid_id" }));
    },
    async postPaycheck(due) {
      check(
        await db.rpc("post_paycheck", {
          p_kid: due.kid_id,
          p_pay_month: due.payMonth,
          p_paid_on: due.paidOn,
          p_gross_cents: due.paycheck.grossCents,
          p_taxes: due.paycheck.taxes,
          p_expenses: due.paycheck.expenses,
          p_net_cents: due.paycheck.netCents,
          p_save_cents: due.split.saveCents,
          p_spend_cents: due.split.spendCents,
          p_give_cents: due.split.giveCents,
        }),
      );
    },
    async addJarEntry(kidId, jar, amountCents, note, occurredOn) {
      check(await db.from("jar_entries").insert({ kid_id: kidId, jar, amount_cents: amountCents, note, occurred_on: occurredOn }));
    },
    async deleteJarEntry(id) {
      check(await db.from("jar_entries").delete().eq("id", id));
    },
    async moveToSavings(kidId, pin, cents) {
      const r = check(await db.rpc("move_to_savings", { p_kid: kidId, p_pin: pin, p_cents: cents })) as { status: PinStatus };
      return r.status;
    },
    async addGoal(goal, pin) {
      if (pin === undefined) {
        check(await db.from("savings_goals").insert(goal));
        return "ok";
      }
      const r = check(
        await db.rpc("kid_add_goal", {
          p_kid: goal.kid_id,
          p_pin: pin,
          p_name: goal.name,
          p_emoji: goal.emoji,
          p_target_cents: goal.target_cents,
        }),
      ) as { status: PinStatus };
      return r.status;
    },
    async removeGoal(kidId, goalId, pin) {
      if (pin === undefined) {
        check(await db.from("savings_goals").delete().eq("id", goalId));
        return "ok";
      }
      const r = check(await db.rpc("kid_remove_goal", { p_kid: kidId, p_pin: pin, p_goal: goalId })) as { status: PinStatus };
      return r.status;
    },
  };
}
