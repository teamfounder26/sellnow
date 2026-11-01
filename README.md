# SellNow — From Idea to Sales

AI-powered business creation, website and checkout platform for Malaysian sellers.
English by default, Bahasa Melayu fully supported, MYR everywhere.

> Status: pre-launch, **V2.0**. See [docs/IMPLEMENTATION_REPORT_V2.md](docs/IMPLEMENTATION_REPORT_V2.md) (V2) and [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) (V1 baseline) for exactly what is implemented, partial and planned.

## Quick start (local)

```bash
npm install
npm run dev -- -p 3100        # http://localhost:3100
```

- No database setup is needed for development: when `DATABASE_URL` is unset, an embedded Postgres (PGlite) is created at `./.data/pglite` and migrations run automatically.
- `.env.local` holds generated `APP_ENCRYPTION_KEY` / `APP_SIGNING_SECRET`. Copy `.env.example` for the full list.
- AI uses **TokenPortal** (`TOKENPORTAL_API_KEY`, model `gpt-6.1-sol`); test it in *Settings → AI*. Without a key the app runs in **manual mode**: onboarding uses guided forms and storefronts are built from a labelled template. Nothing is presented as AI output.
- To take payments locally, connect the **SellNow Test Gateway** in *Settings → Payments*. It moves no money, runs through the same signed-event path as real gateways, and its orders are flagged TEST and excluded from revenue, KPIs and milestones.
- Email delivery is not configured; in development the verification link is shown in *Settings → My profile* and printed to the server log.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest suite against an in-memory Postgres (PGlite) |
| `npm run db:generate` | Generate a SQL migration from `src/lib/db/schema.ts` |

A second, isolated dev server (own build dir + own embedded DB) can run beside the main one: `.claude/launch.json` → `sellnow-verify` (port 3101).

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript strict · Tailwind CSS v4 · Drizzle ORM on PostgreSQL (PGlite in dev/tests, `pg` in production) · Zod · Anthropic SDK (structured outputs) · Stripe SDK · lucide-react.

## Layout

```
src/
  app/                 routes (landing, auth, onboarding, dashboard/*, public store /s/[slug], API + webhooks)
  app/actions/         server actions — every one re-checks auth + workspace role on the server
  components/          UI (design-system primitives in components/ui)
  lib/
    db/                schema + connection (PGlite or Postgres) — migrations in /drizzle
    auth/              scrypt passwords, DB sessions, tenant/role guards
    ai/                provider interface, Anthropic adapter, metered runner, schemas, prompts
    onboarding/        state machine + onboarding service
    categories.ts      six category engines (required facts, checkout mode, fulfillment)
    products/ storefront/ commerce/ payments/ crm/ marketing/ analytics/ billing/ context/
    i18n/              BM + EN dictionaries, server/client helpers
tests/                 critical-path tests (auth, tenancy, onboarding, checkout, payments, analytics…)
```

## Environment variables

See `.env.example`. Production **requires** `DATABASE_URL`, `APP_ENCRYPTION_KEY` (32-byte base64), `APP_SIGNING_SECRET`, `APP_URL`. Optional: `ANTHROPIC_API_KEY`, `SELLNOW_AI_MODEL`, `CRON_SECRET`, `META_APP_ID`/`META_APP_SECRET` (Meta flow not yet built), `ALLOW_TEST_GATEWAY` (never in real production).

Merchant payment credentials (Stripe / Billplz) are entered per workspace in the app and stored AES-256-GCM encrypted.

## Webhooks

- Stripe: `POST /api/webhooks/stripe/{integrationId}` — subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
- Billplz: callback URL is set automatically per bill: `POST /api/webhooks/billplz/{integrationId}`.
- Reservation cleanup: `POST /api/cron/release-reservations` with header `x-cron-key: $CRON_SECRET` every ~10 minutes.
