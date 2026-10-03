import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // On-prem LAN panel: server-side image optimization buys nothing here and
  // pulls in `sharp`, a per-OS native binary. Turning it off lets the web bundle
  // be built anywhere (e.g. a Mac) and dropped onto the Windows server for a
  // quick front-end-only update, without shipping a wrong-platform sharp.
  images: { unoptimized: true },

  allowedDevOrigins: [
    "10.141.233.130",
    "192.168.1.136",
  ],

  typescript: {
    ignoreBuildErrors: true,
  },

  reactStrictMode: false,
};

export default nextConfig;
