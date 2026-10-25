import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveDocumentDataDirectory } from '../lib/document-data-directory';

test('document data directory is stable from repository and web working directories', async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'avantime-data-root-'));
  const webDirectory = path.join(repositoryRoot, 'apps', 'web');
  await mkdir(webDirectory, { recursive: true });
  await writeFile(path.join(webDirectory, 'package.json'), '{}');

  try {
    const expected = path.join(webDirectory, '.data');
    assert.equal(resolveDocumentDataDirectory({}, repositoryRoot), expected);
    assert.equal(resolveDocumentDataDirectory({}, webDirectory), expected);
    assert.equal(
      resolveDocumentDataDirectory({ DOCUMENT_DATA_DIR: 'apps/web/.data' }, webDirectory),
      expected,
    );
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});
