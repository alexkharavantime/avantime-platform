import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { connect } from 'node:tls';
import { promisify } from 'node:util';

import {
  createStagingTestAlert,
  NoopStagingAlertAdapter,
  WebhookStagingAlertAdapter,
} from '../lib/staging-alerts';
import {
  calculateSha256,
  createPendingApprovals,
  evaluateGoLive,
  sanitizeEvidence,
  validateStagingConfiguration,
  validateStagingExample,
  type EnvironmentMap,
  type GoLiveGate,
} from '../lib/staging-go-live';
import {
  assertProviderConnectivityAuthorized,
  validateStagingProviderConfiguration,
} from '../lib/staging-provider-validation';
import { evaluateTlsValidation } from '../lib/staging-tls';
import { getRepositoryRoot, runIntegrationCommand } from './document-integration-environment';

const executeFile = promisify(execFile);
const command = process.argv[2];
const arguments_ = process.argv.slice(3);
const repositoryRoot = getRepositoryRoot();

function hasFlag(name: string) {
  return arguments_.includes(name);
}

function argumentValue(name: string) {
  const inline = arguments_.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}

function unquote(value: string) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseStagingEnvironmentSource(source: string) {
  const environment: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) throw new Error('Staging environment contains an invalid line.');
    const name = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new Error('Staging environment contains an invalid variable name.');
    }
    environment[name] = unquote(line.slice(separator + 1).trim());
  }
  return environment;
}

async function loadEnvironment(options: { allowExample?: boolean } = {}) {
  const example = hasFlag('--example');
  if (example && !options.allowExample) {
    throw new Error('This command cannot operate on the non-deployable staging example.');
  }
  const configured = argumentValue('--env-file');
  const filename = configured || (example ? '.env.staging.example' : '.env.staging');
  const absolute = path.resolve(repositoryRoot, filename);
  if (!absolute.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error('Staging environment file must be inside the repository workspace.');
  }
  const fileEnvironment = parseStagingEnvironmentSource(await readFile(absolute, 'utf8'));
  const environment: EnvironmentMap = { ...process.env, ...fileEnvironment };
  return { environment, filename, example };
}

function output(value: unknown) {
  console.log(JSON.stringify(sanitizeEvidence(value), null, 2));
}

async function run(executable: string, commandArguments: string[], environment: NodeJS.ProcessEnv) {
  await runIntegrationCommand(executable, commandArguments, {
    cwd: repositoryRoot,
    environment,
  });
}

async function configCheck() {
  const { environment, filename, example } = await loadEnvironment({ allowExample: true });
  if (example) {
    output({
      status: 'passed',
      check: 'staging-example-schema',
      environmentFile: filename,
      ...validateStagingExample(environment),
    });
    return;
  }
  const configuration = validateStagingConfiguration(environment);
  output({
    status: 'passed',
    check: 'staging-configuration',
    environmentFile: filename,
    configuration,
  });
}

function deploymentPlan(environmentId: string) {
  return {
    environmentId,
    dryRun: true,
    deploymentPath: 'production-like Docker Compose staging',
    steps: [
      'validate configuration and mounted secret versions',
      'build release images without publishing',
      'create pre-migration encrypted backup',
      'run isolated migration job',
      'start web and workers after successful migration',
      'start reverse proxy and private monitoring',
      'run readiness, smoke, backup/restore and evidence gates',
    ],
    services: [
      'reverse-proxy',
      'web',
      'document-worker',
      'embedding-worker',
      'migration',
      'postgres',
      'redis',
      'object-storage',
      'otel-collector',
      'prometheus',
      'backup',
    ],
    rollback:
      'Stop claims, route the previous compatible web/worker images, retain additive schema.',
  };
}

async function deployPlan() {
  const { environment, example } = await loadEnvironment({ allowExample: true });
  const environmentId = example
    ? 'staging-unassigned'
    : validateStagingConfiguration(environment).environmentId;
  output({ status: 'planned', ...deploymentPlan(environmentId) });
}

async function composeCheck() {
  const { environment, filename } = await loadEnvironment({ allowExample: true });
  await run(
    'docker',
    ['compose', '--env-file', filename, '-f', 'docker-compose.staging.yml', 'config', '--quiet'],
    environment as NodeJS.ProcessEnv,
  );
  output({ status: 'passed', check: 'staging-compose-config', environmentFile: filename });
}

async function deploy() {
  if (!hasFlag('--execute')) {
    await deployPlan();
    return;
  }
  const { environment, filename } = await loadEnvironment();
  const configuration = validateStagingConfiguration(environment);
  if (environment.STAGING_DEPLOY_CONFIRMATION !== `DEPLOY:${configuration.environmentId}`) {
    throw new Error('Deployment requires exact STAGING_DEPLOY_CONFIRMATION.');
  }
  await run(
    'docker',
    [
      'compose',
      '--env-file',
      filename,
      '-p',
      configuration.environmentId,
      '-f',
      'docker-compose.staging.yml',
      'up',
      '-d',
      '--wait',
    ],
    environment as NodeJS.ProcessEnv,
  );
  output({
    status: 'completed',
    operation: 'staging-deploy',
    environmentId: configuration.environmentId,
  });
}

async function migrate() {
  const { environment, filename } = await loadEnvironment({ allowExample: true });
  if (!hasFlag('--execute')) {
    output({
      status: 'planned',
      operation: 'staging-migration',
      steps: [
        'configuration',
        'pre-migration backup',
        'migration deploy',
        'schema/extension/index verification',
        'smoke',
        'evidence',
      ],
    });
    return;
  }
  const configuration = validateStagingConfiguration(environment);
  if (environment.STAGING_MIGRATION_CONFIRMATION !== `MIGRATE:${configuration.environmentId}`) {
    throw new Error('Migration requires exact STAGING_MIGRATION_CONFIRMATION.');
  }
  await run(
    'docker',
    [
      'compose',
      '--env-file',
      filename,
      '-p',
      configuration.environmentId,
      '-f',
      'docker-compose.staging.yml',
      'run',
      '--rm',
      'migration',
    ],
    environment as NodeJS.ProcessEnv,
  );
  output({
    status: 'completed',
    operation: 'staging-migration',
    environmentId: configuration.environmentId,
  });
}

function requestHeaders(protocol: 'http:' | 'https:', hostname: string, method: 'GET' | 'HEAD') {
  return new Promise<{
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
  }>((resolve, reject) => {
    const request = (protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        protocol,
        hostname,
        port: protocol === 'https:' ? 443 : 80,
        path: '/',
        method,
        timeout: 5_000,
        rejectUnauthorized: true,
      },
      (response) => {
        response.resume();
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
        });
      },
    );
    request.once('timeout', () => request.destroy(new Error('Request timed out.')));
    request.once('error', reject);
    request.end();
  });
}

async function inspectTls(hostname: string) {
  const addresses = await lookup(hostname, { all: true });
  const peer = await new Promise<{
    valid_from: string;
    valid_to: string;
    subjectaltname?: string;
    protocol: string;
    cipher: string;
  }>((resolve, reject) => {
    const socket = connect({
      host: hostname,
      port: 443,
      servername: hostname,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      timeout: 5_000,
    });
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      const protocol = socket.getProtocol() || 'unknown';
      const cipher = socket.getCipher().name;
      socket.end();
      resolve({
        valid_from: certificate.valid_from,
        valid_to: certificate.valid_to,
        subjectaltname: certificate.subjectaltname,
        protocol,
        cipher,
      });
    });
    socket.once('timeout', () => socket.destroy(new Error('TLS connection timed out.')));
    socket.once('error', reject);
  });
  const [https, http] = await Promise.all([
    requestHeaders('https:', hostname, 'HEAD'),
    requestHeaders('http:', hostname, 'HEAD'),
  ]);
  const redirectLocation = String(http.headers.location || '');
  const result = evaluateTlsValidation({
    hostname,
    subjectAlternativeNames: peer.subjectaltname || '',
    validFrom: peer.valid_from,
    validTo: peer.valid_to,
    protocol: peer.protocol,
    cipherName: peer.cipher,
    hsts:
      typeof https.headers['strict-transport-security'] === 'string'
        ? https.headers['strict-transport-security']
        : null,
    redirectsToHttps:
      http.statusCode >= 300 &&
      http.statusCode < 400 &&
      redirectLocation.startsWith(`https://${hostname}`),
    internalEndpointsPublic: false,
  });
  return {
    ...result,
    resolvedAddressCount: addresses.length,
  };
}

async function tlsCheck() {
  const { environment } = await loadEnvironment();
  const configuration = validateStagingConfiguration(environment);
  const result = await inspectTls(configuration.hostname);
  output({ check: 'staging-tls', ...result });
  if (result.status !== 'passed') process.exitCode = 1;
}

async function providerConnectivity(
  environment: EnvironmentMap,
  configuration: ReturnType<typeof validateStagingProviderConfiguration>,
  environmentId: string,
) {
  assertProviderConnectivityAuthorized(environment, environmentId);
  if (configuration.provider === 'fake') {
    return {
      status: 'skipped',
      reason: 'deterministic fake provider has no external connectivity',
    };
  }
  const syntheticInput = 'Avantime staging connectivity check';
  if (configuration.provider === 'openai') {
    const endpoint = environment.OPENAI_BASE_URL || 'https://api.openai.com';
    const key = environment.OPENAI_API_KEY!;
    const modelChecks = await Promise.all(
      [configuration.embeddingModel, configuration.answerModel].map(async (model) => {
        const response = await fetch(`${endpoint}/v1/models/${encodeURIComponent(model)}`, {
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(configuration.timeoutMs),
        });
        if (!response.ok)
          throw new Error(`OpenAI model check failed with HTTP ${response.status}.`);
        return model;
      }),
    );
    const embedding = await fetch(`${endpoint}/v1/embeddings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: configuration.embeddingModel,
        input: syntheticInput,
        dimensions: configuration.dimensions,
      }),
      signal: AbortSignal.timeout(configuration.timeoutMs),
    });
    if (!embedding.ok) {
      throw new Error(`OpenAI embedding check failed with HTTP ${embedding.status}.`);
    }
    const body = (await embedding.json()) as { data?: Array<{ embedding?: number[] }> };
    if (body.data?.[0]?.embedding?.length !== configuration.dimensions) {
      throw new Error('OpenAI embedding dimensions do not match staging configuration.');
    }
    return {
      status: 'passed',
      checkedModels: modelChecks.length,
      dimensions: configuration.dimensions,
    };
  }
  const endpoint = environment.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  const key = environment.GOOGLE_GENERATIVE_AI_API_KEY!;
  const modelName = configuration.embeddingModel.replace(/^models\//, '');
  const embedding = await fetch(
    `${endpoint}/v1beta/models/${encodeURIComponent(modelName)}:embedContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: { parts: [{ text: syntheticInput }] },
        outputDimensionality: configuration.dimensions,
      }),
      signal: AbortSignal.timeout(configuration.timeoutMs),
    },
  );
  if (!embedding.ok) {
    throw new Error(`Gemini embedding check failed with HTTP ${embedding.status}.`);
  }
  const body = (await embedding.json()) as { embedding?: { values?: number[] } };
  if (body.embedding?.values?.length !== configuration.dimensions) {
    throw new Error('Gemini embedding dimensions do not match staging configuration.');
  }
  return { status: 'passed', checkedModels: 1, dimensions: configuration.dimensions };
}

async function providerCheck() {
  const { environment } = await loadEnvironment();
  const staging = validateStagingConfiguration(environment);
  const configuration = validateStagingProviderConfiguration(environment);
  if (!hasFlag('--connectivity')) {
    output({
      status: 'passed',
      check: 'staging-provider-static',
      configuration,
      externalConnectivity: configuration.provider === 'fake' ? 'not_applicable' : 'pending',
    });
    return;
  }
  const connectivity = await providerConnectivity(
    environment,
    configuration,
    staging.environmentId,
  );
  output({
    status: 'passed',
    check: 'staging-provider-connectivity',
    provider: configuration.provider,
    connectivity,
  });
}

async function alertTest() {
  const { environment } = await loadEnvironment();
  const staging = validateStagingConfiguration(environment);
  const correlationId = `staging-alert-${randomUUID()}`;
  const adapterName = environment.STAGING_ALERT_ADAPTER || 'noop';
  const adapter =
    adapterName === 'webhook'
      ? new WebhookStagingAlertAdapter(
          environment.STAGING_ALERT_DESTINATION!,
          environment.STAGING_FORBIDDEN_PRODUCTION_HOSTS!.split(','),
        )
      : new NoopStagingAlertAdapter();
  if (
    adapterName !== 'noop' &&
    environment.STAGING_ALERT_CONFIRMATION !== `ALERT_TEST:${staging.environmentId}`
  ) {
    throw new Error('External alert delivery requires exact STAGING_ALERT_CONFIRMATION.');
  }
  const triggered = await adapter.send(
    createStagingTestAlert(staging.environmentId, correlationId),
  );
  const resolved = await adapter.send(
    createStagingTestAlert(staging.environmentId, correlationId, true),
  );
  output({
    status: triggered.delivered && resolved.delivered ? 'passed' : 'pending',
    check: 'staging-alert-delivery',
    adapter: adapterName,
    correlationId,
    triggered,
    resolved,
    acknowledgement: 'pending',
  });
}

async function backup() {
  const { environment } = await loadEnvironment();
  const staging = validateStagingConfiguration(environment);
  if (!hasFlag('--execute')) {
    await run('npm', ['run', 'backup:dry-run'], environment as NodeJS.ProcessEnv);
    return;
  }
  if (
    environment.BACKUP_CONFIRMATION !== `BACKUP:${staging.environmentId}` ||
    environment.STAGING_BACKUP_CONFIRMATION !== `STAGING_BACKUP:${staging.environmentId}`
  ) {
    throw new Error('Staging backup requires both exact confirmations.');
  }
  await run('npm', ['run', 'backup:create', '--', '--execute'], environment as NodeJS.ProcessEnv);
}

async function restoreRehearsal() {
  const { environment } = await loadEnvironment();
  const staging = validateStagingConfiguration(environment);
  if (!hasFlag('--execute')) {
    output({
      status: 'planned',
      operation: 'staging-isolated-restore-rehearsal',
      environmentId: staging.environmentId,
      destructive: false,
      sourceOverwrite: false,
    });
    return;
  }
  if (environment.STAGING_RESTORE_CONFIRMATION !== `STAGING_RESTORE:${staging.environmentId}`) {
    throw new Error('Staging restore rehearsal requires exact confirmation.');
  }
  await run(
    'npm',
    ['run', 'restore:rehearsal', '--', '--execute'],
    environment as NodeJS.ProcessEnv,
  );
}

function defaultGates(): GoLiveGate[] {
  return [
    { id: 'configuration', status: 'passed', blocking: true, evidence: 'static-example' },
    {
      id: 'migration',
      status: 'pending',
      blocking: true,
      reason: 'environment-specific migration evidence has not been imported',
    },
    {
      id: 'tenant_isolation',
      status: 'pending',
      blocking: true,
      reason: 'environment-specific integration evidence has not been imported',
    },
    {
      id: 'dependency_review',
      status: 'accepted_risk',
      blocking: false,
      evidence: 'AR-DEP-2026-001/002',
    },
    { id: 'managed_staging_deployment', status: 'pending', blocking: true },
    { id: 'tls', status: 'pending', blocking: true },
    { id: 'provider_connectivity', status: 'pending', blocking: true },
    { id: 'backup_restore', status: 'pending', blocking: true },
    { id: 'monitoring', status: 'pending', blocking: true },
    { id: 'alert_delivery', status: 'pending', blocking: true },
    { id: 'image_vulnerability_acceptance', status: 'pending', blocking: true },
    { id: 'rollback_drill', status: 'pending', blocking: true },
    { id: 'owner_approvals', status: 'pending', blocking: true },
  ];
}

type ImageSecurityManifest = {
  generatedAt: string;
  tool: string;
  requiredCiFormat: string;
  localFormatLimitation: string | null;
  artifacts: Array<{
    name: string;
    image: string;
    imageId: string;
    format: string;
    path: string;
    sha256: string;
  }>;
};

type ImageScanSummary = {
  generatedAt: string;
  tool: string;
  policy: {
    path: string;
    matching: string;
    default: string;
    blanketIgnores: false;
  };
  status: 'passed' | 'blocked';
  reports: Array<{
    name: string;
    image: string;
    imageId: string;
    path: string;
    sha256: string;
    policyResultPath: string;
    highOrCriticalFindings: number;
    policyStatus: 'passed' | 'warning' | 'blocked';
    gateImpact: string;
    reviewDue: string | null;
    riskOrTrackingId: string | null;
    published: boolean;
    productionUse: boolean;
  }>;
};

async function readOptionalJson<T>(filename: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filename, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function loadImageSecurityEvidence() {
  const artifactRoot = path.join(repositoryRoot, '.artifacts', 'image-security');
  const [sbomManifest, scanSummary] = await Promise.all([
    readOptionalJson<ImageSecurityManifest>(path.join(artifactRoot, 'sbom', 'manifest.json')),
    readOptionalJson<ImageScanSummary>(path.join(artifactRoot, 'scans', 'summary.json')),
  ]);
  const sbomImageIds = new Map(
    sbomManifest?.artifacts.map((artifact) => [artifact.name, artifact.imageId]) ?? [],
  );
  const imageIdsMatch =
    Boolean(sbomManifest && scanSummary) &&
    scanSummary!.reports.length === sbomManifest!.artifacts.length &&
    scanSummary!.reports.every((report) => sbomImageIds.get(report.name) === report.imageId);

  return {
    sbom: sbomManifest
      ? {
          status: 'local_inventory_completed',
          generatedAt: sbomManifest.generatedAt,
          tool: sbomManifest.tool,
          requiredCiFormat: sbomManifest.requiredCiFormat,
          localFormatLimitation: sbomManifest.localFormatLimitation,
          artifacts: sbomManifest.artifacts,
        }
      : { status: 'pending', artifacts: [] },
    vulnerabilityScan: scanSummary
      ? {
          status: imageIdsMatch ? scanSummary.status : 'failed_image_id_mismatch',
          generatedAt: scanSummary.generatedAt,
          tool: scanSummary.tool,
          policy: scanSummary.policy,
          imageIdsMatch,
          reports: scanSummary.reports,
        }
      : { status: 'pending', reports: [] },
    scanSummary,
    imageIdsMatch,
  };
}

async function buildEvidence() {
  const { environment, example } = await loadEnvironment({ allowExample: true });
  const environmentId = example
    ? 'staging-unassigned'
    : validateStagingConfiguration(environment).environmentId;
  const [{ stdout: branch }, { stdout: commit }] = await Promise.all([
    executeFile('git', ['branch', '--show-current'], { cwd: repositoryRoot }),
    executeFile('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
  ]);
  const imageSecurity = await loadImageSecurityEvidence();
  const gates = defaultGates();
  const imageGate = gates.find((gate) => gate.id === 'image_vulnerability_acceptance');
  if (imageGate && imageSecurity.scanSummary) {
    imageGate.status =
      imageSecurity.scanSummary.status === 'passed' && imageSecurity.imageIdsMatch
        ? 'passed'
        : 'failed';
    imageGate.evidence = '.artifacts/image-security/scans/summary.json';
    imageGate.reason =
      imageGate.status === 'failed'
        ? imageSecurity.imageIdsMatch
          ? 'critical/high findings remain pending security acceptance'
          : 'SBOM and vulnerability report image IDs do not match'
        : undefined;
  }
  const decision = evaluateGoLive(gates);
  const evidence = sanitizeEvidence({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environmentId,
    git: { branch: branch.trim(), commit: commit.trim() },
    deployment: { status: 'pending', path: 'docker-compose.staging.yml' },
    configuration: { status: example ? 'example_validated' : 'validated' },
    migrations: { status: 'pending_environment_evidence', expectedCount: 5 },
    healthReadiness: { status: 'pending_environment_evidence' },
    smoke: { status: 'pending_environment_evidence' },
    tls: { status: 'pending' },
    providerValidation: { status: 'static_only_or_pending' },
    backupRestore: { status: 'local_rehearsal_only' },
    sbom: imageSecurity.sbom,
    vulnerabilityScan: imageSecurity.vulnerabilityScan,
    dependencyReview: {
      status: 'accepted_risk',
      risks: ['AR-DEP-2026-001', 'AR-DEP-2026-002'],
      reviewBy: '2026-08-12',
    },
    monitoring: { status: 'pending' },
    alertDelivery: { status: 'pending' },
    loadTest: { status: 'pending_staging_capacity' },
    gates,
    approvals: createPendingApprovals(environmentId),
    goLive: decision,
  });
  const directory = path.join(repositoryRoot, '.artifacts', 'staging', environmentId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'go-live-evidence.json');
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(filename, serialized, { mode: 0o600 });
  await writeFile(`${filename}.sha256`, `${calculateSha256(serialized)}  go-live-evidence.json\n`, {
    mode: 0o600,
  });
  output({
    status: 'completed',
    evidence: path.relative(repositoryRoot, filename),
    sha256: calculateSha256(serialized),
    goLive: decision,
  });
}

async function validateEvidence() {
  const filename = argumentValue('--file');
  if (!filename) throw new Error('--file is required.');
  const absolute = path.resolve(repositoryRoot, filename);
  if (!absolute.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error('Evidence file must be inside the repository workspace.');
  }
  const source = await readFile(absolute, 'utf8');
  const parsed = JSON.parse(source) as Record<string, unknown>;
  const sanitized = sanitizeEvidence(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
    throw new Error('Evidence contains forbidden or unsanitized fields.');
  }
  if (!parsed.environmentId || !parsed.git || !parsed.goLive || !parsed.approvals) {
    throw new Error('Evidence package is incomplete.');
  }
  output({ status: 'passed', check: 'staging-evidence', sha256: calculateSha256(source) });
}

async function readiness() {
  const decision = evaluateGoLive(defaultGates());
  output({ check: 'staging-readiness', ...decision, gates: defaultGates() });
  if (decision.status === 'BLOCKED') process.exitCode = 2;
}

async function main() {
  switch (command) {
    case 'config-check':
      return configCheck();
    case 'compose-check':
      return composeCheck();
    case 'deploy-plan':
      return deployPlan();
    case 'deploy':
      return deploy();
    case 'migrate':
      return migrate();
    case 'tls-check':
      return tlsCheck();
    case 'provider-check':
      return providerCheck();
    case 'alert-test':
      return alertTest();
    case 'backup':
      return backup();
    case 'restore-rehearsal':
      return restoreRehearsal();
    case 'readiness':
      return readiness();
    case 'evidence':
      return buildEvidence();
    case 'evidence-validate':
      return validateEvidence();
    default:
      throw new Error('Unknown staging command.');
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      operation: command || 'unknown',
      errorCode: error instanceof Error ? error.name : 'STAGING_COMMAND_FAILED',
      message: error instanceof Error ? error.message : 'Staging command failed.',
    }),
  );
  process.exitCode = 1;
});
