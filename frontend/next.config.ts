import type { NextConfig } from "next";

// In the single-container deployment the API runs beside Next on 127.0.0.1:8000 and the
// browser calls same-origin /api/*, which Next forwards.
const apiProxy = process.env.API_PROXY_URL;

const nextConfig: NextConfig = {
  // Lets a production build run beside the dev server without sharing `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  async rewrites() {
    return apiProxy ? [{ source: "/api/:path*", destination: `${apiProxy}/api/:path*` }] : [];
  },
};

export default nextConfig;
