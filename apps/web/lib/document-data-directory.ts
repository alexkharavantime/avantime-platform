import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveDocumentWorkspaceRoot(startDirectory = process.cwd()) {
  const fallbackRoot = path.resolve(startDirectory);
  let directory = fallbackRoot;

  while (true) {
    if (existsSync(path.join(directory, 'apps', 'web', 'package.json'))) return directory;

    const parent = path.dirname(directory);
    if (parent === directory) return fallbackRoot;
    directory = parent;
  }
}

export function resolveDocumentDataDirectory(
  environment: Record<string, string | undefined> = process.env,
  workingDirectory = process.cwd(),
) {
  const workspaceRoot = resolveDocumentWorkspaceRoot(workingDirectory);
  const configuredDirectory = environment.DOCUMENT_DATA_DIR?.trim();

  if (!configuredDirectory) return path.join(workspaceRoot, 'apps', 'web', '.data');
  return path.resolve(workspaceRoot, configuredDirectory);
}
