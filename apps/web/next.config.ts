import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Next matches these values against the requesting hostname for /_next/* in dev.
  allowedDevOrigins: ["192.168.1.149"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@nim/types", "@nim/ui", "@nim/validation"],
};

export default nextConfig;
