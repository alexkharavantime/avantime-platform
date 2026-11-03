import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

if (process.env.NODE_ENV === 'development') {
  loadEnvConfig(repositoryRoot);
}

// CMS images are optimized by next/image; the media origin is fixed at build/start time.
function cmsMediaPatterns() {
  const configured = process.env.CMS_MEDIA_URL?.trim();
  if (!configured) return [];
  const url = new URL(configured);
  return [
    {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      port: url.port,
      pathname: '/uploads/**',
    },
  ];
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: cmsMediaPatterns(),
  },
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  transpilePackages: ['@avantime/ui'],
  serverExternalPackages: ['pdf-parse'],
  output: 'standalone',
  outputFileTracingRoot: repositoryRoot,
  turbopack: {
    root: repositoryRoot,
  },
};

export default nextConfig;
