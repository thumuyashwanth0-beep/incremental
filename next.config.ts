import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native argon2 binding must not be bundled.
  serverExternalPackages: ["@node-rs/argon2"],
  async headers() {
    // API responses: never cached, never framed. (Pages get their headers from src/proxy.ts.)
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
