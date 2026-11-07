# Setting up the Bank of Dad (one time, about 20 minutes)

Everything here is free: GitHub Pages hosts the app and Supabase stores the
data and handles sign-in.

You'll end up with:

- **2 parent logins** (email + password).
- **1 family-device login** (email + password) for the kids' tablet or phones.
  It can see balances but can't move money.
- **5 kid profiles**, each with a 4-digit PIN, used on the family device.

> Want to look around first? Open the site and choose **Family → Try the demo**.
> It uses a pretend family and saves nothing.

---

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. Name it `bank-of-dad`, choose a strong database password (store it in your
   password manager; the app never needs it), and pick the region closest to you.
3. Wait a minute or two for it to start.

## 2. Create the database tables

1. In the project, open **SQL Editor → New query**.
2. Paste the entire contents of
   [`supabase/migrations/20261107000000_core.sql`](../supabase/migrations/20261107000000_core.sql)
   and click **Run**. You should see "Success. No rows returned".
3. Click **New query** again and do the same with
   [`supabase/migrations/20261108000000_kid_sign_in_and_withdrawals.sql`](../supabase/migrations/20261108000000_kid_sign_in_and_withdrawals.sql).
   Always run the files in this order (oldest first). If you already ran the
   first file earlier, just run the second one.

This creates the tables, the security rules that keep each family's data
private, and the functions for PINs and opening accounts.

## 3. Set up sign-in

Step 3 has two required parts and one optional part, all on the **Authentication** page of your Supabase
project. To get there, open your project at
[supabase.com/dashboard](https://supabase.com/dashboard) and click
**Authentication** in the left sidebar (the icon looks like a person). A
second menu appears beside it; the parts below use that menu.

> Supabase sometimes renames these menu items. If a name below doesn't match
> exactly, look for the closest one: the settings themselves haven't changed.

### 3a. Turn off public sign-ups

**Why:** so only the people you add in step 4 can ever sign in. Strangers who
find the website can't create an account.

1. In the Authentication menu, under **Configuration**, click
   **Sign In / Providers**. (Older dashboards: **Providers**.)
2. Near the top, find the **User Signups** section and the switch
   **Allow new users to sign up**.
   - Don't see it? Scroll down to **Email** in the provider list, click it to
     expand, and look there for **Enable sign ups** or **Allow new users to
     sign up**.
3. Turn that switch **off**.
4. Leave the **Email** provider itself **on** (enabled). It handles
   email-and-password sign-in, so turning it off would lock everyone out.
5. Click **Save changes** (the button may be at the bottom of the section).

**Check:** the switch shows as off after you reload the page.

### 3b. Tell Supabase where the website lives

**Why:** sign-in emails contain a link back to the app. Supabase only sends
people to addresses you've approved.

1. In the Authentication menu, under **Configuration**, click
   **URL Configuration**.
2. **Site URL:** replace whatever is there (often `http://localhost:3000`) with
   the address below, then click **Save**:

   ```
   https://inyourfacer.github.io/bank-of-dad/
   ```

3. **Redirect URLs:** click **Add URL**, paste the same address, and save. If
   you plan to run the app on your own computer for development, also add:

   ```
   http://localhost:5173/bank-of-dad/
   ```

**Check:** the Site URL box shows the GitHub address, and the Redirect URLs
list has one or two entries.

### 3c. Optional: sign-in by email instead of password

**Skip this.** Everyone signs in with a password, which needs no email at all.
Come back only if you'd rather sign in with emailed codes.

New free Supabase projects come with two email limits:

- **The email template can't be edited** until you connect your own email
  sender (SMTP). You'll see a message like "Set up custom SMTP to edit".
- **Supabase's built-in sender only emails members of your Supabase team**,
  at about 2 emails an hour. Anyone else gets "Email address not authorized".

To use emailed sign-ins, connect a free sender. Gmail is the easiest:

1. In your Google account, turn on **2-Step Verification**, then create an
   **App password** (search "App passwords" in your Google account settings).
   Copy the 16-character password.
2. In Supabase: **Authentication → Emails → SMTP Settings** → turn on
   **Enable custom SMTP** and fill in:

   | Field | Value |
   |---|---|
   | Sender email | your Gmail address |
   | Sender name | `Bank of Dad` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | your Gmail address |
   | Password | the 16-character app password |

3. Save. Now **Emails → Magic Link** can be edited. Replace the subject with
   `Your Bank of Dad sign-in code` and the body with:

   ```html
   <h2>Your Bank of Dad sign-in code</h2>
   <p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   ```

Then on the sign-in screen, choose **Email me a sign-in code instead**.

## 4. Create the logins

In **Authentication → Users → Add user → Create new user**:

| Who | Email | Password | Auto confirm user |
|---|---|---|---|
| You | your email | a starting password | ✅ on |
| Other parent | their email | a starting password (tell them; they change it in the app) | ✅ on |
| Family device | any address, e.g. `kids-tablet@yourfamily.example` (it never receives mail) | a strong password you'll type on the kids' device | ✅ on |

Leave **Auto confirm user** on. Otherwise Supabase tries to send a
confirmation email, which (see 3c) it may not be able to deliver.

**Forgot a password?** Each parent can change their own under **Family
settings → Your password**. If someone is locked out, open **SQL Editor** in
Supabase and run (with the real email and a new password):

```sql
update auth.users
set encrypted_password = extensions.crypt('new-password-here', extensions.gen_salt('bf'))
where email = 'their-email@example.com';
```

## 5. Connect the app

1. In Supabase, open **Project Settings → API** (or **API Keys**) and copy:
   - the **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - the **anon / publishable** key. This key is designed to be public. The
     security rules from step 2 decide what each person can see. **Never** use
     the `service_role` / secret key in the app.
2. In GitHub, open the repo's **Settings → Secrets and variables → Actions →
   Variables** tab, and add two **repository variables**:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_ANON_KEY`: the anon / publishable key
3. Re-run the deploy: **Actions → Deploy to GitHub Pages → Run workflow**.

### 5b. Turn on automatic Paydays

A daily GitHub job posts each kid's Payday once the month ends and keeps the
free Supabase project from pausing. It needs Supabase's **secret** key, which
can read and write everything, so it goes in a GitHub **secret** (hidden even
from you after saving), never in a variable or the app.

1. In Supabase, **Project Settings → API Keys**, copy the **service_role** /
   **secret** key. (Older dashboards: **Project Settings → API → service_role**,
   click *Reveal*.)
2. In GitHub, **Settings → Secrets and variables → Actions → Secrets** tab →
   **New repository secret**:
   - Name: `SUPABASE_SERVICE_ROLE_KEY`
   - Secret: the key you copied
3. Test it: **Actions → Daily bank jobs → Run workflow**, tick **Only show
   what would be posted**, and run. The log should say how many families and
   kid accounts it checked. Untick the box (or wait for the daily run) to post
   for real.

The job runs every day at 10:23 UTC (early morning in the US). Running it more
than once is harmless: each month is posted only once.

## 6. First sign-in

1. Open `https://inyourfacer.github.io/bank-of-dad/`, then go to **Family →
   Parent** and sign in with your email and starting password.
2. Create your family bank (family name and what the kids call you).
3. **Family settings → Add someone**: add the other parent (role *Parent*)
   and the family device (role *Family device*) using the emails from step 4.
   While you're there, change your password under **Your password**.
4. **Add a kid** for each child: name, picture, Junior (5–9) or Standard
   (10+), and starting rates (default 2%/month for 3 months, then 1%/month).
5. Open each kid and **set a 4-digit PIN**.
6. Record any money each kid already has. Until a kid's first login you can
   date entries in the past; interest starts on the first login.

**Check the lockdown:** in Supabase, open **Authentication → Users**. You
should see exactly the three logins from step 4. With sign-ups off (step 3a),
no one else can add themselves to that list. The database rules also ignore
any login a parent hasn't added to the family.

On the kids' device: **Kids → Family device**, then sign in with the device
email and password. Each kid taps their picture and enters their PIN. Their
first sign-in opens the account, and interest starts that day.

## Local development

```sh
cp .env.example .env.local   # then fill in the two values from step 5
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

- **Free projects pause after about a week of no use.** The daily job (step
  5b) prevents this. If it ever happens anyway, open the Supabase dashboard
  and click **Restore**.
- **GitHub pauses scheduled jobs in a repository with no commits for 60
  days** and emails you first. If that happens, open **Actions → Daily bank
  jobs** and click **Enable workflow**. Balances on screen stay correct either
  way, because the app works out interest itself; the job just records it.
- **Changing the database later:** new files in `supabase/migrations/` are
  applied the same way, through the SQL Editor, in filename order.
