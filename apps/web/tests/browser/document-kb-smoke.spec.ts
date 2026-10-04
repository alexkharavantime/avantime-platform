import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

import { cleanupDeletedDocuments, createDocumentServices, deleteDocument } from '../../lib/document-services';
import { loadDocumentConfiguration } from '../../lib/document-configuration';
import type { DocumentTenantContext } from '../../lib/document-model';
import type { DocumentMetadataDatabaseClient } from '../../lib/document-repositories';
import { loadRagConfiguration } from '../../lib/rag-configuration';
import type { VectorDatabaseClient } from '../../lib/vector-repository';
import {
  BROWSER_DATA_DIRECTORY,
  BROWSER_DATABASE_URL,
  browserIdentities,
  browserServerEnvironment,
} from './environment';
import { expect, test } from './fixtures';

const prisma = new PrismaClient({ datasourceUrl: BROWSER_DATABASE_URL });
const applicant = browserIdentities.identityManager;
const tenant: DocumentTenantContext = {
  companyId: applicant.companyId,
  userId: 'browser-identity-manager',
};
const projectMarker = 'AVANTIME-KB-SMOKE-20261002';
const fileName = `${projectMarker}.pdf`;
const question = `Какой срок хранения тестовой поставки в проекте ${projectMarker}?`;
const documentText = [
  `Project: ${projectMarker}. Warehouse code: TEST-WH-742.`,
  'The retention period for the test delivery is 17 days.',
  'This synthetic record contains no customer information.',
  'Item | Quantity | Unit price | Total',
  'Hosting | 2 | 12.50 EUR | 25.00 EUR',
  'Support | 1 | 7.50 EUR | 7.50 EUR',
  'Grand total | | | 32.50 EUR',
].join('\n');

const configuration = loadDocumentConfiguration({
  ...browserServerEnvironment,
  DOCUMENT_DATA_DIR: BROWSER_DATA_DIRECTORY,
});
const services = createDocumentServices(configuration, {
  loadDatabase: async () => prisma as unknown as DocumentMetadataDatabaseClient,
  ragConfiguration: loadRagConfiguration(browserServerEnvironment),
  rag: {
    loadDatabase: async () => prisma as unknown as VectorDatabaseClient,
  },
});

function createPdf(text: string) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    let line = '';
    for (const word of paragraph.split(/\s+/u)) {
      const nextLine = line ? `${line} ${word}` : word;
      if (nextLine.length > 70 && line) {
        lines.push(line);
        line = word;
      } else {
        line = nextLine;
      }
    }
    if (line) lines.push(line);
  }
  const stream = lines
    .map((value, index) => {
      const escaped = value.replace(/([\\()])/g, '\\$1');
      return `BT /F1 12 Tf 72 ${720 - index * 18} Td (${escaped}) Tj ET`;
    })
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

function runOneJob(script: string, workerId: string) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', `scripts/${script}`],
    {
      cwd: process.cwd(),
      env: {
        ...browserServerEnvironment,
        NODE_ENV: 'test',
        DOCUMENT_WORKER_TENANT_ID: tenant.companyId,
        DOCUMENT_WORKER_ID: workerId,
      },
      encoding: 'utf8',
      timeout: 60_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} exited with ${result.status ?? 'no status'}.`);
  }
  return JSON.parse(result.stdout.trim()) as { outcome?: string };
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('synthetic PDF travels from the upload UI through workers, retrieval and citations', async ({
  page,
  loginAs,
}, testInfo) => {
  test.skip(
    process.env.BROWSER_DOCUMENT_KB_SMOKE !== '1',
    'Run only against the dedicated pgvector browser database.',
  );
  test.setTimeout(180_000);
  const pdf = createPdf(documentText);
  let documentId: string | undefined;

  try {
    await loginAs('identityOwner');
    await page.goto('/ru/admin/documents');
    await expect(page.getByRole('heading', { level: 1, name: 'База знаний Avantime' })).toBeVisible();

    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/documents/upload' &&
        response.request().method() === 'POST',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'application/pdf',
      buffer: pdf,
    });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(202);
    const uploadResult = (await uploadResponse.json()) as {
      document?: { id?: string };
    };
    documentId = uploadResult.document?.id;
    expect(documentId).toBeTruthy();
    if (!documentId) throw new Error('Upload response did not include a document ID.');

    const queued = await services.metadata.findById(tenant, documentId);
    expect(queued?.status).toBe('QUEUED');
    expect((await services.queue.list(tenant)).some((job) => job.documentId === documentId)).toBe(true);
    const stored = await services.storage.read(tenant, 'original', queued!.storedName, {
      expectedChecksum: queued!.checksum,
    });
    expect(stored?.equals(pdf)).toBe(true);

    expect(runOneJob('process-one-document-job.ts', 'kb-document-smoke')).toMatchObject({
      outcome: 'COMPLETED',
    });
    expect(runOneJob('process-one-embedding-job.ts', 'kb-embedding-smoke')).toMatchObject({
      outcome: 'COMPLETED',
    });
    await expect
      .poll(async () => (await services.metadata.findById(tenant, documentId!))?.status)
      .toBe('COMPLETED');

    const completed = await services.metadata.findById(tenant, documentId);
    expect(completed).toMatchObject({ status: 'COMPLETED', embeddingStatus: 'COMPLETED' });
    expect(completed?.lastErrorCode).toBeFalsy();
    const extractedText = await services.processing.readText(tenant, documentId);
    expect(extractedText).toContain('TEST-WH-742');
    expect(extractedText).toContain('17 days');
    expect(extractedText).toContain('Hosting | 2 | 12.50 EUR | 25.00 EUR');
    expect(extractedText).toContain('Grand total | | | 32.50 EUR');
    expect(await services.rag?.vectors.listByDocument(tenant, documentId)).not.toHaveLength(0);

    const retrieval = await services.rag!.hybrid.retrieve({
      tenant,
      query: question,
      correlationId: `browser-kb-retrieval-${testInfo.workerIndex}`,
    });
    expect(retrieval.some((result) => result.documentId === documentId)).toBe(true);
    expect(retrieval.find((result) => result.documentId === documentId)?.preview).toContain('17 days');

    await page.goto('/ru/portal/knowledge');
    await page.getByRole('textbox', { name: 'Поисковый запрос' }).fill('32.50 EUR');
    await page.getByRole('button', { name: 'Найти' }).click();
    const searchResult = page.getByRole('link').filter({ hasText: '32.50 EUR' }).first();
    await expect(searchResult).toBeVisible();
    await searchResult.click();
    await expect(page.getByRole('heading', { name: fileName })).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Извлечённый текст' }).click();
    await expect(page.getByText(/32\.50 EUR/u).last()).toBeVisible();
    await page.goto('/ru/portal/knowledge');

    await page.getByRole('textbox', { name: 'Вопрос AI-консультанту' }).fill(question);
    await page.getByRole('button', { name: 'Получить ответ AI' }).click();
    await expect(page.getByText(/17 days/u).first()).toBeVisible();
    const answerResponse = await page.request.post('/api/documents/ask', { data: { question } });
    expect(answerResponse.status()).toBe(200);
    const answerResult = (await answerResponse.json()) as {
      answer: string;
      citations: Array<{
        documentId?: string;
        excerpt: string;
        link: string;
        pageStart?: number | null;
        pageEnd?: number | null;
      }>;
    };
    expect(answerResult.answer).toContain('17 days');
    const citation = answerResult.citations.find((item) => item.documentId === documentId);
    expect(citation?.excerpt).toContain('TEST-WH-742');
    expect(citation?.excerpt).toContain('17 days');
    expect(citation).toMatchObject({ pageStart: 1, pageEnd: 1 });
    expect(citation?.link).toMatch(new RegExp(`^/portal/documents/${documentId}\\?chunk=`,'u'));
    await expect(page.getByText('Страница 1')).toBeVisible();
    const citationLink = page.locator(`a[href^="/ru/portal/documents/${documentId}?chunk="]`);
    await expect(citationLink).toHaveCount(1);
    await citationLink.click();
    await expect(page.getByRole('heading', { name: fileName })).toBeVisible();
    await page.getByRole('tab', { name: 'Извлечённый текст' }).click();
    await expect(page.getByText(/17 days/u).last()).toBeVisible();
    expect((await page.request.get(`/api/documents/file?id=${documentId}`)).status()).toBe(200);

    await page.context().clearCookies();
    await loginAs('tenantB');
    await page.goto('/ru/portal/documents');
    await expect(page.getByText(fileName)).toHaveCount(0);
    const foreignList = await page.request.get('/api/documents/upload');
    expect(foreignList.status()).toBe(200);
    expect(JSON.stringify(await foreignList.json())).not.toContain(documentId);
    const foreignSearch = await page.request.get(
      `/api/documents/search?q=${encodeURIComponent(projectMarker)}&mode=lexical`,
    );
    expect(foreignSearch.status()).toBe(200);
    const foreignSearchBody = (await foreignSearch.json()) as {
      results: Array<{ documentId: string; documentName: string; preview: string }>;
    };
    expect(foreignSearchBody.results).toHaveLength(0);
    const foreignAnswer = await page.request.post('/api/documents/ask', { data: { question } });
    expect(foreignAnswer.status()).toBe(200);
    const foreignAnswerBody = await foreignAnswer.text();
    expect(foreignAnswerBody).not.toContain(projectMarker);
    expect(foreignAnswerBody).not.toContain(fileName);
    expect(foreignAnswerBody).not.toContain(documentId);
    for (const route of ['item', 'file']) {
      const response = await page.request.get(`/api/documents/${route}?id=${documentId}`);
      expect(response.status()).toBe(404);
      const body = await response.text();
      expect(body).not.toContain(projectMarker);
      expect(body).not.toContain(fileName);
    }

    await page.context().clearCookies();
    await loginAs('identityViewer');
    await page.goto('/ru/admin/documents');
    await expect(page).toHaveURL(/\/ru\/portal$/u);
    const viewerUpload = await page.request.post('/api/documents/upload', { data: {} });
    expect(viewerUpload.status()).toBe(403);
    const viewerMembership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { id: 'browser-membership-identity-viewer' },
      select: { status: true, suspendedAt: true },
    });
    await prisma.organizationMembership.update({
      where: { id: 'browser-membership-identity-viewer' },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });
    try {
      const suspendedDownload = await page.request.get(`/api/documents/file?id=${documentId}`);
      expect([401, 403]).toContain(suspendedDownload.status());
      const suspendedBody = await suspendedDownload.text();
      expect(suspendedBody).not.toContain(projectMarker);
      expect(suspendedBody).not.toContain(fileName);
    } finally {
      await prisma.organizationMembership.update({
        where: { id: 'browser-membership-identity-viewer' },
        data: viewerMembership,
      });
    }

    await page.context().clearCookies();
    for (const route of [
      '/api/documents/upload',
      `/api/documents/item?id=${documentId}`,
      `/api/documents/file?id=${documentId}`,
      `/api/documents/search?q=${encodeURIComponent(projectMarker)}&mode=lexical`,
    ]) {
      expect((await page.request.get(route)).status()).toBe(401);
    }
    expect(
      (await page.request.post('/api/documents/ask', { data: { question } })).status(),
    ).toBe(401);
  } finally {
    if (documentId) {
      await deleteDocument(tenant, documentId, services).catch(() => undefined);
      await cleanupDeletedDocuments(tenant, services).catch(() => undefined);
    }
  }
});