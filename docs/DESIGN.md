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
| Parents | 2 | Their own email login (magic link) on their own devices | Everything: manage kids, deposits, rates, approve withdrawals |
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
3. The request appears for **both parents** to approve or deny, with a push
   notification to come later.
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
Comparison mode shows two scenarios side by side, for example "start now" vs
"start in 2 years". It needs no backend, so it works even if the database is
down.

## 7. Teaching extras (after version 1)

- **CDs:** lock some money for 3, 6 or 12 months at a bonus rate. Breaking the
  lock early forfeits the bonus.
- **Rate events:** a parent announces a rate change with a message, as a
  lesson that rates aren't fixed.
- **Loans from Dad:** a kid borrows at interest and sees compounding work
  *against* them, with a payoff schedule and a "minimum payment trap" what-if.

## 8. Look and feel

- **Professional** layout like a real banking app: clean type, clear numbers,
  generous whitespace.
- **Cheerful** color, friendly wording ("Your money earned $3.12 while you
  slept!") and a small confetti moment on Payday.
- Works on phones first, can be installed to the home screen, and supports
  light and dark themes.

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

The app also shows accrued-but-unposted interest, so a late job never shows
wrong numbers.

### 9.3 Keep-alive

Supabase pauses free projects after about a week of inactivity. A GitHub Action
pings the database every 3 days to prevent that.

### 9.4 Security model

- **Parent accounts:** full read and write access to the family's data.
- **Family device account:** a shared login used on the kids' devices. Row
  Level Security lets it **read** family data and **create withdrawal
  requests only**. It cannot record deposits, approve requests or change rates,
  even if someone pokes at the API directly.
- **Kid PINs** pick which profile is shown on a family device. They're a
  convenience, not a hard security boundary between siblings. PINs are stored
  hashed.
- The Supabase service key lives only in GitHub Actions secrets, never in the
  frontend.

## 10. Data model (draft)

```
family        (id, name)
parent        (user_id → auth.users, family_id, display_name)
kid           (id, family_id, name, avatar, mode[junior|standard],
               pin_hash, account_opened_on)
rate_period   (id, kid_id, effective_from date, monthly_rate numeric)
transaction   (id, kid_id, kind[deposit|withdrawal|interest|adjustment],
               amount_cents int, occurred_on date, note,
               period_month date null,  -- set for interest; unique(kid_id, period_month)
               created_by, created_at)
withdrawal_request
              (id, kid_id, amount_cents, reason,
               status[pending|approved|denied], decided_by, decided_at,
               transaction_id null, created_at)
interest_carry(kid_id, period_month, remainder numeric)  -- rounding remainder
```

All money is stored as **integer cents**.

## 11. Open questions (non-blocking)

1. **Loan rate:** what monthly rate should a kid pay to borrow from Dad?
   Suggestion: 3%, so it costs more than saving earns.
2. **CD bonus:** for example +0.5% a month for a 6-month lock?
3. **Kid names, avatars and modes** for the 5 accounts, and each account's
   open date. Should balances be backfilled if the arrangement already exists
   informally?
4. **Notifications:** is a phone notification for withdrawal requests needed
   in version 1, or is a badge in the app enough?
