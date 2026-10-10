import { readFile } from 'node:fs/promises';
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
  REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR,
  REAL_AI_DIAGNOSTIC_OUTPUT_TOKEN_LIMIT,
  REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT,
} from '../../scripts/real-ai-budget';
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
      `Instructions for 1C:ERP 2.5.14 only. Project marker: ${projectMarker}. ` +
      'Nightly maintenance starts at 21:45.',
    fact: '21:45',
  },
  {
    key: 'backup',
    name: `${projectMarker}-1C-ERP-2.5.14-backup-retention.pdf`,
    text:
      `Instructions for 1C:ERP 2.5.14 only. Project marker: ${projectMarker}. ` +
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

async function recordSemanticCheck(
  failures: string[],
  label: string,
  check: () => Promise<void> | void,
) {
  try {
    await check();
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  expect(ragConfiguration.limits.sessionProviderOperationLimit).toBe(
    REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT,
  );
  if (process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE === '1') {
    expect(ragConfiguration.limits.sessionBudgetLimitEur).toBe(REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR);
    expect(process.env.BROWSER_REAL_AI_SESSION_ID).toMatch(/^[a-f0-9]{32}$/u);
  }
  expect(ragConfiguration.limits.rateLimitPerMinute).toBe(10);
  expect(ragConfiguration.limits.rateLimitPerDay).toBe(5);
  expect(ragConfiguration.limits.burstLimit).toBe(3);
  expect(ragConfiguration.limits.dailyBudgetEur).toBe(0.25);
  expect(ragConfiguration.limits.monthlyBudgetEur).toBe(1);
  expect(ragConfiguration.answer.maximumOutputTokens).toBe(REAL_AI_DIAGNOSTIC_OUTPUT_TOKEN_LIMIT);
  expect(ragConfiguration.answer.maximumContextCharacters).toBe(1_500);
  expect(
    controlQuestions.every(
      (question) => question.text.length <= ragConfiguration.limits.queryMaximumCharacters,
    ),
  ).toBe(true);
  expect(documents.every((document) => Buffer.byteLength(document.text, 'utf8') <= 512)).toBe(true);
  expect(
    controlQuestions.every((question) => Buffer.byteLength(question.text, 'utf8') <= 256),
  ).toBe(true);
  expect(
    documents.reduce((total, document) => total + Buffer.byteLength(document.text, 'utf8'), 0),
  ).toBeLessThanOrEqual(512);
  expect(documents.length + controlQuestions.length * 2).toBe(12);
  expect(documents.length + controlQuestions.length * 2).toBeLessThanOrEqual(
    ragConfiguration.limits.sessionProviderOperationLimit!,
  );

  const documentIds = new Map<(typeof documents)[number]['key'], string>();
  const expectedProviderStages: string[] = [];
  const semanticFailures: string[] = [];
  let observedProviderStages: string[] = [];
  let providerTokenEstimatedCostEur = 0;
  let estimatedAnswerCost = 0;
  const assertProviderOperationHeadroom = (upcomingOperations: number) => {
    expect(expectedProviderStages.length + upcomingOperations).toBeLessThanOrEqual(
      REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT,
    );
  };
  const verifyProviderAccounting = async () => {
    const requestedAnswers = expectedProviderStages.filter(
      (stage) => stage === 'query_embedding',
    ).length;
    const requiredAnswerGenerations = expectedProviderStages.filter(
      (stage) => stage === 'rag_answer',
    ).length;
    const usage = await prisma.$queryRaw<
      Array<{
        requestType: string;
        operationCount: number;
        inputTokens: number;
        outputTokens: number;
        estimatedCostEur: number;
      }>
    >`
      SELECT
        "requestType",
        COUNT(*)::int AS "operationCount",
        COALESCE(SUM("inputTokens"), 0)::int AS "inputTokens",
        COALESCE(SUM("outputTokens"), 0)::int AS "outputTokens",
        COALESCE(SUM("estimatedCostEur"), 0)::float8 AS "estimatedCostEur"
      FROM "AiUsageLedger"
      WHERE "companyId" = ${tenantA.companyId} AND "provider" = 'openai'
      GROUP BY "requestType" ORDER BY "requestType"
    `;

    const eventPath = browserServerEnvironment.BROWSER_REAL_AI_DIAGNOSTICS_FILE;
    expect(eventPath).toBeTruthy();
    const events = (await readFile(eventPath!, 'utf8'))
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const providerEvents = events.filter((event) => event.name === 'provider_call');
    expect(providerEvents.length).toBeLessThanOrEqual(REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT);
    expect(providerEvents.every((event) => event.companyId === tenantA.companyId)).toBe(true);
    expect(providerEvents.every((event) => event.outcome === 'success')).toBe(true);
    expect(providerEvents.every((event) => event.actualCostEur === null)).toBe(true);
    expect(
      providerEvents.every(
        (event) =>
          (event.providerDiagnostic as { attemptCount?: number } | undefined)?.attemptCount === 1,
      ),
    ).toBe(true);
    observedProviderStages = providerEvents.map(
      (event) => (event.providerDiagnostic as { stage?: string } | undefined)?.stage ?? 'unknown',
    );
    providerTokenEstimatedCostEur = providerEvents.reduce(
      (total, event) => total + Number(event.estimatedCostEur ?? 0),
      0,
    );
    const observedCount = (stage: string) =>
      observedProviderStages.filter((observed) => observed === stage).length;
    expect(observedCount('document_embedding')).toBe(
      expectedProviderStages.filter((stage) => stage === 'document_embedding').length,
    );
    expect(observedCount('query_embedding')).toBe(requestedAnswers);
    expect(observedCount('rag_answer')).toBeGreaterThanOrEqual(requiredAnswerGenerations);
    expect(observedCount('rag_answer')).toBeLessThanOrEqual(requestedAnswers);
    expect(
      observedProviderStages.every((stage) =>
        ['document_embedding', 'query_embedding', 'rag_answer'].includes(stage),
      ),
    ).toBe(true);
    const eventUsage = [...new Set(observedProviderStages)]
      .map((stage) => {
        const stageEvents = providerEvents.filter(
          (event) => (event.providerDiagnostic as { stage?: string } | undefined)?.stage === stage,
        );
        return {
          requestType: stage,
          operationCount: stageEvents.length,
          inputTokens: stageEvents.reduce(
            (total, event) => total + Number(event.inputTokens ?? 0),
            0,
          ),
          outputTokens: stageEvents.reduce(
            (total, event) => total + Number(event.outputTokens ?? 0),
            0,
          ),
          estimatedCostEur: stageEvents.reduce(
            (total, event) =>
              total +
              Math.max(
                Number(event.reservedCostEur ?? 0),
                Number((Number(event.estimatedCostEur ?? 0) * 2).toFixed(6)),
              ),
            0,
          ),
        };
      })
      .sort((left, right) => left.requestType.localeCompare(right.requestType));
    expect(
      usage.map((operation) => ({
        requestType: operation.requestType,
        operationCount: operation.operationCount,
        inputTokens: operation.inputTokens,
        outputTokens: operation.outputTokens,
      })),
    ).toEqual(
      eventUsage.map((operation) => ({
        requestType: operation.requestType,
        operationCount: operation.operationCount,
        inputTokens: operation.inputTokens,
        outputTokens: operation.outputTokens,
      })),
    );
    for (const [index, operation] of usage.entries()) {
      expect(operation.estimatedCostEur).toBeCloseTo(eventUsage[index]!.estimatedCostEur, 9);
    }

    const [reservations] = await prisma.$queryRaw<
      Array<{
        reservationCount: number;
        reservedCostEur: number;
        unreconciledCount: number;
        unreconciledReservedCostEur: number;
      }>
    >`
      SELECT
        COUNT(*)::int AS "reservationCount",
        COALESCE(SUM("estimatedCostEur"), 0)::float8 AS "reservedCostEur",
        COUNT(*) FILTER (WHERE "status" <> 'RECONCILED')::int AS "unreconciledCount",
        COALESCE(SUM("estimatedCostEur") FILTER (WHERE "status" <> 'RECONCILED'), 0)::float8
          AS "unreconciledReservedCostEur"
      FROM "AiBudgetReservation"
      WHERE "companyId" = ${tenantA.companyId} AND "provider" = 'openai'
    `;
    expect(reservations?.reservationCount ?? 0).toBe(providerEvents.length);
    expect(reservations?.unreconciledCount ?? 0).toBe(0);
    expect(reservations?.reservedCostEur ?? 0).toBeCloseTo(
      providerEvents.reduce((total, event) => total + Number(event.reservedCostEur ?? 0), 0),
      9,
    );
    const budgetImpactEur = usage.reduce(
      (total, operation) => total + operation.estimatedCostEur,
      reservations?.unreconciledReservedCostEur ?? 0,
    );
    expect(budgetImpactEur).toBeLessThanOrEqual(REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR);
  };
  try {
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
      assertProviderOperationHeadroom(1);
      expect(
        runOneJob('process-one-embedding-job.ts', `real-ai-embedding-${index + 1}`),
      ).toMatchObject({ outcome: 'COMPLETED' });
      expectedProviderStages.push('document_embedding');
      await verifyProviderAccounting();
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
    assertProviderOperationHeadroom(2);
    const directResult = await askThroughUi(page, controlQuestions[0].text);
    answers.set('direct', directResult);
    estimatedAnswerCost += directResult.usage.estimatedCostEur;
    expectedProviderStages.push('query_embedding');
    if (directResult.status === 'answered') expectedProviderStages.push('rag_answer');
    await verifyProviderAccounting();

    for (const question of controlQuestions.slice(1)) {
      await page.waitForTimeout(10_500);
      assertProviderOperationHeadroom(2);
      const result = await askThroughUi(page, question.text);
      answers.set(question.key, result);
      estimatedAnswerCost += result.usage.estimatedCostEur;
      expectedProviderStages.push('query_embedding');
      if (result.status === 'answered') expectedProviderStages.push('rag_answer');
      await verifyProviderAccounting();
    }

    const direct = answers.get('direct')!;
    await recordSemanticCheck(semanticFailures, 'direct answer and citation', async () => {
      expect(direct.status).toBe('answered');
      expect(direct.answer).toContain('21:45');
      const citation = direct.citations.find((item) => item.documentId === maintenanceId);
      expect(citation).toBeTruthy();
      if (citation) await expectSourceCitation(citation, maintenanceId);
    });
    await recordSemanticCheck(semanticFailures, 'direct citation UI and source page', async () => {
      const sourceLink = page.locator(`a[href^="/ru/portal/documents/${maintenanceId}?chunk="]`);
      await expect(sourceLink).toHaveCount(1);
      await sourceLink.click();
      await expect(page.getByRole('heading', { name: documents[0].name })).toBeVisible();
      await page.getByRole('tab', { name: 'Извлечённый текст' }).click();
      await expect(page.getByText(/21:45/u).last()).toBeVisible();
      expect((await page.request.get(`/api/documents/file?id=${maintenanceId}`)).status()).toBe(
        200,
      );
    });
    await page.goto('/ru/admin/documents');

    const paraphrase = answers.get('paraphrase')!;
    await recordSemanticCheck(semanticFailures, 'paraphrase answer and citation', async () => {
      expect(paraphrase.status).toBe('answered');
      expect(paraphrase.answer).toContain('21:45');
      const citation = paraphrase.citations.find((item) => item.documentId === maintenanceId);
      expect(citation).toBeTruthy();
      if (citation) await expectSourceCitation(citation, maintenanceId);
    });

    const combined = answers.get('combined')!;
    await recordSemanticCheck(semanticFailures, 'combined answer and citations', async () => {
      expect(combined.status).toBe('answered');
      expect(combined.answer).toContain('21:45');
      expect(combined.answer).toMatch(/14\s*(?:days|дн(?:я|ей|ь)?)/iu);
      const maintenanceCitation = combined.citations.find(
        (citation) => citation.documentId === maintenanceId,
      );
      const backupCitation = combined.citations.find(
        (citation) => citation.documentId === backupId,
      );
      expect(maintenanceCitation).toBeTruthy();
      expect(backupCitation).toBeTruthy();
      if (maintenanceCitation) await expectSourceCitation(maintenanceCitation, maintenanceId);
      if (backupCitation) await expectSourceCitation(backupCitation, backupId);
    });

    const unsupported = answers.get('absent')!;
    await recordSemanticCheck(semanticFailures, 'unsupported fact refusal', () => {
      expect(
        unsupported.status === 'no_answer' ||
          /недостаточ|нет данных|не указано|не найдено|не могу определить/iu.test(
            unsupported.answer,
          ),
      ).toBe(true);
      expect(unsupported.answer).not.toMatch(/\b(?:Get|Set|Update)-[A-Z][A-Za-z]+\b/u);
    });

    const version = answers.get('version')!;
    await recordSemanticCheck(semanticFailures, 'version-scope refusal', () => {
      expect(version.answer).not.toMatch(/1C:ERP 3\.0 (?:поддерживается|применима)/iu);
      expect(version.answer).toMatch(
        /недостаточ|не подтвержден|не указано|нет данных|нет оснований/iu,
      );
      expect(
        version.citations.every((citation) =>
          [maintenanceId, backupId].includes(citation.documentId ?? ''),
        ),
      ).toBe(true);
    });
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
    expect(estimatedAnswerCost).toBeLessThanOrEqual(REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR);

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
        ledgerEstimateEur: number;
        inputTokens: number;
        outputTokens: number;
        operationCount: number;
        openAiOperationCount: number;
        sessionProviderOperationCount: number;
        tenantBAnswerOperations: number;
        actualCostEur: number;
        knownActualCostOperationCount: number;
        unknownActualCostOperationCount: number;
        reservationCount: number;
        reservedCostEur: number;
        unreconciledReservedCostEur: number;
      }>
    >`
      SELECT
        COALESCE(SUM(COALESCE("actualCostEur", "estimatedCostEur")), 0)::float8
          AS "totalEstimatedCost",
        COALESCE(SUM("estimatedCostEur"), 0)::float8 AS "ledgerEstimateEur",
        COALESCE(SUM("inputTokens"), 0)::int AS "inputTokens",
        COALESCE(SUM("outputTokens"), 0)::int AS "outputTokens",
        COALESCE(SUM("actualCostEur"), 0)::float8 AS "actualCostEur",
        COUNT(*) FILTER (WHERE "actualCostEur" IS NOT NULL)::int
          AS "knownActualCostOperationCount",
        COUNT(*) FILTER (WHERE "actualCostEur" IS NULL)::int
          AS "unknownActualCostOperationCount",
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
        )::int AS "tenantBAnswerOperations",
        (SELECT COUNT(*)::int FROM "AiBudgetReservation"
          WHERE "companyId" IN (${tenantA.companyId}, ${browserIdentities.tenantB.companyId})
            AND "provider" = 'openai') AS "reservationCount",
        (SELECT COALESCE(SUM("estimatedCostEur"), 0)::float8 FROM "AiBudgetReservation"
          WHERE "companyId" IN (${tenantA.companyId}, ${browserIdentities.tenantB.companyId})
            AND "provider" = 'openai') AS "reservedCostEur",
        (SELECT COALESCE(SUM("estimatedCostEur"), 0)::float8 FROM "AiBudgetReservation"
          WHERE "companyId" IN (${tenantA.companyId}, ${browserIdentities.tenantB.companyId})
            AND "provider" = 'openai' AND "status" <> 'RECONCILED')
          AS "unreconciledReservedCostEur"
      FROM "AiUsageLedger"
      WHERE "companyId" IN (${tenantA.companyId}, ${browserIdentities.tenantB.companyId})
        AND "occurredAt" >= date_trunc('day', CURRENT_TIMESTAMP)
    `;
    expect(estimatedAnswerCost).toBeLessThanOrEqual(REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR);
    expect(ledger?.totalEstimatedCost ?? 0).toBeLessThanOrEqual(
      REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR,
    );
    expect(ledger?.inputTokens ?? 0).toBeLessThanOrEqual(20_000);
    expect(ledger?.outputTokens ?? 0).toBeLessThanOrEqual(2_560);
    const expectedProviderOperations = observedProviderStages.length;
    expect(expectedProviderOperations).toBeLessThanOrEqual(
      REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT,
    );
    expect(ledger?.totalEstimatedCost ?? 0).toBeLessThanOrEqual(
      ragConfiguration.limits.sessionBudgetLimitEur ?? 0.25,
    );
    expect(ledger?.operationCount ?? 0).toBe(expectedProviderOperations);
    expect(ledger?.openAiOperationCount ?? 0).toBe(expectedProviderOperations);
    expect(ledger?.sessionProviderOperationCount ?? 0).toBe(expectedProviderOperations);
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
        tokenEstimatedCostEur: providerTokenEstimatedCostEur,
        ledgerEstimateEur: ledger?.ledgerEstimateEur ?? 0,
        actualCostEur:
          (ledger?.unknownActualCostOperationCount ?? 0) > 0 ? null : (ledger?.actualCostEur ?? 0),
        knownActualCostOperationCount: ledger?.knownActualCostOperationCount ?? 0,
        unknownActualCostOperationCount: ledger?.unknownActualCostOperationCount ?? 0,
        reservationCount: ledger?.reservationCount ?? 0,
        reservedCostEur: ledger?.reservedCostEur ?? 0,
        unreconciledReservedCostEur: ledger?.unreconciledReservedCostEur ?? 0,
        semanticFailures,
      }),
    );
    expect(ledger?.reservationCount ?? 0).toBe(expectedProviderOperations);
    expect(ledger?.unreconciledReservedCostEur ?? 0).toBe(0);
    expect(semanticFailures, 'all five answers and source checks must pass').toEqual([]);
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
