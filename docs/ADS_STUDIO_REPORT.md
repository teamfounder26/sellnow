# AI Ads Studio — Implementation Report

_2026-11-01 · Upgrade of the existing Creative Studio module (same route `/dashboard/creative`, same design system)._

## 1. Audit findings (before coding)
- **Creative Studio** generated text copy only. **No image-generation provider exists** in the codebase (`imageProviderConfigured()` = false), so there is no "existing image infrastructure" to reuse — image slots stay honestly unavailable and the product photo is used.
- **Meta**: only a refusing stub (`publishCampaign`) and an `integrations` row type. No OAuth, no Marketing API adapter.
- **Billing**: plans in `plans.ts`; **no SellNow subscription checkout** is connected.
- **Products had no cost field**; **orders had no ad attribution**; **the storefront fired no Meta Pixel** — all three were required for honest CPP/profit/tracking and were added.

## 2. What was built
| Area | Status |
|---|---|
| Rename + 5 tabs (Overview · Create Ads · My Ads · Performance · Settings), contextual sidebar | ✅ |
| 6-step wizard Product → Strategy → Audience → Budget → Creative → Review, live feed-style preview, resumable drafts | ✅ |
| AI strategy + audience (TokenPortal, validated, constrained to objectives that actually work; rule fallback) | ✅ live-verified |
| CPP playbook: benchmark / preferred / reference / max-profitable (needs real cost), illustrative projections, all configurable | ✅ |
| AI creative: 8 approaches, 2 variants, editable, testimonial only with verified testimonials; saved to creative library (Creative Star on approval) | ✅ live-verified |
| Meta Marketing API adapter: OAuth connect (long-lived token, AES-GCM encrypted), ad account/Page/Pixel selection (re-validated), Campaign → Ad Set → Creative → Ad created PAUSED then activated, rollback on failure, pause/resume, budget update, review status, insights | ✅ code + mocked tests / ⏳ live (no Meta app) |
| Readiness checks + Draft/Export mode (copy all, JSON export) with exact missing items | ✅ |
| Quota: 3 trial (one-time) + 3/month paid; reserve → consume only after Meta confirms; idempotent per ad; workspace row lock; never pauses live ads | ✅ |
| Subscription RM150/month (configurable `ADS_STUDIO_PRICE_SEN`), upgrade modal, billing-cycle reset, no rollover, past-due blocks only new ads | ✅ logic / ⏳ payment collection |
| Performance engine: Cut Loss / Maintain / Scale from real data with min spend, observation window, min purchases, profit check, confidence flag | ✅ |
| Scaling: +25% (gentle) / +100 / +150 / +200 / custom from the ORIGINAL budget; exact-amount confirmation; audited; risk warning; review time configurable | ✅ |
| Analytics: date ranges incl. custom, period-over-period changes, CPP N/A when 0 purchases, profit only with costs, freshness + attribution window, Meta-attributed vs confirmed store orders | ✅ |
| Tracking: Meta Pixel on storefront (PageView, ViewContent, InitiateCheckout, Lead, Purchase only for verified non-test orders, eventID = order id); `?sn_ad=` captured → `orders.ad_ref` (verified to belong to the store) | ✅ |
| Background sync: `POST /api/cron/ads-sync` + "Sync now" | ✅ |

## 3. Database — `drizzle/0002_ads_studio.sql` (additive only)
New: `ads`, `ad_insights_daily` (unique ad+date), `ad_slot_ledger` (unique ad_id), `ads_subscriptions`, `ads_settings`. New nullable columns: `products.cost_sen`, `orders.ad_ref`.

## 4. Tests — `npm test` → 116 passed (18 new in `tests/ads.test.ts`)
CPP maths with the brief's RM50 example (RM10–17.50 / RM10–15 / RM12 / RM5–7.50), break-even; projections & scaling (RM50 → 100/125/150); every decision branch incl. the RM80/RM15 cut-loss, RM12 maintain, RM6 scale (50%), too-early, unprofitable; insight parsing without double counting; free 3 slots / failure releases / idempotent / concurrent cap; paid monthly reset, no rollover, trial fallback, past-due; full publish chain against a mocked Graph API (PAUSED → ACTIVE, MYR sen budget, Purchase pixel goal, tagged link, slot consumed, Marketing Starter); failed publish rolls back Meta objects and releases slot; Draft/Export readiness; 4th ad refused, duplicate uses new slot, quota never pauses live ads; budget confirmation + audit; sync idempotency → decision; ad attribution tenant check.

Browser (real TokenPortal AI, :3101): Overview (N/A CPP, honest Meta notice) → wizard → AI strategy chose Messages because the site isn't published (Sales correctly unavailable) → AI audience 18–65 with reason → RM45 CPP plan → product cost → AI creative (testimonial disabled) → review readiness/export → Creative Star unlocked → Settings → My Ads. Bugs fixed during the pass: wizard not advancing after draft creation, cramped layout, review label, sidebar highlight.

## 5. Not done / needs configuration
1. **Meta app** (`META_APP_ID/SECRET`) with Marketing API access via App Review → then a real end-to-end publish on a sandbox/real ad account. Not exercised live.
2. **Subscription payment** — no SellNow billing provider; `activateSubscription()` must be called from a verified billing webhook. Dev-only no-charge test activation exists. Admin panel for price: env var for now (no admin panel exists).
3. **Image generation** provider for 1:1 / 4:5 / 9:16 / 3:4 creatives.
4. Conversions API (server-side events) for better attribution; live-creative editing (copy edits on a published ad currently require duplicating).
5. Messages objective targets Messenger; WhatsApp click-to-chat not built.
