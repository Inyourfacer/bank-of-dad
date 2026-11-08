import { useApp } from "../data/AppContext";
import { demoOnly, exitDemo } from "../data/backend";
import type { DemoApi } from "../data/demoApi";
import type { Role } from "../data/types";
import { navigate } from "../lib/router";

/**
 * Demo only: switch between the parent's view and the kids' tablet in one tap,
 * with a hint for what to try next (ask as a kid, approve as a parent).
 */
export function DemoBar() {
  const { api, data, status } = useApp();
  if (api?.kind !== "demo") return null;
  const demo = api as DemoApi;
  const role: Role | null = status === "ready" && data ? data.me.role : null;
  const pending = data?.withdrawalRequests.filter((r) => r.status === "pending") ?? [];
  const kidName = (id: string) => data?.kids.find((k) => k.id === id)?.name ?? "A kid";

  const switchTo = async (r: Role) => {
    if (r === role) return;
    await demo.signInAs(r);
    navigate("/family");
    window.scrollTo(0, 0);
  };

  let hint = "Pick a view to explore the demo.";
  if (role === "device") {
    hint = pending.length
      ? `${pending.length} request${pending.length === 1 ? " is" : "s are"} waiting. Switch to Dad to approve or deny.`
      : "Sign in as a kid (PINs are shown), tap “Take money out”, then switch to Dad.";
  } else if (role === "parent") {
    hint = pending.length
      ? `${kidName(pending[0].kid_id)}'s request is under “Waiting for you”. Approve it, then switch to the kids' tablet.`
      : "Switch to the kids' tablet to ask for money as a kid.";
  }

  return (
    <div className="demo-bar" role="region" aria-label="Demo controls">
      <div className="container demo-bar-inner">
        <span className="demo-bar-label">Demo · viewing as</span>
        <div className="segmented demo-switch" role="radiogroup" aria-label="View the demo as">
          {(["parent", "device"] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? "on" : ""} onClick={() => void switchTo(r)}>
              {r === "parent" ? "Dad (parent)" : "Kids' tablet"}
              {r === "parent" && pending.length > 0 && <span className="nav-count">{pending.length}</span>}
            </button>
          ))}
        </div>
        <span className="demo-bar-hint">{hint}</span>
        {!demoOnly && (
          <button type="button" className="link-button" onClick={exitDemo}>
            Exit demo
          </button>
        )}
      </div>
    </div>
  );
}
