import type { BankApi } from "./api";
import type { DemoApi } from "./demoApi";

/** A kid's mock PIN when running the demo; undefined with a real database. */
export function demoPinFor(api: BankApi | null, kidId: string): string | undefined {
  return api?.kind === "demo" ? (api as DemoApi).demoPin(kidId) : undefined;
}
