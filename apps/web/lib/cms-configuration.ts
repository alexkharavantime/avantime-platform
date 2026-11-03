import path from 'node:path';

import { resolveDocumentDataDirectory, resolveDocumentWorkspaceRoot } from './document-data-directory';

export type CmsConfiguration =
  | { enabled: false }
  | {
      enabled: true;
      url: string;
      mediaUrl: string;
      apiToken: string;
      previewSecret: string;
      revalidateSecret: string;
      timeoutMs: number;
      cacheSeconds: number;
      snapshotDirectory: string;
    };

const PLACEHOLDER = /(?:change.?me|example|placeholder|your[-_ ]|todo|xxx|<[^>]+>)/iu;

function integer(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`CMS_CONFIG_${name}_INVALID`);
  }
  return value;
}

function required(environment: Record<string, string | undefined>, name: string, minimumLength = 1) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`CMS_CONFIG_${name}_REQUIRED`);
  if (PLACEHOLDER.test(value)) throw new Error(`CMS_CONFIG_${name}_PLACEHOLDER`);
  if (value.length < minimumLength) throw new Error(`CMS_CONFIG_${name}_TOO_SHORT`);
  return value;
}

function origin(environment: Record<string, string | undefined>, name: string) {
  let url: URL;
  try {
    url = new URL(required(environment, name));
  } catch (error) {
    if (error instanceof TypeError) throw new Error(`CMS_CONFIG_${name}_INVALID`);
    throw error;
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`CMS_CONFIG_${name}_INVALID`);
  }
  return url.origin;
}

export function loadCmsConfiguration(
  environment: Record<string, string | undefined> = process.env,
): CmsConfiguration {
  const mode = environment.CMS_PILOT_MODE?.trim() || 'off';
  if (mode === 'off') return { enabled: false };
  if (mode !== 'on') throw new Error('CMS_CONFIG_CMS_PILOT_MODE_INVALID');

  const configuredSnapshots = environment.CMS_SNAPSHOT_DIR?.trim();
  return {
    enabled: true,
    url: origin(environment, 'CMS_URL'),
    mediaUrl: origin(environment, 'CMS_MEDIA_URL'),
    apiToken: required(environment, 'CMS_API_TOKEN', 32),
    previewSecret: required(environment, 'CMS_PREVIEW_SECRET', 32),
    revalidateSecret: required(environment, 'CMS_REVALIDATE_SECRET', 32),
    timeoutMs: integer(environment, 'CMS_TIMEOUT_MS', 3000, 500, 10000),
    cacheSeconds: integer(environment, 'CMS_CACHE_SECONDS', 300, 30, 86400),
    snapshotDirectory: configuredSnapshots
      ? path.resolve(resolveDocumentWorkspaceRoot(), configuredSnapshots)
      : path.join(resolveDocumentDataDirectory(environment), 'cms-snapshots'),
  };
}
