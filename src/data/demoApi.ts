/**
 * In-memory backend for trying the app without Supabase. It mirrors the
 * database rules (see supabase/migrations) closely enough to be honest, and
 * keeps its data in sessionStorage so a reload doesn't wipe it.
 */

import { type ISODate, addDays, addMonths, startOfMonth, todayInZone } from "../engine/dates";
import { cdStatus, fullMonthsBetween, grow, loanStatus } from "../engine/cd";
import { DEFAULT_EXPENSES, DEFAULT_SPLIT, DEFAULT_TAX_BRACKETS, type Expense, splitTakeHome } from "../engine/paycheck";
import { ApiError, type BankApi, type SessionUser } from "./api";
import { paycheckFor, paydayFor } from "./payroll";
import type {
  Cd,
  Family,
  FamilyData,
  JarEntry,
  Kid,
  Loan,
  LoanPaymentRow,
  Member,
  PayPlan,
  PayStatement,
  PinStatus,
  RatePeriodRow,
  Role,
  SavingsGoal,
  TransactionRow,
  WithdrawalRequest,
} from "./types";

/** A stub plus the deposit it made (deleting the deposit removes the stub, as in the database). */
type DemoStatement = PayStatement & { transaction_id: string | null };

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
  payPlans: PayPlan[];
  payStatements: DemoStatement[];
  jarEntries: JarEntry[];
  goals: SavingsGoal[];
  cds: Cd[];
  loans: Loan[];
  loanPayments: LoanPaymentRow[];
  user: (SessionUser & { role: Role }) | null;
}

const STORAGE_KEY = "bank-of-dad-demo";
const DAD = { id: "demo-dad", email: "dad@demo.family" };
const MOM = { id: "demo-mom", email: "mom@demo.family" };
const TABLET = { id: "demo-tablet", email: "tablet@demo.family" };

let seq = 0;

/** Mock PINs: easy to remember and shown on screen in the demo (1111, 2222, …). */
function mockPin(index: number): string {
  return String((index % 9) + 1).repeat(4);
}

/** Gives every kid without a PIN a mock one (also upgrades older saved demos). */
function fillMockPins(db: Pick<DemoDb, "kids" | "pins">) {
  db.kids.forEach((k, i) => {
    db.pins[k.id] ??= mockPin(i);
  });
}
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
    tax_brackets: DEFAULT_TAX_BRACKETS,
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

  // Pay: Ava and Ben earn $100 a month, Cora (junior) $50 with smaller bills.
  const coraBills: Expense[] = [
    { name: "Rent", cents: 2000 },
    { name: "Groceries", cents: 1000 },
    { name: "Utilities", cents: 500 },
    { name: "Insurance", cents: 300 },
  ];
  const payPlans: PayPlan[] = [
    { kid_id: ava.id, enabled: true, salary_cents: 10000, pay_day: 1, expenses: DEFAULT_EXPENSES, ...DEFAULT_SPLIT },
    { kid_id: ben.id, enabled: true, salary_cents: 10000, pay_day: 5, expenses: DEFAULT_EXPENSES, ...DEFAULT_SPLIT },
    { kid_id: cora.id, enabled: true, salary_cents: 5000, pay_day: 1, expenses: coraBills, ...DEFAULT_SPLIT },
  ];
  // Past pay stubs (and this month's for Ava and Cora). Ben's is left for
  // Dad to pay with "Pay now".
  const payStatements: DemoStatement[] = [];
  const jarEntries: JarEntry[] = [];
  const stub = (plan: PayPlan, monthsAgo: number) => {
    const monthDay = addMonths(startOfMonth(today), -monthsAgo);
    const paidOn = paydayFor(plan, monthDay);
    if (paidOn > today) return;
    const pc = paycheckFor(plan, family.tax_brackets);
    const split = splitTakeHome(pc.netCents, plan);
    const txn: TransactionRow = {
      id: id("txn"),
      kid_id: plan.kid_id,
      kind: "deposit",
      amount_cents: split.saveCents,
      occurred_on: paidOn,
      note: "Paycheck",
      created_at: new Date().toISOString(),
    };
    transactions.push(txn);
    const statementId = id("pay");
    payStatements.push({
      id: statementId,
      kid_id: plan.kid_id,
      pay_month: startOfMonth(monthDay),
      paid_on: paidOn,
      gross_cents: pc.grossCents,
      taxes: pc.taxes,
      expenses: pc.expenses,
      net_cents: pc.netCents,
      save_cents: split.saveCents,
      spend_cents: split.spendCents,
      give_cents: split.giveCents,
      created_at: new Date().toISOString(),
      transaction_id: txn.id,
    });
    for (const [jar, cents] of [["spend", split.spendCents], ["give", split.giveCents]] as const) {
      if (cents > 0) {
        jarEntries.push({ id: id("jar"), kid_id: plan.kid_id, jar, amount_cents: cents, occurred_on: paidOn, note: "Paycheck", statement_id: statementId, created_at: new Date().toISOString() });
      }
    }
  };
  [2, 1, 0].forEach((m) => stub(payPlans[0], m));
  stub(payPlans[1], 1);
  stub(payPlans[2], 0);
  // Ava already spent a little; goals to aim for.
  jarEntries.push({ id: id("jar"), kid_id: ava.id, jar: "spend", amount_cents: -200, occurred_on: addDays(today, -3), note: "Stickers", statement_id: null, created_at: new Date().toISOString() });
  const goals: SavingsGoal[] = [
    { id: id("goal"), kid_id: ava.id, name: "New bike", emoji: "🚲", target_cents: 12000, created_at: new Date().toISOString() },
    { id: id("goal"), kid_id: cora.id, name: "Plush unicorn", emoji: "🦄", target_cents: 2500, created_at: new Date().toISOString() },
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
    pins: { [ava.id]: mockPin(0), [ben.id]: mockPin(1), [cora.id]: mockPin(2) },
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
    payPlans,
    payStatements,
    jarEntries,
    goals,
    ...seedCdsAndLoans(today, ava, ben, transactions),
    user: null,
  };
}

/** Ava has a CD two months in; Ben is paying off a small loan. */
function seedCdsAndLoans(today: ISODate, ava: Kid, ben: Kid, transactions: TransactionRow[]) {
  const opened = addMonths(today, -2);
  transactions.push({ id: id("txn"), kid_id: ava.id, kind: "adjustment", amount_cents: -2000, occurred_on: opened, note: "Locked in a CD", created_at: new Date().toISOString() });
  const cds: Cd[] = [
    {
      id: id("cd"),
      kid_id: ava.id,
      principal_cents: 2000,
      base_monthly_rate: 0.01,
      bonus_monthly_rate: 0.01,
      term_months: 6,
      opened_on: opened,
      matures_on: addMonths(opened, 6),
      status: "open",
      closed_on: null,
      payout_cents: null,
    },
  ];
  const loanId = id("loan");
  const started = addMonths(today, -1);
  const loans: Loan[] = [
    { id: loanId, kid_id: ben.id, principal_cents: 1500, monthly_rate: 0.03, purpose: "New video game", status: "active", started_on: started, created_at: new Date().toISOString() },
  ];
  const loanPayments: LoanPaymentRow[] = [
    { id: id("lp"), loan_id: loanId, kid_id: ben.id, amount_cents: 300, paid_on: addDays(started, 10), source: "cash" },
  ];
  return { cds, loans, loanPayments };
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
      db.payPlans ??= [];
      db.payStatements ??= [];
      db.jarEntries ??= [];
      db.goals ??= [];
      db.cds ??= [];
      db.loans ??= [];
      db.loanPayments ??= [];
      for (const p of db.payPlans) Object.assign(p, { ...DEFAULT_SPLIT, ...p });
      db.family.tax_brackets ??= DEFAULT_TAX_BRACKETS;
      fillMockPins(db);
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
  /** The kid's PIN, shown on screen in the demo only. */
  demoPin(kidId: string): string | undefined;
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

  /** Kids pass a PIN; parents pass nothing (mirrors check_kid_or_parent). */
  const kidOrParent = (kidId: string, pin?: string): PinStatus => {
    if (pin === undefined) {
      requireParent();
      return "ok";
    }
    return checkPin(kidId, pin);
  };
  const ledgerBalance = (kidId: string) => db.transactions.filter((t) => t.kid_id === kidId).reduce((sum, t) => sum + t.amount_cents, 0);
  const rateToday = (kidId: string) =>
    [...db.rates]
      .filter((r) => r.kid_id === kidId && r.effective_from <= today())
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.monthly_rate ?? 0;
  const txn = (kidId: string, cents: number, note: string) =>
    db.transactions.push({ id: id("txn"), kid_id: kidId, kind: "adjustment", amount_cents: cents, occurred_on: today(), note, created_at: new Date().toISOString() });
  const loanOwed = (loan: Loan) => loanStatus(loan, db.loanPayments.filter((lp) => lp.loan_id === loan.id), today()).balanceCents;
  const dollars = (cents: number) => "$" + (cents / 100).toFixed(2);

  const api: DemoApi = {
    kind: "demo",

    demoPin(kidId) {
      return db.pins[kidId];
    },
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
        payPlans: db.payPlans,
        payStatements: [...db.payStatements]
          .map((st) => ({ ...st, save_cents: st.save_cents ?? null, spend_cents: st.spend_cents ?? null, give_cents: st.give_cents ?? null }))
          .sort((a, b) => b.pay_month.localeCompare(a.pay_month)),
        jarEntries: [...db.jarEntries].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)),
        goals: db.goals,
        cds: db.cds,
        loans: db.loans,
        loanPayments: db.loanPayments,
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
      fillMockPins(db);
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
      db.payPlans = db.payPlans.filter((p) => p.kid_id !== kidId);
      db.payStatements = db.payStatements.filter((p) => p.kid_id !== kidId);
      db.jarEntries = db.jarEntries.filter((j) => j.kid_id !== kidId);
      db.goals = db.goals.filter((g) => g.kid_id !== kidId);
      db.cds = db.cds.filter((c) => c.kid_id !== kidId);
      db.loans = db.loans.filter((l) => l.kid_id !== kidId);
      db.loanPayments = db.loanPayments.filter((lp) => lp.kid_id !== kidId);
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
      const gone = db.payStatements.filter((st) => st.transaction_id === txnId).map((st) => st.id);
      db.payStatements = db.payStatements.filter((st) => st.transaction_id !== txnId);
      db.jarEntries = db.jarEntries.filter((j) => !j.statement_id || !gone.includes(j.statement_id));
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

    async savePayPlan(plan) {
      requireParent();
      kidById(plan.kid_id);
      if (plan.pay_day < 1 || plan.pay_day > 28) throw new ApiError("Payday must be between the 1st and the 28th.");
      db.payPlans = [...db.payPlans.filter((p) => p.kid_id !== plan.kid_id), structuredClone(plan)];
      changed();
    },
    async postPaycheck(due) {
      requireParent();
      kidById(due.kid_id);
      if (db.payStatements.some((p) => p.kid_id === due.kid_id && p.pay_month === due.payMonth)) {
        throw new ApiError("This month's pay was already paid.");
      }
      if (due.paidOn > today() || due.payMonth !== startOfMonth(today())) {
        throw new ApiError("Only this month's pay can be paid, on or after payday.");
      }
      const pc = due.paycheck;
      const split = due.split;
      if (split.saveCents + split.spendCents + split.giveCents !== pc.netCents) {
        throw new ApiError("The Save / Spend / Give split doesn't add up to the take-home pay.");
      }
      let txnId: string | null = null;
      if (split.saveCents > 0) {
        txnId = id("txn");
        db.transactions.push({
          id: txnId,
          kid_id: due.kid_id,
          kind: "deposit",
          amount_cents: split.saveCents,
          occurred_on: due.paidOn,
          note: "Paycheck",
          created_at: new Date().toISOString(),
        });
      }
      db.payStatements.push({
        id: id("pay"),
        kid_id: due.kid_id,
        pay_month: due.payMonth,
        paid_on: due.paidOn,
        gross_cents: pc.grossCents,
        taxes: pc.taxes,
        expenses: pc.expenses,
        net_cents: pc.netCents,
        save_cents: split.saveCents,
        spend_cents: split.spendCents,
        give_cents: split.giveCents,
        created_at: new Date().toISOString(),
        transaction_id: txnId,
      });
      const statementId = db.payStatements[db.payStatements.length - 1].id;
      for (const [jar, cents] of [["spend", split.spendCents], ["give", split.giveCents]] as const) {
        if (cents > 0) {
          db.jarEntries.push({ id: id("jar"), kid_id: due.kid_id, jar, amount_cents: cents, occurred_on: due.paidOn, note: "Paycheck", statement_id: statementId, created_at: new Date().toISOString() });
        }
      }
      changed();
    },

    async addJarEntry(kidId, jar, amountCents, note, occurredOn) {
      requireParent();
      kidById(kidId);
      if (amountCents === 0) throw new ApiError("Enter an amount.");
      const bal = db.jarEntries.filter((j) => j.kid_id === kidId && j.jar === jar).reduce((t, j) => t + j.amount_cents, 0);
      if (bal + amountCents < 0) throw new ApiError(`There's only $${(bal / 100).toFixed(2)} in the ${jar === "spend" ? "Spend" : "Give"} jar.`);
      db.jarEntries.push({ id: id("jar"), kid_id: kidId, jar, amount_cents: amountCents, occurred_on: occurredOn, note, statement_id: null, created_at: new Date().toISOString() });
      changed();
    },
    async deleteJarEntry(entryId) {
      requireParent();
      const e = db.jarEntries.find((j) => j.id === entryId);
      if (e?.statement_id) throw new ApiError("Payday entries go away with their pay stub.");
      db.jarEntries = db.jarEntries.filter((j) => j.id !== entryId);
      changed();
    },
    async moveToSavings(kidId, pin, cents) {
      const status = checkPin(kidId, pin);
      if (status !== "ok") return status;
      if (cents <= 0) throw new ApiError("Enter an amount.");
      const bal = db.jarEntries.filter((j) => j.kid_id === kidId && j.jar === "spend").reduce((t, j) => t + j.amount_cents, 0);
      if (cents > bal) throw new ApiError(`There's only $${(bal / 100).toFixed(2)} in the Spend jar.`);
      const now = new Date().toISOString();
      db.jarEntries.push({ id: id("jar"), kid_id: kidId, jar: "spend", amount_cents: -cents, occurred_on: today(), note: "Moved to savings", statement_id: null, created_at: now });
      db.transactions.push({ id: id("txn"), kid_id: kidId, kind: "deposit", amount_cents: cents, occurred_on: today(), note: "From my Spend jar", created_at: now });
      changed();
      return status;
    },
    async addGoal(goal, pin) {
      if (pin === undefined) requireParent();
      else {
        const status = checkPin(goal.kid_id, pin);
        if (status !== "ok") return status;
      }
      if (db.goals.filter((g) => g.kid_id === goal.kid_id).length >= 3) throw new ApiError("Up to 3 goals at a time. Remove one first.");
      if (!goal.name.trim() || goal.target_cents <= 0) throw new ApiError("Give the goal a name and an amount.");
      db.goals.push({ ...goal, name: goal.name.trim(), id: id("goal"), created_at: new Date().toISOString() });
      changed();
      return "ok";
    },
    async removeGoal(kidId, goalId, pin) {
      if (pin === undefined) requireParent();
      else {
        const status = checkPin(kidId, pin);
        if (status !== "ok") return status;
      }
      db.goals = db.goals.filter((g) => !(g.id === goalId && g.kid_id === kidId));
      changed();
      return "ok";
    },

    async openCd(kidId, cents, months, pin) {
      const status = kidOrParent(kidId, pin);
      if (status !== "ok") return status;
      if (!kidById(kidId).account_opened_on) throw new ApiError("The account isn't open yet.");
      if (![3, 6, 12].includes(months)) throw new ApiError("Choose 3, 6 or 12 months.");
      if (cents <= 0) throw new ApiError("Enter an amount.");
      const max = ledgerBalance(kidId);
      if (cents > max) throw new ApiError("You can lock up to " + dollars(max) + " right now.");
      txn(kidId, -cents, "Locked in a CD");
      db.cds.push({
        id: id("cd"),
        kid_id: kidId,
        principal_cents: cents,
        base_monthly_rate: rateToday(kidId),
        bonus_monthly_rate: db.family.cd_bonus_monthly_rate,
        term_months: months,
        opened_on: today(),
        matures_on: addMonths(today(), months),
        status: "open",
        closed_on: null,
        payout_cents: null,
      });
      changed();
      return status;
    },
    async breakCd(kidId, cdId, pin) {
      const status = kidOrParent(kidId, pin);
      if (status !== "ok") return status;
      const cd = db.cds.find((c) => c.id === cdId && c.kid_id === kidId);
      if (!cd || cd.status !== "open") throw new ApiError("That CD isn't open.");
      if (today() >= cd.matures_on) throw new ApiError("That CD has matured. It pays out in full.");
      const payout = grow(cd.principal_cents, cd.base_monthly_rate, fullMonthsBetween(cd.opened_on, today()));
      txn(kidId, payout, "CD broken early");
      Object.assign(cd, { status: "broken", closed_on: today(), payout_cents: payout });
      changed();
      return status;
    },
    async collectCd(cdId) {
      const cd = db.cds.find((c) => c.id === cdId);
      if (!cd || cd.status !== "open" || today() < cd.matures_on) return;
      const payout = cdStatus(cd, today()).maturityCents;
      txn(cd.kid_id, payout, "CD matured");
      Object.assign(cd, { status: "matured", closed_on: today(), payout_cents: payout });
      changed();
    },
    async requestLoan(kidId, pin, cents, purpose) {
      const status = checkPin(kidId, pin);
      if (status !== "ok") return status;
      if (cents <= 0) throw new ApiError("Enter an amount.");
      const open = db.loans.some((l) => l.kid_id === kidId && (l.status === "pending" || (l.status === "active" && loanOwed(l) > 0)));
      if (open) throw new ApiError("You already have a loan. Pay it off first.");
      db.loans.push({
        id: id("loan"),
        kid_id: kidId,
        principal_cents: cents,
        monthly_rate: db.family.loan_monthly_rate,
        purpose: purpose.trim() || null,
        status: "pending",
        started_on: null,
        created_at: new Date().toISOString(),
      });
      changed();
      return status;
    },
    async cancelLoan(kidId, pin, loanId) {
      const status = checkPin(kidId, pin);
      if (status !== "ok") return status;
      const loan = db.loans.find((l) => l.id === loanId && l.kid_id === kidId && l.status === "pending");
      if (!loan) throw new ApiError("That request isn't waiting anymore.");
      loan.status = "cancelled";
      changed();
      return status;
    },
    async decideLoan(loanId, approve) {
      requireParent();
      const loan = db.loans.find((l) => l.id === loanId);
      if (!loan) throw new ApiError("Loan not found.");
      if (loan.status !== "pending") throw new ApiError("That loan was already " + loan.status + ".");
      loan.status = approve ? "active" : "denied";
      loan.started_on = approve ? today() : null;
      changed();
    },
    async payLoan(kidId, loanId, cents, source, pin) {
      const status = kidOrParent(kidId, pin);
      if (status !== "ok") return status;
      const loan = db.loans.find((l) => l.id === loanId && l.kid_id === kidId);
      if (!loan || loan.status !== "active") throw new ApiError("That loan isn't active.");
      if (source === "cash" && pin !== undefined) throw new ApiError("Pay from savings or the Spend jar.");
      if (cents <= 0) throw new ApiError("Enter an amount.");
      if (cents > loanOwed(loan)) throw new ApiError("That's more than you owe.");
      if (source === "savings") {
        if (cents > ledgerBalance(kidId)) throw new ApiError("Your savings don't have that much right now.");
        txn(kidId, -cents, "Loan payment");
      } else if (source === "spend") {
        const bal = db.jarEntries.filter((j) => j.kid_id === kidId && j.jar === "spend").reduce((t, j) => t + j.amount_cents, 0);
        if (cents > bal) throw new ApiError("There's only " + dollars(bal) + " in the Spend jar.");
        db.jarEntries.push({ id: id("jar"), kid_id: kidId, jar: "spend", amount_cents: -cents, occurred_on: today(), note: "Loan payment", statement_id: null, created_at: new Date().toISOString() });
      }
      db.loanPayments.push({ id: id("lp"), loan_id: loanId, kid_id: kidId, amount_cents: cents, paid_on: today(), source });
      changed();
      return status;
    },
  };
  return api;
}
