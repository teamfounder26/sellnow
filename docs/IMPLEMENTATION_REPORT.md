# SellNow v1.0 — Implementation Report

_Last updated: 2026-11-01_

## 1. Project assessment (Phase 0)

- The `Sellnow` folder was **empty**: no repository, framework, schema, auth, payment or AI integration existed. Nothing to preserve or reuse.
- Environment: Node 26, npm 11. No PostgreSQL or Docker installed. No `ANTHROPIC_API_KEY`, Stripe, Billplz or Meta credentials present.
- Selltro: a Selltro MCP connection exists in the developer's Claude session, but **no Selltro API contract or credentials were available to the application**, so SellNow does not call Selltro. Payments, CRM and catalog are independent SellNow modules behind interfaces (`lib/payments/*`, `lib/crm/*`) so a Selltro adapter can be added once an authorized API is provided.

## 2. Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router + Server Actions, React 19, TS strict | Spec's recommended stack; one deployable; server actions get built-in origin/CSRF checks |
| DB | PostgreSQL via Drizzle ORM | Typed, SQL-first, transactional; same dialect everywhere |
| Local DB | PGlite (embedded Postgres, WASM) | Zero-setup dev + fast isolated tests with real Postgres semantics; `DATABASE_URL` switches to `pg` |
| Auth | Own sessions: scrypt (Node crypto) hashes, random 256-bit tokens stored SHA-256-hashed, httpOnly cookies | No external auth vendor needed; full control over tenancy |
| Money | Integer sen everywhere; server-side quote | No float errors; client never supplies prices |
| AI | `AIProvider` interface + Anthropic adapter (`claude-opus-5-5`, structured outputs via Zod, server-side refusal fallback) | Provider-independent; schema-validated output |
| i18n | Own dictionaries (BM default, EN), parity test | Small, typed, no runtime dependency |
| Storage | FS adapter under `.data/storage` (outside web root); public images via `/api/assets`, private files only via entitlement tokens | Swap for S3/R2 behind same 2 functions |

Infrastructure deliberately **not** introduced yet: Redis, job queue workers, object storage, email provider (each has an adapter seam and is listed under external configuration).

## 3. Modules and status

Legend: ✅ implemented & tested · 🟡 partial · ⏳ planned (not built)

| Domain | Status | Notes |
|---|---|---|
| Identity & auth | ✅ | Signup/login/logout, DB sessions, email verification tokens, rate-limited login/signup. Email *delivery* 🟡 (console adapter). |
| Workspaces & roles | ✅ | Owner/Admin/Editor/Viewer enforced server-side on every action; cross-tenant tests. Member invitations ⏳ (needs email). |
| Landing page | ✅ | Hero AI composer, how-it-works, 6 categories, feature previews, proposed pricing, FAQ, CTA. No fabricated proof. |
| AI onboarding | ✅ | DB-persisted state machine (NEW → … → PUBLISHED), back-navigation, change category, resume, draft persistence, error recovery with preserved input. Low-confidence categories are never auto-selected. Facts carry provenance (user / AI suggestion / confirmed / missing). |
| AI Business Builder | ✅ (code) / 🟡 (live) | Analyze + profile drafting with Zod-validated structured outputs, credit metering, generation records, refund on failure. **Not exercised against the live Anthropic API** (no key) — covered by tests with a fake provider. Manual mode fully works. |
| Category engines | ✅ physical, digital · 🟡 service · ⏳ booking/event/membership checkout | Physical & digital: full checkout. Service: enquiry → lead. Booking/event/membership: profile + storefront + "register interest" lead capture; checkout is blocked server-side (`checkout.categoryNotPurchasable`). Slots/tickets/subscriptions ⏳. |
| Products | ✅ | Category-specific validation, variants, compare-at price, stock tracking, digital file upload (private), images. |
| Storefront builder | ✅ | AI or labelled-template generation, editable/reorderable/hideable sections, theme colours, policies, mobile/desktop preview, slug, order bump, versioned publishing (draft never changes live), validation with precise fix links, unpublish. Confirmed-only testimonials. Custom domains ⏳. |
| Checkout & payments | ✅ (test gateway) / 🟡 (Stripe, Billplz) | Server-side totals, coupons, flat shipping, pickup, MY address/postcode/state validation, idempotency keys, atomic stock reservation, reservation expiry, payment state machine, signed-webhook verification, idempotent event apply, amount/currency matching. **Stripe and Billplz adapters are written against their official APIs but have not been run against real sandbox accounts.** Upsell ⏳; bundles ⏳. |
| Orders & fulfillment | ✅ | Order list/detail, payment event log, mark fulfilled, refunds (Stripe via API; Billplz/test recorded manually; full refund revokes downloads). |
| Digital delivery | ✅ | Entitlements granted only on verified PAID; hashed tokens, expiry, download limits, atomic counting; revoked on refund. |
| CRM | 🟡 | Customers from checkout/enquiries, consent + opt-out, timeline, leads with status + human-takeover flag. AI Sales Assistant / WhatsApp ⏳ (needs official WhatsApp Business integration). |
| Creative Studio | 🟡 | Text creatives (ad copy, headlines, descriptions, scripts) via the AI provider with credit cost, approval, price snapshot. Image/video generation ⏳ (no provider) — UI says so; no mock images. |
| Marketing / Meta | 🟡 | Campaign drafts, audience, budget, approval (owner/admin, exact budget), budget change clears approval. **Publishing to Meta is not implemented**: it refuses with an explicit error. Meta OAuth connect ⏳. |
| Analytics | ✅ | Defined KPIs from persisted data, date ranges, refunds netted, test orders excluded, visitor tracking (anonymous, per-workspace hashed), missing-data states for ad spend/ROAS/CAC/profit. |
| Recommendations | ✅ (rule-based) | Computed from data with minimum sample sizes and supporting metrics; labelled as not-AI. |
| Context engine | ✅ (price changes) | Price change → finds storefront draft/live, creatives, campaigns, FAQ that may be stale → dashboard alert; never edits published material. AI tool-calling agent (`readBusinessProfile`, …) ⏳. |
| Milestones | ✅ | Derived from records only; First Sale requires a non-test verified payment; Growth = 10 paid orders & RM1,000 net. Celebrations respect reduced motion. |
| Billing & credits | 🟡 | Configurable plans + entitlements, append-only credit ledger with row-locking, failed-generation refunds. SellNow subscription checkout ⏳; monthly re-allocation job ⏳; top-ups ⏳. |
| Notifications | ✅ (in-app) | Order paid, first sale, store live, new lead, mismatch/oversell warnings, context alerts. |
| Audit log & product analytics | ✅ | `audit_logs`, `analytics_events` (no customer PII in props). |
| Localization | ✅ | Every UI string through BM/EN dictionaries with a parity test; MYR, Malaysia timezone, states, phone/postcode formats. AI replies in the user's language. |

## 4. Database

Single initial migration `drizzle/0000_init.sql` (schema in `src/lib/db/schema.ts`): users, sessions, email_verification_tokens, workspaces, workspace_members, business_profiles, onboarding_sessions, assets, products, product_variants, storefronts, storefront_versions, integrations, discount_codes, customers, leads, orders, order_items, payment_events, download_entitlements, ai_generations, ai_credit_ledger, creatives, campaigns, notifications, audit_logs, analytics_events.

Key constraints: unique `(provider, provider_event_id)` (webhook idempotency), unique `orders.idempotency_key`, unique `(workspace_id, number)`, unique `(generation_id, reason)` on the credit ledger, unique `(order_id, product_id)` entitlements, tenant-scoped indexes. Tables in the conceptual spec that are not needed yet (bookings, events, subscriptions, ad_performance_daily, etc.) were intentionally **not** created.

## 5. Tests (executed)

`npm test` → **42 passed / 0 failed** (5 files), run 2026-11-01 against in-memory PGlite:

- auth: scrypt hashing, sessions, forged tokens, single-use verification, cross-tenant denial, role minimums
- onboarding: state machine, fact normalization, AI extraction (fake provider), low-confidence category not auto-selected, failure → input preserved + credits refunded, insufficient credits, profile provenance, confirm → product draft, manual mode generates nothing
- commerce: server totals & coupons, client prices ignored, duplicate submit idempotency, **concurrent stock (1 unit, 2 buyers → 1 succeeds)**, variant stock, address required, unsupported category blocked, webhook idempotency, forged signature, amount mismatch, stock release on failure/expiry, Billplz X-Signature, protected downloads (limit, revoke on refund), revenue reconciliation with refunds & test exclusion, First Sale not unlocked by test orders, versioned publishing, precise publish issues
- marketing/CRM: approval required, no fake publish, budget change clears approval, min budget, creative price snapshot → context alert, AI-not-configured refusal, tenant-scoped leads
- i18n/money: BM/EN key parity, formatting, timezone, sen precision, category-specific product validation

Also run: `tsc --noEmit` (clean), `next build` (success), and a manual browser pass of the primary path on `localhost:3100`: signup → onboarding (manual mode) → profile → template storefront → email verification → test gateway → publish validation → publish → public store → checkout (qty 2, shipping) → test payment → paid order page → dashboard (test order excluded) → price change → context alert → analytics visitors → EN locale; 375px width checked for landing, dashboard and checkout (no horizontal overflow).

Not tested: live Anthropic calls, live Stripe/Billplz sandboxes, real email delivery, tablet breakpoints in detail, load/performance.

## 6. External configuration required

1. **ANTHROPIC_API_KEY** (and optionally `SELLNOW_AI_MODEL`) to enable AI mode. Verify one onboarding run end-to-end after adding it.
2. **PostgreSQL** `DATABASE_URL` for any shared/staging/production environment.
3. **Payment gateway accounts** per merchant (Stripe account with MYR/FPX enabled and a webhook endpoint, or Billplz collection + keys). Run a sandbox payment for each before going live.
4. **Email provider** (implement `lib/email.ts`) — required for real verification emails and member invites.
5. **Object storage** (S3/R2/GCS) for multi-instance production (implement `lib/storage.ts`).
6. **Cron** calling `/api/cron/release-reservations` with `CRON_SECRET`.
7. **Shared rate-limit store** (e.g. Redis) when running more than one instance.
8. **Meta app** (`META_APP_ID/SECRET`, app review for `ads_management`) before the Meta adapter can be built.

## 7. Decisions needing owner approval

- **Merchant model:** today each seller connects their own Stripe/Billplz account (SellNow never holds funds). A marketplace model (Stripe Connect, platform fees) changes compliance scope — please confirm.
- **Free plan publishing:** `PLANS.free.entitlements.publishStorefront = true` during pre-launch so the core path is testable. Decide before launch.
- **Plan prices** (RM99 / RM299) and credit amounts are placeholders in `src/lib/billing/plans.ts`.
- **PDPA:** retention periods and data-deletion workflow for customer records need a policy decision.

## 8. Next priorities

1. Run AI mode with a real key and tune prompts on real Malaysian examples.
2. Stripe sandbox end-to-end (FPX), then Billplz sandbox.
3. Email provider + member invitations.
4. Booking engine (slots, capacity, conflicts) → events/tickets → memberships (only with a mandate-capable provider).
5. Meta OAuth + Marketing API adapter (create paused campaign, read status, pause).
6. AI context agent with authorized tools and approval queue.
