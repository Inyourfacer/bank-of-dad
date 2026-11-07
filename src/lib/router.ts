import { useSyncExternalStore } from "react";

/**
 * Hash-based routing: GitHub Pages can't rewrite paths, so routes live after `#`.
 * The current route is also kept in memory and in-app links are handled here,
 * so navigation still works where the page can't change its own address
 * (for example inside an embedded preview).
 */
const inBrowser = typeof window !== "undefined";
const fromHash = () => (inBrowser ? window.location.hash.replace(/^#/, "") : "") || "/";

let current = fromHash();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (inBrowser) {
  window.addEventListener("hashchange", () => {
    const next = fromHash();
    if (next !== current) {
      current = next;
      emit();
    }
  });

  // Route clicks on in-app links (href="#/...") without relying on the address bar.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href^='#/']");
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute("href")!.slice(1));
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, () => current);
}

export function navigate(path: string) {
  if (path === current) return;
  current = path;
  try {
    window.location.hash = path;
  } catch {
    /* address bar not writable: the in-memory route still updates */
  }
  window.scrollTo(0, 0);
  emit();
}

/** Matches "/family/kid/:id" style patterns; returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/");
  const a = path.split("/");
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
