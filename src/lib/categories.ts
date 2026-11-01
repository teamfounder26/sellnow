/**
 * The six business category engines. Each defines its own required facts, checkout behaviour
 * and fulfillment semantics. `checkout` reflects what is ACTUALLY implemented today:
 *   - "full": customers can pay online and the order is fulfilled by the platform flow.
 *   - "enquiry": customers submit an enquiry (lead) — no payment collected.
 *   - "unsupported": storefront can be drafted, but publishing a buy flow is blocked.
 */
export type Category = "physical" | "digital" | "service" | "booking" | "event" | "membership";

export const CATEGORIES: Category[] = ["physical", "digital", "service", "booking", "event", "membership"];

export type FactKey =
  | "business_name"
  | "product_name"
  | "product_type"
  | "description"
  | "price"
  | "weight_g"
  | "fulfillment"
  | "shipping_fee"
  | "location"
  | "file_format"
  | "service_scope"
  | "duration"
  | "event_date"
  | "capacity"
  | "billing_period"
  | "claims";

export const FACT_KEYS: FactKey[] = [
  "business_name",
  "product_name",
  "product_type",
  "description",
  "price",
  "weight_g",
  "fulfillment",
  "shipping_fee",
  "location",
  "file_format",
  "service_scope",
  "duration",
  "event_date",
  "capacity",
  "billing_period",
  "claims",
];

export type CategoryEngine = {
  id: Category;
  checkout: "full" | "enquiry" | "unsupported";
  /** Facts required before a business profile can be drafted. */
  required: FactKey[];
  optional: FactKey[];
  fulfillment: "shipping_or_pickup" | "digital_delivery" | "service_delivery" | "scheduled" | "recurring";
};

export const ENGINES: Record<Category, CategoryEngine> = {
  physical: {
    id: "physical",
    checkout: "full",
    required: ["product_name", "price", "fulfillment"],
    optional: ["weight_g", "shipping_fee", "description", "claims", "location"],
    fulfillment: "shipping_or_pickup",
  },
  digital: {
    id: "digital",
    checkout: "full",
    required: ["product_name", "price", "file_format"],
    optional: ["description"],
    fulfillment: "digital_delivery",
  },
  service: {
    id: "service",
    checkout: "enquiry",
    required: ["product_name", "price", "service_scope"],
    optional: ["duration", "location", "description"],
    fulfillment: "service_delivery",
  },
  booking: {
    id: "booking",
    checkout: "unsupported",
    required: ["product_name", "price", "duration"],
    optional: ["location", "capacity", "description"],
    fulfillment: "scheduled",
  },
  event: {
    id: "event",
    checkout: "unsupported",
    required: ["product_name", "price", "event_date", "capacity"],
    optional: ["location", "description"],
    fulfillment: "scheduled",
  },
  membership: {
    id: "membership",
    checkout: "unsupported",
    required: ["product_name", "price", "billing_period"],
    optional: ["description"],
    fulfillment: "recurring",
  },
};

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as string[]).includes(v);
}
