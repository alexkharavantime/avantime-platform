import { isIP } from 'node:net';

import type { EnvironmentMap } from './staging-go-live';

export type ProviderValidationSummary = {
  provider: 'fake' | 'openai' | 'gemini';
  embeddingModel: string;
  answerModel: string;
  dimensions: number;
  timeoutMs: number;
  credentialsPresent: boolean;
  connectivity: 'not_requested' | 'pending';
};

function required(environment: EnvironmentMap, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for staging provider validation.`);
  return value;
}

function assertEndpoint(name: string, raw: string, allowedHosts: readonly string[]) {
  const url = new URL(raw);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    isIP(hostname) !== 0 ||
    !allowedHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))
  ) {
    throw new Error(`${name} is outside the provider endpoint allowlist.`);
  }
}

export function validateStagingProviderConfiguration(
  environment: EnvironmentMap = process.env,
): ProviderValidationSummary {
  const provider = required(environment, 'STAGING_PROVIDER_MODE');
  if (!['fake', 'openai', 'gemini'].includes(provider)) {
    throw new Error('STAGING_PROVIDER_MODE is invalid.');
  }
  if (provider === 'fake' && environment.STAGING_ALLOW_FAKE_PROVIDER !== 'true') {
    throw new Error('Fake staging provider requires an explicit override.');
  }
  if (provider === 'openai') {
    assertEndpoint('OPENAI_BASE_URL', environment.OPENAI_BASE_URL || 'https://api.openai.com', [
      'api.openai.com',
    ]);
  }
  if (provider === 'gemini') {
    assertEndpoint(
      'GEMINI_BASE_URL',
      environment.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
      ['generativelanguage.googleapis.com'],
    );
  }
  const dimensions = Number.parseInt(required(environment, 'DOCUMENT_EMBEDDING_DIMENSIONS'), 10);
  const timeoutMs = Number.parseInt(required(environment, 'DOCUMENT_EMBEDDING_TIMEOUT_MS'), 10);
  if (!Number.isInteger(dimensions) || dimensions < 8 || dimensions > 16_384) {
    throw new Error('DOCUMENT_EMBEDDING_DIMENSIONS is invalid.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error('DOCUMENT_EMBEDDING_TIMEOUT_MS is invalid.');
  }
  const credentialsPresent =
    provider === 'fake' ||
    (provider === 'openai'
      ? Boolean(environment.OPENAI_API_KEY?.trim())
      : Boolean(environment.GOOGLE_GENERATIVE_AI_API_KEY?.trim()));
  if (provider !== 'fake' && !credentialsPresent) {
    throw new Error('Selected staging provider credentials are missing.');
  }
  return {
    provider: provider as ProviderValidationSummary['provider'],
    embeddingModel: required(environment, 'DOCUMENT_EMBEDDING_MODEL'),
    answerModel: required(environment, 'RAG_ANSWER_MODEL'),
    dimensions,
    timeoutMs,
    credentialsPresent,
    connectivity: 'not_requested',
  };
}

export function assertProviderConnectivityAuthorized(
  environment: EnvironmentMap,
  environmentId: string,
) {
  if (
    environment.STAGING_PROVIDER_CONNECTIVITY_CONFIRMATION !== `PROVIDER_CHECK:${environmentId}`
  ) {
    throw new Error('Provider connectivity requires exact staging confirmation.');
  }
  if (!environment.STAGING_PROVIDER_BUDGET_RESERVATION_ID?.trim()) {
    throw new Error('Provider connectivity requires a cost reservation.');
  }
}
