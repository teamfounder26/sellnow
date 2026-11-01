import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second local dev server run side by side (separate build output) — e.g. NEXT_DIST_DIR=.next-verify.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "mammoth", "word-extractor"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
  poweredByHeader: false,
};

export default nextConfig;
