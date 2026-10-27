# Schedule Confirmation SaaS — Client Portal

The agency-facing web app (`app.<domain>`): subscribers, bookings, deliveries, follow-up queue,
reports, reminder settings, users and billing. Spec: [docs/client-portal-spec.md](docs/client-portal-spec.md).
Project rules: [CLAUDE.md](CLAUDE.md).

The backend API, super admin console and infrastructure are in
[SAAS-Admin](https://github.com/Acube-Innovation/SAAS-Admin).

## Layout

```
apps/portal          Client portal (Next.js App Router, port 3001)
packages/ui          Shared UI components + translation helper   (also in SAAS-Admin)
packages/api-client  Typed API client                            (also in SAAS-Admin)
packages/config      Shared tsconfig, ESLint and Tailwind theme  (also in SAAS-Admin)
```

## Prerequisites

- Node.js 22 LTS and pnpm 10 (`npm i -g pnpm@10`)
- The API running locally from SAAS-Admin (`docker compose up` there), on http://localhost:8000

## Run

```bash
pnpm install
pnpm dev                 # portal on http://localhost:3001
```

The portal proxies `/api/*` to `API_INTERNAL_URL` or `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).

## Checks

```bash
pnpm check               # turbo: lint, typecheck, test, build
```

CI (`.github/workflows/ci.yml`) runs the same on every pull request and on pushes to `main`.
