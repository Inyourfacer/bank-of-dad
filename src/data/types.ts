import type { ISODate } from "../engine/dates";
import type { Expense, PayLine, TaxBracket } from "../engine/paycheck";

export type Role = "parent" | "device";
export type KidMode = "junior" | "standard";
export type TxnKind = "deposit" | "withdrawal" | "interest" | "adjustment";

export interface Family {
  id: string;
  name: string;
  time_zone: string;
  regular_bank_apy: number;
  cd_bonus_monthly_rate: number;
  loan_monthly_rate: number;
  tax_brackets: TaxBracket[];
}

export interface Member {
  user_id: string;
  family_id: string;
  role: Role;
  display_name: string;
}

export interface Kid {
  id: string;
  family_id: string;
  name: string;
  avatar: string;
  mode: KidMode;
  intro_monthly_rate: number;
  intro_months: number;
  ongoing_monthly_rate: number;
  account_opened_on: ISODate | null;
  created_at: string;
}

export interface RatePeriodRow {
  id: string;
  kid_id: string;
  effective_from: ISODate;
  monthly_rate: number;
}

export interface TransactionRow {
  id: string;
  kid_id: string;
  kind: TxnKind;
  amount_cents: number;
  occurred_on: ISODate;
  note: string | null;
  created_at: string;
}

export interface PayPlan {
  kid_id: string;
  enabled: boolean;
  salary_cents: number;
  /** Day of the month (1–28) the salary is paid. */
  pay_day: number;
  expenses: Expense[];
}

export interface PayStatement {
  id: string;
  kid_id: string;
  /** First day of the month the pay is for. */
  pay_month: ISODate;
  paid_on: ISODate;
  gross_cents: number;
  taxes: PayLine[];
  expenses: PayLine[];
  net_cents: number;
  created_at: string;
}

export type RequestStatus = "pending" | "approved" | "denied" | "cancelled";

export interface WithdrawalRequest {
  id: string;
  kid_id: string;
  amount_cents: number;
  reason: string | null;
  status: RequestStatus;
  decided_at: string | null;
  created_at: string;
}

/** Result of a PIN check on the family device. */
export type PinStatus = "ok" | "wrong" | "locked" | "no_pin";

export interface KidSignInResult {
  status: PinStatus;
  firstLogin: boolean;
}

/** Everything a signed-in family member can see. */
export interface FamilyData {
  me: Member;
  family: Family;
  members: Member[];
  kids: Kid[];
  rates: RatePeriodRow[];
  transactions: TransactionRow[];
  withdrawalRequests: WithdrawalRequest[];
  kidsWithPin: string[];
  payPlans: PayPlan[];
  /** Newest first. */
  payStatements: PayStatement[];
}

export type KidTemplate = Pick<Kid, "name" | "avatar" | "mode" | "intro_monthly_rate" | "intro_months" | "ongoing_monthly_rate">;

export type FamilySettings = Pick<
  Family,
  "name" | "time_zone" | "regular_bank_apy" | "cd_bonus_monthly_rate" | "loan_monthly_rate" | "tax_brackets"
>;

export interface NewTransaction {
  kid_id: string;
  kind: Exclude<TxnKind, "interest">;
  amount_cents: number;
  occurred_on: ISODate;
  note: string | null;
}
