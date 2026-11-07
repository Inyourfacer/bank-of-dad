import type { BankApi } from "./api";
import { createDemoApi, resetDemo } from "./demoApi";
import { createSupabaseApi, supabaseConfigured } from "./supabaseApi";

const MODE_KEY = "bank-of-dad-mode";

/** Build flag for previews: always run the demo, with no way to leave it. */
export const demoOnly = import.meta.env.VITE_DEMO_ONLY === "true";

export function isDemoMode(): boolean {
  if (demoOnly) return true;
  try {
    return sessionStorage.getItem(MODE_KEY) === "demo";
  } catch {
    return false;
  }
}

export function enterDemo() {
  try {
    sessionStorage.setItem(MODE_KEY, "demo");
  } catch {
    /* ignore: demo will still work for this page load */
  }
  window.location.hash = "/sign-in";
  window.location.reload();
}

export function exitDemo() {
  try {
    sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
  resetDemo();
  window.location.hash = "/";
  window.location.reload();
}

let api: BankApi | null | undefined;

/** The active backend: the demo when chosen, Supabase when configured, else null. */
export function getApi(): BankApi | null {
  if (api === undefined) {
    api = isDemoMode() ? createDemoApi() : supabaseConfigured ? createSupabaseApi() : null;
  }
  return api;
}
