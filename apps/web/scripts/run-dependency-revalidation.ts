import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getRepositoryRoot } from './document-integration-environment';

type AuditReport = {
  auditReportVersion?: number;
  metadata?: {
    vulnerabilities?: Record<string, number>;
    dependencies?: Record<string, number>;
  };
  vulnerabilities?: Record<string, unknown>;
};

const repositoryRoot = getRepositoryRoot();
const outputPath = path.join(
  repositoryRoot,
  '.artifacts',
  'security',
  'npm-audit-task-006-2026-07-29.json',
);

function redactSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveKeys);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      /(authorization|cookie|credential|password|secret|token)/i.test(key)
        ? '[REDACTED]'
        : redactSensitiveKeys(child),
    ]),
  );
}

async function runAudit() {
  const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn('npm', ['audit', '--json'], {
        cwd: repositoryRoot,
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`npm audit stopped by ${signal}.`));
          return;
        }
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      });
    },
  );

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(`npm audit failed with exit code ${result.exitCode}: ${result.stderr.trim()}`);
  }

  const parsed = JSON.parse(result.stdout) as AuditReport;
  const safeReport = redactSensitiveKeys(parsed) as AuditReport;
  const serialized = `${JSON.stringify(safeReport, null, 2)}\n`;
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, serialized, { mode: 0o600 });
  await chmod(outputPath, 0o600);

  console.log(
    JSON.stringify(
      {
        status: 'completed',
        authoritativeEndpoint: 'official npm audit endpoint',
        auditReportVersion: safeReport.auditReportVersion,
        vulnerabilities: safeReport.metadata?.vulnerabilities,
        dependencies: safeReport.metadata?.dependencies,
        advisoryRecords: Object.keys(safeReport.vulnerabilities ?? {}).length,
        reportPath: path.relative(repositoryRoot, outputPath),
        bytes: Buffer.byteLength(serialized),
        sha256: createHash('sha256').update(serialized).digest('hex'),
        permissions: '0600',
        npmExitCode: result.exitCode,
      },
      null,
      2,
    ),
  );
}

void runAudit().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      errorCode: 'DEPENDENCY_REVALIDATION_FAILED',
      message: error instanceof Error ? error.message : 'npm audit failed.',
    }),
  );
  process.exitCode = 1;
});
