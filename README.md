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

Demo data: in SAAS-Admin run `docker compose exec api python manage.py seed_demo` (an agency with subscribers,
bookings, outcomes, delivery jobs and follow-ups; owner, manager and office staff users). Sign in at
http://localhost:3001/login. Owners set up two-factor authentication on first sign-in. Platform staff can't sign in
here; they open an agency from the super admin console (Open as support).

What's built so far: sign-in with 2FA, invitation acceptance, agency choice for users in several agencies, the menu
for each role (spec 1.1), the suspended-agency and support banners, and Home (spec 2.1) with the first-login
checklist (Workflow 3.6). Other screens show a placeholder until their step.

## Checks

```bash
pnpm check               # turbo: lint, typecheck, test, build
```

CI (`.github/workflows/ci.yml`) runs the same on every pull request and on pushes to `main`.

End-to-end tests (Playwright) run against the SAAS-Admin backend: each run seeds a fresh demo agency with
`seed_demo` and signs in its owner (real 2FA), manager and office staff.

```bash
cd apps/portal
E2E_MANAGE="docker compose exec -T api python manage.py" E2E_MANAGE_CWD=../../../SAAS-Admin pnpm e2e
```

`E2E_MANAGE_CWD` is your SAAS-Admin checkout (where `docker compose` runs); `E2E_CHROME_PATH` uses an installed Chrome.
