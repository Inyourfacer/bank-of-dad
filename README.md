# Bank of Dad

A family bank that pays generous interest so kids can watch compounding happen
in months, not decades.

- [Design](docs/DESIGN.md)
- [Build plan](docs/PLAN.md)
- [Setup guide](docs/SETUP.md): connect free Supabase + GitHub Pages, then describe your family in a config file ([example](docs/family.example.yaml))

## Development

Requires Node 22+.

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests (interest engine, formatting)
npm run lint
npm run typecheck
npm run build      # production build to dist/
```

Without Supabase configured, **Family → Try the demo** runs the whole app on
an in-memory pretend family. To connect a real database, see
[docs/SETUP.md](docs/SETUP.md).

A daily GitHub job (`.github/workflows/daily.yml`) posts Paydays and keeps
Supabase awake. To run it by hand: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run daily -- --dry-run`.

Database security rules are tested against plain Postgres:

```sh
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

The interest engine lives in `src/engine/` and is pure TypeScript with no I/O.
Every rule in [DESIGN §3](docs/DESIGN.md#3-money-rules) has a test.
The database schema and access rules live in `supabase/migrations/`.

## Deploying (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and
publishes the site to `https://<owner>.github.io/bank-of-dad/`.

One-time setup:

1. The repo must be **public** for free GitHub Pages.
2. Go to **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Add the `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository variables ([SETUP.md](docs/SETUP.md) step 5).
