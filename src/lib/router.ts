import { useSyncExternalStore } from "react";

/** Hash-based routing: GitHub Pages can't rewrite paths, so routes live after `#`. */
const read = () => window.location.hash.replace(/^#/, "") || "/";

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, read);
}

export function navigate(path: string) {
  window.location.hash = path;
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
