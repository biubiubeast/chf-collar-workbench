import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['node:sqlite'],
};

export default nextConfig;
