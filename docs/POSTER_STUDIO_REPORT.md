# AI Poster Studio — Implementation Report

_2026-11-02 · An upgrade inside AI Ads Studio (`/dashboard/creative?tab=posters`), not a separate app._

## 1. Audit findings (before coding)
- **Creative Studio** only made text copy. Visual types were permanently disabled (`imageProviderConfigured()` was hard-coded to `false`).
- **There is no image provider.** TokenPortal lists 40 models, none of them image models, and `POST /v1/images/generations` returns **404**. A separate adapter was therefore required.
- **Credits:** a ledger already existed (`ai_credit_ledger` + `ai_generations`), with reserve-under-row-lock and refund-on-failure through `runGeneration`. Poster Studio reuses it.
- **Product and business data:** comes from `products`, the approved `business_profiles` (confirmed/user fields only), and confirmed storefront testimonials. Brand colours come from the profile, then the storefront theme.
- **Library:** there was only the old `creatives` table, which stores text. It is untouched and still shown under Settings.

## 2. What was built
| Area | Status |
|---|---|
| **Tab and navigation.** New "Poster Studio" tab and sidebar entry. 6-step stepper. Left panel for setup, right panel as the workspace. Container queries keep it single-column until there is room. | ✅ |
| **Step 1 · Product Intelligence.** Verified facts are pulled from the product, profile and storefront, deduplicated, and labelled with their source. The AI writes what/who/problem/solution/benefits/USP, plus **assumptions** (separated) and short **questions**. If the product has no description, a one-line question is asked. Edits regenerate the brief. | ✅ live-verified |
| **Step 2 · Strategy.** Objective (5 plus AI; Sales/Traffic/Leads are disabled with a reason when not possible). Theme (4 plus AI; Testimonial only with verified testimonials). Angle (7 plus AI). Style (6 plus AI). Ratio 3:4/4:5/1:1/9:16. Language BM/EN/Mixed, defaulting to the UI locale. Variations 1/3/5. | ✅ |
| **Advanced Settings** (collapsed): customer, marketing (offer, proof, custom CTA, show price), seller testimonial with a permission checkbox, logo and reference uploads, brand colours, font, restrictions, layout, text density, background | ✅ |
| **Step 3 · Creative Brief.** Product, audience, strategy, evidence, and one concept per variation (theme, angle, key message, headline with a 4–7 word hint, 2–4 body points, CTA, visual direction). Each field is marked Verified / AI-generated / Edited by you. | ✅ live-verified |
| **Step 4 · Approval** (mandatory): Edit Brief / Regenerate Strategy / Approve & Continue. Any edit sends the brief back for re-approval. Price, product and testimonials are locked server-side. No image credits are used at this stage. | ✅ |
| **Brief generation runs as a durable job** (`poster.brief`). It is non-blocking, survives a refresh, a double-click returns the same job, and resuming is idempotent through a pre-assigned project id. | ✅ live-verified |
| **Step 5 · Mode A: prompts only** (free). One independent prompt per variation containing the exact approved text, theme structure, illustration list, typography, brand colours, ratio and px size, lighting, quality and negative constraints. Copy, edit, save and generate from a prompt. | ✅ |
| **Step 5 · Mode B: generate images.** OpenAI-compatible `/images/generations` adapter (`IMAGE_*` env). The cost is shown first. Credits are reserved, refunded on failure, and the action is **idempotent per request key**. One generation per poster at a time. Abandoned runs are reaped and refunded. | ✅ code + tests / ⏳ live (no provider key) |
| **Exact-text composition.** The image model draws only the artwork, and SellNow typesets the approved headline, body and CTA on a canvas. Text is therefore always spelled correctly and can be edited **without regenerating**. An optional "text in image" mode is labelled as needing regeneration for text changes. | ✅ |
| **Layout posters** (free, no AI image): the seller's real product photo plus the approved text, with a theme-specific layout (numbered steps / feature checks / USP statement + chips / quote card) | ✅ live-verified |
| **Step 6 · Edit and use.** Each poster card has preview, theme, headline, ratio, status and version strip. Actions: edit headline/body/CTA (live preview), change style, regenerate, copy prompt, PNG, JPG, Save to Library, Use in Meta Ads. Every regeneration and text edit is a new version, and old versions are kept. | ✅ live-verified |
| **Creative Library.** Visual thumbnails, product/theme/status filters, Draft/Approved/Published, date, ratio, version count, saved-prompt badge. Actions: open, duplicate, download, reuse in a campaign. Spend/Purchases/CPP/ROAS and a 14-day spend trend appear once the poster's ad has real Meta data. Shown only when posters exist, so there is no large empty panel. | ✅ |
| **Recommendation engine.** The AI recommends which themes and angles to test from the facts and past **real** poster ad results (theme/angle → spend, purchases, CPP, ROAS). It never promises conversions. | ✅ |
| **Meta Ads integration.** "Use in Meta Ads" saves the composed 1200×1600 render and creates an Ads Studio draft with that image, headline, primary text and a CTA that matches the objective. The ad wizard now keeps the poster image when the seller picks different copy. | ✅ live-verified |

## 3. Database — `drizzle/0003_poster_studio.sql` (additive only)
New tables:
- `poster_projects`: settings, intel, brief, approval.
- `posters`: one per variation; copy, prompt, art prompt, `ad_id`.
- `poster_versions`: immutable history; unique (poster, version) and unique (workspace, request_key).

There are no changes to existing tables.

## 4. Credits and slots
| Operation | Cost |
|---|---|
| Creative brief, or regenerate strategy (AI) | `poster.brief` = 2 credits |
| Prompts, approval, layout posters, text edits, saving, downloads | free |
| AI image (per poster, per generation) | `poster.image` = 4 credits; refunded on failure; never charged twice for one request |
| Meta ad slot | **only** a successfully published new ad (unchanged Free Trial 3 / RM150 for 3 per month rules) |

## 5. Tests
`tests/posters.test.ts` has 9 tests:
- prompt compiler;
- rules mode is uncharged;
- testimonial guard;
- AI brief normalisation;
- approval gate and re-approval;
- image idempotency, refund and version history;
- free text-edit versions;
- layout + save + Use in Meta Ads without consuming a slot;
- tenant isolation;
- the durable job.

Full suite: **125 passing**. `tsc --noEmit` is clean. All 246 Poster Studio i18n keys are present in BM and EN.

## 6. Not yet live / needs owner action
- **AI image generation needs a provider key:**
  ```
  IMAGE_API_KEY=…
  IMAGE_BASE_URL=…   # default https://api.openai.com/v1
  IMAGE_MODEL=…      # default gpt-image-1
  ```
  Until a key is set, the UI says so and offers free prompts and layout posters. It never shows placeholders.
- **Reference images** are stored and shown for the seller's review. They are not sent to the image model, because the configured endpoint is text-to-image.
- **Brief latency:** gpt-6.1-sol took about 2.8 minutes for a 3-variation brief. It now runs as a background job, but a faster model for this task would improve the experience.
