import type { NextConfig } from "next";

// Baseline browser protections for every route. A full Content Security Policy
// is deliberately not set yet; publisher images load from many HTTPS hosts.
const securityHeaders = [
  // Never allow the site inside another site's frame (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Publishers see our domain, not the full page address.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Preserve the app's existing prefetch behavior during the Next.js 16.4 upgrade.
  partialPrefetching: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
