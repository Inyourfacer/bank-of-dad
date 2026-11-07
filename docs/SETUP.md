# Setting up the Bank of Dad (one time, about 20 minutes)

Everything here is free: GitHub Pages hosts the app and Supabase stores the
data and handles sign-in.

You'll end up with:

- **2 parent logins** (email codes, no passwords).
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

This creates the tables, the security rules that keep each family's data
private, and the functions for PINs and opening accounts.

## 3. Lock down sign-in

In **Authentication**:

1. **Sign In / Providers**: turn **off** "Allow new users to sign up". Only
   people you add can sign in. Leave the **Email** provider on.
2. **URL Configuration**:
   - **Site URL**: `https://inyourfacer.github.io/bank-of-dad/`
   - **Redirect URLs**: add `https://inyourfacer.github.io/bank-of-dad/` and,
     for local development, `http://localhost:5173/bank-of-dad/`.
3. **Emails → Magic Link**: so the email contains a typeable code as well as a
   link (handy when the app is installed on a phone's home screen), replace the
   body with:

   ```html
   <h2>Your Bank of Dad sign-in code</h2>
   <p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   ```

> Supabase's built-in email sender only allows a few emails an hour. That's
> plenty for a family. If you ever hit the limit, wait an hour or connect your
> own SMTP under **Authentication → Emails → SMTP Settings**.

## 4. Create the logins

In **Authentication → Users → Add user → Create new user**:

| Who | Email | Password | Auto confirm |
|---|---|---|---|
| You | your email | leave blank | ✅ |
| Other parent | their email | leave blank | ✅ |
| Family device | any address, e.g. `kids-tablet@yourfamily.example` (it never receives mail) | a strong password you'll type on the kids' device | ✅ |

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

## 6. First sign-in

1. Open `https://inyourfacer.github.io/bank-of-dad/`, then go to **Family →
   Parent**, enter your email and the code you receive.
2. Create your family bank (family name and what the kids call you).
3. **Family settings → Add someone**: add the other parent (role *Parent*)
   and the family device (role *Family device*) using the emails from step 4.
4. **Add a kid** for each child: name, picture, Junior (5–9) or Standard
   (10+), and starting rates (default 2%/month for 3 months, then 1%/month).
5. Open each kid and **set a 4-digit PIN**.
6. Record any money each kid already has. Until a kid's first login you can
   date entries in the past; interest starts on the first login.

On the kids' device: **Family → Family device**, then sign in with the device
email and password. (Kid profiles with PIN sign-in arrive in Phase 3.)

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

- **Free projects pause after about a week of no use.** If the app says it
  can't connect, open the Supabase dashboard and click **Restore**. Phase 4 adds
  an automatic weekly "keep-alive" so this stops happening.
- **Changing the database later:** new files in `supabase/migrations/` are
  applied the same way, through the SQL Editor, in filename order.
