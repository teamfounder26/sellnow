# SellNow V3.0 — Commerce, Settlement, Couriers & Superadmin

_2026-11-02 · This extends V2.0 and the AI Ads Studio; it is not a rebuild. No deploy, no real money moved. All migrations are additive._

## 1. Technical audit (Phase 0)

| Area | What existed | What V3 changed |
|---|---|---|
| **Payments** | Per-seller Stripe, Billplz or test gateway, keys stored per tenant. The event layer was already verified and idempotent (`payment_events` unique on provider + event id), with an amount check and a payment state machine. | Selltro Pay is now the only online method, running on one platform-managed Billplz collection. The legacy per-seller gateway stays readable for existing orders and is no longer offered. |
| **Orders** | Payment status and fulfilment (`UNFULFILLED / FULFILLED / DIGITAL`) only. | Lifecycles are now separate: order, payment, fulfilment, settlement and COD, plus a timeline (`order_events`). |
| **Shipping** | One flat fee per product. | A zone × Normal/COD × weight rule engine. Stores without rules keep the flat fee. |
| **Couriers** | None. | A unified adapter. ParcelDaily is implemented. Direct couriers are honestly marked "awaiting access". |
| **Ledger / settlement** | None. | An immutable double-entry ledger, a T+1 settlement engine, and a Billplz Payment Order adapter. |
| **Roles** | Workspace roles only. | Separate `platform_admins` with 6 roles and 25 permissions. |
| **Jobs / cron** | Durable `ai_jobs` runner and `x-cron-key` cron. | Reused for bulk courier push, the daily settlement worker and the courier credit watch. |

**Blocking external dependencies** (not decided in code):
- the Billplz Enterprise contract (platform collection plus third-party disbursement / merchant-of-record);
- KYC requirements;
- Payment Order funding;
- ParcelDaily commercial account and webhook secret;
- partner API access for J&T, Pos, Ninja Van, SPX and DHL.

## 2. What was built

### Selltro Pay and seller payouts (Phase 1)
- **Seller onboarding.** The seller sees "Set up your payouts" and gives:
  - business type, legal name and SSM number;
  - MyKad, AES-GCM encrypted with only the last 4 digits shown;
  - phone and bank (SWIFT list of 21 Malaysian banks), account number (encrypted, masked) and holder name.

  Seller status: `NOT_ACTIVATED → PENDING_VERIFICATION → ACTIVE / RESTRICTED / SUSPENDED`. Bank status: `PENDING_VERIFICATION → VERIFIED / REJECTED / SUSPENDED`.
- **Bank changes.** A change needs the seller's password. It adds a new row; the old one is kept as history. Payouts pause until the new account is verified, and the seller is notified.
- **Review controls.** Reviewers can't verify a bank account they created, and can't review a tenant they belong to (maker-checker plus conflict of interest).
- **Payments.**
  - Checkout creates a Billplz bill on the platform collection.
  - The callback at `/api/webhooks/selltro-pay` is verified with X-Signature, matched by bill id, deduplicated and amount-checked.
  - Redirects never mark an order paid.
  - Test mode reuses the signed simulated payment page.
- **Ledger.**
  - On PAID: clearing +gross / seller −net / platform-fee revenue / processing fee.
  - Refund: seller +amount / clearing −amount.
  - Every transaction balances to 0, and a unique key (source, account) makes replays harmless.
- **Reconciliation.** A read-only `GET /api/v3/bills/{id}` check runs before a payment becomes settlement-eligible.

### Orders, payment methods and shipping (Phases 2–3)
- **Payment methods** (Settings → Payment Methods):
  - **Selltro Pay**.
  - **COD**: the seller must confirm courier support; min/max order, fee and regions are configurable.
  - **Manual transfer**: bank details, instructions, deadline and optional proof. It is never marked paid automatically. The seller confirms with a note, and it is never in Selltro Pay balances.
- **Checkout.**
  - The buyer picks the method.
  - Postage is computed from the postcode once it's entered. The postcode decides the zone and the state must agree with it.
  - COD fee is a separate line.
  - No matching rule shows "shipping unavailable", never RM0.
  - A rule snapshot is frozen on the order.
- **Postage rates** (Settings → Shipping):
  - built-in zones (Peninsular, Sabah, Sarawak, Labuan, all) plus custom postcode-range zones;
  - inclusive gram ranges; ambiguous overlaps are refused;
  - deterministic priority → specificity → narrowest range;
  - CSV import/export and a test calculator;
  - free-shipping threshold and default weight.
- **Orders module.**
  - Tabs: All / New / Ready to Ship / Pending Payment / Shipped / Delivered / COD / Returns & Refunds / Shipment History.
  - Search covers order number, customer, phone and tracking number.
  - Filters for date, payment status and method.
  - Bulk selection and CSV export (with formula-injection guard).
  - Detail page: customer, products, payment (with reference), shipping (rule, weight, tracking events), financial (customer shipping vs actual courier cost and the difference), activity timeline, transfer verification, COD remittance and cancel (restores COD stock).

### Couriers (Phase 4)
- **Unified adapter.** Each courier declares its capabilities, and the UI only offers what is declared.
- **ParcelDaily**, built from the official OpenAPI spec and platform-managed via `PARCELDAILY_*`:
  - quote: no quote ids, so an empty price means the courier can't take the parcel;
  - create (`reference` = our shipment id) → credit check → checkout (`/order/pay` returns the connote);
  - track (v2), cancel, AWB `consign-pdf`;
  - signed webhooks (HMAC-SHA256 over timestamp + raw body, 300 s window; **unsigned webhooks refused**) for status, COD remitted, weight and cancel.
- **Booking safety.**
  - A shipment row is written first, and a partial unique index allows one live shipment per order, so a duplicate push is refused.
  - A failed checkout is retried without creating a second ParcelDaily order.
  - A network error leaves the booking pending and raises an alert; it is never re-booked blindly.
- **Bulk push** runs as a background job with per-order results, totals and "retry failed".
- **AWB.** Labels are cached privately. Bulk print merges only this tenant's labels into one PDF (`pdf-lib`) with an order-to-label mapping.
- **Direct couriers** (J&T, Pos Laju, Ninja Van, SPX, DHL): connection cards show **Awaiting integration access** with the reason. There is a clearly labelled manual tracking-number workflow, and nothing is simulated.
- **COD.** A delivered parcel puts the order in AWAITING_REMITTANCE. It is PAID only on a real remittance (webhook or recorded reference). An amount mismatch is flagged DISPUTED with an alert.

### Settlement engine (Phase 5) — payouts disabled by default
- **T+1 calendar day** in Asia/Kuala_Lumpur, every day including weekends and holidays. The cutoff is configurable; payments after the cutoff roll to T+2.
- **Calculation** (no money moves):
  - one batch per date/environment, with an advisory lock and a unique source key per item;
  - only reconciled payments are included unless "advance settlement" is switched on;
  - refunds and approved adjustments net off;
  - balances ≤ 0 are carried forward, never paid;
  - holds: suspended tenant, inactive account, unverified bank, seller hold.
- **Approval.** A password is required. Dual approval applies at or above the threshold, with a different second approver.
- **Execution.**
  - A funding check against the Payment Order Limit; a shortfall sets AWAITING_FUNDING and raises an alert, and nothing is sent.
  - The bank account is re-checked.
  - The attempt row is committed before the provider call. Billplz `reference_id` gives provider-level idempotency.
  - A timeout or 5xx sets **UNKNOWN**, which freezes retries until a person reconciles with evidence.
  - The callback is checksum-verified and deduplicated.
  - A reversal re-owes the seller.
- **Test mode** runs a clearly labelled *simulated* payout. Sandbox/live need the Superadmin **payouts kill switch** (default OFF).
- **Seller view:** "Earnings & Settlements" on Finances shows paid sales, available, pending, in progress, on hold and next date, plus history with fees and a CSV statement per settlement.

### Superadmin (Phases 6–7) — `/admin`
- **Access.** Separate from tenant roles. Non-admins get a 404. The first owner comes from `SUPERADMIN_BOOTSTRAP_EMAIL` or `scripts/grant-admin.ts`.
- **Roles:** owner, finance, operations, support, analyst and technical. For example, support can view payments but not approve payouts; analysts are read-only.
- **16 sections:**
  - Overview: KPIs with GMV kept apart from revenue, 12-month charts and actionable alerts.
  - Tenants: directory with 14 columns; detail pages A–H with suspend, notes and risk flags, plan change, overrides, KYC and bank review, and seller holds.
  - Users & Access: DAU/WAU/MAU, activation funnel, time-to-first website/sale, and role assignment.
  - Packages: DB-backed, server-enforced entitlements and grandfathered prices.
  - Payments: KPIs, transactions, an investigation view with callback history and read-only refresh, and the KYC queue.
  - Settlements: liquidity, batches, approve, execute, hold/release, retry, reconcile-unknown and maker-checker adjustments.
  - Orders; Courier Management (ParcelDaily credit, success/failure, margins, webhooks); Websites; AI Usage; Marketing & Integrations.
  - Revenue & Finance: explicit revenue-recognition definitions and a ledger integrity check.
  - Report Center: CSV with metadata header, personal data masked without permission, audited.
  - System Health; Audit trail; Platform Settings (password per change).

## 3. Database — `drizzle/0004_v3_commerce.sql` (additive)
- **New tables:**
  - `seller_payment_accounts`, `seller_bank_accounts`, `payment_transactions`, `ledger_entries`;
  - `settlement_batches`, `settlements`, `settlement_items`, `settlement_holds`, `payment_adjustments`;
  - `disbursement_attempts`, `payout_webhook_events`, `funding_snapshots`;
  - `order_settings`, `manual_transfer_verifications`, `order_events`;
  - `shipping_zones`, `shipping_rate_rules`;
  - `courier_connections`, `shipping_settings`, `shipments`, `shipment_events`, `cod_remittances`, `courier_webhook_events`;
  - `platform_admins`, `platform_settings`, `system_alerts`;
  - `subscription_plans`, `tenant_subscriptions`, `billing_events`, `tenant_feature_overrides`, `tenant_notes`.
- **New columns:**
  - `orders`: `order_status`, `payment_method`, `settlement_status`, `cod_status`, `cod_fee_sen`, `weight_grams`, `shipping_rule_snapshot`, `courier_cost_sen`;
  - `workspaces`: `suspended_at`, `suspended_reason`.
- **New fulfilment enum values:** `READY_TO_SHIP`, `BOOKING_PENDING`, `SHIPPED`, `DELIVERED`, `RETURNED`.

## 4. Tests — 154 passing (31 new)
- `tests/finance.test.ts` (12) covers:
  - T+1 dates for Saturday, Sunday, Merdeka Day and the cutoff;
  - encryption, masking, maker-checker and the step-up password;
  - a balanced ledger and replay safety;
  - the cycle: not due → due → idempotent → approve → simulated payout → settled;
  - concurrent workers (one batch);
  - suspended seller and a bank change after calculation;
  - refund after settlement, carried forward and netted next cycle;
  - adjustments maker-checker and dual approval;
  - payouts kill switch;
  - UNKNOWN freeze → reconcile → new `reference_id`, checksum checked against the Billplz example, duplicate callback;
  - insufficient Payment Order Limit;
  - tenant-scoped statements.
- `tests/commerce-v3.test.ts` (10) covers:
  - zones and boundary weights (500/501 g, Sabah COD, Sarawak missing, state mismatch, multi-item weight);
  - overlap refusal, custom zone priority and CSV import;
  - COD regions and limits, manual proof ≠ paid, seller verification, cancel restoring COD stock, CSV injection guard;
  - ParcelDaily units and status mapping;
  - unpaid push blocked, create/checkout payload, duplicate push, tenant-isolated bulk AWB;
  - insufficient credit, network-unknown with no double create, checkout retry reusing the order;
  - signed/stale/duplicate webhooks, COD delivered → remitted;
  - own-courier awaiting access plus manual tracking.
- `tests/superadmin.test.ts` (7) covers:
  - role matrix, step-up and last-owner protection;
  - DB package limits, overrides, grandfathered price, suspended tenant blocked;
  - directory/detail without ciphertext, report masking and audit, and GMV never counted as revenue.
- `typecheck` is clean. All 292 new seller-screen i18n keys exist in BM and EN.

## 5. Browser QA (isolated verify server)
Superadmin (finance role):
- Health and Settings are hidden and return 404.
- The KYC queue, tenant detail and maker-checker refusal shown in the UI were checked.
- "Run today's cycle" was checked.

Seller side:
- Selltro Pay activation → masked bank → test-mode verification → Active.
- COD validation message.
- Postage rule plus test calculation.
- Couriers, Orders and Finances render without errors.

Fixed during QA:
- "RM -0.00" display;
- a client bundle that pulled in server code (state list moved to a client-safe module);
- form inputs without accessible names (`Field` now wraps its control);
- a stale "verified by the gateway" subtitle.

## 6. Not live / needs owner action
1. **Billplz Enterprise:** confirm the platform-collection and payout model, KYC and merchant-of-record arrangement. Then set:
   - `SELLTRO_PAY_MODE=sandbox`, keys and collection id;
   - `BILLPLZ_PAYMENT_ORDER_COLLECTION_ID`;
   - test in sandbox (bank code `DUMMYBANKVERIFIED` succeeds).

   Live also needs the Superadmin "Live approved" switch. Real payouts need the "Real payouts" switch and a funded Payment Order Limit. **Neither adapter has been exercised against the Billplz sandbox yet.**
2. **Fees:** the Billplz processing fee and the platform fee per package are **0 until you set them** (Superadmin → Settings / Packages).
3. **ParcelDaily:** set token, merchant id and **webhook secret**, and test in sandbox. The adapter is built to the spec but not yet run against their sandbox. Bulk push uses per-order create+checkout (deterministic per-order idempotency) rather than `bulkCreate`/`payAll`.
4. **Direct couriers:** need partner credentials and current API docs from each provider.
5. **Schedule crons** (header `x-cron-key: CRON_SECRET`):
   - `POST /api/cron/settlements` daily at the execution time;
   - `POST /api/cron/couriers` hourly;
   - the existing `/api/cron/release-reservations`.
6. **Not built:**
   - MFA for admins (use the identity provider);
   - subscription billing collection and invoices;
   - XLSX and background generation for very large reports;
   - volumetric weight and multi-parcel shipments;
   - bank-ownership verification service (manual review instead);
   - Superadmin UI in BM (English only, internal tool).
