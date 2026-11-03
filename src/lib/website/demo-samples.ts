/**
 * Sample content packs for the public sales-page demo (English). They dress SellNow's real templates
 * so the preview matches the visitor's idea. Clearly fictional sample brands — never shown as a
 * real customer, never published.
 */
type Pack = { business: string; headline: string; sub: string; products: { name: string; desc: string; priceSen: number }[] };

export const DEMO_PACKS: Record<string, Pack> = {
  product: { business: "Aina Handmade", headline: "Handmade bags, made to last.", sub: "Small-batch totes and pouches, stitched by hand in Ipoh.", products: [{ name: "Everyday Tote", desc: "Sturdy canvas tote with inner pocket.", priceSen: 6900 }, { name: "Batik Pouch", desc: "Zip pouch in hand-stamped batik.", priceSen: 2900 }, { name: "Laptop Sleeve", desc: "Padded sleeve for 14-inch laptops.", priceSen: 5900 }, { name: "Mini Coin Purse", desc: "Pocket-size purse with snap button.", priceSen: 1900 }] },
  food: { business: "Dapur Mak Teh", headline: "Homemade sambal, just like at home.", sub: "Cooked in small batches. No preservatives. Delivered across Malaysia.", products: [{ name: "Sambal Garing", desc: "Crispy anchovy sambal, 200g jar.", priceSen: 1990 }, { name: "Sambal Hijau", desc: "Green chilli sambal, 200g jar.", priceSen: 1790 }, { name: "Serunding Daging", desc: "Spiced beef floss, 150g.", priceSen: 2500 }, { name: "Bundle 3-in-1", desc: "One of each — great for gifts.", priceSen: 4900 }] },
  beauty: { business: "Lumière Botanics", headline: "Gentle skincare, made by hand.", sub: "Natural oils, small batches, kind to sensitive skin.", products: [{ name: "Rose Glow Serum", desc: "Lightweight daily serum, 30ml.", priceSen: 5900 }, { name: "Oat Calm Cream", desc: "Soothing moisturiser, 50ml.", priceSen: 4500 }, { name: "Kelulut Lip Balm", desc: "Stingless-bee honey balm.", priceSen: 1800 }, { name: "Clay Cleanser", desc: "Gentle foaming cleanser, 100ml.", priceSen: 3900 }] },
  digital: { business: "Bakery Business Kit", headline: "Start your home bakery the smart way.", sub: "Recipes, costing sheets and a pricing guide — download instantly.", products: [{ name: "Home Bakery Ebook", desc: "48-page PDF guide.", priceSen: 2900 }, { name: "Costing Spreadsheet", desc: "Price every recipe in minutes.", priceSen: 1900 }, { name: "Label Templates", desc: "Printable product labels.", priceSen: 1500 }] },
  service: { business: "Moments by Hafiz", headline: "Wedding & event photography that feels like you.", sub: "Natural, candid photos — from nikah to reception.", products: [{ name: "Wedding Package", desc: "Full-day coverage with edited gallery.", priceSen: 180000 }, { name: "Event Coverage", desc: "Up to 4 hours, 150+ edited photos.", priceSen: 60000 }] },
  booking: { business: "Glow Facial Studio", headline: "Calm, glowing skin starts here.", sub: "Facials by certified therapists in Shah Alam. Pick a service and request a time.", products: [{ name: "Hydrating Facial", desc: "60 minutes · deep hydration.", priceSen: 12000 }, { name: "Acne Treatment", desc: "45 minutes · clarifying care.", priceSen: 9500 }, { name: "Brightening Facial", desc: "60 minutes · even, radiant tone.", priceSen: 13500 }] },
  event: { business: "Baking 101", headline: "Learn kek lapis from scratch — live online.", sub: "A friendly 2-hour workshop for beginners. Ingredients list sent after you register.", products: [{ name: "General Ticket", desc: "Live session + recording.", priceSen: 3500 }, { name: "Ticket + Starter Kit", desc: "Session plus a mailed baking kit.", priceSen: 8900 }] },
  membership: { business: "Ruang Kreatif", headline: "A home for Malaysian creators.", sub: "Monthly lessons, live Q&A and a supportive community.", products: [{ name: "Monthly Membership", desc: "Lessons, community and events.", priceSen: 2500 }, { name: "Yearly Membership", desc: "Two months free versus monthly.", priceSen: 25000 }] },
};

export function isDemoPack(v: unknown): v is keyof typeof DEMO_PACKS {
  return typeof v === "string" && v in DEMO_PACKS;
}
