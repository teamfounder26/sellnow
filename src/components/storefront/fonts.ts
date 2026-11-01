import { Fraunces, Space_Grotesk } from "next/font/google";

/** Storefront heading fonts per design preset (serif = editorial, display = bold). Sans uses Plus Jakarta. */
export const serifFont = Fraunces({ subsets: ["latin"], variable: "--font-sf-serif", display: "swap", weight: ["500", "600", "700"] });
export const displayFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-sf-display", display: "swap", weight: ["500", "700"] });

export const storefrontFontVars = `${serifFont.variable} ${displayFont.variable}`;
