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
  | "contact";

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
