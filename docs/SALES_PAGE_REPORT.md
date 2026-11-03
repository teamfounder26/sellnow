# SellNow Public Sales Page — Report

_2026-11-03 · Route `/` (replaces the previous landing page). English only, per the brief. Uses the existing Next.js 16 + Tailwind v4 stack and the existing Plus Jakarta Sans font._

## Files

### Page
- `src/app/page.tsx`: the sales page.
- `src/app/sales.css`: motion, the device-screen scaling system and reduced-motion overrides.

### `src/components/sales/`
- `content.ts`: **all copy, pricing, categories, FAQ and demo examples** (one central config).
- `art.tsx`: Fluent-inspired SVG — shared gradient defs, 3 problem illustrations, 9 dimensional icons and the pointing hand.
- `devices.tsx`: SVG device bezels with live HTML screens. Screens use container-query `em` scaling, so text stays crisp at any size.
- `screens.tsx`: the dashboard mockup (mirrors real SellNow dashboard labels and sections), the sample skincare store, the phone builder and 6 category screens.
- `sections.tsx`: header, hero, problems, why, demo shell, categories, benefits, pricing, FAQ, final CTA, footer.
- `InteractiveDemo.tsx` + `DemoLoader.tsx`: the 6-state demo, code-split and loaded without SSR, with a fixed-height placeholder so the layout doesn't shift.
- `SalesBehaviour.tsx`: the only other client code — scroll reveal, page view, `data-track` clicks, FAQ opens, pricing in view.
- `analytics.ts`: provider-neutral event hook.

### Supporting changes
- `src/app/api/track/sales/route.ts`: anonymous, rate-limited funnel counter. Event names and props are allowlisted; prompt text is never sent.
- `src/lib/website/demo-samples.ts` + `src/app/preview/template/[type]/page.tsx`: the optional `?demo=` sample pack that dresses the **real** templates for the demo preview.
- HTML embed (§19): `src/lib/storefront/embed.ts`, an `embed` section type in the schema, `sections.ts`, `StorefrontRenderer.tsx`, `StorefrontEditor.tsx` (with an "Add embed block" button), `next.config.ts` (storefront CSP), and `tests/embed.test.ts`.

## What works (checked in the browser at 1440px and 375px)
- **Header and hero.** One-line audience strip and headline A; the B variant exists in config and isn't rendered. CTAs: Start Building for Free goes to `/signup` (or `/onboarding` when logged in); See How It Works scrolls to the demo.
- **Device composition.** Desktop dashboard, tablet store and phone builder, with entrance, float and pulse animations. Three floating feature cards that never cover the phone. On mobile the cards stack under the devices.
- **Problems.** Three cards, each with its own SVG scene.
- **Why SellNow.** Four points plus a workflow comparison, labelled as not a claim about any specific product.
- **Demo — every state, fully keyboard-operable:**
  - idea input with 4 example chips;
  - analysing, using fixed steps with no fake percentages;
  - 2 style options matched to the idea by transparent keyword rules (e.g. "facial spa" → booking styles);
  - build stages;
  - "Your Website Is Ready!" with bounded confetti, ribbons and sparkles that stop by themselves;
  - a live preview of SellNow's **real template** in an iframe with a Desktop/Mobile toggle;
  - Try Another Idea and Start Building for Free.

  It's labelled **Interactive Sample Preview** and says on screen that it runs locally, uses no AI credits and publishes nothing. The pointer hand guides input → button → choice, is decorative only, and disappears after interaction.
- **Categories.** Six distinct editorial cards, each with its own website mockup.
- **Benefits.** Six capabilities.
- **Pricing.** Free RM0/20, Starter RM20/100, Builder RM50/250, Pro RM100/500 (labelled "RECOMMENDED"), Elite RM200/1,200. All CTAs are `href="#"` (tracked, and they don't jump to the top).
- **FAQ and final CTA.** 12-question accessible accordion; final CTA.
- **Tracking.** All 10 events fire. They are delivered to `analytics_events` and also exposed as a DOM event and `dataLayer`.

## Revision 2 — real product features (2026-11-03)
The first version used only the brief's sample copy, so most of what SellNow actually does was missing. Added:
- **How It Works** — a 3-step strip after the hero.
- **Feature tour** (`#tour`, replaces the old 6-line Benefits grid) — six alternating feature/mockup rows, each mapped to built code. The mockups live in `tour-mocks.tsx`.
  - **AI Business Builder:** voice note, photo, PDF/DOC and link import, plus a source-labelled profile.
  - **Website Builder:** 13 formats, niche styling, editor, desktop/mobile preview and the embed block.
  - **Selltro Pay:** FPX, COD, manual transfer and T+1 daily settlement.
  - **Orders & Shipping:** ParcelDaily, the courier price when shipping, bulk AWB, tracking, and postage for Peninsular, Sabah, Sarawak and Labuan.
  - **AI Ads & Poster Studio:** 6 styles, 4 ratios, BM/EN/mixed copy, Meta publishing once connected, and spend/CPP/ROAS tracking.
  - **Customers & Growth:** customers, leads, dashboard and achievement stickers.

  Each row states its honest condition (verification, Meta connection, ad spend billed by Meta, booking/event/membership pages taking requests only), and the section ends with a CTA.
- **Made for Malaysia** — RM, FPX, COD, local couriers, BM & English, and East/West Malaysia postage.
- **3 new FAQs** — settlement timing, courier account and Meta ads.

## Honesty rules applied
- **No invented values.** No original/strikethrough prices, discounts, RM "worth" values (all `show_value: false`), testimonials, user counts or guarantees.
- **Features match the product.**
  - "Ready to Sell" says payments work once Selltro Pay is active.
  - Category features were adjusted to what exists: "Booking Requests", not "Booking Confirmation"; "Ticket Options"; "Member Plans / Join Requests" instead of subscriptions.
  - "Most popular" is replaced by "RECOMMENDED", since there's no sales data.
- **Credit FAQ** describes the real model (per-task AI credit use; manual editing is free).

## Checks
- **Responsive:** no horizontal scroll at 375px; headline and CTA above the fold on mobile.
- **Accessibility:**
  - semantic sections, each labelled by its heading id;
  - labelled demo input and `aria-live` status; focus moves to each new step;
  - visible focus rings; `aria-pressed` on the preview toggle; `<details>` accordion;
  - reduced motion disables all animation and confetti.
- **Console:** no errors.
- **Tests:** 157 pass, typecheck clean.
- **Performance (dev server, indicative only):** CLS 0.000, about 1,335 DOM nodes, no animation libraries, demo code-split. The hero headline renders without a fade, to protect LCP. LCP and INP need a production-build Lighthouse run.

## Needs your decision
1. **Pricing model.** One-time packs vs recurring credits isn't stated anywhere on the page, deliberately. The app today gives the Free plan **50 monthly credits** (`billing/plans.ts`), but the sales page says **20**. These need to be aligned before launch.
2. **Credit top-up checkout** isn't built; pricing buttons stay `#`.
3. **Credit definition copy** (`SALES.pricing.creditA`) is flagged for business approval.
4. **BM version** of the sales page isn't built (the brief asked for English).
