import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@avantime/ui'],
  serverExternalPackages: ['pdf-parse'],
  output: 'standalone',
};

export default nextConfig;
