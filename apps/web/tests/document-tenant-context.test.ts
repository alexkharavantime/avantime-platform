import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { getDocumentTenantContext } from '../lib/document-model';
import type { AppSession } from '../lib/session';

function session(companyId?: string): AppSession {
  return {
    userId: 'user-1',
    name: 'Platform Admin',
    company: '',
    companyId,
    email: 'admin@example.com',
    role: 'ADMIN',
    expiresAt: Date.now() + 60_000,
  };
}

test('document tenant context uses the session organization', () => {
  assert.deepEqual(getDocumentTenantContext(session(' company-a ')), {
    companyId: 'company-a',
    userId: 'user-1',
  });
});

test('document tenant context rejects a session without an organization', () => {
  for (const companyId of [undefined, '', '   ']) {
    assert.throws(() => getDocumentTenantContext(session(companyId)), /organization context/);
  }
});

test('portal home reads documents only with documents.view', async () => {
  const page = await readFile(path.join(process.cwd(), 'app/portal/page.tsx'), 'utf8');
  assert.match(
    page,
    /hasOrganizationPermission\(session, 'documents\.view'\)\) \{\s*try \{\s*const documents = await getDocumentServices\(\)\.metadata\.list\(\s*getDocumentTenantContext\(session\),?\s*\)/,
  );
});
