import type { NextConfig } from "next";
import { storefrontCsp } from "./src/lib/storefront/embed";

const nextConfig: NextConfig = {
  // Lets a second local dev server run side by side (separate build output) — e.g. NEXT_DIST_DIR=.next-verify.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth", "word-extractor"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
  poweredByHeader: false,
  // Seller websites may embed widgets: frames only from the allowlist (HTML snippets use sandboxed srcdoc).
  async headers() {
    return [{ source: "/s/:path*", headers: [{ key: "Content-Security-Policy", value: storefrontCsp() }] }];
  },
};

export default nextConfig;
