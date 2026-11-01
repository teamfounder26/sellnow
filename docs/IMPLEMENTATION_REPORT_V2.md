# SellNow V2.0 — Implementation Report

_Last updated: 2026-11-01 · Supersedes nothing in V1 that still works — see [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) for the V1 baseline._

## 0. Repository audit (Phase 0)

The folder already held the **V1 MVP** (Next.js 16 App Router, React 19, TS strict, Tailwind v4, Drizzle + PostgreSQL/PGlite, own scrypt sessions, Anthropic adapter, Stripe/Billplz/Test gateway, 42 passing tests). V2 was implemented **as an extension**: commerce, payments, webhooks, credit ledger, CRM, analytics and versioned publishing were preserved; onboarding, the design system, the dashboard shell and milestones were replaced.

**Spec conflict resolved:** the V2 header says *Default language: English*, §24 says *Bahasa Melayu*. English is now the default (`DEFAULT_LOCALE`), BM is fully supported with compile-time key parity. One-line change in `src/lib/i18n/translate.ts` to flip.

## 1. What was completed (by phase)

| Phase | Status | Notes |
|---|---|---|
| 1 Design foundation | ✅ | `#1F83D8` token system, ambient top gradient (`.ambient`), subtle glass (`.glass`, `.glass-icon`), `GlassIcon`, `ProgressBar`, new logo, Plus Jakarta Sans, reduced-motion respected. Muted text darkened to 4.7:1 for WCAG AA. |
| 2 Authentication | ✅ code / 🟡 live | Centered signup/login (Google · Facebook · Email), OAuth 2.0 auth-code + **PKCE + signed state cookie**, safe account linking, forgot/reset password (single-use, revokes all sessions). Google/Facebook buttons are **disabled with a reason until client IDs are configured** — not exercised against live providers. |
| 3 Onboarding IDEA→DETAILS→PROFILE→STORE→LAUNCH | ✅ | Centered wizard, autosave + Save & Exit/resume, back navigation. Text, image, PDF/DOC/DOCX (magic-byte detection, video refused), voice recorder (permission, timer, pause, playback, re-record, transcript edit). Link research with SSRF-safe fetch; Facebook/TikTok/Instagram are **not scraped** (honest "needs account connection"). AI profile with per-field provenance; integrity rules drop unverifiable prices/contacts. Durable jobs with real stages. |
| 4 Website builder | ✅ | 13 website formats (registry), niche design engine (8 presets + brand override + contrast-safe button text), structured sections only, catalog/search/filter, product pages, cart → server-quoted checkout, representative template previews (labelled *Example*), draft preview with top bar, publish dialog with blocking issues + fix links, **enquiry-only publishing** (no fake checkout), public URL. |
| 5 Dashboard | ✅ | Glass rail (11 items) + contextual secondary sidebar (collapsible, mobile drawer), header (switcher, Ask AI quick actions, achievements, notifications, profile), website banner state machine, local-time greeting, setup progress with stickers, 4 KPI cards with ranges, sales chart only with data, state-based recommendations, journey widget. New pages: Website, Achievements, Finances, Integrations, Settings → AI. |
| 6 Sticker system | ✅ | Unlimited order track (1/10/50/100, +1 level per 100), setup stickers, original SVG sticker art on a 6-tier scale, reward modal (confetti/ribbons/sparkles, optional sound), achievements page with locked silhouettes + timeline. DB-backed, idempotent, presentation tracked separately. |
| 7 AI integration | ✅ code / 🟡 live | TokenPortal adapter (`gpt-6.1-sol`, env-configurable), structured output via embedded JSON Schema + Zod + one repair pass, vision via `image_url` with text-only fallback, timeout/retry/Retry-After, error mapping, usage + optional cost, connection test (UI + 6 real checks). **No TokenPortal key is present, so no live call was made.** |
| 8 Commerce & growth | 🟡 (V1 carried over) | Cart added; everything else is V1 (checkout, Stripe/Billplz/test gateway, orders, refunds, CRM, creative text, campaign drafts, analytics). |

## 2. Key files

- AI: `src/lib/ai/{provider,tokenportal,json,connection-test,transcribe,schemas,prompts,run}.ts`
- Ingestion: `src/lib/ingest/{safe-fetch,links,html,documents}.ts`
- Jobs: `src/lib/jobs/{runner,kick,registry}.ts`, `src/app/api/jobs/[id]/route.ts`
- Onboarding: `src/lib/onboarding/{wizard,research-job}.ts`, `src/app/actions/onboarding.ts`, `src/components/onboarding/*`
- Website: `src/lib/website/{types,design,generator,generate-job,samples}.ts`, `src/components/storefront/*`, `src/app/preview/**`, `src/app/s/[slug]/**`, `src/components/website/*`
- Achievements: `src/lib/achievements/{definitions,service,view}.ts`, `src/components/achievements/*`, `src/app/dashboard/achievements`
- Dashboard: `src/app/dashboard/{layout,page}.tsx`, `src/components/dashboard/*`, `src/lib/dashboard/state.ts`
- Auth: `src/lib/auth/oauth.ts`, `src/app/api/auth/[provider]/{start,callback}`, `src/app/(auth)/*`, `src/components/auth/*`
- i18n: `src/lib/i18n/dict/v2.{en,ms}.ts` (merged over V1; `enV2` is typed against `msV2` → parity is a compile error if broken)

V1 files removed: `lib/onboarding/{service,machine}.ts`, `components/onboarding/OnboardingFlow.tsx` (replaced by the wizard).

## 3. Database changes — `drizzle/0001_v2_foundation.sql` (additive)

New tables: `auth_accounts`, `password_reset_tokens`, `onboarding_inputs`, `imported_sources`, `business_profile_versions`, `ai_jobs`, `achievement_unlocks`, `achievement_notifications`.
New columns: `onboarding_sessions.{stage, idea_text, links, no_links, website_type, research_job_id, generation_job_id}`, `storefronts.{website_type, viewed_at, published_at, last_generation_job_id}`, `products.collection`, `ai_generations.estimated_cost_micros`.
Enum: `storefront_status` += `GENERATING`, `READY_FOR_REVIEW`, `FAILED`.
Changed: `users.password_hash` → nullable (OAuth-only users), `users.locale` default `en`.
Key constraints: unique `(provider, provider_account_id)`; unique `(workspace_id, key, level)` on unlocks; unique `unlock_id` on notifications; **partial unique `(workspace_id, kind) WHERE status is active`** on `ai_jobs` (duplicate-job prevention); unique `(workspace_id, version)` on profile versions.
No destructive operations. The V1 `onboarding_sessions.state` column is retained (unused).

## 4. Tests executed

`npm test` → **98 passed / 0 failed** (9 files) on 2026-11-01. `tsc --noEmit` clean. `next build` succeeds.

New suites:
- `onboarding.test.ts` (16): save/resume; image + **real PDF and DOCX extraction**; video/disguised-file rejection; voice transcription + edit; STT-off fallback; website import (mocked network) with provenance; Facebook/TikTok not fetched; SSRF link refusal; low-confidence category + clarification; failure → credits refunded → retry keeps completed stages; manual mode generates nothing; integrity rules; approve → versioned profile + product; type selection; **duplicate job prevention**; 8-stage generation; sticker not re-awarded on regeneration; **crash resume with two racing pollers**; back/skip rules.
- `achievements.test.ts` (13): level maths incl. 100 000 orders; concurrent unlocks; collect/dismiss keeps unlock + tenant isolation; first sale via signed webhook, test orders excluded, duplicate webhook; 10/50/100/200/300 with catch-up; 1 250 orders; concurrent evaluation; refund policy; Creative Star and Marketing Starter qualification.
- `ai-provider.test.ts` (12): defaults/env model; provider selection; missing key; request shape + fenced JSON; repair pass; 429 retry, 401, 404; timeout; vision fallback; cost estimate; connection test (pass + each failure class); runner usage/cost + refund.
- `ingest-security.test.ts` (8): private/metadata IP classes; URL rules; DNS-to-private refusal; platform detection; JSON-LD/OG extraction ignores scripts; magic-byte document/audio detection.
- `auth-dashboard.test.ts` (13): banner states (never "ready" on failure); setup/recommendations/stage; local-time greeting; sidebar resolution; OAuth state signing/expiry/PKCE; new Google user + no duplicates; **pre-registration hijack prevented**; Facebook never auto-links; explicit linking + linkedElsewhere; failed exchange; password reset single-use + session revocation; enquiry-only publish + server-side checkout refusal.

Browser pass (isolated dev server on :3101): sign-up → IDEA → DETAILS (Facebook + live example.com research) → PROFILE (inline edit, provenance) → STORE (recommendation, example preview) → LAUNCH (sticker + confetti) → draft preview → publish dialog (issues, enquiry mode, inline contact email) → email verification → publish → live URL → checkout refused → dashboard (reward modal, banner, setup) → mobile 375px (no horizontal scroll, drawer) → achievements in BM. No server or console errors. Bugs found and fixed during the pass: email button invisible, AI pill shown without AI, publish-mode selector disappearing, "Buy Now" label in enquiry mode, mobile header clipping.

**Not tested:** live TokenPortal calls, live Google/Facebook OAuth, real STT, real email delivery, live Stripe/Billplz (unchanged from V1), the AI-mode UI end-to-end (covered by tests with a fake provider only), tablet breakpoints in detail.

## 5. Working features (no external setup needed)

Email sign-up/login/reset · full 5-stage onboarding in manual mode · document extraction · website research of public sites · 13 website formats, niche themes, catalog/cart/product pages · draft preview · publish (checkout or enquiry-only) · public storefront · test-gateway checkout (V1) · new dashboard · achievements · BM/EN.

## 6. Incomplete integrations / external configuration

1. **TokenPortal** — set `TOKENPORTAL_API_KEY`, then run *Settings → AI → Test AI connection*. Verify whether `gpt-6.1-sol` is vision-tagged (`TOKENPORTAL_VISION=false` otherwise). Run one real onboarding in AI mode and tune prompts.
2. **Speech-to-text** — `STT_BASE_URL`/`STT_API_KEY` (OpenAI-compatible transcription). Without it voice notes are recorded and the seller types.
3. **Google / Facebook OAuth** — client IDs/secrets + redirect URIs (see `.env.example`). Facebook app review is needed for production.
4. **Facebook/TikTok content import** — requires official authorised connections (Graph API / TikTok Login Kit). Not built; links are stored and the UI says so.
5. **Image generation** (Creative Studio posters) — needs a separate image provider; not assumed from the text model.
6. **Meta Ads launch** — `recordCampaignLaunchConfirmed()` is the single place Marketing Starter is awarded; the Meta adapter itself is still V1-planned.
7. **Malware scanning** for uploads — no scanner available; files are type-checked by content, size-limited, stored privately and never executed. Add ClamAV/vendor scanning before production.
8. **Booking / ticketing / subscriptions** — formats exist but capture *interest* only (clearly labelled); no fake calendars or tickets.
9. Email delivery, object storage, shared rate-limit store, cron — unchanged from V1 §6.

## 7. Problems discovered

- The dev server already running on :3100 (another session) opened PGlite **before** this migration existed. It must be **restarted** to apply `0001_v2_foundation` — until then V2 pages there will fail. Verification used an isolated server: `.claude/launch.json` → `sellnow-verify` (port 3101, `NEXT_DIST_DIR=.next-verify`, `PGLITE_DIR=.data/pglite-verify`).
- Two dev servers cannot share one PGlite folder (single-process database) — hence `PGLITE_DIR`.
- TokenPortal docs list no JSON-schema response format or audio endpoint; handled by design (prompt-embedded schema + validation, separate STT adapter).
- Spec language-default conflict (see §0).

## 7b. Live TokenPortal verification (2026-11-01, after key was added)

- Key stored in `.env.local` only (gitignored, mode 600). It was shared in chat → **rotate it** in the TokenPortal dashboard and replace the value.
- Connection test: **6/6 checks passed** against `gpt-6.1-sol` (real responses).
- Real AI onboarding (kek lapis idea, no links): identify 5,144/314 tokens · profile 5,170/894 · website copy 4,842/329. Price (RM45) and location (Kuching) kept as *From you*; email/phone left *Missing*; FAQs only from stated facts; AI recommended Full Online Store with its own reason. No server errors.
- **Billing finding:** TokenPortal bills a large hidden prompt overhead (~4.2k tokens minimum, mostly cached). Requests with a `system` message, and some specific wordings, were billed ~22.5k. The adapter now sends instructions inside the first user message (`TOKENPORTAL_SYSTEM_ROLE=true` restores the system role). Set the `TOKENPORTAL_PRICE_*` env vars to see estimated cost per call in Settings → AI.
- Gap found and fixed: AI identified 3 flavours but approval created only the main product. The Profile step now lists "Other products we found" (verified prices only, plan limit respected); ticked ones become drafts on approval, matched server-side against the research output and never duplicated. Verified live: Horlicks/Cheese/Pandan created at RM45. Escape now dismisses the reward modal.

## 8. Next implementation priority

1. Add the TokenPortal key → connection test → one real AI onboarding; tune prompts on real Malaysian examples.
2. Configure Google OAuth (largest sign-up conversion lever), then Facebook.
3. Stripe sandbox end-to-end for the cart checkout (V1 adapter, new multi-line path).
4. STT provider for voice notes.
5. Image provider for Creative Studio posters → Creative Star on real posters.
6. Booking engine (slots/capacity) so booking formats can take real bookings.
