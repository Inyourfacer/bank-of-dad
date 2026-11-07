# Bank of Dad

A family bank that pays generous interest so kids can watch compounding happen
in months, not decades.

- [Design](docs/DESIGN.md)
- [Build plan](docs/PLAN.md)

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

The interest engine lives in `src/engine/` and is pure TypeScript with no I/O.
Every rule in [DESIGN §3](docs/DESIGN.md#3-money-rules) has a test.

## Deploying (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and
publishes the site to `https://<owner>.github.io/bank-of-dad/`.

One-time setup:

1. The repo must be **public** for free GitHub Pages.
2. Go to **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
