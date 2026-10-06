import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

import {
  cleanupDeletedDocuments,
  createDocumentServices,
  deleteDocument,
} from '../../lib/document-services';
import { loadDocumentConfiguration } from '../../lib/document-configuration';
import type { DocumentTenantContext } from '../../lib/document-model';
import type { DocumentMetadataDatabaseClient } from '../../lib/document-repositories';
import { loadRagConfiguration } from '../../lib/rag-configuration';
import type { VectorDatabaseClient } from '../../lib/vector-repository';
import {
  BROWSER_DATA_DIRECTORY,
  BROWSER_DATABASE_NAME,
  BROWSER_DATABASE_URL,
  browserIdentities,
  browserServerEnvironment,
} from './environment';
import { expect, test } from './fixtures';

test.describe.configure({ retries: 0 });

const prisma = new PrismaClient({ datasourceUrl: BROWSER_DATABASE_URL });
const manager = browserIdentities.identityManager;
const tenantA: DocumentTenantContext = {
  companyId: manager.companyId,
  userId: 'browser-identity-manager',
};
const configuration = loadDocumentConfiguration({
  ...browserServerEnvironment,
  DOCUMENT_DATA_DIR: BROWSER_DATA_DIRECTORY,
});
const ragConfiguration = loadRagConfiguration(browserServerEnvironment);
const services = createDocumentServices(configuration, {
  loadDatabase: async () => prisma as unknown as DocumentMetadataDatabaseClient,
  ragConfiguration,
  rag: {
    environment: browserServerEnvironment,
    loadDatabase: async () => prisma as unknown as VectorDatabaseClient,
  },
});

const projectMarker = `REAL-AI-${BROWSER_DATABASE_NAME.slice(-8)}`;
const documents = [
  {
    key: 'maintenance',
    name: `${projectMarker}-1C-ERP-2.5.14-maintenance.pdf`,
    text:
      `Synthetic instructions for 1C:ERP 2.5.14 only. Project marker: ${projectMarker}. ` +
      'Nightly maintenance starts at 21:45.',
    fact: '21:45',
  },
  {
    key: 'backup',
    name: `${projectMarker}-1C-ERP-2.5.14-backup-retention.pdf`,
    text:
      `Synthetic instructions for 1C:ERP 2.5.14 only. Project marker: ${projectMarker}. ` +
      'Backups are retained for 14 days.',
    fact: '14 days',
  },
] as const;

const controlQuestions = [
  {
    key: 'direct',
    text: 'Во сколько начинается ночное обслуживание в 1C:ERP 2.5.14?',
  },
  {
    key: 'paraphrase',
    text: 'К какому времени назначают регламентные работы в системе версии 2.5.14?',
  },
  {
    key: 'combined',
    text: 'Укажи время ночного обслуживания и срок хранения резервных копий.',
  },
  {
    key: 'absent',
    text: 'Какой PowerShell cmdlet выполняет обновление схемы 1C:ERP 2.5.14?',
  },
  {
    key: 'version',
    text: 'Подтверждают ли эти инструкции порядок работы в 1C:ERP 3.0?',
  },
] as const;

type Citation = {
  documentId?: string;
  chunkId: string;
  excerpt: string;
  link: string;
};

type AskResult = {
  status: 'answered' | 'no_answer';
  answer: string;
  citations: Citation[];
  usage: { estimatedCostEur: number };
};

function createPdf(text: string) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/u)) {
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length > 70 && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }
  if (line) lines.push(line);
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
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

function runOneJob(script: string, workerId: string) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `scripts/${script}`], {
    cwd: process.cwd(),
    env: {
      ...browserServerEnvironment,
      NODE_ENV: 'test',
      DOCUMENT_WORKER_TENANT_ID: tenantA.companyId,
      DOCUMENT_WORKER_ID: workerId,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${script} exited with ${result.status ?? 'no status'}.`);
  const runResult = JSON.parse(result.stdout.trim()) as {
    outcome?: string;
    errorCode?: string;
  };
  if (runResult.outcome === 'QUARANTINED' || runResult.outcome === 'FAILED') {
    throw new Error(
      `${script} returned ${runResult.outcome} (${runResult.errorCode ?? 'no safe error code'}).`,
    );
  }
  return runResult;
}

async function askThroughUi(page: import('@playwright/test').Page, question: string) {
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/documents/ask' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('textbox', { name: 'Вопрос AI-консультанту' }).fill(question);
  await page.getByRole('button', { name: 'Получить ответ AI' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Получить ответ AI' })).toBeEnabled();
  return (await response.json()) as AskResult;
}

async function expectSourceCitation(citation: Citation, documentId: string) {
  expect(citation.documentId).toBe(documentId);
  const chunks = await services.processing.readChunks(tenantA, documentId);
  const sourceChunk = chunks.find((chunk) => chunk.id === citation.chunkId);
  expect(sourceChunk).toBeTruthy();
  expect(sourceChunk?.pageStart).toBe(1);
  expect(sourceChunk?.pageEnd).toBe(1);
  expect(citation.excerpt).toBe(sourceChunk!.text.replace(/\s+/g, ' ').trim().slice(0, 480));
  expect(citation.link).toBe(
    `/portal/documents/${encodeURIComponent(documentId)}?chunk=${encodeURIComponent(citation.chunkId)}`,
  );
}

test('real AI: bounded 1C document retrieval, answers, citations and tenant isolation @real-ai', async ({
  page,
  loginAs,
}) => {
  test.skip(
    process.env.BROWSER_REAL_AI_KB_SMOKE !== '1',
    'Run only with the dedicated real-AI browser command and explicit provider configuration.',
  );
  test.setTimeout(300_000);
  expect(controlQuestions).toHaveLength(5);
  expect(ragConfiguration.embedding.driver).toBe('openai');
  expect(ragConfiguration.embedding.model).toBe('text-embedding-3-small');
  expect(ragConfiguration.embedding.dimensions).toBe(1536);
  expect(ragConfiguration.answer.driver).toBe('openai');
  expect(ragConfiguration.answer.model).toBe('gpt-5-mini');
  expect(ragConfiguration.vector.driver).toBe('pgvector');
  expect(ragConfiguration.embeddingQueue.driver).toBe('postgresql');
  expect(ragConfiguration.limits.providerMaxAttempts).toBe(1);
  expect(ragConfiguration.limits.sessionProviderOperationLimit).toBe(13);
  if (process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE === '1') {
    expect(ragConfiguration.limits.sessionBudgetLimitEur).toBe(0.05);
    expect(process.env.BROWSER_REAL_AI_SESSION_ID).toMatch(/^[a-f0-9]{32}$/u);
  }
  expect(ragConfiguration.limits.rateLimitPerMinute).toBe(10);
  expect(ragConfiguration.limits.rateLimitPerDay).toBe(5);
  expect(ragConfiguration.limits.burstLimit).toBe(3);
  expect(ragConfiguration.limits.dailyBudgetEur).toBe(0.25);
  expect(ragConfiguration.limits.monthlyBudgetEur).toBe(1);
  expect(ragConfiguration.answer.maximumOutputTokens).toBe(512);
  expect(ragConfiguration.answer.maximumContextCharacters).toBe(1_500);
  expect(
    controlQuestions.every(
      (question) => question.text.length <= ragConfiguration.limits.queryMaximumCharacters,
    ),
  ).toBe(true);
  expect(documents.length + controlQuestions.length * 2).toBe(12);
  expect(documents.length + controlQuestions.length * 2).toBeLessThanOrEqual(
    ragConfiguration.limits.sessionProviderOperationLimit!,
  );

  const documentIds = new Map<(typeof documents)[number]['key'], string>();
  let estimatedAnswerCost = 0;
  try {
    if (process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE === '1') {
      await prisma.aiBudgetReservation.create({
        data: {
          id: 'prior-diagnostic-reservation-c4f7fa69818542e39e39d97f11d98161',
          companyId: tenantA.companyId,
          userId: tenantA.userId,
          provider: 'openai',
          correlationId: 'diagnostic-c4f7fa69818542e39e39d97f11d98161',
          idempotencyKey: 'rag_answer:diagnostic-c4f7fa69818542e39e39d97f11d98161',
          estimatedCostEur: 0.00109,
          status: 'FAILED',
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        },
      });
      const [carryover] = await prisma.$queryRaw<
        Array<{ operationCount: number; reservedCostEur: number }>
      >`
        SELECT COUNT(*)::int AS "operationCount",
          COALESCE(SUM("estimatedCostEur"), 0)::float8 AS "reservedCostEur"
        FROM "AiBudgetReservation"
        WHERE "companyId" = ${tenantA.companyId}
          AND "id" = 'prior-diagnostic-reservation-c4f7fa69818542e39e39d97f11d98161'
          AND "status" = 'FAILED'
      `;
      expect(carryover).toEqual({ operationCount: 1, reservedCostEur: 0.00109 });
    }

    await loginAs('identityManager');
    await page.goto('/ru/admin/documents');
    await expect(
      page.getByRole('heading', { level: 1, name: 'База знаний Avantime' }),
    ).toBeVisible();

    for (const document of documents) {
      const responsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/documents/upload' &&
          response.request().method() === 'POST',
      );
      await page.locator('input[type="file"]').setInputFiles({
        name: document.name,
        mimeType: 'application/pdf',
        buffer: createPdf(document.text),
      });
      const response = await responsePromise;
      expect(response.status()).toBe(202);
      const upload = (await response.json()) as { document?: { id?: string } };
      const documentId = upload.document?.id;
      expect(documentId).toBeTruthy();
      if (!documentId) throw new Error('Upload response did not include a document ID.');
      documentIds.set(document.key, documentId);
      expect((await services.metadata.findById(tenantA, documentId))?.status).toBe('QUEUED');
    }

    for (const [index, document] of documents.entries()) {
      const documentId = documentIds.get(document.key)!;
      expect(
        runOneJob('process-one-document-job.ts', `real-ai-document-${index + 1}`),
      ).toMatchObject({ outcome: 'COMPLETED' });
      const chunks = await services.processing.readChunks(tenantA, documentId);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.text.length).toBeLessThanOrEqual(3_000);
      expect(
        runOneJob('process-one-embedding-job.ts', `real-ai-embedding-${index + 1}`),
      ).toMatchObject({ outcome: 'COMPLETED' });
      await expect
        .poll(async () => (await services.metadata.findById(tenantA, documentId))?.embeddingStatus)
        .toBe('COMPLETED');
      const embedded = await services.metadata.findById(tenantA, documentId);
      expect(embedded?.embeddingModel).toBe(ragConfiguration.embedding.model);
      expect(embedded?.embeddingDimensions).toBe(ragConfiguration.embedding.dimensions);
      const extracted = await services.processing.readText(tenantA, documentId);
      expect(extracted).toContain('1C:ERP 2.5.14');
      expect(extracted).toContain(projectMarker);
      expect(extracted).toContain(document.fact);
    }

    const maintenanceId = documentIds.get('maintenance')!;
    const backupId = documentIds.get('backup')!;
    const answers = new Map<string, AskResult>();
    const direct = await askThroughUi(page, controlQuestions[0].text);
    answers.set('direct', direct);
    estimatedAnswerCost += direct.usage.estimatedCostEur;
    const directCitation = direct.citations.find(
      (citation) => citation.documentId === maintenanceId,
    );
    expect(directCitation, 'retrieval must find the expected maintenance passage').toBeTruthy();
    await expectSourceCitation(directCitation!, maintenanceId);
    expect(direct.answer, 'generation must state the source fact').toContain('21:45');

    const sourceLink = page.locator(`a[href^="/ru/portal/documents/${maintenanceId}?chunk="]`);
    await expect(sourceLink).toHaveCount(1);
    await sourceLink.click();
    await expect(page.getByRole('heading', { name: documents[0].name })).toBeVisible();
    await page.getByRole('tab', { name: 'Извлечённый текст' }).click();
    await expect(page.getByText(/21:45/u).last()).toBeVisible();
    expect((await page.request.get(`/api/documents/file?id=${maintenanceId}`)).status()).toBe(200);
    await page.goto('/ru/admin/documents');

    for (const question of controlQuestions.slice(1)) {
      await page.waitForTimeout(10_500);
      const result = await askThroughUi(page, question.text);
      answers.set(question.key, result);
      estimatedAnswerCost += result.usage.estimatedCostEur;
    }

    const paraphrase = answers.get('paraphrase')!;
    const paraphraseCitation = paraphrase.citations.find(
      (citation) => citation.documentId === maintenanceId,
    );
    expect(paraphraseCitation, 'paraphrased retrieval must find the same passage').toBeTruthy();
    await expectSourceCitation(paraphraseCitation!, maintenanceId);
    expect(paraphrase.answer).toContain('21:45');

    const combined = answers.get('combined')!;
    const combinedMaintenance = combined.citations.find(
      (citation) => citation.documentId === maintenanceId,
    );
    const combinedBackup = combined.citations.find((citation) => citation.documentId === backupId);
    expect(combinedMaintenance, 'combined retrieval must find maintenance source').toBeTruthy();
    expect(combinedBackup, 'combined retrieval must find backup source').toBeTruthy();
    await expectSourceCitation(combinedMaintenance!, maintenanceId);
    await expectSourceCitation(combinedBackup!, backupId);
    expect(combined.answer).toContain('21:45');
    expect(combined.answer).toMatch(/14\s*(?:days|дн(?:я|ей|ь)?)/iu);

    const unsupported = answers.get('absent')!;
    expect(
      unsupported.status === 'no_answer' ||
        /недостаточ|нет данных|не указано|не найдено|не могу определить/iu.test(unsupported.answer),
      'an unsupported fact must be explicitly declined',
    ).toBe(true);
    expect(unsupported.answer).not.toMatch(/\b(?:Get|Set|Update)-[A-Z][A-Za-z]+\b/u);

    const version = answers.get('version')!;
    expect(version.answer).not.toMatch(/1C:ERP 3\.0 (?:поддерживается|применима)/iu);
    expect(version.answer).toMatch(
      /недостаточ|не подтвержден|не указано|нет данных|нет оснований/iu,
    );
    expect(
      version.citations.every((citation) =>
        [maintenanceId, backupId].includes(citation.documentId ?? ''),
      ),
    ).toBe(true);
    console.info(
      JSON.stringify({
        event: 'real_ai_smoke_answers',
        results: controlQuestions.map((question) => ({
          question: question.text,
          expected:
            question.key === 'direct' || question.key === 'paraphrase'
              ? '21:45'
              : question.key === 'combined'
                ? '21:45 and 14 days'
                : question.key === 'absent'
                  ? 'Explicitly decline unsupported PowerShell cmdlet'
                  : 'Do not claim 1C:ERP 3.0 is supported',
          actual: answers.get(question.key)?.answer,
          status: answers.get(question.key)?.status,
          sources: answers.get(question.key)?.citations.map((citation) => ({
            documentId: citation.documentId,
            chunkId: citation.chunkId,
            link: citation.link,
            excerpt: citation.excerpt,
          })),
        })),
      }),
    );
    expect(estimatedAnswerCost).toBeLessThanOrEqual(0.25);

    await page.context().clearCookies();
    await loginAs('tenantB');
    const foreignSearch = await page.request.get(
      `/api/documents/search?q=${encodeURIComponent(projectMarker)}&mode=lexical`,
    );
    expect(foreignSearch.status()).toBe(200);
    const foreignSearchBody = (await foreignSearch.json()) as {
      results: Array<{ documentId: string; documentName: string; preview: string }>;
    };
    expect(foreignSearchBody.results).toHaveLength(0);

    for (const documentId of documentIds.values()) {
      for (const route of ['item', 'file']) {
        const response = await page.request.get(`/api/documents/${route}?id=${documentId}`);
        expect(response.status()).toBe(404);
        const body = await response.text();
        expect(body).not.toContain(projectMarker);
        expect(body).not.toContain('21:45');
        expect(body).not.toContain('14 days');
      }
    }

    const [ledger] = await prisma.$queryRaw<
      Array<{
        totalEstimatedCost: number;
        inputTokens: number;
        outputTokens: number;
        operationCount: number;
        openAiOperationCount: number;
        sessionProviderOperationCount: number;
        tenantBAnswerOperations: number;
      }>
    >`
      SELECT
        COALESCE(SUM(COALESCE("actualCostEur", "estimatedCostEur")), 0)::float8
          AS "totalEstimatedCost",
        COALESCE(SUM("inputTokens"), 0)::int AS "inputTokens",
        COALESCE(SUM("outputTokens"), 0)::int AS "outputTokens",
        COUNT(*)::int AS "operationCount",
        COUNT(*) FILTER (WHERE "provider" = 'openai')::int AS "openAiOperationCount",
        (COUNT(*) FILTER (WHERE "provider" IN ('openai', 'gemini')) + COALESCE((
          SELECT COUNT(*)::int FROM "AiBudgetReservation"
          WHERE "provider" IN ('openai', 'gemini')
            AND "status" IN ('FAILED', 'CANCELLED')
        ), 0))::int AS "sessionProviderOperationCount",
        COUNT(*) FILTER (
          WHERE "companyId" = ${browserIdentities.tenantB.companyId}
            AND "requestType" = 'rag_answer'
        )::int AS "tenantBAnswerOperations"
      FROM "AiUsageLedger"
      WHERE "companyId" IN (${tenantA.companyId}, ${browserIdentities.tenantB.companyId})
        AND "occurredAt" >= date_trunc('day', CURRENT_TIMESTAMP)
    `;
    expect(estimatedAnswerCost).toBeLessThanOrEqual(0.25);
    expect(ledger?.totalEstimatedCost ?? 0).toBeLessThanOrEqual(0.25);
    expect(ledger?.inputTokens ?? 0).toBeLessThanOrEqual(20_000);
    expect(ledger?.outputTokens ?? 0).toBeLessThanOrEqual(
      2_560,
    );
    const expectedProviderOperations = 12;
    const expectedSessionProviderOperations =
      expectedProviderOperations +
      (process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE === '1' ? 1 : 0);
    expect(ledger?.totalEstimatedCost ?? 0).toBeLessThanOrEqual(
      ragConfiguration.limits.sessionBudgetLimitEur ?? 0.25,
    );
    expect(ledger?.operationCount ?? 0).toBe(expectedProviderOperations);
    expect(ledger?.openAiOperationCount ?? 0).toBe(expectedProviderOperations);
    expect(ledger?.sessionProviderOperationCount ?? 0).toBe(expectedSessionProviderOperations);
    expect(ledger?.tenantBAnswerOperations ?? 0).toBe(0);
    console.info(
      JSON.stringify({
        event: 'real_ai_smoke_usage',
        embeddingModel: ragConfiguration.embedding.model,
        answerModel: ragConfiguration.answer.model,
        providerCalls: ledger?.openAiOperationCount ?? 0,
        sessionProviderOperations: ledger?.sessionProviderOperationCount ?? 0,
        inputTokens: ledger?.inputTokens ?? 0,
        outputTokens: ledger?.outputTokens ?? 0,
        estimatedCostEur: ledger?.totalEstimatedCost ?? 0,
      }),
    );
  } finally {
    for (const documentId of documentIds.values()) {
      await deleteDocument(tenantA, documentId, services).catch(() => undefined);
    }
    await cleanupDeletedDocuments(tenantA, services).catch(() => undefined);
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
