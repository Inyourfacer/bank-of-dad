import type { FamilyData, FamilySettings, KidTemplate, Member, NewTransaction, Role } from "./types";

export interface SessionUser {
  id: string;
  email: string;
}

/** Everything the app needs from a backend. Implemented by Supabase and an in-memory demo. */
export interface BankApi {
  readonly kind: "supabase" | "demo";

  currentUser(): Promise<SessionUser | null>;
  onAuthChange(cb: () => void): () => void;
  /** Emails a one-time sign-in code (and link). Parents only; no sign-ups. */
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  /** Changes the signed-in user's own password. */
  changePassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;

  /** null when the signed-in user doesn't belong to a family yet. */
  loadFamily(): Promise<FamilyData | null>;
  createFamily(name: string, displayName: string, timeZone: string): Promise<void>;
  updateFamily(familyId: string, settings: Partial<FamilySettings>): Promise<void>;
  addMember(email: string, role: Role, displayName: string): Promise<void>;
  removeMember(userId: Member["user_id"]): Promise<void>;

  addKid(familyId: string, kid: KidTemplate): Promise<void>;
  updateKid(kidId: string, changes: Partial<KidTemplate>): Promise<void>;
  deleteKid(kidId: string): Promise<void>;
  setKidPin(kidId: string, pin: string): Promise<void>;

  addTransaction(t: NewTransaction): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  addRatePeriod(kidId: string, effectiveFrom: string, monthlyRate: number): Promise<void>;
  deleteRatePeriod(id: string): Promise<void>;
}

/** Errors with a message that is safe and useful to show the user. */
export class ApiError extends Error {}
