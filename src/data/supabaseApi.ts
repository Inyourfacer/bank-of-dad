import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { ApiError, type BankApi } from "./api";
import type { FamilyData, Kid, Member, RatePeriodRow, TransactionRow } from "./types";

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

    async signOut() {
      await db.auth.signOut();
    },

    async loadFamily() {
      const { data: auth } = await db.auth.getUser();
      if (!auth.user) return null;
      const members = check(await db.from("members").select("*")) as Member[];
      const me = members.find((m) => m.user_id === auth.user!.id);
      if (!me) return null;

      const [family, kids, rates, transactions, withPin] = await Promise.all([
        db.from("families").select("*").single(),
        db.from("kids").select("*").order("created_at"),
        db.from("rate_periods").select("id, kid_id, effective_from, monthly_rate").order("effective_from"),
        db.from("transactions").select("id, kid_id, kind, amount_cents, occurred_on, note, created_at").order("occurred_on"),
        db.rpc("kids_with_pin"),
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
        },
        kids: (check(kids) as Kid[]).map((k) => ({
          ...k,
          intro_monthly_rate: num(k.intro_monthly_rate),
          ongoing_monthly_rate: num(k.ongoing_monthly_rate),
        })),
        rates: (check(rates) as RatePeriodRow[]).map((r) => ({ ...r, monthly_rate: num(r.monthly_rate) })),
        transactions: (check(transactions) as TransactionRow[]).map((t) => ({ ...t, amount_cents: num(t.amount_cents) })),
        kidsWithPin: (check(withPin) as string[]) ?? [],
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
  };
}
