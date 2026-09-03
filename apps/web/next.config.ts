import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

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
