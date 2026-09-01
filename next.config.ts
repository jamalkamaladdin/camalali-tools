import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static output: every tool computes in the browser, so no Node
  // process runs in production. Caddy serves the `out/` folder directly.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
