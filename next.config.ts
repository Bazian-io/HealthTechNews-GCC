import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Preserve the app's existing prefetch behavior during the Next.js 16.4 upgrade.
  partialPrefetching: false,
};

export default nextConfig;
