import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/privacy",
        destination: "/legal#privacy",
        permanent: true,
      },
      {
        source: "/terms",
        destination: "/legal#terms",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/_next/image",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            // Report-Only for initial rollout. After 7-14 days of clean reports
            // in production, swap this header key to "Content-Security-Policy".
            key: "Content-Security-Policy-Report-Only",
            value: (() => {
              // Vercel injects vercel.live (preview toolbar / comments) only on
              // preview deployments. Allow it just there — production stays
              // locked down.
              const isPreview = process.env.VERCEL_ENV === "preview";
              const vercelLive = isPreview ? " https://vercel.live" : "";
              const vercelLiveWs = isPreview
                ? " wss://ws-us3.pusher.com wss://ws-mt1.pusher.com"
                : "";
              return [
                "default-src 'self'",
                `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${vercelLive}`,
                "style-src 'self' 'unsafe-inline'",
                `img-src 'self' data: blob: https://*.supabase.co${vercelLive}`,
                "font-src 'self'",
                `connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com${vercelLive}${vercelLiveWs}`,
                `frame-src https://challenges.cloudflare.com https://www.google.com/maps/embed${vercelLive}`,
                "frame-ancestors 'none'",
                "form-action 'self'",
                "object-src 'none'",
                "base-uri 'self'",
                "report-uri /api/csp-report",
              ].join("; ");
            })(),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
