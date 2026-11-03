import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * SellNow relational schema.
 * Conventions:
 *  - IDs are text (prefixed random IDs, see lib/ids.ts) so they are stable across environments.
 *  - Money is stored as integer "sen" (1/100 MYR) — never floats.
 *  - Every tenant-owned row carries workspace_id; every query must filter on it (see lib/auth/guard.ts).
 *  - Timestamps are stored as timestamptz (UTC) and converted for display.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

// ---------------------------------------------------------------- Enums
export const roleEnum = pgEnum("workspace_role", ["owner", "admin", "editor", "viewer"]);
export const categoryEnum = pgEnum("business_category", [
  "physical",
  "digital",
  "service",
  "booking",
  "event",
  "membership",
]);
export const onboardingStateEnum = pgEnum("onboarding_state", [
  "NEW",
  "IDEA_SUBMITTED",
  "CATEGORY_IDENTIFIED",
  "INFORMATION_REQUIRED",
  "BUSINESS_PROFILE_DRAFTED",
  "OFFER_DRAFTED",
  "STOREFRONT_DRAFTED",
  "SETUP_REQUIRED",
  "READY_TO_PUBLISH",
  "PUBLISHED",
]);
export const productStatusEnum = pgEnum("product_status", ["draft", "active", "archived"]);
export const storefrontStatusEnum = pgEnum("storefront_status", [
  "DRAFT",
  "VALIDATING",
  "READY",
  "PUBLISHED",
  "ARCHIVED",
  "GENERATING",
  "READY_FOR_REVIEW",
  "FAILED",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);
export const fulfillmentStatusEnum = pgEnum("fulfillment_status", [
  "UNFULFILLED",
  "FULFILLED",
  "DELIVERED_DIGITAL",
  "NOT_REQUIRED",
  // V3 physical fulfilment lifecycle (FULFILLED is kept for V1/V2 orders and means "shipped").
  "READY_TO_SHIP",
  "BOOKING_PENDING",
  "SHIPPED",
  "DELIVERED",
  "RETURNED",
]);
export const assetVisibilityEnum = pgEnum("asset_visibility", ["public", "private"]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "qualified", "won", "lost"]);
export const generationStatusEnum = pgEnum("generation_status", ["pending", "succeeded", "failed"]);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "pending_approval",
  "approved",
  "publishing",
  "active",
  "paused",
  "failed",
]);

// ---------------------------------------------------------------- Identity
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Null for accounts created through Google/Facebook that never set a password. */
  passwordHash: text("password_hash"),
  emailVerifiedAt: ts("email_verified_at"),
  locale: text("locale").notNull().default("en"),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Linked OAuth identities. (provider, provider_account_id) is unique so an identity maps to exactly one user. */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "google" | "facebook"
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_accounts_provider_uq").on(t.provider, t.providerAccountId), index("auth_accounts_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- Workspace
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: categoryEnum("category"),
  currency: text("currency").notNull().default("MYR"),
  timezone: text("timezone").notNull().default("Asia/Kuala_Lumpur"),
  plan: text("plan").notNull().default("free"),
  /** Set by Superadmin. A suspended tenant cannot take new orders or payments. */
  suspendedAt: ts("suspended_at"),
  suspendedReason: text("suspended_reason"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("members_user_idx").on(t.userId)],
);

/**
 * Business profile. `fields` maps field key → { value, status, source } so every value
 * carries its provenance: user-provided, AI suggestion, confirmed, or missing.
 */
export const businessProfiles = pgTable("business_profiles", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  fields: jsonb("fields").$type<Record<string, ProfileField>>().notNull().default({}),
  faq: jsonb("faq").$type<FaqItem[]>().notNull().default([]),
  confirmedAt: ts("confirmed_at"),
  version: integer("version").notNull().default(1),
  updatedAt: updatedAt(),
});

/**
 * Provenance: "user" = the seller said it, "extracted" = read from a linked source/document,
 * "ai_suggested" = generated, "confirmed" = seller approved, "missing" = needs input.
 */
export type FieldStatus = "user" | "extracted" | "ai_suggested" | "confirmed" | "missing";
export type ProfileField = { value: string | number | null; status: FieldStatus; source?: string };
export type FaqItem = { q: string; a: string; status: FieldStatus };

/** Immutable snapshot of every approved profile — the shared business context other modules read. */
export const businessProfileVersions = pgTable(
  "business_profile_versions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    category: categoryEnum("category"),
    fields: jsonb("fields").$type<Record<string, ProfileField>>().notNull(),
    faq: jsonb("faq").$type<FaqItem[]>().notNull().default([]),
    approvedBy: text("approved_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("profile_versions_uq").on(t.workspaceId, t.version)],
);

// ---------------------------------------------------------------- Onboarding
export type OnboardingMessage = {
  role: "user" | "assistant";
  text: string;
  at: string;
  imageAssetId?: string;
};
export type OnboardingQuestion = { field: string; question: string };
/** V2 wizard stages. */
export type OnboardingStage = "idea" | "details" | "profile" | "store" | "launch" | "done";
export type OnboardingLink = { url: string; platform: "website" | "facebook" | "tiktok" | "instagram" | "other" };

export const onboardingSessions = pgTable(
  "onboarding_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    state: onboardingStateEnum("state").notNull().default("NEW"),
    mode: text("mode").notNull().default("ai"), // "ai" | "manual"
    category: categoryEnum("category"),
    categoryConfidence: integer("category_confidence"),
    suggestedCategory: categoryEnum("suggested_category"),
    /** Structured facts extracted so far, keyed by field. Same provenance shape as profiles. */
    facts: jsonb("facts").$type<Record<string, ProfileField>>().notNull().default({}),
    pendingQuestions: jsonb("pending_questions").$type<OnboardingQuestion[]>().notNull().default([]),
    messages: jsonb("messages").$type<OnboardingMessage[]>().notNull().default([]),
    stateHistory: jsonb("state_history").$type<string[]>().notNull().default([]),
    lastError: text("last_error"),
    // ---- V2 wizard
    stage: text("stage").$type<OnboardingStage>().notNull().default("idea"),
    ideaText: text("idea_text").notNull().default(""),
    links: jsonb("links").$type<OnboardingLink[]>().notNull().default([]),
    noLinks: boolean("no_links").notNull().default(false),
    websiteType: text("website_type"),
    researchJobId: text("research_job_id"),
    generationJobId: text("generation_job_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("onboarding_ws_idx").on(t.workspaceId)],
);

/** Every idea input (image, document, voice note) with its extraction result. Extracted text is untrusted data. */
export const onboardingInputs = pgTable(
  "onboarding_inputs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => onboardingSessions.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"image" | "document" | "voice">().notNull(),
    assetId: text("asset_id").references(() => assets.id, { onDelete: "set null" }),
    status: text("status").$type<"processing" | "ready" | "failed" | "unsupported">().notNull().default("processing"),
    /** Text extracted from a document, or the (seller-editable) voice transcript. */
    text: text("text"),
    /** True once the seller has reviewed/edited a transcript. */
    textEdited: boolean("text_edited").notNull().default(false),
    error: text("error"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("onboarding_inputs_session_idx").on(t.sessionId)],
);

/** Result of researching one seller-provided link. Never stores anything fetched without permission. */
export const importedSources = pgTable(
  "imported_sources",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => onboardingSessions.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    platform: text("platform").notNull(),
    /** fetched | blocked | unreachable | requires_connection | invalid */
    status: text("status").notNull(),
    httpStatus: integer("http_status"),
    title: text("title"),
    description: text("description"),
    extracted: jsonb("extracted").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [index("imported_sources_session_idx").on(t.sessionId)],
);

// ---------------------------------------------------------------- Assets
export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "image" | "digital_file"
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    originalName: text("original_name").notNull(),
    visibility: assetVisibilityEnum("visibility").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("assets_ws_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------- Products
export type ProductAttributes = {
  fulfillment?: "shipping" | "pickup" | "both";
  shippingFlatSen?: number;
  digitalAssetId?: string;
  downloadLimit?: number;
  downloadExpiryDays?: number;
  serviceScope?: string;
  serviceDuration?: string;
};

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: categoryEnum("type").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    priceSen: integer("price_sen").notNull(),
    compareAtSen: integer("compare_at_sen"),
    sku: text("sku"),
    weightG: integer("weight_g"),
    trackStock: boolean("track_stock").notNull().default(false),
    stock: integer("stock").notNull().default(0),
    status: productStatusEnum("status").notNull().default("draft"),
    /** Optional storefront collection label (ecommerce category filter). */
    collection: text("collection"),
    /** Seller-provided unit cost (sen). Enables break-even CPP and profit; never estimated. */
    costSen: integer("cost_sen"),
    imageAssetId: text("image_asset_id").references(() => assets.id, { onDelete: "set null" }),
    attributes: jsonb("attributes").$type<ProductAttributes>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("products_ws_slug_uq").on(t.workspaceId, t.slug), index("products_ws_idx").on(t.workspaceId)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku"),
    priceSen: integer("price_sen").notNull(),
    stock: integer("stock").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

// ---------------------------------------------------------------- Storefront
export type SectionType =
  | "hero"
  | "showcase"
  | "benefits"
  | "problem_solution"
  | "social_proof"
  | "offer"
  | "pricing"
  | "faq"
  | "cta"
  | "catalog"
  | "details"
  | "contact"
  | "embed";

export type StorefrontSection = {
  id: string;
  type: SectionType;
  visible: boolean;
  /** Free-form props validated per section type in lib/storefront/sections.ts */
  props: Record<string, unknown>;
};

export type StorefrontTheme = {
  primary: string;
  accent: string;
  background: string;
  text: string;
  /** Niche design preset (see lib/website/design.ts). Optional for V1 drafts. */
  preset?: string;
  /** Text colour used on primary buttons — computed for contrast. */
  onPrimary?: string;
};
export type StorefrontPolicies = { contactEmail?: string; contactPhone?: string; refund?: string; shipping?: string };
export type StorefrontContent = {
  sections: StorefrontSection[];
  productIds: string[];
  seoTitle?: string;
  policies?: StorefrontPolicies;
  /** Optional order bump: a second product offered at checkout. */
  orderBumpProductId?: string | null;
  /** Website format (see lib/website/types.ts). Controls layout and functional modules. */
  websiteType?: string;
  /**
   * "checkout" sells online (needs a connected gateway); "enquiry" publishes without online payment —
   * buy buttons become an enquiry form. Never implies a live checkout that does not exist.
   */
  salesMode?: "checkout" | "enquiry";
};

export const storefronts = pgTable("storefronts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  status: storefrontStatusEnum("status").notNull().default("DRAFT"),
  draftContent: jsonb("draft_content").$type<StorefrontContent>().notNull(),
  draftTheme: jsonb("draft_theme").$type<StorefrontTheme>().notNull(),
  publishedVersionId: text("published_version_id"),
  customDomain: text("custom_domain"),
  websiteType: text("website_type"),
  /** First time the owner opened the generated draft (drives the dashboard "ready to explore" banner). */
  viewedAt: ts("viewed_at"),
  publishedAt: ts("published_at"),
  lastGenerationJobId: text("last_generation_job_id"),
  draftUpdatedAt: updatedAt(),
  createdAt: createdAt(),
});

export const storefrontVersions = pgTable(
  "storefront_versions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storefrontId: text("storefront_id")
      .notNull()
      .references(() => storefronts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").$type<StorefrontContent>().notNull(),
    theme: jsonb("theme").$type<StorefrontTheme>().notNull(),
    publishedBy: text("published_by").references(() => users.id),
    publishedAt: ts("published_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sf_versions_uq").on(t.storefrontId, t.version)],
);

// ---------------------------------------------------------------- Integrations
export const integrations = pgTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "payment" | "ads"
    provider: text("provider").notNull(), // "stripe" | "billplz" | "test" | "meta"
    mode: text("mode").notNull().default("test"), // "test" | "live"
    status: text("status").notNull().default("disconnected"), // "connected" | "disconnected" | "error"
    publicConfig: jsonb("public_config").$type<Record<string, string>>().notNull().default({}),
    /** AES-256-GCM ciphertext of a JSON object with secret values. Never returned to clients. */
    secretCiphertext: text("secret_ciphertext"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integrations_ws_provider_uq").on(t.workspaceId, t.provider)],
);

// ---------------------------------------------------------------- Commerce
export const discountCodes = pgTable(
  "discount_codes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    kind: text("kind").notNull(), // "percent" | "fixed"
    value: integer("value").notNull(), // percent (1-100) or sen
    active: boolean("active").notNull().default(true),
    maxRedemptions: integer("max_redemptions"),
    redemptions: integer("redemptions").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("discount_ws_code_uq").on(t.workspaceId, t.code)],
);

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    optedOutAt: ts("opted_out_at"),
    source: text("source").notNull().default("storefront"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customers_ws_email_uq").on(t.workspaceId, t.email)],
);

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    message: text("message").notNull().default(""),
    status: leadStatusEnum("status").notNull().default("new"),
    source: text("source").notNull().default("enquiry_form"),
    humanTakeover: boolean("human_takeover").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("leads_ws_idx").on(t.workspaceId)],
);

export type ShippingAddress = {
  line1: string;
  line2?: string;
  postcode: string;
  city: string;
  state: string;
  country: "MY";
};

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("PENDING"),
    fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status").notNull().default("UNFULFILLED"),
    subtotalSen: integer("subtotal_sen").notNull(),
    discountSen: integer("discount_sen").notNull().default(0),
    shippingSen: integer("shipping_sen").notNull().default(0),
    totalSen: integer("total_sen").notNull(),
    refundedSen: integer("refunded_sen").notNull().default(0),
    currency: text("currency").notNull().default("MYR"),
    discountCodeId: text("discount_code_id").references(() => discountCodes.id),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddress | null>(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    /** Hosted payment page URL for a pending order (reused on duplicate submits). */
    paymentUrl: text("payment_url"),
    deliveryMethod: text("delivery_method"), // "shipping" | "pickup" | null
    isTest: boolean("is_test").notNull().default(false),
    /** SellNow ad id captured from the ad's destination URL (?sn_ad=…) — "confirmed store orders" per ad. */
    adRef: text("ad_ref"),
    // ---- V3: separate lifecycles (order / payment / fulfilment / settlement / COD) ----
    orderStatus: text("order_status").$type<OrderState>().notNull().default("NEW"),
    /** How the buyer pays: Selltro Pay (online), cash on delivery, or a direct bank transfer to the seller. */
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull().default("online"),
    settlementStatus: text("settlement_status").$type<SettlementState>().notNull().default("NOT_ELIGIBLE"),
    codStatus: text("cod_status").$type<CodState>().notNull().default("NOT_APPLICABLE"),
    codFeeSen: integer("cod_fee_sen").notNull().default(0),
    /** Parcel weight (grams) used for the shipping rule. */
    weightGrams: integer("weight_grams"),
    /** The shipping rule applied at checkout, frozen so later rule edits never change past orders. */
    shippingRuleSnapshot: jsonb("shipping_rule_snapshot").$type<Record<string, unknown> | null>(),
    /** What the courier actually charged (customer shipping is `shippingSen`). */
    courierCostSen: integer("courier_cost_sen"),
    /** Client-generated per checkout attempt; prevents duplicate orders on double submit. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** True while stock is held for this unpaid order. */
    stockReserved: boolean("stock_reserved").notNull().default(false),
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_ws_number_uq").on(t.workspaceId, t.number),
    index("orders_ws_status_idx").on(t.workspaceId, t.paymentStatus),
    index("orders_provider_ref_idx").on(t.provider, t.providerRef),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    variantId: text("variant_id").references(() => productVariants.id),
    productType: categoryEnum("product_type").notNull(),
    name: text("name").notNull(),
    unitPriceSen: integer("unit_price_sen").notNull(),
    quantity: integer("quantity").notNull(),
    totalSen: integer("total_sen").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** Every provider callback/webhook is recorded once. Unique (provider, event_id) gives idempotency. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => orders.id),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
    resultingStatus: paymentStatusEnum("resulting_status"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_events_uq").on(t.provider, t.providerEventId)],
);

export const downloadEntitlements = pgTable(
  "download_entitlements",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    maxDownloads: integer("max_downloads").notNull(),
    downloadCount: integer("download_count").notNull().default(0),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("entitlement_order_product_uq").on(t.orderId, t.productId)],
);

// ---------------------------------------------------------------- AI
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    task: text("task").notNull(),
    status: generationStatusEnum("status").notNull().default("pending"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown> | null>(),
    error: text("error"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Estimated provider cost in micro-USD, only when per-token prices are configured. */
    estimatedCostMicros: integer("estimated_cost_micros"),
    credits: integer("credits").notNull(),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("ai_gen_ws_idx").on(t.workspaceId)],
);

/** Append-only ledger. Balance = SUM(delta). (generation_id, reason) unique prevents double debits/refunds. */
export const aiCreditLedger = pgTable(
  "ai_credit_ledger",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(), // "allocation" | "generation" | "refund_failed_generation" | "topup"
    generationId: text("generation_id").references(() => aiGenerations.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ledger_generation_reason_uq").on(t.generationId, t.reason), index("ledger_ws_idx").on(t.workspaceId)],
);

export type JobStatus = "QUEUED" | "PROCESSING" | "VALIDATING" | "COMPLETED" | "FAILED" | "CANCELLED" | "RETRYING";
export type JobStage = { key: string; status: "pending" | "running" | "done" | "failed" | "skipped"; at?: string; note?: string };

/**
 * Durable background jobs (research, website generation). A lease (lease_until) lets any request
 * resume a job whose worker died; completed stage outputs are persisted so a resume skips them.
 * The partial unique index allows at most one active job per (workspace, kind).
 */
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    kind: text("kind").notNull(), // "onboarding.research" | "website.generate"
    status: text("status").$type<JobStatus>().notNull().default("QUEUED"),
    stage: text("stage"),
    stages: jsonb("stages").$type<JobStage[]>().notNull().default([]),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    /** Accumulated per-stage outputs (resume skips stages whose output exists). */
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: ts("lease_until"),
    createdAt: createdAt(),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ai_jobs_ws_idx").on(t.workspaceId, t.kind),
    uniqueIndex("ai_jobs_active_uq")
      .on(t.workspaceId, t.kind)
      .where(sql`status in ('QUEUED','PROCESSING','VALIDATING','RETRYING')`),
  ],
);

// ---------------------------------------------------------------- Achievements
/**
 * One row per earned sticker level. Unique (workspace, key, level) makes unlocking idempotent:
 * duplicate webhooks, regenerations and concurrent orders can never double-award.
 * Unlocks are permanent (see lib/achievements/definitions.ts for the refund policy).
 */
export const achievementUnlocks = pgTable(
  "achievement_unlocks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // "website_creator" | "creative_star" | "marketing_starter" | "orders"
    level: integer("level").notNull(),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    unlockedAt: ts("unlocked_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("achievement_unlock_uq").on(t.workspaceId, t.key, t.level), index("achievement_ws_idx").on(t.workspaceId, t.unlockedAt)],
);

/** Presentation state, tracked separately: closing the modal never removes the unlock. */
export const achievementNotifications = pgTable(
  "achievement_notifications",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    unlockId: text("unlock_id")
      .notNull()
      .unique()
      .references(() => achievementUnlocks.id, { onDelete: "cascade" }),
    presentedAt: ts("presented_at"),
    collectedAt: ts("collected_at"),
    dismissedAt: ts("dismissed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("achievement_ntf_ws_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------- Marketing
export const creatives = pgTable(
  "creatives",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    objective: text("objective").notNull(),
    ratio: text("ratio"),
    status: text("status").notNull().default("draft"), // draft | approved
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    /** Price (sen) of the product at generation time — used by the context engine to detect stale copy. */
    priceSnapshotSen: integer("price_snapshot_sen"),
    generationId: text("generation_id").references(() => aiGenerations.id),
    createdAt: createdAt(),
  },
  (t) => [index("creatives_ws_idx").on(t.workspaceId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    creativeId: text("creative_id").references(() => creatives.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    objective: text("objective").notNull(),
    audience: jsonb("audience").$type<Record<string, unknown>>().notNull().default({}),
    dailyBudgetSen: integer("daily_budget_sen").notNull(),
    durationDays: integer("duration_days").notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    provider: text("provider").notNull().default("meta"),
    externalId: text("external_id"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: ts("approved_at"),
    /** Budget at approval time. Any later change requires re-approval. */
    approvedBudgetSen: integer("approved_budget_sen"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("campaigns_ws_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------- AI Ads Studio
export type AdObjective = "sales" | "leads" | "messages" | "traffic";
export type AdStatus = "draft" | "publishing" | "pending_review" | "active" | "paused" | "rejected" | "failed" | "completed" | "archived";
export type AdAudience = { country: string; ageMin: number; ageMax: number; gender: "all" | "female" | "male"; mode: "broad" | "detailed"; interests: string[]; placements: "advantage" | "feeds" | "stories_reels"; reason?: string };
export type AdCreative = { approach: string; primaryText: string; headline: string; description: string; cta: string; imageAssetId?: string | null; ratio?: string | null };
export type AdStrategy = { objective: AdObjective; reason: string; customerProblem?: string; targetBuyer?: string; benefits?: string[]; purchaseIntent?: string; byAI: boolean };

/**
 * One SellNow ad = one Meta Campaign → Ad Set → Ad. The seller sees a single object; the Meta
 * hierarchy ids are kept here. Draft until a confirmed successful publish.
 */
export const ads = pgTable(
  "ads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: text("status").$type<AdStatus>().notNull().default("draft"),
    step: text("step").notNull().default("product"),
    objective: text("objective").$type<AdObjective>(),
    strategy: jsonb("strategy").$type<AdStrategy | null>(),
    audience: jsonb("audience").$type<AdAudience | null>(),
    dailyBudgetSen: integer("daily_budget_sen"),
    /** Budget at first publish — scaling percentages are computed from this. */
    originalBudgetSen: integer("original_budget_sen"),
    targetCppSen: integer("target_cpp_sen"),
    creative: jsonb("creative").$type<AdCreative | null>(),
    creativeId: text("creative_id").references(() => creatives.id, { onDelete: "set null" }),
    destinationUrl: text("destination_url"),
    metaCampaignId: text("meta_campaign_id"),
    metaAdSetId: text("meta_adset_id"),
    metaCreativeId: text("meta_creative_id"),
    metaAdId: text("meta_ad_id"),
    metaEffectiveStatus: text("meta_effective_status"),
    metaReview: jsonb("meta_review").$type<Record<string, unknown> | null>(),
    lastError: text("last_error"),
    duplicatedFromId: text("duplicated_from_id"),
    publishedAt: ts("published_at"),
    lastSyncedAt: ts("last_synced_at"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ads_ws_idx").on(t.workspaceId, t.status), uniqueIndex("ads_meta_ad_uq").on(t.metaAdId)],
);

/** Daily performance pulled from Meta (never generated). Unique (ad, date) → re-sync overwrites, never duplicates. */
export const adInsightsDaily = pgTable(
  "ad_insights_daily",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    adId: text("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD in Asia/Kuala_Lumpur (ad account timezone)
    spendSen: integer("spend_sen").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    purchases: integer("purchases").notNull().default(0),
    revenueSen: integer("revenue_sen").notNull().default(0),
    leads: integer("leads").notNull().default(0),
    attribution: text("attribution").notNull().default("7d_click,1d_view"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ad_insights_uq").on(t.adId, t.date), index("ad_insights_ws_idx").on(t.workspaceId, t.date)],
);

/**
 * Publication slot ledger. A row is RESERVED while a publish is in flight (so concurrent publishes
 * can't exceed the quota), becomes CONSUMED only after Meta confirms, and is deleted on failure.
 * unique(ad_id) → one slot per ad, so retries/double clicks never consume twice.
 */
export const adSlotLedger = pgTable(
  "ad_slot_ledger",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    adId: text("ad_id")
      .notNull()
      .references(() => ads.id),
    kind: text("kind").$type<"trial" | "monthly">().notNull(),
    /** Billing-period start for monthly slots (ISO date); null for trial slots. */
    periodStart: text("period_start"),
    status: text("status").$type<"reserved" | "consumed">().notNull().default("reserved"),
    metaAdId: text("meta_ad_id"),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ad_slot_ad_uq").on(t.adId), index("ad_slot_ws_idx").on(t.workspaceId, t.kind)],
);

/** AI Ads Studio software subscription (separate from Meta ad spend, which Meta bills directly). */
export const adsSubscriptions = pgTable("ads_subscriptions", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  plan: text("plan").$type<"ads_studio">().notNull().default("ads_studio"),
  status: text("status").$type<"active" | "past_due" | "canceled" | "expired">().notNull(),
  priceSen: integer("price_sen").notNull(),
  currentPeriodStart: ts("current_period_start").notNull(),
  currentPeriodEnd: ts("current_period_end").notNull(),
  paymentStatus: text("payment_status").notNull().default("paid"),
  provider: text("provider").notNull(), // "test" until SellNow billing is connected
  providerRef: text("provider_ref"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Per-workspace advertising playbook & cost settings (all user-configurable). */
export type AdsPlaybook = {
  benchmarkLowPct: number;
  benchmarkHighPct: number;
  preferredLowPct: number;
  preferredHighPct: number;
  scaleBelowPct: number;
  cutLossSpendMultiple: number;
  cutLossCppMultiple: number;
  minObservationHours: number;
  minPurchasesForScale: number;
  feePct: number;
  shippingSubsidySen: number;
  otherVariableSen: number;
  minProfitSen: number;
  scalingReviewTime: string;
};
export const adsSettings = pgTable("ads_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  playbook: jsonb("playbook").$type<Partial<AdsPlaybook>>().notNull().default({}),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- System
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_ws_idx").on(t.workspaceId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_ws_idx").on(t.workspaceId, t.createdAt)],
);

/** Internal product-funnel events (no raw customer PII in props). */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    name: text("name").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("analytics_ws_name_idx").on(t.workspaceId, t.name, t.createdAt)],
);

// ---------------------------------------------------------------- AI Poster Studio
export type PosterTheme = "educate" | "features" | "usp" | "testimonial";
export type PosterAngle = "problem_solution" | "curiosity" | "mirror" | "benefits" | "educational" | "offer" | "direct";
export type PosterStyle = "fluent_3d" | "flat" | "chibi" | "cartoon_3d" | "photo" | "editorial";
export type PosterRatio = "3:4" | "4:5" | "1:1" | "9:16";
export type PosterObjective = "awareness" | "traffic" | "leads" | "sales" | "engagement";
/** Where a value came from: product/profile/storefront records and the seller are verified; "ai" is an assumption to review. */
export type PosterSource = "product" | "profile" | "storefront" | "user" | "ai";
export type PosterSettings = {
  objective: "auto" | PosterObjective;
  theme: "auto" | PosterTheme;
  angle: "auto" | PosterAngle;
  style: "auto" | PosterStyle;
  ratio: PosterRatio;
  language: "ms" | "en" | "mixed";
  variations: 1 | 3 | 5;
  advanced: {
    audience?: string;
    problem?: string;
    motivation?: string;
    awareness?: "unaware" | "problem" | "solution" | "product" | "most";
    keyMessage?: string;
    offer?: string;
    showPrice?: boolean;
    proofPoints?: string;
    customCta?: string;
    logoAssetId?: string | null;
    brandColors?: string[];
    fontPreference?: string;
    referenceAssetIds?: string[];
    restrictions?: string;
    layout?: string;
    textDensity?: "light" | "balanced" | "rich";
    background?: string;
    /** Seller-pasted testimonial; usable only with the permission confirmation. */
    testimonial?: { quote: string; author: string; permission: boolean } | null;
  };
};
export type PosterFact = { label: string; value: string; source: PosterSource };
export type PosterIntel = {
  facts: PosterFact[];
  what: string;
  who: string;
  problem: string;
  solution: string;
  benefits: string[];
  usp: string;
  evidence: string[];
  /** Statements the AI inferred (not in the seller's records) — shown as assumptions. */
  assumptions: string[];
  questions: string[];
};
export type PosterCopy = { headline: string; body: string[]; cta: string };
export type PosterConcept = {
  theme: PosterTheme;
  angle: PosterAngle;
  keyMessage: string;
  copy: PosterCopy;
  visual: { style: PosterStyle; hero: string; supporting: string[]; layout: string; colors: string[] };
  /** Index into brief.evidence.testimonials for testimonial posters (quote is never AI-written). */
  testimonialIndex?: number | null;
};
export type PosterBrief = {
  product: { name: string; priceSen: number; mainBenefit: string };
  audience: { customer: string; problem: string; motivation: string };
  strategy: { objective: PosterObjective; recommendation: string };
  concepts: PosterConcept[];
  evidence: { facts: string[]; claims: string[]; testimonials: { quote: string; author: string }[] };
  /** Field path → origin, for the "auto-generated vs confirmed" markers. */
  sources: Record<string, PosterSource>;
};

/** One poster brief → approval → prompts/images run. Brief edits after approval require re-approval. */
export const posterProjects = pgTable(
  "poster_projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    status: text("status").$type<"brief" | "approved">().notNull().default("brief"),
    settings: jsonb("settings").$type<PosterSettings>().notNull(),
    intel: jsonb("intel").$type<PosterIntel>().notNull(),
    brief: jsonb("brief").$type<PosterBrief>().notNull(),
    briefBy: text("brief_by").$type<"ai" | "rules">().notNull(),
    generationId: text("generation_id").references(() => aiGenerations.id),
    approvedAt: ts("approved_at"),
    approvedBy: text("approved_by").references(() => users.id),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("poster_projects_ws_idx").on(t.workspaceId, t.createdAt)],
);

/** One poster variation. Creative generation never touches Meta ad slots — only a published ad does. */
export const posters = pgTable(
  "posters",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => posterProjects.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    idx: integer("idx").notNull(),
    theme: text("theme").$type<PosterTheme>().notNull(),
    angle: text("angle").$type<PosterAngle>().notNull(),
    style: text("style").$type<PosterStyle>().notNull(),
    ratio: text("ratio").$type<PosterRatio>().notNull(),
    status: text("status").$type<"draft" | "approved" | "published">().notNull().default("draft"),
    copy: jsonb("copy").$type<PosterCopy>().notNull(),
    /** Full image prompt including the exact approved text (for external tools). */
    prompt: text("prompt").notNull(),
    /** Artwork-only prompt (no lettering) used with SellNow's exact-text overlay. */
    artPrompt: text("art_prompt").notNull(),
    promptEdited: boolean("prompt_edited").notNull().default(false),
    currentVersionId: text("current_version_id"),
    adId: text("ad_id").references(() => ads.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("posters_ws_idx").on(t.workspaceId, t.createdAt), index("posters_project_idx").on(t.projectId)],
);

/** Immutable render history: every regenerate or text edit adds a version; earlier ones are kept. */
export const posterVersions = pgTable(
  "poster_versions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    posterId: text("poster_id")
      .notNull()
      .references(() => posters.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** ai_image: provider artwork; layout: seller's product photo composition (no AI image). */
    kind: text("kind").$type<"ai_image" | "layout">().notNull(),
    textMode: text("text_mode").$type<"overlay" | "in_image">().notNull().default("overlay"),
    status: text("status").$type<"generating" | "succeeded" | "failed">().notNull(),
    artAssetId: text("art_asset_id").references(() => assets.id, { onDelete: "set null" }),
    /** Final composed poster saved by the seller (used for Meta Ads and downloads). */
    imageAssetId: text("image_asset_id").references(() => assets.id, { onDelete: "set null" }),
    copy: jsonb("copy").$type<PosterCopy>().notNull(),
    style: text("style").$type<PosterStyle>().notNull(),
    ratio: text("ratio").$type<PosterRatio>().notNull(),
    prompt: text("prompt"),
    provider: text("provider"),
    model: text("model"),
    credits: integer("credits").notNull().default(0),
    generationId: text("generation_id").references(() => aiGenerations.id),
    error: text("error"),
    /** Client idempotency key: a retried click returns the same version and is never charged twice. */
    requestKey: text("request_key").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [uniqueIndex("poster_versions_uq").on(t.posterId, t.version), uniqueIndex("poster_versions_key_uq").on(t.workspaceId, t.requestKey), index("poster_versions_poster_idx").on(t.posterId)],
);

// ================================================================ V3 — Commerce infrastructure
export type OrderState = "NEW" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "RETURNED";
export type PaymentMethod = "online" | "cod" | "manual_transfer";
export type SettlementState = "NOT_ELIGIBLE" | "PENDING" | "AVAILABLE" | "SCHEDULED" | "PROCESSING" | "SETTLED" | "ON_HOLD" | "FAILED";
export type CodState = "NOT_APPLICABLE" | "AWAITING_DELIVERY" | "AWAITING_REMITTANCE" | "REMITTED" | "RECONCILED" | "DISPUTED";

// ---------------------------------------------------------------- Selltro Pay (Billplz underneath)
export type SellerPayStatus = "NOT_ACTIVATED" | "PENDING_VERIFICATION" | "ACTIVE" | "RESTRICTED" | "SUSPENDED";
/** One per tenant. The seller never sees Billplz — collections and keys are platform-managed. */
export const sellerPaymentAccounts = pgTable("seller_payment_accounts", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  status: text("status").$type<SellerPayStatus>().notNull().default("NOT_ACTIVATED"),
  businessType: text("business_type").$type<"individual" | "sole_prop" | "company">(),
  legalName: text("legal_name"),
  /** SSM / company registration number (business identifier, not secret). */
  registrationNumber: text("registration_number"),
  /** MyKad / passport number — encrypted; only the last 4 digits are shown. */
  idNumberCiphertext: text("id_number_ciphertext"),
  idNumberLast4: text("id_number_last4"),
  contactPhone: text("contact_phone"),
  termsAcceptedAt: ts("terms_accepted_at"),
  submittedAt: ts("submitted_at"),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: ts("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type BankAccountStatus = "UNVERIFIED" | "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED" | "SUSPENDED";
/** Payout destinations. Changes add a new row (old ones are superseded, never edited) for a full history. */
export const sellerBankAccounts = pgTable(
  "seller_bank_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    bankCode: text("bank_code").notNull(), // SWIFT code (Billplz Payment Order `bank_code`)
    bankName: text("bank_name").notNull(),
    accountNumberCiphertext: text("account_number_ciphertext").notNull(),
    accountLast4: text("account_last4").notNull(),
    holderName: text("holder_name").notNull(),
    accountType: text("account_type").$type<"personal" | "business">().notNull().default("personal"),
    status: text("status").$type<BankAccountStatus>().notNull().default("PENDING_VERIFICATION"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    createdBy: text("created_by").references(() => users.id),
    supersededAt: ts("superseded_at"),
    createdAt: createdAt(),
  },
  (t) => [index("seller_bank_ws_idx").on(t.workspaceId), uniqueIndex("seller_bank_current_uq").on(t.workspaceId).where(sql`superseded_at is null`)],
);

/** Selltro Pay collections (one per Billplz bill). The order keeps its own payment status. */
export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").notNull(), // "selltro_pay"
    environment: text("environment").$type<"test" | "sandbox" | "live">().notNull(),
    billId: text("bill_id"),
    amountSen: integer("amount_sen").notNull(),
    status: text("status").$type<"PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED">().notNull().default("PENDING"),
    providerStatus: text("provider_status"),
    processingFeeSen: integer("processing_fee_sen").notNull().default(0),
    platformFeeSen: integer("platform_fee_sen").notNull().default(0),
    refundedSen: integer("refunded_sen").notNull().default(0),
    paidAt: ts("paid_at"),
    /** Result of comparing the local record with Billplz (GET bill). */
    reconcileStatus: text("reconcile_status").$type<"unreconciled" | "matched" | "mismatch">().notNull().default("unreconciled"),
    reconciledAt: ts("reconciled_at"),
    reconcileNote: text("reconcile_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("payment_tx_bill_uq").on(t.billId), uniqueIndex("payment_tx_order_uq").on(t.orderId), index("payment_tx_ws_idx").on(t.workspaceId, t.status)],
);

// ---------------------------------------------------------------- Ledger (immutable, double-entry)
/**
 * Every money movement is a balanced transaction (entries sum to 0; debit > 0, credit < 0).
 * Rows are insert-only: corrections are new reversing/adjusting transactions, never edits.
 * (source_type, source_id, account) is unique, so replaying an event can't post it twice.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    txnId: text("txn_id").notNull(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    account: text("account").notNull(), // see lib/finance/ledger.ts ACCOUNTS
    amountSen: integer("amount_sen").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    memo: text("memo"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ledger_source_uq").on(t.sourceType, t.sourceId, t.account), index("ledger_ws_account_idx").on(t.workspaceId, t.account), index("ledger_txn_idx").on(t.txnId)],
);

/** Seller-level payout holds (risk, disputes). Released holds keep their history. */
export const settlementHolds = pgTable(
  "settlement_holds",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => users.id),
    releasedBy: text("released_by").references(() => users.id),
    releasedAt: ts("released_at"),
    createdAt: createdAt(),
  },
  (t) => [index("settlement_holds_ws_idx").on(t.workspaceId)],
);

/** Manual credit/debit to a seller balance. Needs a second admin to approve (maker ≠ checker). */
export const paymentAdjustments = pgTable(
  "payment_adjustments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    amountSen: integer("amount_sen").notNull(), // + credit to seller, − debit
    reason: text("reason").notNull(),
    status: text("status").$type<"pending_approval" | "approved" | "rejected">().notNull().default("pending_approval"),
    createdBy: text("created_by").references(() => users.id),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: ts("approved_at"),
    createdAt: createdAt(),
  },
  (t) => [index("payment_adj_ws_idx").on(t.workspaceId)],
);

export type BatchStatus = "CALCULATED" | "AWAITING_APPROVAL" | "AWAITING_FUNDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
/** One batch per settlement date (T+1, Asia/Kuala_Lumpur) and environment. */
export const settlementBatches = pgTable(
  "settlement_batches",
  {
    id: text("id").primaryKey(),
    settlementDate: text("settlement_date").notNull(), // YYYY-MM-DD (MYT)
    environment: text("environment").$type<"test" | "sandbox" | "live">().notNull(),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end").notNull(),
    status: text("status").$type<BatchStatus>().notNull().default("CALCULATED"),
    tenantCount: integer("tenant_count").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    grossSen: integer("gross_sen").notNull().default(0),
    feesSen: integer("fees_sen").notNull().default(0),
    adjustmentsSen: integer("adjustments_sen").notNull().default(0),
    netSen: integer("net_sen").notNull().default(0),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: ts("approved_at"),
    secondApprovedBy: text("second_approved_by").references(() => users.id),
    secondApprovedAt: ts("second_approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("settlement_batch_date_uq").on(t.settlementDate, t.environment)],
);

export type SettlementStatus = "PENDING" | "CALCULATED" | "AWAITING_APPROVAL" | "AWAITING_FUNDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "ON_HOLD" | "REVERSED" | "UNKNOWN";
/** One seller's payout inside a batch. `reference` is sent as Billplz `reference_id` (unique per collection). */
export const settlements = pgTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => settlementBatches.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reference: text("reference").notNull().unique(),
    status: text("status").$type<SettlementStatus>().notNull().default("CALCULATED"),
    holdReason: text("hold_reason"),
    grossSen: integer("gross_sen").notNull(),
    processingFeeSen: integer("processing_fee_sen").notNull(),
    platformFeeSen: integer("platform_fee_sen").notNull(),
    refundsSen: integer("refunds_sen").notNull(),
    adjustmentsSen: integer("adjustments_sen").notNull(),
    netSen: integer("net_sen").notNull(),
    bankAccountId: text("bank_account_id").references(() => sellerBankAccounts.id),
    bankSnapshot: jsonb("bank_snapshot").$type<{ bankCode: string; bankName: string; last4: string; holderName: string } | null>(),
    scheduledFor: text("scheduled_for").notNull(),
    completedAt: ts("completed_at"),
    providerRef: text("provider_ref"),
    providerStatus: text("provider_status"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("settlements_batch_ws_uq").on(t.batchId, t.workspaceId), index("settlements_ws_idx").on(t.workspaceId, t.status)],
);

/** What a settlement contains. Unique (source_type, source_id): a transaction can never be in two settlements. */
export const settlementItems = pgTable(
  "settlement_items",
  {
    id: text("id").primaryKey(),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => settlements.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceType: text("source_type").$type<"payment" | "refund" | "adjustment">().notNull(),
    sourceId: text("source_id").notNull(),
    grossSen: integer("gross_sen").notNull(),
    processingFeeSen: integer("processing_fee_sen").notNull().default(0),
    platformFeeSen: integer("platform_fee_sen").notNull().default(0),
    netSen: integer("net_sen").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("settlement_items_source_uq").on(t.sourceType, t.sourceId), index("settlement_items_settlement_idx").on(t.settlementId)],
);

/** Each attempt to send money. A new attempt is allowed only after the previous one is confirmed failed. */
export const disbursementAttempts = pgTable(
  "disbursement_attempts",
  {
    id: text("id").primaryKey(),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => settlements.id),
    attemptNo: integer("attempt_no").notNull(),
    provider: text("provider").notNull(), // "billplz_payment_order" | "simulated"
    providerId: text("provider_id"),
    status: text("status").$type<"submitting" | "processing" | "completed" | "failed" | "unknown" | "refunded">().notNull(),
    providerStatus: text("provider_status"),
    response: jsonb("response").$type<Record<string, unknown> | null>(),
    error: text("error"),
    initiatedBy: text("initiated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("disb_attempt_uq").on(t.settlementId, t.attemptNo), index("disb_provider_idx").on(t.providerId)],
);

/** Provider callbacks for payouts, deduplicated like payment events. */
export const payoutWebhookEvents = pgTable(
  "payout_webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: text("result"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payout_webhook_uq").on(t.provider, t.providerEventId)],
);

/** Funding checks (Billplz Payment Order Limit, ParcelDaily credit) — readings, never actions. */
export const fundingSnapshots = pgTable(
  "funding_snapshots",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(), // "billplz_payment_order_limit" | "parceldaily_credit"
    amountSen: integer("amount_sen"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("funding_source_idx").on(t.source, t.createdAt)],
);

// ---------------------------------------------------------------- Order payment methods
export type OrderPaymentSettings = {
  onlineEnabled: boolean;
  codEnabled: boolean;
  cod: { minSen: number | null; maxSen: number | null; feeSen: number; regions: string[]; courierConfirmed: boolean };
  manualEnabled: boolean;
  manual: { bankName: string; accountName: string; accountNumber: string; instructions: string; deadlineHours: number; proofRequired: boolean };
  freeShippingThresholdSen: number | null;
  defaultWeightGrams: number;
};
export const orderSettings = pgTable("order_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  settings: jsonb("settings").$type<OrderPaymentSettings>().notNull(),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

/** Manual transfers are confirmed by a person with permission — never by a screenshot alone. */
export const manualTransferVerifications = pgTable(
  "manual_transfer_verifications",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    proofAssetId: text("proof_asset_id").references(() => assets.id),
    payerReference: text("payer_reference"),
    status: text("status").$type<"submitted" | "approved" | "rejected">().notNull().default("submitted"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("manual_tx_order_idx").on(t.orderId)],
);

/** Order timeline (payment, shipment, status changes, user actions). */
export const orderEvents = pgTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    type: text("type").notNull(),
    actorUserId: text("actor_user_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

// ---------------------------------------------------------------- Shipping postage rules
/** Custom zones (states and/or postcode ranges). Built-in zones (peninsular/sabah/sarawak/labuan) need no row. */
export const shippingZones = pgTable(
  "shipping_zones",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    states: jsonb("states").$type<string[]>().notNull().default([]),
    postcodeRanges: jsonb("postcode_ranges").$type<{ from: string; to: string }[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("shipping_zones_ws_idx").on(t.workspaceId)],
);

export const shippingRateRules = pgTable(
  "shipping_rate_rules",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    zone: text("zone").notNull(), // "peninsular" | "sabah" | "sarawak" | "labuan" | "all" | "zone:<id>"
    deliveryType: text("delivery_type").$type<"normal" | "cod">().notNull(),
    minGrams: integer("min_grams").notNull(),
    maxGrams: integer("max_grams").notNull(),
    feeSen: integer("fee_sen").notNull(),
    courier: text("courier"),
    priority: integer("priority").notNull().default(100),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shipping_rules_ws_idx").on(t.workspaceId, t.status)],
);

// ---------------------------------------------------------------- Couriers & shipments
export type CourierProvider = "parceldaily" | "jnt" | "poslaju" | "ninjavan" | "spx" | "dhl";
export type CourierConnectionStatus = "NOT_CONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR" | "EXPIRED" | "DISABLED" | "AWAITING_ACCESS";
export type ShipperProfile = {
  senderName: string;
  senderPhone: string;
  pickup: { line1: string; line2?: string; postcode: string; city: string; state: string };
  returnAddress?: { line1: string; line2?: string; postcode: string; city: string; state: string } | null;
  defaultWeightGrams: number;
  defaultContent: string;
};
export const courierConnections = pgTable(
  "courier_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").$type<CourierProvider>().notNull(),
    /** platform = SellNow-managed ParcelDaily; own = the seller's courier account. */
    mode: text("mode").$type<"platform" | "own">().notNull(),
    status: text("status").$type<CourierConnectionStatus>().notNull().default("NOT_CONNECTED"),
    credentialsCiphertext: text("credentials_ciphertext"),
    config: jsonb("config").$type<{ preferredService?: string | null; codEnabled?: boolean; accountLabel?: string }>().notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    lastError: text("last_error"),
    lastCheckedAt: ts("last_checked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("courier_conn_ws_provider_uq").on(t.workspaceId, t.provider), index("courier_conn_ws_idx").on(t.workspaceId)],
);

export const shippingSettings = pgTable("shipping_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  shipper: jsonb("shipper").$type<ShipperProfile>().notNull(),
  updatedAt: updatedAt(),
});

export type ShipmentStatus =
  | "NOT_BOOKED" | "BOOKING_PENDING" | "BOOKED" | "AWB_READY" | "PICKUP_PENDING" | "PICKED_UP" | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_FAILED" | "RETURNED" | "CANCELLED" | "FAILED";
export const shipments = pgTable(
  "shipments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    connectionId: text("connection_id").references(() => courierConnections.id),
    provider: text("provider").notNull(), // courier provider or "manual"
    status: text("status").$type<ShipmentStatus>().notNull().default("BOOKING_PENDING"),
    providerStatus: text("provider_status"),
    serviceCode: text("service_code"),
    serviceName: text("service_name"),
    courierName: text("courier_name"),
    /** What the courier charges (sen). */
    courierCostSen: integer("courier_cost_sen"),
    codAmountSen: integer("cod_amount_sen").notNull().default(0),
    weightGrams: integer("weight_grams"),
    externalOrderId: text("external_order_id"),
    trackingNumber: text("tracking_number"),
    awbAssetId: text("awb_asset_id").references(() => assets.id),
    bulkJobId: text("bulk_job_id"),
    lastError: text("last_error"),
    providerResponse: jsonb("provider_response").$type<Record<string, unknown> | null>(),
    bookedAt: ts("booked_at"),
    deliveredAt: ts("delivered_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One live shipment per order: a duplicate push can't create a second booking.
    uniqueIndex("shipments_order_active_uq").on(t.orderId).where(sql`status not in ('CANCELLED','FAILED')`),
    index("shipments_ws_idx").on(t.workspaceId, t.status),
    index("shipments_tracking_idx").on(t.provider, t.trackingNumber),
    index("shipments_external_idx").on(t.provider, t.externalOrderId),
  ],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status").$type<ShipmentStatus>().notNull(),
    providerStatus: text("provider_status"),
    description: text("description"),
    source: text("source").$type<"booking" | "webhook" | "poll" | "manual">().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    occurredAt: ts("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("shipment_events_dedupe_uq").on(t.shipmentId, t.dedupeKey), index("shipment_events_ship_idx").on(t.shipmentId)],
);

/** COD money is tracked separately: "delivered" is not "remitted". */
export const codRemittances = pgTable(
  "cod_remittances",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    amountSen: integer("amount_sen").notNull(),
    status: text("status").$type<"REMITTED" | "RECONCILED" | "DISPUTED">().notNull(),
    reference: text("reference"),
    recordedBy: text("recorded_by").references(() => users.id),
    remittedAt: ts("remitted_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("cod_remit_order_uq").on(t.orderId)],
);

/** Inbound courier webhooks, deduplicated. */
export const courierWebhookEvents = pgTable(
  "courier_webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: text("result"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("courier_webhook_uq").on(t.provider, t.dedupeKey)],
);

// ---------------------------------------------------------------- Platform (Superadmin)
export type AdminRole = "owner" | "finance" | "operations" | "support" | "analyst" | "technical";
/** Platform staff. Separate from workspace roles: a tenant owner is never a platform admin by default. */
export const platformAdmins = pgTable("platform_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<AdminRole>().notNull(),
  status: text("status").$type<"active" | "disabled">().notNull().default("active"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Platform-wide configuration (fees, settlement times, kill switches). Every change is audited. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

export const systemAlerts = pgTable(
  "system_alerts",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    severity: text("severity").$type<"info" | "warning" | "critical">().notNull(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    link: text("link"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    /** One open alert per key — repeated failures update the count instead of flooding. */
    dedupeKey: text("dedupe_key").notNull(),
    count: integer("count").notNull().default(1),
    resolvedAt: ts("resolved_at"),
    resolvedBy: text("resolved_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("system_alerts_open_uq").on(t.dedupeKey).where(sql`resolved_at is null`), index("system_alerts_open_idx").on(t.resolvedAt, t.severity)],
);

export type PlanEntitlements = {
  publishStorefront: boolean;
  checkout: boolean;
  maxProducts: number;
  maxWorkspaces: number;
  maxWebsites: number;
  maxMembers: number;
  creativeStudio: boolean;
  marketing: boolean;
  salesAssistant: boolean;
  advancedAnalytics: boolean;
  courierAccess: boolean;
  monthlyAdsStudioAds: number;
};
/** Commercial packages, editable by Superadmin. Business logic reads these, never hard-coded prices. */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(), // "free" | "launch" | "growth" | "enterprise" | custom
  name: text("name").notNull(),
  status: text("status").$type<"active" | "inactive" | "archived">().notNull().default("active"),
  monthlySen: integer("monthly_sen").notNull(),
  annualSen: integer("annual_sen"),
  trialDays: integer("trial_days").notNull().default(0),
  monthlyCredits: integer("monthly_credits").notNull(),
  /** Selltro Pay platform fee for this plan, basis points of the paid amount. */
  transactionFeeBps: integer("transaction_fee_bps").notNull().default(0),
  entitlements: jsonb("entitlements").$type<PlanEntitlements>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type TenantSubStatus = "active" | "trial" | "past_due" | "cancelled" | "expired" | "suspended";
export const tenantSubscriptions = pgTable("tenant_subscriptions", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  planId: text("plan_id")
    .notNull()
    .references(() => subscriptionPlans.id),
  status: text("status").$type<TenantSubStatus>().notNull().default("active"),
  billingCycle: text("billing_cycle").$type<"monthly" | "annual">().notNull().default("monthly"),
  /** Price locked at signup (grandfathering) — package price edits don't change existing tenants. */
  priceSen: integer("price_sen").notNull(),
  currentPeriodEnd: ts("current_period_end"),
  trialEndsAt: ts("trial_ends_at"),
  scheduledPlanId: text("scheduled_plan_id").references(() => subscriptionPlans.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Every plan/status change (who, what, why). Also the invoice/payment-failure history once billing is live. */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("billing_events_ws_idx").on(t.workspaceId, t.createdAt)],
);

/** Per-tenant entitlement overrides (auditable, optional expiry). */
export const tenantFeatureOverrides = pgTable(
  "tenant_feature_overrides",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => users.id),
    expiresAt: ts("expires_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tenant_override_uq").on(t.workspaceId, t.key)],
);

/** Tenant notes and risk flags for platform staff (never shown to the tenant). */
export const tenantNotes = pgTable(
  "tenant_notes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"note" | "risk_flag" | "support">().notNull(),
    body: text("body").notNull(),
    authorId: text("author_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("tenant_notes_ws_idx").on(t.workspaceId)],
);
