/**
 * In-memory backend for trying the app without Supabase. It mirrors the
 * database rules (see supabase/migrations) closely enough to be honest, and
 * keeps its data in sessionStorage so a reload doesn't wipe it.
 */

import { type ISODate, addDays, addMonths, startOfMonth, todayInZone } from "../engine/dates";
import { ApiError, type BankApi, type SessionUser } from "./api";
import type { Family, FamilyData, Kid, Member, RatePeriodRow, Role, TransactionRow } from "./types";

interface DemoDb {
  family: Family;
  members: Member[];
  kids: Kid[];
  rates: RatePeriodRow[];
  transactions: TransactionRow[];
  pins: Record<string, string>;
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
    if (raw) return JSON.parse(raw) as DemoDb;
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
  };
  return api;
}
