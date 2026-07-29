import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createStagingTestAlert, NoopStagingAlertAdapter } from '../lib/staging-alerts';
import {
  assertApprovalWasExternallyRecorded,
  assertNoProductionSecretReuse,
  calculateSha256,
  createPendingApprovals,
  evaluateGoLive,
  sanitizeEvidence,
  secretFingerprint,
  validateSbomChecksum,
  validateStagingConfiguration,
  validateVulnerabilityException,
} from '../lib/staging-go-live';
import {
  assertProviderConnectivityAuthorized,
  validateStagingProviderConfiguration,
} from '../lib/staging-provider-validation';
import {
  EnvironmentStagingSecretProvider,
  loadRequiredStagingSecrets,
} from '../lib/staging-secrets';
import { evaluateTlsValidation, validateTlsHostname } from '../lib/staging-tls';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function stagingEnvironment() {
  return {
    DEPLOYMENT_ENVIRONMENT: 'staging',
    STAGING_ENVIRONMENT_ID: 'staging-eu-test',
    STAGING_LABEL: 'staging eu test',
    STAGING_TENANT_ALLOWLIST: 'staging-tenant-en,staging-tenant-lv,staging-tenant-ru',
    STAGING_TLS_HOSTNAME: 'staging.avantime.invalid',
    STAGING_FORBIDDEN_PRODUCTION_HOSTS: 'app.avantime.example,api.avantime.example',
    STAGING_PROVIDER_MODE: 'fake',
    STAGING_ALLOW_FAKE_PROVIDER: 'true',
    STAGING_SECRETS_SOURCE: 'file',
    APP_URL: 'https://staging.avantime.invalid',
    DATABASE_URL:
      'postgresql://staging_user:staging_password@staging-db.avantime.invalid/staging?sslmode=verify-full',
    REDIS_URL: 'rediss://staging_user:staging_password@staging-redis.avantime.invalid/0',
    OBJECT_STORAGE_ENDPOINT: 'https://staging-objects.avantime.invalid',
    OBJECT_STORAGE_BUCKET: 'avantime-staging-documents',
    BACKUP_OBJECT_STORAGE_BUCKET: 'avantime-staging-backups',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://staging-otel.avantime.invalid',
    STAGING_ALERT_DESTINATION: 'https://staging-alerts.avantime.invalid/hook',
    DOCUMENT_STORAGE_DRIVER: 's3',
    DOCUMENT_METADATA_DRIVER: 'postgresql',
    DOCUMENT_PROCESSING_QUEUE_DRIVER: 'external',
    DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'redis',
    DOCUMENT_VECTOR_DRIVER: 'pgvector',
    AI_RATE_LIMIT_DRIVER: 'redis',
    AI_COST_LEDGER_DRIVER: 'postgresql',
    DOCUMENT_EMBEDDING_MODEL: 'deterministic-staging-v1',
    DOCUMENT_EMBEDDING_DIMENSIONS: '32',
    DOCUMENT_EMBEDDING_TIMEOUT_MS: '5000',
    RAG_ANSWER_MODEL: 'deterministic-answer-staging-v1',
  };
}

function validTlsInput() {
  return {
    hostname: 'staging.avantime.invalid',
    subjectAlternativeNames: 'DNS:staging.avantime.invalid',
    validFrom: '2026-07-01T00:00:00.000Z',
    validTo: '2026-12-01T00:00:00.000Z',
    protocol: 'TLSv1.3',
    cipherName: 'TLS_AES_256_GCM_SHA384',
    hsts: 'max-age=31536000; includeSubDomains',
    redirectsToHttps: true,
    internalEndpointsPublic: false,
  };
}

test('staging rejects a production URL', () => {
  assert.throws(() =>
    validateStagingConfiguration({
      ...stagingEnvironment(),
      OBJECT_STORAGE_ENDPOINT: 'https://app.avantime.example',
    }),
  );
  assert.throws(() =>
    validateStagingConfiguration({
      ...stagingEnvironment(),
      REDIS_URL: 'rediss://user:password@redis.production.example/0',
    }),
  );
});

test('staging rejects a placeholder critical value', () => {
  assert.throws(() =>
    validateStagingConfiguration({
      ...stagingEnvironment(),
      STAGING_ENVIRONMENT_ID: '<replace-me>',
    }),
  );
});

test('production secret reuse is detected by fingerprint without exposing the value', () => {
  const reused = 'unique-secret-used-in-production-123456789';
  assert.throws(
    () =>
      assertNoProductionSecretReuse(
        { SESSION_SECRET: reused },
        new Set([secretFingerprint(reused)]),
      ),
    /SESSION_SECRET reuses a production secret/,
  );
});

test('TLS hostname validation rejects local and malformed names', () => {
  assert.equal(validateTlsHostname('staging.avantime.invalid'), 'staging.avantime.invalid');
  assert.throws(() => validateTlsHostname('localhost'));
  assert.throws(() => validateTlsHostname('https://staging.avantime.invalid'));
});

test('certificate expiry thresholds are blocking before the minimum', () => {
  const result = evaluateTlsValidation(
    {
      ...validTlsInput(),
      validTo: '2026-08-03T00:00:00.000Z',
    },
    { now: new Date('2026-07-29T00:00:00.000Z') },
  );
  assert.equal(result.checks.hostnameMatch, true);
  assert.equal(result.checks.expiryMinimum, false);
  assert.equal(result.status, 'failed');
});

test('TLS policy rejects downgrade, weak cipher, missing HSTS and public internals', () => {
  const result = evaluateTlsValidation(
    {
      ...validTlsInput(),
      protocol: 'TLSv1.1',
      cipherName: 'DES-CBC3-SHA',
      hsts: null,
      redirectsToHttps: false,
      internalEndpointsPublic: true,
    },
    { now: new Date('2026-07-29T00:00:00.000Z') },
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.checks.protocolAllowed, false);
  assert.equal(result.checks.internalEndpointsPrivate, false);
});

test('provider endpoint allowlist rejects private or non-provider endpoints', () => {
  assert.throws(() =>
    validateStagingProviderConfiguration({
      ...stagingEnvironment(),
      STAGING_PROVIDER_MODE: 'openai',
      OPENAI_API_KEY: 'staging-openai-key-with-safe-test-length',
      OPENAI_BASE_URL: 'https://127.0.0.1/v1',
    }),
  );
  assert.throws(() =>
    validateStagingProviderConfiguration({
      ...stagingEnvironment(),
      STAGING_PROVIDER_MODE: 'gemini',
      GOOGLE_GENERATIVE_AI_API_KEY: 'staging-gemini-key-with-safe-test-length',
      GEMINI_BASE_URL: 'https://example.com',
    }),
  );
});

test('provider connectivity requires explicit confirmation and cost reservation', () => {
  assert.throws(() => assertProviderConnectivityAuthorized({}, 'staging-eu-test'));
  assert.throws(() =>
    assertProviderConnectivityAuthorized(
      {
        STAGING_PROVIDER_CONNECTIVITY_CONFIRMATION: 'PROVIDER_CHECK:staging-eu-test',
      },
      'staging-eu-test',
    ),
  );
  assert.doesNotThrow(() =>
    assertProviderConnectivityAuthorized(
      {
        STAGING_PROVIDER_CONNECTIVITY_CONFIRMATION: 'PROVIDER_CHECK:staging-eu-test',
        STAGING_PROVIDER_BUDGET_RESERVATION_ID: 'reservation-1',
      },
      'staging-eu-test',
    ),
  );
});

test('staging tenant allowlist requires multiple staging-scoped tenants', () => {
  assert.throws(() =>
    validateStagingConfiguration({
      ...stagingEnvironment(),
      STAGING_TENANT_ALLOWLIST: 'tenant-production',
    }),
  );
  assert.equal(validateStagingConfiguration(stagingEnvironment()).tenantAllowlist.length, 3);
});

test('evidence package recursively sanitizes credentials and content', () => {
  const sanitized = sanitizeEvidence({
    status: 'partial',
    password: 'must-not-survive',
    nested: {
      documentText: 'private text',
      endpoint: 'postgresql://user:password@db.example/staging',
    },
  });
  assert.deepEqual(sanitized, {
    status: 'partial',
    password: '[REDACTED]',
    nested: {
      documentText: '[REDACTED]',
      endpoint: '[REDACTED]',
    },
  });
});

test('approval cannot be auto-marked', () => {
  const approval = {
    ...createPendingApprovals('staging-eu-test')[0],
    status: 'approved' as const,
    name: 'External approver',
    date: '2026-07-29',
    evidenceReference: 'ticket-123',
  };
  assert.throws(() => assertApprovalWasExternallyRecorded(approval, false));
  assert.equal(assertApprovalWasExternallyRecorded(approval, true).status, 'approved');
});

test('go-live calculation blocks failed or pending required gates', () => {
  const result = evaluateGoLive([
    { id: 'migration', status: 'passed', blocking: true },
    { id: 'backup_restore', status: 'failed', blocking: true },
    { id: 'tls', status: 'pending', blocking: true },
  ]);
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.blockers, ['backup_restore', 'tls']);
});

test('go-live calculation distinguishes ready and accepted risks', () => {
  assert.equal(
    evaluateGoLive([{ id: 'migration', status: 'passed', blocking: true }]).status,
    'READY',
  );
  assert.equal(
    evaluateGoLive([
      { id: 'migration', status: 'passed', blocking: true },
      { id: 'dependency', status: 'accepted_risk', blocking: false },
    ]).status,
    'READY_WITH_ACCEPTED_RISKS',
  );
  assert.equal(evaluateGoLive([]).status, 'NOT_EVALUATED');
});

test('missing backup blocks readiness', () => {
  assert.equal(
    evaluateGoLive([{ id: 'backup_restore', status: 'pending', blocking: true }]).status,
    'BLOCKED',
  );
});

test('missing monitoring blocks readiness', () => {
  assert.equal(
    evaluateGoLive([{ id: 'monitoring', status: 'pending', blocking: true }]).status,
    'BLOCKED',
  );
});

test('vulnerability exception expiry is enforced', () => {
  assert.equal(
    validateVulnerabilityException(
      { id: 'AR-DEP-2026-001', approved: true, expiresAt: '2026-08-12T23:59:59Z' },
      new Date('2026-07-29T00:00:00Z'),
    ).status,
    'active',
  );
  assert.throws(() =>
    validateVulnerabilityException(
      { id: 'AR-DEP-2026-001', approved: true, expiresAt: '2026-08-12T23:59:59Z' },
      new Date('2026-08-13T00:00:00Z'),
    ),
  );
});

test('SBOM checksum validation rejects changed artifacts', () => {
  const sbom = '{"bomFormat":"CycloneDX","components":[]}';
  assert.equal(validateSbomChecksum(sbom, calculateSha256(sbom)), true);
  assert.throws(() => validateSbomChecksum(`${sbom}\n`, calculateSha256(sbom)));
});

test('alert test payload is staging-only, safe and supports resolution', async () => {
  const triggered = createStagingTestAlert('staging-eu-test', 'staging-alert-12345678');
  const resolved = createStagingTestAlert('staging-eu-test', 'staging-alert-12345678', true);
  assert.equal(triggered.event, 'staging.test.triggered');
  assert.equal(resolved.event, 'staging.test.resolved');
  assert.doesNotMatch(JSON.stringify(triggered), /content|prompt|secret|credential/i);
  assert.deepEqual(await new NoopStagingAlertAdapter().send(triggered), {
    delivered: false,
  });
  assert.throws(() => createStagingTestAlert('production', 'staging-alert-12345678'));
});

test('managed secret provider fails fast for missing, placeholder and stale values', async () => {
  const provider = new EnvironmentStagingSecretProvider({
    SESSION_SECRET: 'valid-staging-session-secret-123456789',
    SESSION_SECRET_VERSION: 'version-7',
    SESSION_SECRET_UPDATED_AT: '2026-07-20T00:00:00.000Z',
  });
  const loaded = await loadRequiredStagingSecrets(provider, ['SESSION_SECRET'], {
    maximumAgeDays: 30,
    now: new Date('2026-07-29T00:00:00.000Z'),
  });
  assert.equal(loaded.summary[0].present, true);
  assert.equal(loaded.summary[0].version, 'version-7');
  assert.equal(JSON.stringify(loaded.summary).includes(loaded.values.SESSION_SECRET), false);
  await assert.rejects(() => loadRequiredStagingSecrets(provider, ['OPENAI_API_KEY']));
  await assert.rejects(() =>
    loadRequiredStagingSecrets(
      new EnvironmentStagingSecretProvider({
        SESSION_SECRET: 'change-me-placeholder-value',
      }),
      ['SESSION_SECRET'],
    ),
  );
});

test('production images use compiled JavaScript and prohibit runtime TypeScript tooling', async () => {
  const [dockerfile, stagingCompose, productionCompose, webPackage, databasePackage, bundler] =
    await Promise.all([
      readFile(path.join(repositoryRoot, 'docker', 'production.Dockerfile'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docker-compose.staging.yml'), 'utf8'),
      readFile(path.join(repositoryRoot, 'docker-compose.production.example.yml'), 'utf8'),
      readFile(path.join(repositoryRoot, 'apps', 'web', 'package.json'), 'utf8'),
      readFile(path.join(repositoryRoot, 'packages', 'database', 'package.json'), 'utf8'),
      readFile(
        path.join(repositoryRoot, 'apps', 'web', 'scripts', 'build-production-entrypoints.mjs'),
        'utf8',
      ),
    ]);
  const webManifest = JSON.parse(webPackage) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const databaseManifest = JSON.parse(databasePackage) as {
    dependencies?: Record<string, string>;
  };

  assert.doesNotMatch(dockerfile, /CMD \[[^\n]*(?:tsx|typescript|npm|npx)/);
  assert.doesNotMatch(dockerfile, /--import["', ]+tsx/);
  assert.match(dockerfile, /CMD \["node", "production-entrypoints\/document-worker\.mjs"\]/);
  assert.match(dockerfile, /CMD \["node", "production-entrypoints\/embedding-worker\.mjs"\]/);
  assert.match(dockerfile, /CMD \["node", "production-entrypoints\/production-readiness\.mjs"\]/);
  assert.doesNotMatch(`${stagingCompose}\n${productionCompose}`, /(?:command:.*)(?:npm|npx|tsx)/);
  assert.equal(webManifest.dependencies?.tsx, undefined);
  assert.equal(webManifest.devDependencies?.tsx, '4.19.0');
  assert.equal(databaseManifest.dependencies?.prisma, '^6.0.0');
  assert.match(bundler, /sourcemap: false/);
  assert.match(bundler, /sourcesContent: false/);
});

test('image scanner delegates exact findings and expiry decisions to the shared policy', async () => {
  const [scanner, policyText] = await Promise.all([
    readFile(
      path.join(repositoryRoot, 'apps', 'web', 'scripts', 'staging-image-security.ts'),
      'utf8',
    ),
    readFile(path.join(repositoryRoot, 'security', 'container-vulnerability-policy.json'), 'utf8'),
  ]);
  const policy = JSON.parse(policyText) as {
    targets: Record<string, { classification: string; findingRecord: string }>;
    records: Record<
      string,
      {
        expiresAt: string;
        findings: Array<{ id: string; package: string; severity: string }>;
      }
    >;
  };
  const acceptance = policy.records['AR-DEP-2026-002'];

  assert.match(scanner, /enforce-container-vulnerability-policy\.mjs/);
  assert.match(scanner, /--classification=/);
  assert.equal(policy.targets.web.classification, 'production_runtime');
  assert.equal(policy.targets.web.findingRecord, 'AR-DEP-2026-002');
  assert.equal(acceptance.expiresAt, '2026-08-12T23:59:59Z');
  assert.deepEqual(
    acceptance.findings.map((finding) => ({
      id: finding.id,
      package: finding.package,
      severity: finding.severity,
    })),
    [
      { id: 'GHSA-6g55-p6wh-862q', package: 'postcss', severity: 'High' },
      { id: 'GHSA-r28c-9q8g-f849', package: 'postcss', severity: 'High' },
      { id: 'GHSA-f88m-g3jw-g9cj', package: 'sharp', severity: 'High' },
    ],
  );
});
