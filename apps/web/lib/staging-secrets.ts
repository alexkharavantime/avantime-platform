import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export type SecretVersion = {
  version: string;
  updatedAt?: string;
};

export type LoadedSecret = SecretVersion & {
  name: string;
  value: string;
};

export interface StagingSecretProvider {
  readonly kind: 'environment' | 'file' | 'external';
  load(name: string): Promise<LoadedSecret | null>;
}

const SAFE_NAME = /^[A-Z][A-Z0-9_]{2,100}$/;
const PLACEHOLDER = /(?:change[-_ ]?me|placeholder|replace[-_ ]?me|example|todo|xxx+|^<.+>$)/i;

function validateName(name: string) {
  if (!SAFE_NAME.test(name)) throw new Error('Secret name is invalid.');
}

export class EnvironmentStagingSecretProvider implements StagingSecretProvider {
  readonly kind = 'environment' as const;

  constructor(private readonly environment: Record<string, string | undefined>) {}

  async load(name: string): Promise<LoadedSecret | null> {
    validateName(name);
    const value = this.environment[name];
    if (!value) return null;
    return {
      name,
      value,
      version: this.environment[`${name}_VERSION`] || 'environment-unversioned',
      updatedAt: this.environment[`${name}_UPDATED_AT`],
    };
  }
}

export class FileMountedStagingSecretProvider implements StagingSecretProvider {
  readonly kind = 'file' as const;
  private readonly root: string;

  constructor(root: string) {
    if (!path.isAbsolute(root)) throw new Error('Secret mount root must be absolute.');
    this.root = path.resolve(root);
  }

  async load(name: string): Promise<LoadedSecret | null> {
    validateName(name);
    const target = path.resolve(this.root, name);
    if (!target.startsWith(`${this.root}${path.sep}`)) {
      throw new Error('Secret path escapes the configured mount.');
    }
    try {
      const [value, metadata] = await Promise.all([readFile(target, 'utf8'), stat(target)]);
      return {
        name,
        value: value.trim(),
        version: `${metadata.size}-${Math.floor(metadata.mtimeMs)}`,
        updatedAt: metadata.mtime.toISOString(),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

export class ExternalStagingSecretProvider implements StagingSecretProvider {
  readonly kind = 'external' as const;

  constructor(
    private readonly adapter: {
      getSecret(name: string): Promise<{
        value: string;
        version: string;
        updatedAt?: string;
      } | null>;
    },
  ) {}

  async load(name: string): Promise<LoadedSecret | null> {
    validateName(name);
    const secret = await this.adapter.getSecret(name);
    return secret ? { name, ...secret } : null;
  }
}

export async function loadRequiredStagingSecrets(
  provider: StagingSecretProvider,
  names: readonly string[],
  options: { minimumLength?: number; maximumAgeDays?: number; now?: Date } = {},
) {
  const minimumLength = options.minimumLength ?? 20;
  const now = options.now ?? new Date();
  const loaded: LoadedSecret[] = [];
  for (const name of names) {
    const secret = await provider.load(name);
    if (!secret) throw new Error(`${name} is missing from the staging secret provider.`);
    if (secret.value.length < minimumLength || PLACEHOLDER.test(secret.value)) {
      throw new Error(`${name} is invalid or uses a placeholder.`);
    }
    if (!secret.version || PLACEHOLDER.test(secret.version)) {
      throw new Error(`${name} has no usable secret version.`);
    }
    if (options.maximumAgeDays !== undefined) {
      if (!secret.updatedAt) throw new Error(`${name} has no rotation timestamp.`);
      const updatedAt = new Date(secret.updatedAt);
      const maximumAgeMs = options.maximumAgeDays * 24 * 60 * 60 * 1_000;
      if (
        !Number.isFinite(updatedAt.getTime()) ||
        now.getTime() - updatedAt.getTime() > maximumAgeMs
      ) {
        throw new Error(`${name} is stale and must be rotated.`);
      }
    }
    loaded.push(secret);
  }
  return {
    values: Object.fromEntries(loaded.map((secret) => [secret.name, secret.value])),
    summary: loaded.map(({ name, version, updatedAt }) => ({
      name,
      version,
      updatedAt: updatedAt ?? null,
      present: true as const,
    })),
  };
}
