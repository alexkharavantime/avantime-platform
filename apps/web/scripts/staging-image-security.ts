import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { getRepositoryRoot } from './document-integration-environment';

const executeFile = promisify(execFile);
const mode = process.argv[2];
const repositoryRoot = getRepositoryRoot();
const artifactRoot = path.join(repositoryRoot, '.artifacts', 'image-security');
const dockerizedSyftImage = 'anchore/syft:v1.50.0';
const dockerizedGrypeImage = 'anchore/grype:v0.112.0';
const vulnerabilityPolicy = path.join(
  repositoryRoot,
  'security',
  'container-vulnerability-policy.json',
);
const vulnerabilityPolicyEvaluator = path.join(
  repositoryRoot,
  'apps',
  'web',
  'scripts',
  'enforce-container-vulnerability-policy.mjs',
);
const images = [
  ['web', 'avantime-web:task-006-staging', 'production_runtime'],
  ['document-worker', 'avantime-document-worker:task-006-staging', 'production_runtime'],
  ['embedding-worker', 'avantime-embedding-worker:task-006-staging', 'production_runtime'],
  ['migration', 'avantime-migration:task-006-staging', 'migration_runtime'],
  ['operations', 'avantime-operations:task-006-staging', 'operations_runtime'],
  ['ocr-integration', 'avantime-ocr-integration', 'ephemeral_test_only'],
] as const;

async function run(command: string, arguments_: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(signal ? `${command} stopped by ${signal}.` : `${command} exited ${code}.`),
        );
    });
  });
}

async function installed(command: string, arguments_: string[]) {
  try {
    await executeFile(command, arguments_);
    return true;
  } catch {
    return false;
  }
}

function sha256(content: Buffer) {
  return createHash('sha256').update(content).digest('hex');
}

async function inspectImage(image: string) {
  const { stdout } = await executeFile('docker', [
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    image,
  ]);
  return stdout.trim();
}

type PolicyResult = {
  status: 'passed' | 'warning' | 'blocked';
  decision: string;
  riskId: string | null;
  expiresAt: string | null;
  classification: string;
  published: boolean;
  productionUse: boolean;
};

async function enforceVulnerabilityPolicy(name: string, scope: string, reportFilename: string) {
  const outputFilename = path.join(artifactRoot, 'scans', `avantime-${name}.policy.json`);
  try {
    await executeFile(
      process.execPath,
      [
        vulnerabilityPolicyEvaluator,
        `--target=${name}`,
        `--classification=${scope}`,
        `--report=${reportFilename}`,
        `--policy=${vulnerabilityPolicy}`,
        `--output=${outputFilename}`,
      ],
      { cwd: repositoryRoot },
    );
  } catch (error) {
    const exitCode = (error as { code?: number }).code;
    if (exitCode !== 2) throw error;
  }
  const result = JSON.parse(await readFile(outputFilename, 'utf8')) as PolicyResult;
  return { outputFilename, result };
}

async function generateSbom() {
  await mkdir(path.join(artifactRoot, 'sbom'), { recursive: true, mode: 0o700 });
  const hasSyft = await installed('syft', ['version']);
  const hasDocker = await installed('docker', ['version']);
  if (!hasSyft && !hasDocker) throw new Error('Neither Syft nor Docker is installed.');
  if (!hasSyft) await run('docker', ['pull', dockerizedSyftImage]);
  const artifacts = [];
  for (const [name, image, scope] of images) {
    const imageId = await inspectImage(image);
    const filename = path.join(artifactRoot, 'sbom', `avantime-${name}.cdx.json`);
    if (hasSyft) {
      await run('syft', [`image:${image}`, '-o', `cyclonedx-json=${filename}`]);
    } else {
      await run('docker', [
        'run',
        '--rm',
        '--volume',
        '/var/run/docker.sock:/var/run/docker.sock',
        '--volume',
        `${path.join(artifactRoot, 'sbom')}:/reports`,
        dockerizedSyftImage,
        `image:${image}`,
        '-o',
        `cyclonedx-json=/reports/${path.basename(filename)}`,
      ]);
    }
    const content = await readFile(filename);
    artifacts.push({
      name,
      image,
      imageId,
      scope,
      format: 'cyclonedx-json',
      path: path.relative(repositoryRoot, filename),
      bytes: content.length,
      sha256: sha256(content),
    });
  }
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    tool: hasSyft ? 'syft' : dockerizedSyftImage,
    requiredCiFormat: 'cyclonedx-json',
    localFormatLimitation: null,
    artifacts,
  };
  await writeFile(
    path.join(artifactRoot, 'sbom', 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ status: 'completed', ...manifest }, null, 2));
}

async function scanImages() {
  await mkdir(path.join(artifactRoot, 'scans'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(artifactRoot, 'grype-cache'), {
    recursive: true,
    mode: 0o700,
  });
  const hasGrype = await installed('grype', ['version']);
  const hasDocker = await installed('docker', ['version']);
  if (!hasGrype && !hasDocker) {
    throw new Error('Neither Grype nor Docker is installed.');
  }
  if (!hasGrype) await run('docker', ['pull', dockerizedGrypeImage]);
  const reports = [];
  for (const [name, image, scope] of images) {
    const imageId = await inspectImage(image);
    const filename = path.join(artifactRoot, 'scans', `avantime-${name}.grype.json`);
    if (hasGrype) {
      await run('grype', [image, '--output', 'json', '--file', filename]);
    } else {
      await run('docker', [
        'run',
        '--rm',
        '--volume',
        '/var/run/docker.sock:/var/run/docker.sock',
        '--volume',
        `${path.join(artifactRoot, 'scans')}:/reports`,
        '--volume',
        `${path.join(artifactRoot, 'grype-cache')}:/grype-cache`,
        '--env',
        'GRYPE_DB_CACHE_DIR=/grype-cache',
        dockerizedGrypeImage,
        image,
        '--output',
        'json',
        '--file',
        `/reports/${path.basename(filename)}`,
      ]);
    }
    const content = await readFile(filename);
    const parsed = JSON.parse(content.toString('utf8')) as {
      matches?: Array<{
        vulnerability?: {
          id?: string;
          severity?: string;
          fix?: { state?: string; versions?: string[] };
        };
      }>;
    };
    const relevantMatches = parsed.matches?.filter((match) =>
      ['high', 'critical'].includes(match.vulnerability?.severity?.toLowerCase() ?? ''),
    );
    const findingCount = relevantMatches?.length ?? 0;
    const criticalFindings =
      relevantMatches?.filter(
        (match) => match.vulnerability?.severity?.toLowerCase() === 'critical',
      ).length ?? null;
    const highFindings =
      relevantMatches?.filter((match) => match.vulnerability?.severity?.toLowerCase() === 'high')
        .length ?? null;
    const fixedFindings =
      relevantMatches?.filter(
        (match) =>
          match.vulnerability?.fix?.state === 'fixed' ||
          (match.vulnerability?.fix?.versions?.length ?? 0) > 0,
      ).length ?? null;
    const policy = await enforceVulnerabilityPolicy(name, scope, filename);
    reports.push({
      name,
      image,
      imageId,
      scope,
      format: 'grype-json',
      path: path.relative(repositoryRoot, filename),
      sha256: sha256(content),
      policyResultPath: path.relative(repositoryRoot, policy.outputFilename),
      highOrCriticalFindings: findingCount,
      criticalFindings,
      highFindings,
      fixedFindings,
      unfixedFindings: fixedFindings === null ? null : findingCount - fixedFindings,
      policyStatus: policy.result.status,
      gateImpact: policy.result.decision,
      reviewDue: policy.result.expiresAt?.slice(0, 10) ?? null,
      riskOrTrackingId: policy.result.riskId,
      published: policy.result.published,
      productionUse: policy.result.productionUse,
    });
  }
  const blocked = reports.some((report) => report.policyStatus === 'blocked');
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    tool: hasGrype ? 'grype' : dockerizedGrypeImage,
    policy: {
      path: path.relative(repositoryRoot, vulnerabilityPolicy),
      matching:
        'exact image target, production/test classification, CVE/GHSA, package, severity, risk/tracking ID and expiry',
      default:
        'unknown, additional, severity-escalated, expired or unaccepted high/critical findings block',
      blanketIgnores: false,
    },
    status: blocked ? 'blocked' : 'passed',
    reports,
  };
  await writeFile(
    path.join(artifactRoot, 'scans', 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(JSON.stringify(summary, null, 2));
  if (blocked) process.exitCode = 2;
}

async function main() {
  if (mode === 'sbom') return generateSbom();
  if (mode === 'scan') return scanImages();
  throw new Error('Expected sbom or scan mode.');
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      operation: mode,
      errorCode: 'STAGING_IMAGE_SECURITY_FAILED',
      message: error instanceof Error ? error.message : 'Image security operation failed.',
    }),
  );
  process.exitCode = 1;
});
