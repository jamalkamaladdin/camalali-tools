import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static output: every tool computes in the browser, so no Node
  // process runs in production. Caddy serves the `out/` folder directly.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // The browser runs on Windows while the dev server runs in WSL, so requests
  // arrive with the WSL IP as their origin.
  allowedDevOrigins: ["172.18.121.252"],
};

export default nextConfig;
