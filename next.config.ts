import type { NextConfig } from "next";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self' data:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.r2.cloudflarestorage.com https://ntp-a1.nict.go.jp https://api.github.com https://*.opentimestamps.org https://a.pool.opentimestamps.org https://b.pool.opentimestamps.org;
  frame-src 'self' blob:;
  object-src 'self' blob:;
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
`.replace(/\s{2,}/g, ' ').trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
