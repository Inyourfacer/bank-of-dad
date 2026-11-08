/**
 * Reads and checks the FAMILY_CONFIG secret (YAML). Pure: no network, so it
 * can be unit-tested. Error messages never include passwords or PINs.
 */
import { parse } from "yaml";
import { loginEmail } from "../src/lib/login";

export interface LoginConfig {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface KidConfig {
  name: string;
  pin?: string;
  reset_pin?: boolean;
  avatar?: string;
  mode?: "junior" | "standard";
  intro_monthly_rate?: number;
  intro_months?: number;
  ongoing_monthly_rate?: number;
}

export interface FamilyConfig {
  family: { name: string; time_zone: string };
  parents: LoginConfig[];
  tablet?: LoginConfig;
  kids: KidConfig[];
}

export class ConfigError extends Error {}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

/** "2%" or 2 or 0.02 → 0.02 (a monthly rate). */
function percent(v: unknown, where: string): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).trim();
  const n = Number(s.replace("%", ""));
  if (!Number.isFinite(n) || n < 0) throw new ConfigError(`${where} should be a percentage like 2%.`);
  const fraction = s.endsWith("%") || n >= 1 ? n / 100 : n;
  if (fraction > 0.2) throw new ConfigError(`${where} is above the 20% a month limit.`);
  return fraction;
}

function login(v: unknown, where: string): LoginConfig {
  if (!isObj(v)) throw new ConfigError(`${where} needs a name, username and password.`);
  const name = str(v.name);
  const username = str(v.username ?? v.email).toLowerCase();
  const password = typeof v.password === "string" || typeof v.password === "number" ? String(v.password) : "";
  if (!name) throw new ConfigError(`${where} needs a name.`);
  if (!username) throw new ConfigError(`${name} needs a username.`);
  if (!username.includes("@") && !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(username)) {
    throw new ConfigError(`${name}'s username can only use letters, numbers, dots, dashes and underscores.`);
  }
  if (password.length < 8) throw new ConfigError(`${name}'s password must be at least 8 characters.`);
  return { name, username, email: loginEmail(username), password };
}

export function parseFamilyConfig(text: string | undefined): FamilyConfig {
  if (!text || !text.trim()) throw new ConfigError("FAMILY_CONFIG is empty. Paste your family.yaml into the secret.");
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    const line = (e as { linePos?: { line: number }[] }).linePos?.[0]?.line;
    throw new ConfigError(`The config isn't valid YAML${line ? ` (around line ${line})` : ""}. Check the indentation.`);
  }
  if (!isObj(raw)) throw new ConfigError("The config should start with `family:`.");

  const familyName = str(raw.family);
  if (!familyName) throw new ConfigError("Add your family name, e.g. `family: The Smiths`.");
  const timeZone = str(raw.time_zone) || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new ConfigError(`Unknown time zone "${timeZone}". Use one like America/Chicago.`);
  }

  if (!Array.isArray(raw.parents) || raw.parents.length === 0) throw new ConfigError("Add at least one parent under `parents:`.");
  const parents = raw.parents.map((p, i) => login(p, `Parent ${i + 1}`));
  const tablet = raw.tablet === undefined ? undefined : login({ name: "Kids tablet", ...(raw.tablet as Raw) }, "The tablet");

  const usernames = [...parents, ...(tablet ? [tablet] : [])].map((l) => l.email);
  const dupe = usernames.find((u, i) => usernames.indexOf(u) !== i);
  if (dupe) throw new ConfigError(`Two logins use the username "${dupe.split("@")[0]}".`);

  const kidsRaw = raw.kids ?? [];
  if (!Array.isArray(kidsRaw)) throw new ConfigError("`kids:` should be a list (each kid starts with `- name:`).");
  const kids = kidsRaw.map((k, i): KidConfig => {
    if (!isObj(k)) throw new ConfigError(`Kid ${i + 1} needs at least a name.`);
    const name = str(k.name);
    if (!name) throw new ConfigError(`Kid ${i + 1} needs a name.`);
    // An unquoted PIN like 0427 arrives as the number 427; put the zero back.
    const pin =
      k.pin === undefined ? undefined : typeof k.pin === "number" && Number.isInteger(k.pin) ? String(k.pin).padStart(4, "0") : str(k.pin);
    if (pin !== undefined && !/^\d{4}$/.test(pin)) {
      throw new ConfigError(`${name}'s PIN must be 4 digits. Put it in quotes, like pin: "0427".`);
    }
    const view = str(k.view ?? k.mode).toLowerCase();
    if (view && view !== "junior" && view !== "standard") throw new ConfigError(`${name}'s view must be junior or standard.`);
    const months = k.starter_months === undefined ? undefined : Number(k.starter_months);
    if (months !== undefined && (!Number.isInteger(months) || months < 0 || months > 24)) {
      throw new ConfigError(`${name}'s starter_months must be a whole number from 0 to 24.`);
    }
    return {
      name,
      pin,
      reset_pin: k.reset_pin === true,
      avatar: str(k.picture ?? k.avatar) || undefined,
      mode: (view || undefined) as KidConfig["mode"],
      intro_monthly_rate: percent(k.starter_rate, `${name}'s starter_rate`),
      intro_months: months,
      ongoing_monthly_rate: percent(k.rate, `${name}'s rate`),
    };
  });
  const kidNames = kids.map((k) => k.name.toLowerCase());
  const dupeKid = kids.find((k, i) => kidNames.indexOf(k.name.toLowerCase()) !== i);
  if (dupeKid) throw new ConfigError(`Two kids are named ${dupeKid.name}.`);

  return { family: { name: familyName, time_zone: timeZone }, parents, tablet, kids };
}
