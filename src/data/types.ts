import type { ISODate } from "../engine/dates";

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

/** Everything a signed-in family member can see. */
export interface FamilyData {
  me: Member;
  family: Family;
  members: Member[];
  kids: Kid[];
  rates: RatePeriodRow[];
  transactions: TransactionRow[];
  kidsWithPin: string[];
}

export type KidTemplate = Pick<Kid, "name" | "avatar" | "mode" | "intro_monthly_rate" | "intro_months" | "ongoing_monthly_rate">;

export type FamilySettings = Pick<Family, "name" | "time_zone" | "regular_bank_apy" | "cd_bonus_monthly_rate" | "loan_monthly_rate">;

export interface NewTransaction {
  kid_id: string;
  kind: Exclude<TxnKind, "interest">;
  amount_cents: number;
  occurred_on: ISODate;
  note: string | null;
}
