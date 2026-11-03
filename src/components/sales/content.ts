/**
 * SellNow sales page — every customer-facing word, price and claim lives here.
 * Keep it honest: no invented discounts, testimonials, usage numbers or guarantees.
 * Items marked `needsApproval` are business decisions still to be confirmed (see the report).
 */

export const SALES = {
  audience: "For entrepreneurs, creators & small businesses ready to sell online.",
  hero: {
    // A/B-ready: the page renders `variants[active]` only.
    active: "a" as "a" | "b",
    variants: {
      a: { line1: "Your Business Idea Deserves a Website.", line2: "Let AI Build It With You." },
      b: { line1: "Have Something to Sell?", line2: "Build Your Website With AI." },
    },
    sub: "Upload a photo or describe your idea. SellNow helps you create a beautiful website, add your products, and get ready to sell.",
    primary: "Start Building for Free",
    secondary: "See How It Works",
    micro: "No coding needed. Start with your idea.",
    cards: [
      { icon: "builder", title: "AI Website Builder", body: "Turn your idea into a website." },
      // Payments need Selltro Pay activation — the copy says "when you're set up", not "instantly".
      { icon: "sell", title: "Ready to Sell", body: "Add products and accept payments once Selltro Pay is active." },
      { icon: "business", title: "Built for Your Business", body: "Stores, bookings, services & more." },
    ],
  },
  problems: {
    eyebrow: "SOUND FAMILIAR?",
    title: "Starting Online Shouldn't Be This Hard.",
    sub: "You have something to sell. But building a website can feel like another full-time job.",
    items: [
      { art: "code", title: "You Have an Idea, Not Coding Skills.", body: "You know what you want to sell. But setting up pages, designs, and technical tools takes time you don't have." },
      { art: "tools", title: "Everything Is in a Different App.", body: "One tool for your website. Another for payments. Another for marketing. It's hard to keep everything together." },
      { art: "stuck", title: "You Keep Planning. Nothing Goes Live.", body: "You spend days choosing templates, fixing layouts, and rewriting text. Your business is still waiting to launch." },
    ],
  },
  why: {
    eyebrow: "A SMARTER WAY TO START",
    title: "Not Just Another Website Builder.",
    sub: "Most website builders give you tools. SellNow helps you figure out what to build—and guides you through creating it.",
    points: [
      { title: "Start With an Idea", body: "Describe your business or upload a product photo. No blank page to figure out." },
      { title: "SellNow Understands Your Business", body: "It helps prepare your business profile, products, and website content — you review everything." },
      { title: "The Right Website for You", body: "A sales page, online store, booking website, or another format that fits your business." },
      { title: "More Than a Website", body: "Manage your products, orders, customers, and growth in one place." },
    ],
    traditional: { title: "Traditional website builder", steps: ["Choose a template manually", "Build each section yourself", "Write all your own copy", "Connect separate tools", "Configure complex settings"] },
    sellnow: { title: "SellNow", steps: ["Tell SellNow your idea", "Review your business profile", "Choose your website style", "Generate and edit", "Publish when ready"] },
  },
  demo: {
    eyebrow: "TRY SELLNOW",
    title: "One Idea. Watch a Website Come Together.",
    sub: "Try a simple example and see how SellNow turns a business idea into a beautiful website.",
    label: "Interactive Sample Preview",
    disclosure: "This preview runs in your browser with SellNow's real website templates. It doesn't use AI credits or publish anything. Sign up to build your own site.",
    question: "What do you want to sell?",
    placeholder: "I want to sell homemade sambal.",
    create: "Create My Website",
    steps: ["Understanding your idea...", "Choosing the best website style...", "Creating your page...", "Adding the finishing touches..."],
    pickTitle: "Pick a website style",
    ready: "Your Website Is Ready!",
    readySub: "Your idea just became something real.",
    again: "Try Another Idea",
  },
  categories: {
    eyebrow: "ONE PLATFORM. MANY POSSIBILITIES.",
    title: "Whatever You Sell, Start With SellNow.",
    sub: "Create the kind of website your business needs—without starting from scratch.",
  },
  how: {
    eyebrow: "HOW IT WORKS",
    title: "From Idea to Website in 3 Simple Steps.",
    steps: [
      { title: "Tell SellNow what you sell", body: "Type a sentence, record a voice note, upload a product photo or PDF, or paste your Facebook, TikTok or website link." },
      { title: "Review and choose", body: "Check the business profile SellNow prepares, fix anything, then pick the website style that fits." },
      { title: "Publish and start selling", body: "Edit anything you like and go live. Then switch on payments, shipping and ads when you're ready." },
    ],
  },
  /**
   * Feature tour — every bullet maps to something built in the app today. `note` states the honest
   * condition (activation, connection, partial availability) right next to the claim.
   */
  tour: {
    eyebrow: "EVERYTHING IN ONE PLACE",
    title: "Your Website Is Just the Beginning.",
    sub: "SellNow handles the business behind the website too — payments, shipping, marketing and customers. One login. One place.",
    items: [
      {
        id: "builder",
        eyebrow: "AI BUSINESS BUILDER",
        title: "Start With Whatever You Have.",
        body: "No business plan? No problem. Type one sentence, talk into your phone, snap a product photo or drop in your price list. Already selling on Facebook or TikTok? Just paste the link.",
        bullets: [
          "Type it, say it with a voice note, or upload it",
          "Reads product photos, PDF and Word documents",
          "Uses public info from your website, Facebook or TikTok link",
          "Prepares your business profile — you approve every detail",
        ],
        note: "SellNow shows what came from you and what AI suggested. It never makes up prices, reviews or certifications.",
      },
      {
        id: "website",
        eyebrow: "WEBSITE BUILDER",
        title: "A Website That Fits the Way You Sell.",
        body: "SellNow recommends the right kind of website for your business and styles it for your niche — warm and bold for food, soft and elegant for skincare, clean and trustworthy for services.",
        bullets: [
          "13 website formats: sales pages, online stores, digital products, services, leads, bookings, events and memberships",
          "Change text, images, sections and colours — no code",
          "Preview on desktop and mobile before anything goes live",
          "Add YouTube, Calendly, Google Forms and other widgets safely",
        ],
        note: "Booking, event and membership pages collect requests and registrations today — you confirm with each customer directly.",
      },
      {
        id: "pay",
        eyebrow: "SELLTRO PAY",
        title: "Get Paid the Way Malaysians Pay.",
        body: "Accept online banking without wrestling with payment gateways. Verify your business and bank account once — SellNow handles the technical side.",
        bullets: [
          "FPX online banking through Selltro Pay",
          "Cash on delivery, where your courier supports it",
          "Manual bank transfer with a proper verification step",
          "Online sales settled to your bank daily (T+1), weekends included",
        ],
        note: "Online payments start after your business and bank account are verified. When money is credited depends on your bank.",
      },
      {
        id: "ship",
        eyebrow: "ORDERS & SHIPPING",
        title: "Ship Orders Without the Back-and-Forth.",
        body: "Every order lands in one list — new, pending payment, COD, ready to ship, delivered. Book the courier, print the airway bill and share tracking without leaving SellNow.",
        bullets: [
          "Ship with ParcelDaily — no courier account of your own needed",
          "Choose the courier and see the real price when you ship",
          "Print airway bills in bulk and track every parcel",
          "Set postage by weight for Peninsular, Sabah, Sarawak and Labuan",
        ],
        note: "Using your own courier account? Book in the courier's system and record the tracking number in SellNow.",
      },
      {
        id: "market",
        eyebrow: "AI ADS & POSTER STUDIO",
        title: "Market Like a Pro — Without Hiring One.",
        body: "Turn your product details into eye-catching posters and Facebook & Instagram ads. SellNow suggests the strategy, writes the copy, and shows you which ads to scale and which to fix.",
        bullets: [
          "AI posters in 6 styles and 4 sizes — in BM, English or both",
          "Creative briefs built only from your real product facts",
          "Create Meta ads, then publish once you connect your account",
          "Track spend, purchases, cost per purchase and ROAS",
        ],
        note: "Meta bills your ad spend separately. No ad is guaranteed to convert — SellNow helps you test and read the real numbers.",
      },
      {
        id: "grow",
        eyebrow: "CUSTOMERS & GROWTH",
        title: "Watch Your Business Grow — and Celebrate It.",
        body: "Every buyer and enquiry is saved for you. Your dashboard shows sales, orders, visitors and customers at a glance, with clear next steps instead of complicated reports.",
        bullets: [
          "Customer list with full order history",
          "Leads saved from your enquiry and interest forms",
          "Simple dashboard with AI recommendations",
          "Achievement stickers for real milestones, from your first sale onwards",
        ],
        note: null,
      },
    ],
    cta: "Get All of This — Start Free",
    ctaNote: "One account. No coding. No card needed to start.",
  },
  local: {
    eyebrow: "BUILT FOR MALAYSIA",
    title: "Made for Selling in Malaysia.",
    sub: "Not a foreign tool you have to work around. SellNow speaks your customers' language — and pays the way they pay.",
    items: [
      { title: "Prices in RM", body: "Ringgit everywhere — products, checkout and reports." },
      { title: "FPX online banking", body: "The payment method your buyers already trust." },
      { title: "Cash on delivery", body: "Offer COD where your courier supports it." },
      { title: "Local couriers", body: "Ship through ParcelDaily without your own courier account." },
      { title: "Bahasa Melayu & English", body: "Use SellNow and write content in either language." },
      { title: "East & West Malaysia", body: "Postage rules for Peninsular, Sabah, Sarawak and Labuan." },
    ],
  },
  pricing: {
    eyebrow: "SIMPLE PRICING",
    title: "Start Free. Add More Credits When You Need Them.",
    sub: "Choose the message credit package that fits your needs.",
    creditQ: "What is a message credit?",
    // needsApproval: matches the current implementation (credits are spent per AI task, different tasks cost different amounts).
    creditA: "Message credits are used when SellNow's AI works for you — for example, understanding your idea, writing your website content, or creating ad copy. Different tasks use different amounts of credits. Building and editing your website by hand doesn't use credits.",
    note: "Prices in Malaysian Ringgit (MYR).",
  },
  faqTitle: "Questions? We've Got Answers.",
  final: {
    title: "Your Idea Is Ready. Are You?",
    body: "You don't need to figure everything out before you start. Tell SellNow what you want to build—and take your first step today.",
    cta: "Start Building for Free",
    note: "Start with 20 message credits.",
  },
};

export type CategoryCard = {
  id: "physical" | "digital" | "service" | "booking" | "event" | "membership";
  name: string;
  title: string;
  benefit: string;
  features: [string, string, string];
  mock: "phone" | "tablet";
  /** Only show an RM value when it's documented and defensible. None is, today. */
  value_rm: number | null;
  value_label: string | null;
  show_value: boolean;
  tone: string;
};

export const CATEGORIES: CategoryCard[] = [
  { id: "physical", name: "Physical Products", title: "Launch Your Online Store.", benefit: "Show your products, take orders, and give customers an easy way to buy.", features: ["Product Catalog", "Product Pages", "Shopping Cart & Checkout"], mock: "phone", value_rm: null, value_label: null, show_value: false, tone: "from-[#E8F4FF] to-white" },
  { id: "digital", name: "Digital Products", title: "Sell What You Create.", benefit: "Turn your ebooks, templates, and digital files into products people can buy.", features: ["Digital Product Pages", "Secure File Delivery", "Online Checkout"], mock: "tablet", value_rm: null, value_label: null, show_value: false, tone: "from-[#F0EAFE] to-white" },
  { id: "service", name: "Services & Consultation", title: "Turn Your Skills Into a Business.", benefit: "Show your services, build trust, and make it easy for customers to contact you.", features: ["Service Packages", "Portfolio", "Lead & Quotation Forms"], mock: "phone", value_rm: null, value_label: null, show_value: false, tone: "from-[#E8F8F0] to-white" },
  { id: "booking", name: "Bookings & Appointments", title: "Let Customers Book You Online.", benefit: "Give customers a simple way to choose a service and request a time.", features: ["Booking Page", "Service Times", "Booking Requests"], mock: "tablet", value_rm: null, value_label: null, show_value: false, tone: "from-[#FFF0E5] to-white" },
  { id: "event", name: "Events & Workshops", title: "Fill Your Next Event.", benefit: "Create an event page where people can learn more and register.", features: ["Event Landing Page", "Registration", "Ticket Options"], mock: "phone", value_rm: null, value_label: null, show_value: false, tone: "from-[#FFFBF5] to-[#FFF0E5]" },
  { id: "membership", name: "Membership & Community", title: "Build Something People Join.", benefit: "Create a home for your members, content, and recurring experiences.", features: ["Membership Pages", "Member Plans", "Join Requests"], mock: "tablet", value_rm: null, value_label: null, show_value: false, tone: "from-[#E8F4FF] to-[#F0EAFE]" },
];

export type PricingPlan = {
  id: string;
  name: string;
  price_rm: number;
  message_credits: number;
  /** Only a REAL previous price may go here; null hides the strikethrough. */
  original_price_rm: number | null;
  promotion_label: string | null;
  highlight: boolean;
  ribbon_text: string | null;
  tagline: string;
  included_features: string[];
  benefit_values: { label: string; value_rm: number }[];
  cta_label: string;
  cta_href: string;
};

/** Features confirmed for every package. The only confirmed differences are price and credits. */
const ALL_PLANS = ["AI Business Builder", "AI website generation", "Website preview & editing", "Website publishing", "All 6 business categories"];

export const PRICING: PricingPlan[] = [
  { id: "free", name: "Free", price_rm: 0, message_credits: 20, original_price_rm: null, promotion_label: null, highlight: false, ribbon_text: null, tagline: "Try SellNow with your own idea.", included_features: ALL_PLANS, benefit_values: [], cta_label: "Start for Free", cta_href: "#" },
  { id: "starter", name: "Starter", price_rm: 20, message_credits: 100, original_price_rm: null, promotion_label: null, highlight: false, ribbon_text: null, tagline: "For your first website and edits.", included_features: ALL_PLANS, benefit_values: [], cta_label: "Choose Starter", cta_href: "#" },
  { id: "builder", name: "Builder", price_rm: 50, message_credits: 250, original_price_rm: null, promotion_label: null, highlight: false, ribbon_text: null, tagline: "Room to build, test and refine.", included_features: ALL_PLANS, benefit_values: [], cta_label: "Choose Builder", cta_href: "#" },
  { id: "pro", name: "Pro", price_rm: 100, message_credits: 500, original_price_rm: null, promotion_label: null, highlight: true, ribbon_text: "RECOMMENDED", tagline: "More room to create, test, and grow.", included_features: ALL_PLANS, benefit_values: [], cta_label: "Choose Pro", cta_href: "#" },
  { id: "elite", name: "Elite", price_rm: 200, message_credits: 1200, original_price_rm: null, promotion_label: null, highlight: false, ribbon_text: null, tagline: "The most credits per ringgit.", included_features: ALL_PLANS, benefit_values: [], cta_label: "Choose Elite", cta_href: "#" },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "What is SellNow?", a: "SellNow helps you turn a business idea, product photo or existing business info into a professional website — then manage products, orders and customers in one place." },
  { q: "Do I need coding skills?", a: "No. You describe your business, review what SellNow prepares, and edit with simple forms." },
  { q: "Can I use SellNow if I don't have a website?", a: "Yes. Most people start with just an idea or a product photo." },
  { q: "What types of websites can I build?", a: "Sales pages, online stores, digital product pages, service and lead websites, booking pages, event registration and membership pages." },
  { q: "Can I edit the website after AI generates it?", a: "Yes. You can change text, images, sections and layout before and after you publish." },
  { q: "Can I use my own business name and branding?", a: "Yes. Your business name, logo, colours and products are used throughout your site." },
  { q: "What are message credits?", a: SALES.pricing.creditA },
  { q: "Can I start for free?", a: "Yes. The Free package gives you 20 message credits to try SellNow with your own idea." },
  { q: "Can I add more credits later?", a: "Yes — pick a larger package whenever you need more credits." },
  { q: "Can I use SellNow on my phone?", a: "Yes. SellNow and the websites it builds work on phones, tablets and computers." },
  { q: "Can I embed HTML on my website?", a: "Yes. Add an embed block for widgets like YouTube, Calendly or Google Forms, or paste your own HTML. Custom code runs in an isolated frame for your store's safety." },
  { q: "Can I accept online payments?", a: "Yes, after you activate Selltro Pay and your business and bank details are verified. You can also offer cash on delivery or bank transfer." },
  { q: "When do I receive my money?", a: "Selltro Pay online sales are settled to your verified bank account daily on a T+1 basis, weekends and public holidays included. COD and bank transfer payments go straight to you." },
  { q: "Do I need my own courier account?", a: "No. You can ship through ParcelDaily inside SellNow. If you already have your own courier account, you can keep using it and record tracking numbers in SellNow." },
  { q: "Can SellNow help me run Facebook and Instagram ads?", a: "Yes. AI Ads Studio helps you create ads and posters from your product details. To publish and track ads, connect your Meta Business account. Your ad spend is billed by Meta." },
];

export const DEMO_EXAMPLES = [
  { label: "Homemade Sambal", prompt: "I want to sell homemade sambal.", kind: "food" },
  { label: "Skincare Products", prompt: "I want to sell handmade skincare products.", kind: "beauty" },
  { label: "Photography Service", prompt: "I offer wedding and event photography.", kind: "service" },
  { label: "Online Workshop", prompt: "I want to run an online baking workshop.", kind: "event" },
] as const;
