# Bank of Dad — Design

> **Status:** Draft for review. Nothing here is built yet.

## 1. Purpose

Real banks pay so little interest that compounding is invisible to a kid. The
Bank of Dad pays a **generous rate on a monthly cycle** so kids (ages 5–18) can
watch money make money in months instead of decades.

The app is a **ledger of what the Bank of Dad owes each kid**. Real cash stays
with the parents; the app keeps the books, pays interest automatically, and
makes compounding visible.

It has two uses:

1. **Real accounts**: each kid's actual balance, deposits, withdrawals and interest.
2. **What-if simulator**: a sandbox, open to anyone, for exploring scenarios.

## 2. Users

| Who | Count | How they sign in | Can do |
|---|---|---|---|
| Parents | 2 | Their own email login (6-digit code or link, no password) on their own devices | Everything: manage kids, deposits, rates, approve withdrawals |
| Kids | 5 | Profile picker + 4-digit PIN on a signed-in device | View own account, run what-ifs, **request** withdrawals |
| Anyone | — | No login | Simulator only |

This app is for one family only. There is no sign-up flow, and both parents
are admins.

### Kid modes

- **Junior (about 5–9):** big balance, a "savings jar" or growing tree visual,
  very little text, large buttons.
- **Standard (about 10–18):** full charts, sliders, ledger and lessons.

A parent sets each kid's mode and can change it at any time.

## 3. Money rules

### 3.1 Rates (per account)

Every kid's account has its **own rate schedule**. The default for a new account is:

| Period | Monthly rate | ≈ Annual (compounded) |
|---|---|---|
| First 3 months from **account open date** | **2%** | 26.8% |
| After that | **1%** | 12.7% |

- A schedule is a list of `(effective_from, monthly_rate)` entries, so parents
  can change a kid's rate at any time and the history stays correct.
- The intro period runs from the open date to the same day 3 months later.
  Example: an account opened Jan 15 earns 2% through Apr 14 and 1% from Apr 15.

### 3.1a Account open date

An account **opens on the kid's first login**. A parent creates the kid's
profile ahead of time and can record deposits right away, but **interest
starts on the open date**. Money deposited before the first login waits,
earning nothing, until the kid signs in. That gives a natural "welcome"
moment: *"Your account is open, and your money starts earning today!"*

### 3.2 How interest is calculated

Interest **accrues daily** and is **paid on the last day of each month**.

For each day of the month:

```
daily_interest = end_of_day_balance × monthly_rate_that_day ÷ days_in_month
```

The month's interest is the sum of the daily amounts. It is credited as one
**"Payday"** transaction on the last day of the month, and from then on it
earns interest too. That is the compounding.

- Interest accrued during a month is **not withdrawable until it is paid**.
- Rate changes mid-month (including the end of the intro period) are handled
  naturally, because each day uses that day's rate.
- **Rounding:** money is stored as whole cents. Daily accruals are kept at
  full precision, and the monthly total is rounded to the cent. The rounding
  remainder carries into the next month, so no fractions are ever lost.

**Worked example:** a 30-day month at 2%. The balance is $100 for days 1–15,
and a $50 deposit lands on day 16:

```
days 1–15:  15 × $100 × 0.02 ÷ 30 = $1.00
days 16–30: 15 × $150 × 0.02 ÷ 30 = $1.50
Payday on the 30th:                 $2.50
```

### 3.3 Deposits

Parents record deposits by hand, with an optional note ("Birthday from Grandma").
Recurring allowance is a later feature.

### 3.4 Withdrawals

Kids can withdraw **at any time**, through a request:

1. The kid taps **Withdraw** and enters an amount and a reason.
2. **Reality check** screen: *"If you keep this $10 instead, it will be $11.27 in
   a year and $18.17 in 5 years."* The kid confirms or cancels.
3. The request appears for **both parents** to approve or deny. An in-app
   badge shows the number of pending requests; there are no push notifications.
4. On approval, the withdrawal is dated the approval day, and the parent hands
   over the cash.

Rules: a kid can't request more than their available (paid) balance minus any
other pending requests. Interest keeps accruing on money that is still pending.

## 4. Kid view

**Home**
- Big balance.
- **"The Bank of Dad has paid you $X"** (lifetime interest).
- Countdown to the next Payday, plus the interest earned so far this month.

**Growth chart**
- Stacked area: *money I put in* vs *money interest made*. The goal is for
  kids to see the interest band grow until it overtakes their deposits.

**What-if panel** (overlays a dashed projection on the chart)
- **Time slider:** 1 month to 10 years.
- **One-time extra deposit:** "What if I add my $50 birthday money?"
- **Recurring extra deposit:** "$5 every week" or "$20 every month".
- **Real bank comparison:** the same plan at a typical savings rate (default
  0.5%/yr, editable).
- Readout: final balance, total deposited, total interest, and how long it
  takes to double.

**Rate comparison** (always visible on the kid view and in the simulator)
- The Bank of Dad quotes **monthly** rates and real banks quote **annual**
  rates, so every rate is shown **both ways** for an apples-to-apples
  comparison:

  | Account | Per month | Per year | $100 for a year earns |
  |---|---|---|---|
  | Bank of Dad starter rate | 2% | 26.82% | $26.82 |
  | Bank of Dad regular rate | 1% | 12.68% | $12.68 |
  | Regular bank | 0.042% | 0.5% | $0.50 |

- Conversions assume monthly compounding both ways:
  `per year = (1 + monthly)^12 − 1` and `per month = (1 + annual)^(1/12) − 1`.
  "Per year" is the effective annual yield (APY), which is what banks advertise.
- The kid view shows **that kid's own** rates. The starter row only appears
  while it still applies or is recent; the regular-bank rate is editable by
  parents (default 0.5%).
- Bars on one shared per-year scale, plus a line like *"the Bank of Dad pays
  about 25× more than a regular bank."*

**Activity**: a ledger of deposits, withdrawals, Paydays and pending requests.

**Later:** savings goals with a projected date, lessons that unlock as the kid
progresses (Rule of 72, simple vs compound interest), and a Payday celebration.

## 5. Parent view

- **Family dashboard:** all 5 kids at a glance, pending withdrawal requests,
  and a total liability figure.
- **Per kid:** record a deposit, edit the rate schedule, set the mode, reset
  the PIN, view the full ledger, and make manual corrections.
- **Liability forecast:** what the Bank of Dad will owe across all kids in 1,
  3 and 5 years at current rates.
- **Approvals:** approve or deny withdrawal requests.

## 6. Simulator (public)

The same chart and what-if controls as the kid view, without an account:
starting amount, monthly rate, intro rate and length, deposits and years.
It needs no backend, so it works even if the database is down.

The simulator starts on the 1st of next month, so every month is a full
Payday cycle. It shows:

- The balance, split into *money you put in* and *interest earned*.
- A growth chart with a dashed "without extra deposits" line and a dotted
  "regular bank" line.
- Insight cards: vs. a regular bank, what the extra deposits became,
  doubling time, and the tipping point where interest has made more than
  was put in.
- A table of every Payday.

A side-by-side comparison mode ("start now" vs "start in 2 years") comes later.

## 7. Teaching extras (after version 1)

- **CDs:** lock some money for 3, 6 or 12 months at a bonus rate on top of
  the account's current rate. The bonus is **configurable** by the parents,
  defaulting to **+1% a month**. Breaking the lock early forfeits the bonus.
- **Rate events:** a parent announces a rate change with a message, as a
  lesson that rates aren't fixed.
- **Loans from Dad:** a kid borrows at **3% a month** (configurable) and sees
  compounding work *against* them, with a payoff schedule and a "minimum
  payment trap" what-if. Loan interest uses the same daily-accrual,
  month-end engine.

## 8. Look and feel

- **Professional** layout like a real banking app: clean type, clear numbers,
  generous whitespace.
- **Cheerful** color, friendly wording ("Your money earned $3.12 while you
  slept!") and a small confetti moment on Payday.
- Works on phones first, can be installed to the home screen, and supports
  light and dark themes.
- Chart colors: blue for *money you put in*, aqua for *interest earned*, and
  orange for *regular bank*. They were checked for colorblind safety in both
  themes. Aqua is low-contrast on the light background, so charts always carry
  a legend and a table view.

## 9. Architecture (free)

```
 Phones / tablets / laptops
            │
            ▼
 GitHub Pages ── static React app (installable)
            │
            ▼
 Supabase (free tier) ── Postgres + Auth + Row Level Security
            ▲
            │
 GitHub Actions ── deploy on push · post Payday monthly · keep-alive ping
```

| Piece | Choice | Cost |
|---|---|---|
| Frontend | React + TypeScript + Vite, Recharts for charts | Free |
| Hosting | GitHub Pages (requires a **public** repo; family data is never in the repo) | Free |
| Data and logins | Supabase free tier | Free |
| Scheduled jobs | GitHub Actions cron | Free for public repos |

### 9.1 Interest engine

The interest engine is a **pure TypeScript module** (no I/O) and the most
important code in the app. It is heavily unit-tested, and it is used by:

- the **kid and parent views**, for live "earned so far this month" figures,
- the **what-if simulator and projections**,
- the **Payday job**, to post interest.

Because interest is computed deterministically from the ledger and rate
schedule, the numbers can always be recomputed and audited.

### 9.2 Payday posting

A GitHub Actions job runs on the 1st of each month (and can be run by hand). It
computes the previous month's interest for every account and inserts a Payday
transaction. Each Payday is unique per `(account, month)`, so a re-run never
double-pays. If a run is missed, the next run catches up on every unpaid month.

**Interest is always derived.** The app computes balances and Paydays from the
ledger and rate schedule with the interest engine. Posted Payday rows are a
record of what was paid, not an input, so a late or missed job never shows
wrong numbers. Two database rules keep past months from changing underneath
the posted record:

- Once an account is open, ledger entries can only be added or removed **in
  the current month**. Earlier months' Paydays are final; fix mistakes with a
  correction (an adjustment) this month.
- Rate changes can only take effect **today or later**, and rates already in
  effect can't be removed.

Before an account opens there's no interest, so parents can backfill entries
with any past date.

### 9.3 Keep-alive

Supabase pauses free projects after about a week of inactivity. A GitHub Action
pings the database every 3 days to prevent that.

### 9.4 Security model

- **Parent accounts:** full read and write access to the family's data.
- **Family device account:** a shared login used on the kids' devices. Row
  Level Security lets it **read** family data, check kid PINs, open a kid's
  account on first login and, from Phase 3, **create withdrawal requests**.
  It cannot record deposits, approve requests or change rates, even if someone
  pokes at the API directly.
- **No parent PIN.** Parents manage money only from their own logins, so the
  shared device never holds parent powers.
- **Kid PINs** pick which profile is shown on a family device. They're a
  convenience, not a hard security boundary between siblings. PINs are stored
  bcrypt-hashed in a table no client can read; five wrong guesses lock that
  profile for a minute.
- **Sign-ups are disabled.** Parents create logins in the Supabase dashboard
  and then add them to the family in the app.
- Every rule above is covered by SQL tests (`supabase/tests/`) that run in CI.
- The Supabase service key lives only in GitHub Actions secrets, never in the
  frontend.

## 10. Data model

The source of truth is `supabase/migrations/`. In summary:

```
families      (id, name, time_zone, regular_bank_apy,
               cd_bonus_monthly_rate, loan_monthly_rate)
members       (user_id → auth.users, family_id, role[parent|device], display_name)
kids          (id, family_id, name, avatar, mode[junior|standard],
               intro_monthly_rate, intro_months, ongoing_monthly_rate,  -- rate template
               account_opened_on null)                                  -- set on first login
kid_pins      (kid_id, pin_hash, failed_attempts, locked_until)         -- functions only
rate_periods  (id, kid_id, effective_from, monthly_rate)                -- created on open
transactions  (id, kid_id, kind[deposit|withdrawal|interest|adjustment],
               amount_cents, occurred_on, note,
               period_month null,  -- interest only; unique(kid_id, period_month)
               created_by, created_at)
withdrawal_requests (Phase 3)
```

Functions: `create_family`, `add_family_member`, `remove_family_member`,
`set_kid_pin`, `kids_with_pin`, `verify_kid_pin`, `open_account`.

Paydays are a pure function of the ledger and rates, so the rounding remainder
doesn't need its own table.

All money is stored as **integer cents**.

## 11. Decisions log

| Question | Decision |
|---|---|
| Who uses it | One family: 2 parents (both admins) and 5 kids aged 5–18 |
| Default rates | 2%/month for 3 months from open, then 1%/month; set per account |
| Payday | Last day of each month; daily accrual, as in §3.2 |
| Withdrawals | Anytime, by request; a parent approves |
| Kid logins | Profile picker + 4-digit PIN |
| Open date | The kid's first login (confirmed). Deposits made earlier earn nothing until then |
| Rate display | Bank of Dad and regular-bank rates shown both per month and per year |
| Loan rate | 3%/month |
| CD bonus | +1%/month, configurable |
| Notifications | In-app badge only |
| Hosting | Free: GitHub Pages + Supabase + GitHub Actions |
