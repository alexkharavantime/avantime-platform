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
const acceptedWebAdvisories = new Set([
  'GHSA-6g55-p6wh-862q',
  'GHSA-r28c-9q8g-f849',
  'GHSA-f88m-g3jw-g9cj',
]);
const dependencyAcceptanceExpiresAt = new Date('2026-08-12T23:59:59Z');
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
  const hasTrivy = await installed('trivy', ['--version']);
  const hasGrype = await installed('grype', ['version']);
  const hasDocker = await installed('docker', ['version']);
  if (!hasTrivy && !hasGrype && !hasDocker) {
    throw new Error('Neither Trivy, Grype nor Docker is installed.');
  }
  if (!hasTrivy && !hasGrype) await run('docker', ['pull', dockerizedGrypeImage]);
  const reports = [];
  for (const [name, image, scope] of images) {
    const imageId = await inspectImage(image);
    const reportFormat = hasTrivy ? 'sarif' : 'grype-json';
    const filename = path.join(
      artifactRoot,
      'scans',
      `avantime-${name}.${hasTrivy ? 'sarif' : 'grype'}.json`,
    );
    if (hasTrivy) {
      await run('trivy', [
        'image',
        '--format',
        'sarif',
        '--output',
        filename,
        '--severity',
        'HIGH,CRITICAL',
        '--ignore-unfixed=false',
        image,
      ]);
    } else if (hasGrype) {
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
    const parsed = JSON.parse(content.toString('utf8')) as
      | { runs?: Array<{ results?: unknown[] }> }
      | { matches?: Array<{ vulnerability?: { severity?: string } }> };
    const matches =
      'matches' in parsed
        ? (parsed.matches as
            | Array<{
                vulnerability?: {
                  id?: string;
                  severity?: string;
                  fix?: { state?: string; versions?: string[] };
                };
              }>
            | undefined)
        : undefined;
    const runs = 'runs' in parsed ? parsed.runs : undefined;
    const relevantMatches = matches?.filter((match) =>
      ['high', 'critical'].includes(match.vulnerability?.severity?.toLowerCase() ?? ''),
    );
    const findingCount =
      relevantMatches?.length ??
      runs?.reduce((sum, run) => sum + (run.results?.length || 0), 0) ??
      0;
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
    const testOnly = scope === 'ephemeral_test_only';
    const acceptedExistingWebRisk =
      name === 'web' &&
      new Date() <= dependencyAcceptanceExpiresAt &&
      relevantMatches?.length === acceptedWebAdvisories.size &&
      relevantMatches.every((match) => acceptedWebAdvisories.has(match.vulnerability?.id ?? ''));
    reports.push({
      name,
      image,
      imageId,
      scope,
      format: reportFormat,
      path: path.relative(repositoryRoot, filename),
      sha256: sha256(content),
      highOrCriticalFindings: findingCount,
      criticalFindings,
      highFindings,
      fixedFindings,
      unfixedFindings: fixedFindings === null ? null : findingCount - fixedFindings,
      gateImpact:
        findingCount === 0
          ? 'passed'
          : acceptedExistingWebRisk
            ? 'accepted_active_risk'
            : testOnly
              ? 'tracked_test_only_non_promotion_risk'
              : 'blocks_until_reachability_and_security_decision',
      reviewDue: (testOnly && findingCount > 0) || acceptedExistingWebRisk ? '2026-08-12' : null,
      acceptance:
        findingCount === 0
          ? 'not_required'
          : acceptedExistingWebRisk
            ? 'AR-DEP-2026-002'
            : 'pending_security_review',
    });
  }
  const blocked = reports.some(
    (report) =>
      report.scope !== 'ephemeral_test_only' &&
      report.highOrCriticalFindings > 0 &&
      report.acceptance !== 'AR-DEP-2026-002',
  );
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    tool: hasTrivy ? 'trivy' : hasGrype ? 'grype' : dockerizedGrypeImage,
    policy: {
      productionRuntime:
        'critical/high findings block until reachability is classified and Security Owner explicitly decides',
      existingDependencyAcceptance:
        'only the exact web PostCSS/Sharp advisory set is covered by active AR-DEP-2026-002; expiry fails closed',
      migrationAndOperations:
        'classified separately, but critical/high findings remain blocking until a reachability decision exists',
      ephemeralTestOnly:
        'never published or deployed; findings are tracked separately with a review deadline and do not automatically accept production risk',
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
