import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AiGatewayError,
  DefaultAiGateway,
  DeterministicFakeAiProvider,
  normalizeOpenAiBaseUrl,
  OpenAiGatewayProvider,
} from '../lib/ai-gateway';
import { MemoryAiCostController, MemoryAiRateLimiter } from '../lib/ai-control';
import { InMemoryAiOperationalEventSink } from '../lib/ai-observability';
import { loadRagConfiguration } from '../lib/rag-configuration';

const expectedUrl = 'https://api.openai.com/v1/responses';
const requestedModel = 'gpt-5-mini';
const budgetLimitEur = 0.01;
const maximumOutputTokens = 64;
const question = 'Reply exactly: 21:45.';
const instructions = 'Synthetic check. Return only the requested value.';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

type SafeUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeToken(value: unknown, maximumLength = 128) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
    ? value
    : undefined;
}

function safeParam(value: unknown) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 96 &&
    /^[A-Za-z0-9_.-]+$/u.test(value)
    ? value
    : undefined;
}

function responseUsage(value: unknown): SafeUsage | undefined {
  if (!isRecord(value)) return undefined;
  const inputTokens = value.input_tokens;
  const outputTokens = value.output_tokens;
  const totalTokens = value.total_tokens;
  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    (totalTokens !== undefined && !Number.isSafeInteger(totalTokens))
  ) {
    return undefined;
  }
  return {
    inputTokens: inputTokens as number,
    outputTokens: outputTokens as number,
    ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
  };
}

async function main() {
  const rootEnvironmentFile = path.join(repositoryRoot, '.env');
  const inheritedKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!inheritedKey && existsSync(rootEnvironmentFile)) {
    process.loadEnvFile(rootEnvironmentFile);
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is unavailable.');

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    BROWSER_REAL_AI_KB_SMOKE: '1',
    BROWSER_REAL_AI_DIAGNOSTIC_MODE: '1',
    DOCUMENT_EMBEDDING_DRIVER: 'fake',
    RAG_ANSWER_DRIVER: 'openai',
    RAG_ANSWER_MODEL: requestedModel,
    RAG_MAX_OUTPUT_TOKENS: String(maximumOutputTokens),
    AI_PROVIDER_MAX_ATTEMPTS: '1',
    AI_DAILY_BUDGET_EUR: '0.25',
    AI_MONTHLY_BUDGET_EUR: '1.00',
  };
  const baseUrl = normalizeOpenAiBaseUrl(environment.OPENAI_BASE_URL);
  const targetUrl = `${baseUrl}/responses`;
  const inputTokens = Math.ceil((question.length + instructions.length) / 4);
  const applicationEstimateEur = Number(
    (inputTokens * 0.000001 + maximumOutputTokens * 0.000004).toFixed(6),
  );
  const reservationEstimateEur = Number((applicationEstimateEur * 2).toFixed(6));
  const preflight = {
    keyPresent: true,
    keySource: inheritedKey ? 'inherited-process-environment' : 'repository-root-.env',
    model: requestedModel,
    method: 'POST',
    url: targetUrl,
    inputCharacters: question.length + instructions.length,
    estimatedInputTokens: inputTokens,
    maximumOutputTokens,
    applicationEstimateEur,
    conservativeReservationEstimateEur: reservationEstimateEur,
    separateBudgetLimitEur: budgetLimitEur,
    gatewayMaxAttempts: 1,
    sdkMaxRetries: 0,
  };

  if (
    targetUrl !== expectedUrl ||
    environment.RAG_ANSWER_MODEL !== requestedModel ||
    environment.AI_PROVIDER_MAX_ATTEMPTS !== '1' ||
    reservationEstimateEur <= 0 ||
    reservationEstimateEur > budgetLimitEur
  ) {
    throw new Error('Diagnostic preflight rejected the URL, model, retry count, or budget.');
  }
  if (process.argv.includes('--preflight-only')) {
    console.log(JSON.stringify({ mode: 'preflight-only', ...preflight }, null, 2));
    return;
  }

  process.env.BROWSER_REAL_AI_KB_SMOKE = '1';
  process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE = '1';
  const sessionId = randomUUID().replaceAll('-', '');
  const artifactDirectory = path.join(
    repositoryRoot,
    '.artifacts',
    `openai-responses-path-diagnostic-${sessionId}`,
  );
  await mkdir(artifactDirectory, { recursive: false, mode: 0o700 });

  let outboundAttempts = 0;
  let httpStatus: number | undefined;
  let responseStatus: string | undefined;
  let requestId: string | undefined;
  let providerErrorType: string | undefined;
  let providerErrorCode: string | undefined;
  let providerErrorParam: string | undefined;
  let bodyUsage: SafeUsage | undefined;
  let answer: string | undefined;
  let returnedUsage:
    { inputTokens: number; outputTokens: number; estimatedCostEur: number } | undefined;
  let safeGatewayError:
    { code: string; type?: string; providerCode?: string; requestId?: string } | undefined;

  const configuration = loadRagConfiguration(environment);
  const events = new InMemoryAiOperationalEventSink();
  const provider = new OpenAiGatewayProvider(apiKey, async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const parsedUrl = new URL(request.url);
    const safeUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
    if (
      request.method !== 'POST' ||
      safeUrl !== expectedUrl ||
      parsedUrl.search ||
      parsedUrl.hash ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error('Diagnostic request target did not match the approved endpoint.');
    }
    if (outboundAttempts >= 1) {
      throw new Error('Diagnostic outbound operation cap exceeded.');
    }
    outboundAttempts += 1;
    const response = await globalThis.fetch(input, init);
    httpStatus = response.status;
    requestId = safeToken(response.headers.get('x-request-id'));
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    if (isRecord(body)) {
      responseStatus = safeToken(body.status);
      bodyUsage = responseUsage(body.usage);
      if (isRecord(body.error)) {
        providerErrorType = safeToken(body.error.type);
        providerErrorCode = safeToken(body.error.code);
        providerErrorParam = safeParam(body.error.param);
      }
    }
    return response;
  });
  const gateway = new DefaultAiGateway(
    configuration,
    new DeterministicFakeAiProvider(),
    provider,
    events,
    undefined,
    {
      rateLimiter: new MemoryAiRateLimiter(),
      costController: new MemoryAiCostController(
        configuration.limits.dailyBudgetEur,
        configuration.limits.monthlyBudgetEur,
        undefined,
        1,
        budgetLimitEur,
      ),
    },
  );

  try {
    const result = await gateway.generateRagAnswer({
      tenant: { companyId: 'synthetic-diagnostic', userId: 'synthetic-diagnostic' },
      question,
      language: 'en',
      systemInstructions: instructions,
      maximumOutputTokens,
      sources: [],
      correlationId: `path-diagnostic-${sessionId}`,
    });
    answer = result.answer;
    returnedUsage = {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      estimatedCostEur: result.usage.estimatedCostEur,
    };
  } catch (error) {
    const gatewayError = error instanceof AiGatewayError ? error : undefined;
    const diagnostic = gatewayError?.providerDiagnostic;
    safeGatewayError = {
      code: gatewayError?.code ?? 'AI_DIAGNOSTIC_FAILED',
      ...((providerErrorType ?? diagnostic?.providerErrorType)
        ? { type: providerErrorType ?? diagnostic?.providerErrorType }
        : {}),
      ...((providerErrorCode ?? diagnostic?.providerErrorCode)
        ? { providerCode: providerErrorCode ?? diagnostic?.providerErrorCode }
        : {}),
      ...((requestId ?? diagnostic?.providerRequestId)
        ? { requestId: requestId ?? diagnostic?.providerRequestId }
        : {}),
    };
  }

  const event = events.list().find((item) => item.name === 'provider_call');
  const diagnostic = event?.providerDiagnostic;
  const usageCostEstimateEur = bodyUsage
    ? Number((bodyUsage.inputTokens * 0.000001 + bodyUsage.outputTokens * 0.000004).toFixed(6))
    : null;
  const result = {
    sessionId,
    attemptedAt: new Date().toISOString(),
    ...preflight,
    outboundAttempts,
    httpStatus: httpStatus ?? null,
    responseStatus: responseStatus ?? null,
    hasNonEmptyText: Boolean(answer?.trim()),
    usage: returnedUsage
      ? {
          inputTokens: returnedUsage.inputTokens,
          outputTokens: returnedUsage.outputTokens,
          providerReportedTokens: bodyUsage ?? null,
          applicationUsageCostEstimateEur: returnedUsage.estimatedCostEur,
          actualCostEur: null,
        }
      : bodyUsage
        ? {
            providerReportedTokens: bodyUsage,
            applicationUsageCostEstimateEur: usageCostEstimateEur,
            actualCostEur: null,
          }
        : null,
    reservationEstimateEur: event?.reservedCostEur ?? reservationEstimateEur,
    error: safeGatewayError
      ? {
          ...safeGatewayError,
          type:
            providerErrorType ??
            diagnostic?.providerErrorType ??
            diagnostic?.responseErrorType ??
            null,
          providerCode:
            providerErrorCode ??
            diagnostic?.providerErrorCode ??
            diagnostic?.responseErrorCode ??
            null,
          param: providerErrorParam ?? null,
          incompleteReason: diagnostic?.incompleteReason ?? null,
          requestId: requestId ?? diagnostic?.providerRequestId ?? null,
        }
      : null,
  };
  const outputPath = path.join(artifactDirectory, 'result.json');
  await writeFile(outputPath, JSON.stringify(result, null, 2), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    JSON.stringify({ ...result, artifact: path.relative(repositoryRoot, outputPath) }, null, 2),
  );
  if (outboundAttempts !== 1 || !answer?.trim()) process.exitCode = 1;
}

main().catch(() => {
  console.error(
    JSON.stringify({ event: 'openai_responses_path_diagnostic', status: 'preflight_failed' }),
  );
  process.exitCode = 1;
});
