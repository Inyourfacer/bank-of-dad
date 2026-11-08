/**
 * Parents and the kids' tablet sign in with a username (from the family
 * config) instead of an email. Supabase needs an email-shaped login, so a
 * username becomes "<username>@bankofdad.local". Nothing is ever sent there.
 * Typing a full email still works.
 */
export const LOGIN_DOMAIN = "bankofdad.local";

export function loginEmail(usernameOrEmail: string): string {
  const v = usernameOrEmail.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${LOGIN_DOMAIN}`;
}

/** "dad@bankofdad.local" → "dad"; real emails are shown as-is. */
export function displayLogin(email: string): string {
  return email.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -LOGIN_DOMAIN.length - 1) : email;
}
