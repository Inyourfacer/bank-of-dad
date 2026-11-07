# Bank of Dad — Build Plan

Each phase ends with something usable. See [DESIGN.md](DESIGN.md) for the details.

## Phase 0: Foundations ✅
- Scaffold Vite + React + TypeScript, oxlint, Vitest.
- GitHub Actions: lint, test and build on every push; deploy `main` to GitHub Pages.
- The Supabase setup guide moves to Phase 2, where it's first needed.

**Done when:** a placeholder page is live on GitHub Pages and CI is green.

## Phase 1: Interest engine + simulator (no backend) ✅
- Pure `interest` module covering daily accrual, monthly Payday, rate periods,
  the intro period from the open date, cent rounding with carry, and
  projections with one-time and recurring deposits.
- Thorough unit tests: worked examples, mid-month deposits and withdrawals,
  the intro-period boundary mid-month, months of different lengths, leap
  years, and the rounding carry.
- **Public simulator page** with the growth chart (deposits vs interest), the
  what-if controls and the real-bank comparison.

**Done when:** anyone can open the site and play with the simulator.

## Phase 2: Data, logins, parent admin ✅
- Supabase schema, Row Level Security policies and migrations checked into
  `supabase/`.
- Parent email login and the family device login.
- Parent dashboard: add the 5 kids, set modes and PINs, record deposits, edit
  rate schedules, and view each ledger.
- Demo mode (in-memory, no Supabase) to try everything before setup.
- Setup guide: [SETUP.md](SETUP.md).

**Done when:** a parent can set up all 5 accounts and record deposits.

## Phase 3: Kid view + withdrawals ✅
- Profile picker + PIN. The first login sets the account's open date.
- Kid home (balance, lifetime interest, Payday countdown, earned this month),
  growth chart, what-if panel with extra deposits, and the activity list.
- Withdrawal request flow with the reality check, plus parent approval and a pending badge.

- Kids are signed out after 5 minutes idle; pending requests hold the money;
  Junior mode (jar, big number, "if you wait…") ships in a simple form.

**Done when:** kids use it day to day.

## Phase 4: Automation ✅
- Daily Payday Action (idempotent, family time zone, catches up on missed
  months); the same daily run keeps Supabase awake.
- Parent liability forecast.

**Done when:** interest posts itself on the 1st with no one touching anything.

## Phase 5: Polish + Junior mode
- Simulator comparison mode (side-by-side scenarios).
- Junior mode visuals (savings jar or tree), Payday celebration,
  installable on the home screen.
- Savings goals with projected dates, and lessons (Rule of 72, simple vs compound).

## Phase 6: Teaching extras
- CDs (+1%/month bonus, configurable), rate-change events, loans from Dad (3%/month).
