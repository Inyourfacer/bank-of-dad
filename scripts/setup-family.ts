/**
 * Sets up (or updates) the family from the FAMILY_CONFIG secret.
 * Run by .github/workflows/setup-family.yml.
 *
 *   1. Checks the config and explains any problem.
 *   2. Creates each parent's and the tablet's login, or updates its password.
 *   3. Creates the family, adds the logins, and creates the kids with their
 *      PINs (apply_family_config). Never overwrites changes made in the app.
 *
 *   npx tsx scripts/setup-family.ts --check   # only check the config
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ConfigError, type LoginConfig, parseFamilyConfig } from "./familyConfig";
import { displayLogin } from "../src/lib/login";

const checkOnly = process.argv.includes("--check");

async function allUsers(db: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Couldn't list logins: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

async function ensureLogin(db: SupabaseClient, existing: User[], login: LoginConfig): Promise<string> {
  const who = `${login.name} (${displayLogin(login.email)})`;
  const found = existing.find((u) => u.email?.toLowerCase() === login.email);
  if (found) {
    const { error } = await db.auth.admin.updateUserById(found.id, { password: login.password, email_confirm: true });
    if (error) throw new Error(`Couldn't update the login for ${who}: ${error.message}`);
    console.log(`✓ Login ready: ${who} (password set from the config)`);
    return found.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email: login.email,
    password: login.password,
    email_confirm: true,
    user_metadata: { display_name: login.name },
  });
  if (error || !data.user) {
    const hint = /email/i.test(error?.message ?? "")
      ? " If Supabase says the email is invalid, put a real email address in `username` for this login."
      : "";
    throw new Error(`Couldn't create the login for ${who}: ${error?.message ?? "unknown error"}.${hint}`);
  }
  console.log(`✓ Login created: ${who}`);
  return data.user.id;
}

async function main() {
  const config = parseFamilyConfig(process.env.FAMILY_CONFIG);
  const logins = [...config.parents, ...(config.tablet ? [config.tablet] : [])];
  console.log(
    `Config looks good: ${config.family.name}, ${config.parents.length} parent(s), ` +
      `${config.tablet ? "a tablet login, " : "no tablet login, "}${config.kids.length} kid(s).`,
  );
  if (checkOnly) return;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set the SUPABASE_URL variable and the SUPABASE_SERVICE_ROLE_KEY secret first (docs/SETUP.md step 5).");
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const existing = await allUsers(db);
  const members = [];
  for (const l of logins) {
    const id = await ensureLogin(db, existing, l);
    members.push({ user_id: id, role: l === config.tablet ? "device" : "parent", display_name: l.name });
  }

  const { data, error } = await db.rpc("apply_family_config", {
    p: { family: config.family, members, kids: config.kids },
  });
  if (error) {
    const hint = /apply_family_config/.test(error.message)
      ? " Run supabase/migrations/20261109000000_family_config.sql in the Supabase SQL Editor first."
      : "";
    throw new Error(`Couldn't set up the family: ${error.message}.${hint}`);
  }

  const s = data as {
    family_created: boolean;
    members_added: string[];
    kids_created: string[];
    kids_kept: string[];
    pins_set: string[];
    kids_not_in_config: string[];
  };
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");
  console.log(`✓ Family: ${config.family.name} (${s.family_created ? "created" : "already set up"})`);
  console.log(`✓ Logins added to the family: ${list(s.members_added)}`);
  console.log(`✓ Kids created: ${list(s.kids_created)}; already there (left as they are): ${list(s.kids_kept)}`);
  console.log(`✓ PINs set: ${list(s.pins_set)}`);
  if (s.kids_not_in_config.length) {
    console.log(`ℹ In the app but not in the config (left alone): ${list(s.kids_not_in_config)}`);
  }
  console.log("Done. Sign in on the website with a username and password from your config.");
}

main().catch((e) => {
  const msg = e instanceof ConfigError || e instanceof Error ? e.message : String(e);
  console.error(`::error::${msg}`);
  process.exit(1);
});
