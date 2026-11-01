import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SellNow — Dari Idea ke Jualan", template: "%s · SellNow" },
  description: "Platform AI untuk membina perniagaan, kedai dalam talian dan menerima bayaran — dibina untuk Malaysia.",
};

export const viewport: Viewport = { themeColor: "#FFFBF5", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === "ms" ? "ms-MY" : "en-MY"} className={jakarta.variable}>
      <body className="min-h-dvh overflow-x-hidden">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
