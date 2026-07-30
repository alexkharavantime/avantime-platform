import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const SECRET_KEY = /^(authorization|cookie|set-cookie|password|passwd|secret|token)$/i;
const SECRET_NAME =
  /^(authorization|cookie|set-cookie|password|passwd|secret|token|avantime_session)$/i;
const SECRET_VALUE =
  /(browser-user-a-password|browser-user-b-password|browser-admin-password|browser-tests-only-session-secret-32-characters-minimum)/g;

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sanitized = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeValue(item),
      ]),
    );
    if (typeof record.name === 'string' && SECRET_NAME.test(record.name) && 'value' in record) {
      sanitized.value = '[REDACTED]';
    }
    return sanitized;
  }
  return typeof value === 'string' ? value.replace(SECRET_VALUE, '[REDACTED]') : value;
}

function sanitizeJsonLines(data: Uint8Array) {
  const text = strFromU8(data);
  const sanitized = text
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line;
      try {
        return JSON.stringify(sanitizeValue(JSON.parse(line)));
      } catch {
        return line.replace(SECRET_VALUE, '[REDACTED]');
      }
    })
    .join('\n');
  return strToU8(sanitized);
}

async function findTraceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const results = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? findTraceFiles(target)
        : Promise.resolve(entry.name === 'trace.zip' ? [target] : []);
    }),
  );
  return results.flat();
}

export async function sanitizePlaywrightArtifacts(directory: string) {
  for (const tracePath of await findTraceFiles(directory)) {
    const archive = unzipSync(new Uint8Array(await readFile(tracePath)));
    for (const [name, data] of Object.entries(archive)) {
      if (name.endsWith('.trace') || name.endsWith('.network') || name.endsWith('.stacks')) {
        archive[name] = sanitizeJsonLines(data);
      }
    }
    await writeFile(tracePath, zipSync(archive));
  }
}
