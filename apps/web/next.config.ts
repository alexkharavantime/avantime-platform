import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

if (process.env.NODE_ENV === 'development') {
  loadEnvConfig(repositoryRoot);
}

const nextConfig: NextConfig = {
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
