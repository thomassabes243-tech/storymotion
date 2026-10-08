import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["sharp"],
  devIndicators: false,
  experimental: { proxyClientMaxBodySize: "52mb" },
};
export default config;
