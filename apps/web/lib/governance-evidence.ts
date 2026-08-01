import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/u;
const SAFE_TEXT = /^[a-zA-Z0-9<>=][a-zA-Z0-9 .,;:_/()@+<>=-]{0,249}$/u;
const SENSITIVE_KEY =
  /(?:authorization|cookie|credential|email|password|recovery|secret|session|token)/iu;

export type GovernanceEvidence = {
  schemaVersion: 1;
  generatedAt: string;
  environment: 'integration' | 'staging';
  ceremony: 'platform-owner-bootstrap' | 'support-session' | 'controlled-approval' | 'invariants';
  status: 'passed' | 'failed' | 'pending';
  correlationId: string;
  commitSha: string;
  migrationVersion: string;
  actorHashes: string[];
  reviewerSignOff: string | null;
  records: Array<{
    type: string;
    status: 'passed' | 'failed' | 'pending';
    reference?: string;
    timestamp: string;
    expectedOutcome: string;
    actualOutcome: string;
    auditEventIds?: string[];
    notificationIds?: string[];
    approvalId?: string;
    supportSessionId?: string;
    resourceVersion?: number;
    artifacts?: Array<{ kind: 'screenshot' | 'json'; reference: string; sanitized: true }>;
    details?: Record<string, string | number | boolean | null>;
  }>;
};

export function governanceEvidenceHash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function validateGovernanceEvidence(evidence: GovernanceEvidence) {
  if (
    evidence.schemaVersion !== 1 ||
    !['integration', 'staging'].includes(evidence.environment) ||
    !SAFE_REFERENCE.test(evidence.correlationId) ||
    !/^[a-f0-9]{7,64}$/u.test(evidence.commitSha) ||
    !SAFE_REFERENCE.test(evidence.migrationVersion) ||
    evidence.actorHashes.some((value) => !/^[a-f0-9]{64}$/u.test(value)) ||
    (evidence.reviewerSignOff !== null && !SAFE_TEXT.test(evidence.reviewerSignOff))
  ) {
    throw new Error('GOVERNANCE_EVIDENCE_INVALID');
  }
  for (const record of evidence.records) {
    if (
      !SAFE_REFERENCE.test(record.type) ||
      (record.reference !== undefined && !SAFE_REFERENCE.test(record.reference)) ||
      !SAFE_TEXT.test(record.expectedOutcome) ||
      !SAFE_TEXT.test(record.actualOutcome) ||
      (record.approvalId !== undefined && !SAFE_REFERENCE.test(record.approvalId)) ||
      (record.supportSessionId !== undefined && !SAFE_REFERENCE.test(record.supportSessionId)) ||
      (record.resourceVersion !== undefined && !Number.isSafeInteger(record.resourceVersion)) ||
      [...(record.auditEventIds ?? []), ...(record.notificationIds ?? [])].some(
        (value) => !SAFE_REFERENCE.test(value),
      ) ||
      (record.artifacts ?? []).some(
        (artifact) => artifact.sanitized !== true || !SAFE_REFERENCE.test(artifact.reference),
      ) ||
      !Number.isFinite(Date.parse(record.timestamp))
    ) {
      throw new Error('GOVERNANCE_EVIDENCE_INVALID');
    }
    for (const [key, value] of Object.entries(record.details ?? {})) {
      if (
        SENSITIVE_KEY.test(key) ||
        !SAFE_REFERENCE.test(key) ||
        (typeof value === 'string' && (!SAFE_TEXT.test(value) || value.length > 200)) ||
        (typeof value === 'number' && !Number.isFinite(value))
      ) {
        throw new Error('GOVERNANCE_EVIDENCE_SENSITIVE');
      }
    }
  }
  const serialized = JSON.stringify(evidence);
  if (/(?:bearer\s+|password|set-cookie|-----BEGIN|\bsk-[a-zA-Z0-9]{20,})/iu.test(serialized)) {
    throw new Error('GOVERNANCE_EVIDENCE_SENSITIVE');
  }
  return evidence;
}

export async function writeGovernanceEvidence(input: {
  evidence: GovernanceEvidence;
  evidenceRoot: string;
  fileName: string;
}) {
  const evidence = validateGovernanceEvidence(input.evidence);
  if (!/^[a-z0-9][a-z0-9._-]{2,120}\.json$/u.test(input.fileName)) {
    throw new Error('GOVERNANCE_EVIDENCE_PATH_INVALID');
  }
  const root = path.resolve(input.evidenceRoot);
  const output = path.resolve(root, input.fileName);
  if (!output.startsWith(`${root}${path.sep}`)) {
    throw new Error('GOVERNANCE_EVIDENCE_PATH_INVALID');
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return { output, sha256: governanceEvidenceHash(JSON.stringify(evidence)) };
}
