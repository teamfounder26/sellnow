import type { Category } from "@/lib/categories";
import type { SectionType } from "@/lib/db/schema";

/**
 * Website formats offered in the STORE step. `modules` lists functional features the format
 * renders — every module listed here is actually implemented (see StorefrontRenderer):
 *   checkout     → server-quoted checkout through the connected gateway
 *   cart         → multi-product cart feeding the same checkout
 *   catalog      → product grid with search + collection filter
 *   productPages → per-product detail pages
 *   enquiry      → lead form saved to Customers → Leads
 *   interest     → "register interest" lead capture (used where online booking/tickets/subscriptions
 *                  are not built yet — the card says so, nothing pretends to take bookings)
 */
export type WebsiteTypeId =
  | "sales_page"
  | "ecommerce"
  | "digital_sales"
  | "digital_store"
  | "service_landing"
  | "service_website"
  | "lead_website"
  | "booking_website"
  | "booking_page"
  | "event_registration"
  | "ticketing"
  | "membership_landing"
  | "membership_portal";

export type WebsiteModule = "checkout" | "cart" | "catalog" | "productPages" | "enquiry" | "interest";

export type WebsiteType = {
  id: WebsiteTypeId;
  categories: Category[];
  layout: "single" | "catalog";
  blueprint: SectionType[];
  modules: WebsiteModule[];
  /** "full" = everything it promises works today; "interest" = visitors register interest only. */
  availability: "full" | "interest";
};

export const WEBSITE_TYPES: Record<WebsiteTypeId, WebsiteType> = {
  sales_page: {
    id: "sales_page",
    categories: ["physical"],
    layout: "single",
    blueprint: ["hero", "problem_solution", "benefits", "showcase", "offer", "faq", "pricing", "cta"],
    modules: ["checkout"],
    availability: "full",
  },
  ecommerce: {
    id: "ecommerce",
    categories: ["physical"],
    layout: "catalog",
    blueprint: ["hero", "catalog", "benefits", "faq", "cta"],
    modules: ["catalog", "productPages", "cart", "checkout"],
    availability: "full",
  },
  digital_sales: {
    id: "digital_sales",
    categories: ["digital"],
    layout: "single",
    blueprint: ["hero", "problem_solution", "benefits", "details", "offer", "faq", "pricing", "cta"],
    modules: ["checkout"],
    availability: "full",
  },
  digital_store: {
    id: "digital_store",
    categories: ["digital"],
    layout: "catalog",
    blueprint: ["hero", "catalog", "benefits", "faq", "cta"],
    modules: ["catalog", "productPages", "cart", "checkout"],
    availability: "full",
  },
  service_landing: {
    id: "service_landing",
    categories: ["service"],
    layout: "single",
    blueprint: ["hero", "problem_solution", "benefits", "details", "faq", "contact"],
    modules: ["enquiry"],
    availability: "full",
  },
  service_website: {
    id: "service_website",
    categories: ["service"],
    layout: "single",
    blueprint: ["hero", "benefits", "showcase", "details", "social_proof", "faq", "contact"],
    modules: ["enquiry"],
    availability: "full",
  },
  lead_website: {
    id: "lead_website",
    categories: ["service"],
    layout: "single",
    blueprint: ["hero", "benefits", "contact", "faq"],
    modules: ["enquiry"],
    availability: "full",
  },
  booking_website: {
    id: "booking_website",
    categories: ["booking"],
    layout: "single",
    blueprint: ["hero", "benefits", "details", "showcase", "faq", "contact"],
    modules: ["interest"],
    availability: "interest",
  },
  booking_page: {
    id: "booking_page",
    categories: ["booking"],
    layout: "single",
    blueprint: ["hero", "details", "faq", "contact"],
    modules: ["interest"],
    availability: "interest",
  },
  event_registration: {
    id: "event_registration",
    categories: ["event"],
    layout: "single",
    blueprint: ["hero", "details", "benefits", "faq", "contact"],
    modules: ["interest"],
    availability: "interest",
  },
  ticketing: {
    id: "ticketing",
    categories: ["event"],
    layout: "single",
    blueprint: ["hero", "details", "showcase", "faq", "contact"],
    modules: ["interest"],
    availability: "interest",
  },
  membership_landing: {
    id: "membership_landing",
    categories: ["membership"],
    layout: "single",
    blueprint: ["hero", "problem_solution", "benefits", "details", "faq", "contact"],
    modules: ["interest"],
    availability: "interest",
  },
  membership_portal: {
    id: "membership_portal",
    categories: ["membership"],
    layout: "single",
    blueprint: ["hero", "benefits", "showcase", "details", "faq", "contact"],
    modules: ["interest"],
    availability: "interest",
  },
};

export const WEBSITE_TYPE_IDS = Object.keys(WEBSITE_TYPES) as WebsiteTypeId[];

export function isWebsiteType(v: unknown): v is WebsiteTypeId {
  return typeof v === "string" && v in WEBSITE_TYPES;
}

export function websiteTypesFor(category: Category): WebsiteType[] {
  return WEBSITE_TYPE_IDS.map((id) => WEBSITE_TYPES[id]).filter((t) => t.categories.includes(category));
}

/** Rule-based recommendation (used when AI is off, or when the AI suggestion is not valid for the category). */
export function recommendWebsiteType(category: Category, productCount: number): { id: WebsiteTypeId; reasonKey: string } {
  switch (category) {
    case "physical":
      return productCount > 1 ? { id: "ecommerce", reasonKey: "manyProducts" } : { id: "sales_page", reasonKey: "heroProduct" };
    case "digital":
      return productCount > 1 ? { id: "digital_store", reasonKey: "manyProducts" } : { id: "digital_sales", reasonKey: "heroProduct" };
    case "service":
      return { id: "service_landing", reasonKey: "service" };
    case "booking":
      return { id: "booking_website", reasonKey: "booking" };
    case "event":
      return { id: "event_registration", reasonKey: "event" };
    case "membership":
      return { id: "membership_landing", reasonKey: "membership" };
  }
}
