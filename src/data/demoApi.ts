/**
 * In-memory backend for trying the app without Supabase. It mirrors the
 * database rules (see supabase/migrations) closely enough to be honest, and
 * keeps its data in sessionStorage so a reload doesn't wipe it.
 */

import { type ISODate, addDays, addMonths, startOfMonth, todayInZone } from "../engine/dates";
import { ApiError, type BankApi, type SessionUser } from "./api";
import type { Family, FamilyData, Kid, Member, PinStatus, RatePeriodRow, Role, TransactionRow, WithdrawalRequest } from "./types";

interface DemoDb {
  family: Family;
  members: Member[];
  kids: Kid[];
  rates: RatePeriodRow[];
  transactions: TransactionRow[];
  pins: Record<string, string>;
  /** Failed PIN attempts and lock expiry (ms since epoch) per kid. */
  pinFails: Record<string, { count: number; lockedUntil: number }>;
  requests: WithdrawalRequest[];
  user: (SessionUser & { role: Role }) | null;
}

const STORAGE_KEY = "bank-of-dad-demo";
const DAD = { id: "demo-dad", email: "dad@demo.family" };
const MOM = { id: "demo-mom", email: "mom@demo.family" };
const TABLET = { id: "demo-tablet", email: "tablet@demo.family" };

let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function seed(): DemoDb {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const today = todayInZone(tz);
  const family: Family = {
    id: "demo-family",
    name: "The Demo Family",
    time_zone: tz,
    regular_bank_apy: 0.005,
    cd_bonus_monthly_rate: 0.01,
    loan_monthly_rate: 0.03,
  };
  const kid = (name: string, avatar: string, mode: Kid["mode"], openedMonthsAgo: number | null): Kid => ({
    id: `demo-kid-${name.toLowerCase()}`,
    family_id: family.id,
    name,
    avatar,
    mode,
    intro_monthly_rate: 0.02,
    intro_months: 3,
    ongoing_monthly_rate: 0.01,
    account_opened_on: openedMonthsAgo === null ? null : addMonths(today, -openedMonthsAgo),
    created_at: new Date().toISOString(),
  });
  const kids = [kid("Ava", "🦊", "standard", 7), kid("Ben", "🐢", "standard", 2), kid("Cora", "🦄", "junior", null)];

  const rates: RatePeriodRow[] = [];
  for (const k of kids) if (k.account_opened_on) rates.push(...openingRates(k, k.account_opened_on));

  const t = (k: Kid, daysAgo: number, cents: number, kind: TransactionRow["kind"], note: string | null): TransactionRow => ({
    id: id("txn"),
    kid_id: k.id,
    kind,
    amount_cents: cents,
    occurred_on: addDays(today, -daysAgo),
    note,
    created_at: new Date().toISOString(),
  });
  const [ava, ben, cora] = kids;
  const transactions = [
    t(ava, 212, 5000, "deposit", "Opening deposit"),
    t(ava, 150, 2500, "deposit", "Birthday from Grandma"),
    t(ava, 90, -1200, "withdrawal", "Movie tickets"),
    t(ava, 40, 2000, "deposit", "Allowance savings"),
    t(ben, 61, 2000, "deposit", "Opening deposit"),
    t(ben, 20, 1000, "deposit", "Mowed the lawn"),
    t(cora, 10, 1500, "deposit", "Tooth fairy"),
  ];

  return {
    family,
    members: [
      { user_id: DAD.id, family_id: family.id, role: "parent", display_name: "Dad" },
      { user_id: MOM.id, family_id: family.id, role: "parent", display_name: "Mom" },
      { user_id: TABLET.id, family_id: family.id, role: "device", display_name: "Kids tablet" },
    ],
    kids,
    rates,
    transactions,
    pins: { [ava.id]: "1234", [ben.id]: "1234" },
    pinFails: {},
    requests: [
      {
        id: id("req"),
        kid_id: ava.id,
        amount_cents: 500,
        reason: "Ice cream with friends",
        status: "pending",
        decided_at: null,
        created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      },
    ],
    user: null,
  };
}

function openingRates(k: Kid, openedOn: ISODate): RatePeriodRow[] {
  const out: RatePeriodRow[] = [];
  if (k.intro_months > 0) out.push({ id: id("rate"), kid_id: k.id, effective_from: openedOn, monthly_rate: k.intro_monthly_rate });
  out.push({ id: id("rate"), kid_id: k.id, effective_from: addMonths(openedOn, k.intro_months), monthly_rate: k.ongoing_monthly_rate });
  return out;
}

function load(): DemoDb {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDb;
      // Demo data saved by an older version of the app.
      db.requests ??= [];
      db.pinFails ??= {};
      return db;
    }
  } catch {
    /* storage unavailable: fall through to a fresh seed */
  }
  return seed();
}

export function resetDemo() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface DemoApi extends BankApi {
  signInAs(role: Role): Promise<void>;
}

export function createDemoApi(): DemoApi {
  const db = load();
  const listeners = new Set<() => void>();
  const save = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* ignore */
    }
  };
  const changed = () => {
    save();
    listeners.forEach((l) => l());
  };
  const today = () => todayInZone(db.family.time_zone);
  const requireParent = () => {
    if (db.user?.role !== "parent") throw new ApiError("You don't have permission to do that.");
  };
  const kidById = (kidId: string) => {
    const k = db.kids.find((x) => x.id === kidId);
    if (!k) throw new ApiError("Kid not found.");
    return k;
  };
  const tick = () => new Promise((r) => setTimeout(r, 120));

  /** Mirrors check_kid_pin: 5 misses lock the profile for a minute. */
  const checkPin = (kidId: string, pin: string): PinStatus => {
    kidById(kidId);
    const real = db.pins[kidId];
    if (!real) return "no_pin";
    const f = (db.pinFails[kidId] ??= { count: 0, lockedUntil: 0 });
    if (f.lockedUntil > Date.now()) return "locked";
    if (pin === real) {
      f.count = 0;
      f.lockedUntil = 0;
      return "ok";
    }
    f.count += 1;
    if (f.count >= 5) {
      f.count = 0;
      f.lockedUntil = Date.now() + 60_000;
      save();
      return "locked";
    }
    save();
    return "wrong";
  };

  const api: DemoApi = {
    kind: "demo",

    async currentUser() {
      return db.user ? { id: db.user.id, email: db.user.email } : null;
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signInAs(role) {
      db.user = role === "parent" ? { ...DAD, role } : { ...TABLET, role };
      changed();
    },
    async sendEmailCode() {
      await tick();
    },
    async verifyEmailCode() {
      await api.signInAs("parent");
    },
    async signInWithPassword() {
      await api.signInAs("device");
    },
    async changePassword(newPassword) {
      if (newPassword.length < 8) throw new ApiError("Use at least 8 characters.");
    },
    async signOut() {
      db.user = null;
      changed();
    },

    async loadFamily(): Promise<FamilyData | null> {
      await tick();
      const me = db.members.find((m) => m.user_id === db.user?.id);
      if (!me) return null;
      return structuredClone({
        me,
        family: db.family,
        members: db.members,
        kids: db.kids,
        rates: [...db.rates].sort((a, b) => a.effective_from.localeCompare(b.effective_from)),
        transactions: [...db.transactions].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)),
        kidsWithPin: Object.keys(db.pins),
        withdrawalRequests: [...db.requests].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      });
    },
    async createFamily() {
      throw new ApiError("The demo already has a family.");
    },
    async updateFamily(_familyId, settings) {
      requireParent();
      Object.assign(db.family, settings);
      changed();
    },
    async addMember(email, role, displayName) {
      requireParent();
      if (db.members.some((m) => m.display_name === displayName)) throw new ApiError("That user already belongs to a family.");
      db.members.push({ user_id: id(`demo-${email}`), family_id: db.family.id, role, display_name: displayName });
      changed();
    },
    async removeMember(userId) {
      requireParent();
      if (userId === db.user?.id) throw new ApiError("You can't remove yourself.");
      db.members = db.members.filter((m) => m.user_id !== userId);
      changed();
    },

    async addKid(familyId, kid) {
      requireParent();
      if (db.kids.some((k) => k.name.toLowerCase() === kid.name.trim().toLowerCase())) {
        throw new ApiError("There's already a kid with that name.");
      }
      db.kids.push({ ...kid, id: id("kid"), family_id: familyId, account_opened_on: null, created_at: new Date().toISOString() });
      changed();
    },
    async updateKid(kidId, changes) {
      requireParent();
      Object.assign(kidById(kidId), changes);
      changed();
    },
    async deleteKid(kidId) {
      requireParent();
      db.kids = db.kids.filter((k) => k.id !== kidId);
      db.rates = db.rates.filter((r) => r.kid_id !== kidId);
      db.transactions = db.transactions.filter((t) => t.kid_id !== kidId);
      db.requests = db.requests.filter((r) => r.kid_id !== kidId);
      delete db.pins[kidId];
      changed();
    },
    async setKidPin(kidId, pin) {
      requireParent();
      if (!/^\d{4}$/.test(pin)) throw new ApiError("PIN must be 4 digits.");
      db.pins[kidId] = pin;
      changed();
    },

    async addTransaction(t) {
      requireParent();
      const k = kidById(t.kid_id);
      if (t.occurred_on > today()) throw new ApiError("Transactions can't be dated in the future.");
      if (k.account_opened_on && t.occurred_on < startOfMonth(today())) {
        throw new ApiError("That month's Payday is final. Use a date in the current month, or record an adjustment.");
      }
      db.transactions.push({ ...t, id: id("txn"), created_at: new Date().toISOString() });
      changed();
    },
    async deleteTransaction(txnId) {
      requireParent();
      const t = db.transactions.find((x) => x.id === txnId);
      if (!t) return;
      if (kidById(t.kid_id).account_opened_on && t.occurred_on < startOfMonth(today())) {
        throw new ApiError("That month's Payday is final. Use a date in the current month, or record an adjustment.");
      }
      db.transactions = db.transactions.filter((x) => x.id !== txnId);
      changed();
    },
    async addRatePeriod(kidId, effectiveFrom, monthlyRate) {
      requireParent();
      if (!kidById(kidId).account_opened_on) throw new ApiError("This account isn't open yet. Edit the starting rates instead.");
      if (effectiveFrom < today()) throw new ApiError("Rate changes can only start today or later.");
      if (db.rates.some((r) => r.kid_id === kidId && r.effective_from === effectiveFrom)) {
        throw new ApiError("There's already a rate change on that date.");
      }
      db.rates.push({ id: id("rate"), kid_id: kidId, effective_from: effectiveFrom, monthly_rate: monthlyRate });
      changed();
    },
    async deleteRatePeriod(rateId) {
      requireParent();
      const r = db.rates.find((x) => x.id === rateId);
      if (r && r.effective_from <= today()) throw new ApiError("Rates already in effect can't be removed. Add a new rate change instead.");
      db.rates = db.rates.filter((x) => x.id !== rateId);
      changed();
    },

    async kidSignIn(kidId, pin) {
      await tick();
      const status = checkPin(kidId, pin);
      if (status !== "ok") return { status, firstLogin: false };
      const k = kidById(kidId);
      const firstLogin = !k.account_opened_on;
      if (firstLogin) {
        k.account_opened_on = today();
        db.rates.push(...openingRates(k, k.account_opened_on));
      }
      changed();
      return { status, firstLogin };
    },
    async requestWithdrawal(kidId, pin, amountCents, reason) {
      await tick();
      const status = checkPin(kidId, pin);
      if (status !== "ok") return status;
      if (!kidById(kidId).account_opened_on) throw new ApiError("This account isn't open yet.");
      if (amountCents <= 0) throw new ApiError("Enter an amount.");
      if (db.requests.filter((r) => r.kid_id === kidId && r.status === "pending").length >= 5) {
        throw new ApiError("You already have 5 requests waiting. Ask a parent to look at them first.");
      }
      db.requests.push({
        id: id("req"),
        kid_id: kidId,
        amount_cents: amountCents,
        reason: reason.trim() || null,
        status: "pending",
        decided_at: null,
        created_at: new Date().toISOString(),
      });
      changed();
      return status;
    },
    async cancelWithdrawal(kidId, pin, requestId) {
      const status = checkPin(kidId, pin);
      if (status !== "ok") return status;
      const r = db.requests.find((x) => x.id === requestId && x.kid_id === kidId && x.status === "pending");
      if (!r) throw new ApiError("That request isn't waiting anymore.");
      r.status = "cancelled";
      r.decided_at = new Date().toISOString();
      changed();
      return status;
    },
    async decideWithdrawal(requestId, approve) {
      requireParent();
      const r = db.requests.find((x) => x.id === requestId);
      if (!r) throw new ApiError("Request not found.");
      if (r.status !== "pending") throw new ApiError(`That request was already ${r.status}.`);
      if (approve) {
        db.transactions.push({
          id: id("txn"),
          kid_id: r.kid_id,
          kind: "withdrawal",
          amount_cents: -r.amount_cents,
          occurred_on: today(),
          note: r.reason ?? "Withdrawal",
          created_at: new Date().toISOString(),
        });
      }
      r.status = approve ? "approved" : "denied";
      r.decided_at = new Date().toISOString();
      changed();
    },
  };
  return api;
}
