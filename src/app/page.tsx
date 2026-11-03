import type { Metadata } from "next";
import "./sales.css";
import { getCurrentUser } from "@/lib/auth/session";
import { SalesDefs } from "@/components/sales/art";
import { SALES } from "@/components/sales/content";
import { SalesBehaviour } from "@/components/sales/SalesBehaviour";
import { DemoLoader } from "@/components/sales/DemoLoader";
import { Categories, DemoSection, FaqSection, FeatureTour, FinalCta, Hero, HowItWorks, MadeForMalaysia, Pricing, Problems, SalesFooter, SalesHeader, WhySellNow } from "@/components/sales/sections";

export const metadata: Metadata = {
  title: "SellNow — From Idea to Sales",
  description: "Describe your business or upload a product photo. SellNow helps you create a professional website, add your products and get ready to sell.",
};

/** Public sales page (English). Copy, pricing and claims live in components/sales/content.ts. */
export default async function SalesPage() {
  const user = await getCurrentUser().catch(() => null);
  const startHref = user ? "/onboarding" : "/signup";
  return (
    <div id="sellnow-sales" className="overflow-x-clip bg-white font-sans text-[#171717] [scroll-behavior:smooth]">
      <SalesDefs />
      <SalesBehaviour variant={SALES.hero.active} />
      <SalesHeader startHref={user ? "/dashboard" : "/signup"} loggedIn={Boolean(user)} />
      <main>
        <Hero startHref={startHref} />
        <HowItWorks />
        <Problems />
        <WhySellNow />
        <DemoSection>
          <DemoLoader startHref={startHref} />
        </DemoSection>
        <FeatureTour startHref={startHref} />
        <MadeForMalaysia />
        <Categories />
        <Pricing />
        <FaqSection />
        <FinalCta startHref={startHref} />
      </main>
      <SalesFooter />
    </div>
  );
}
