# Setting up the Bank of Dad (one time, about 20 minutes)

Everything here is free: GitHub Pages hosts the app, Supabase stores the data,
and GitHub runs two small jobs (setting up your family and paying interest).

You'll end up with:

- **Parent logins** (username + password) for the website.
- **A tablet login** (username + password) for the kids' shared tablet or phone.
  It can see balances but can't move money.
- **Kid profiles**, each with a 4-digit PIN, used on the tablet.

You describe your family once in a short config file, keep it in a private
GitHub secret, and click a button. No emails and no creating logins by hand.

> Want to look around first? Open the site and choose **Family → Try the demo**.
> It uses a pretend family and saves nothing.

---

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. Name it `bank-of-dad`, choose a strong database password (store it in your
   password manager; the app never needs it), and pick the region closest to you.
3. Wait a minute or two for it to start.

## 2. Create the database tables

In the project, open **SQL Editor**. For each file below, in this order, click
**New query**, paste the file's entire contents, and click **Run**. Each should
say "Success. No rows returned".

1. [`supabase/migrations/20261107000000_core.sql`](../supabase/migrations/20261107000000_core.sql)
2. [`supabase/migrations/20261108000000_kid_sign_in_and_withdrawals.sql`](../supabase/migrations/20261108000000_kid_sign_in_and_withdrawals.sql)
3. [`supabase/migrations/20261109000000_family_config.sql`](../supabase/migrations/20261109000000_family_config.sql)

Already ran some of them earlier? Just run the ones you haven't, oldest first.

## 3. Turn off public sign-ups

**Why:** so only the logins in your family config can ever sign in. Strangers
who find the website can't create an account.

1. In Supabase, click **Authentication** in the left sidebar, then under
   **Configuration** click **Sign In / Providers** (older dashboards:
   **Providers**).
2. Find the switch **Allow new users to sign up** (if it isn't near the top,
   expand **Email** in the provider list and look for **Enable sign ups**).
3. Turn it **off**. Leave the **Email** provider itself **on**: it handles
   username-and-password sign-in.
4. Click **Save changes**.

**Check:** the switch still shows as off after you reload the page.

> Supabase sometimes renames menu items. If a name doesn't match exactly, look
> for the closest one: the settings themselves haven't changed.

## 4. Connect GitHub to Supabase

In Supabase, open **Project Settings → API Keys** (older dashboards:
**Project Settings → API**) and keep it open. In GitHub, open the repo's
**Settings → Secrets and variables → Actions**.

**Variables tab → New repository variable**, twice:

| Name | Value | |
|---|---|---|
| `SUPABASE_URL` | the **Project URL**, e.g. `https://abcd1234.supabase.co` | |
| `SUPABASE_ANON_KEY` | the **anon / publishable** key | Public by design: the security rules from step 2 decide what each person can see. |

**Secrets tab → New repository secret**:

| Name | Value | |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | the **service_role / secret** key (click *Reveal*) | Can read and change everything, so it only ever goes in a secret, which GitHub hides even from you after saving. |

Then **Actions → Deploy to GitHub Pages → Run workflow**, so the website picks
up the two variables.

## 5. Write your family config

1. Copy [`docs/family.example.yaml`](family.example.yaml) into a note on your
   computer and fill it in: your family name and time zone, a username and
   password for each parent and the tablet, and each kid's name and PIN.

   ```yaml
   family: The Smiths
   time_zone: America/Chicago
   parents:
     - { name: Dad, username: dad, password: "at least 8 characters" }
     - { name: Mom, username: mom, password: "at least 8 characters" }
   tablet: { username: kids-tablet, password: "at least 8 characters" }
   kids:
     - { name: Ava, pin: "4821", picture: 🦊, view: standard }
     - { name: Cora, pin: "7395", picture: 🦄, view: junior }
   ```

   Per kid you can also set `starter_rate`, `starter_months` and `rate`
   (defaults: 2% a month for 3 months, then 1%). Put PINs in quotes.

2. **Save that note somewhere private**, such as your password manager.
   GitHub won't show you the secret again, so to change anything later you'll
   edit your copy and paste it in again.
3. **Never commit it to the repo.** The repo is public.
4. In GitHub, **Secrets tab → New repository secret**:
   - Name: `FAMILY_CONFIG`
   - Secret: paste the whole config
5. **Actions → Set up family → Run workflow**:
   - First tick **Only check the config** and run. If something's wrong, the
     log says what and where (it never prints passwords or PINs).
   - Then run it again with the box unticked. The log lists the logins,
     family and kids it created.

## 6. Sign in

**Parents:** open `https://inyourfacer.github.io/bank-of-dad/`, go to
**Family → Parent**, and sign in with your username and password. Record any
money each kid already has. Until a kid's first sign-in you can date entries
in the past; interest starts on the first sign-in.

**Kids' tablet:** open the same address on the tablet, go to **Kids → Family
device**, and sign in with the tablet username and password. Each kid taps
their picture and enters their PIN. Their first sign-in opens the account, and
interest starts that day.

**Turn on automatic Paydays:** **Actions → Daily bank jobs → Run workflow**,
tick **Only show what would be posted**, and run. The log should say how many
families and kid accounts it checked. After that it runs by itself every day
at 10:23 UTC, posts each Payday once the month ends, and keeps Supabase awake.

**Check the lockdown:** in Supabase, **Authentication → Users** should list
exactly the logins from your config.

## Changing things later

| To… | Do this |
|---|---|
| Add a kid | Add them to your config, update the `FAMILY_CONFIG` secret, run **Set up family**. (Or **Add a kid** in the app.) |
| Change a PIN | In the app: open the kid, **Change PIN**. Or in the config: change it, add `reset_pin: true` to that kid, update the secret, run **Set up family**. |
| Reset a forgotten password | Change it in your config, update the secret, run **Set up family**. Parents can also change their own under **Family settings → Your password**. |
| Add another parent or a second tablet | Add them under `parents:` (or change `tablet:`), update the secret, run **Set up family**. |

**Set up family** only adds what's new: it never deletes anything and never
overwrites changes made in the app (pictures, views, rates, PINs), except
passwords and PINs marked `reset_pin: true`.

## Local development

```sh
cp .env.example .env.local   # then fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:5173/bank-of-dad/
```

Without `.env.local` the app still runs, and **Family → Try the demo** works.

## Database tests

The security rules have their own tests, run against plain Postgres in CI:

```sh
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

## Good to know

- **Free projects pause after about a week of no use.** The daily job prevents
  this. If it ever happens anyway, open the Supabase dashboard and click
  **Restore**.
- **GitHub pauses scheduled jobs in a repository with no commits for 60
  days** and emails you first. If that happens, open **Actions → Daily bank
  jobs** and click **Enable workflow**. Balances on screen stay correct either
  way, because the app works out interest itself; the job just records it.
- **Changing the database later:** new files in `supabase/migrations/` are
  applied the same way, through the SQL Editor, in filename order.
- **Usernames** become logins like `dad@bankofdad.local` inside Supabase.
  Nothing is ever emailed there. If Supabase ever refuses one, use a real
  email address as that person's `username` instead.

## Optional: sign in with emailed codes

You don't need this; everyone signs in with a password. It's here only if a
parent would rather get a sign-in code by email.

New free Supabase projects can't edit email templates, and their built-in
sender only emails members of your Supabase team, so you first connect a free
email sender. Gmail is the easiest:

1. In your Google account, turn on **2-Step Verification**, then create an
   **App password** (search "App passwords" in your Google account settings).
2. In Supabase: **Authentication → Emails → SMTP Settings** → turn on
   **Enable custom SMTP**: sender email and username = your Gmail address,
   sender name `Bank of Dad`, host `smtp.gmail.com`, port `465`, password = the
   app password.
3. **Authentication → URL Configuration**: set **Site URL** and add a
   **Redirect URL** of `https://inyourfacer.github.io/bank-of-dad/`.
4. **Emails → Magic Link**: subject `Your Bank of Dad sign-in code`, body:

   ```html
   <h2>Your Bank of Dad sign-in code</h2>
   <p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   ```

5. That parent's `username` in the config must be their real email address.
   On the sign-in screen they choose **Email me a sign-in code instead**.
