import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/u;
const SAFE_TEXT = /^[a-zA-Z0-9<>=][a-zA-Z0-9 .,;:_/()@+<>=-]{0,249}$/u;
const SENSITIVE_KEY =
  /(?:authorization|cookie|credential|email|password|recovery|secret|session|token)/iu;

export type GovernanceEvidence = {
  schemaVersion: 1;
  generatedAt: string;
  environment: 'integration' | 'staging';
  ceremony:
    | 'platform-owner-bootstrap'
    | 'support-session'
    | 'controlled-approval'
    | 'invariants'
    | 'managed-preflight'
    | 'notification-validation'
    | 'invalidation-validation'
    | 'dependency-report'
    | 'manual-accessibility'
    | 'recovery-drill';
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

type CanonicalJson =
  null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

export function canonicalGovernanceJson(value: CanonicalJson): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalGovernanceJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalGovernanceJson(value[key]!)}`)
    .join(',')}}`;
}

export type GovernanceEvidenceEnvelope = {
  envelopeVersion: 1;
  evidence: GovernanceEvidence;
  evidenceSha256: string;
};

export function validateGovernanceEvidence(evidence: GovernanceEvidence) {
  const evidenceKeys = new Set([
    'schemaVersion',
    'generatedAt',
    'environment',
    'ceremony',
    'status',
    'correlationId',
    'commitSha',
    'migrationVersion',
    'actorHashes',
    'reviewerSignOff',
    'records',
  ]);
  if (
    Object.keys(evidence).some((key) => !evidenceKeys.has(key)) ||
    evidence.schemaVersion !== 1 ||
    !['integration', 'staging'].includes(evidence.environment) ||
    ![
      'platform-owner-bootstrap',
      'support-session',
      'controlled-approval',
      'invariants',
      'managed-preflight',
      'notification-validation',
      'invalidation-validation',
      'dependency-report',
      'manual-accessibility',
      'recovery-drill',
    ].includes(evidence.ceremony) ||
    !['passed', 'failed', 'pending'].includes(evidence.status) ||
    !Number.isFinite(Date.parse(evidence.generatedAt)) ||
    !SAFE_REFERENCE.test(evidence.correlationId) ||
    !/^[a-f0-9]{7,64}$/u.test(evidence.commitSha) ||
    !SAFE_REFERENCE.test(evidence.migrationVersion) ||
    evidence.actorHashes.some((value) => !/^[a-f0-9]{64}$/u.test(value)) ||
    (evidence.reviewerSignOff !== null && !SAFE_TEXT.test(evidence.reviewerSignOff))
  ) {
    throw new Error('GOVERNANCE_EVIDENCE_INVALID');
  }
  const recordKeys = new Set([
    'type',
    'status',
    'reference',
    'timestamp',
    'expectedOutcome',
    'actualOutcome',
    'auditEventIds',
    'notificationIds',
    'approvalId',
    'supportSessionId',
    'resourceVersion',
    'artifacts',
    'details',
  ]);
  for (const record of evidence.records) {
    if (
      Object.keys(record).some((key) => !recordKeys.has(key)) ||
      !['passed', 'failed', 'pending'].includes(record.status) ||
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
        (artifact) =>
          Object.keys(artifact).some((key) => !['kind', 'reference', 'sanitized'].includes(key)) ||
          !['screenshot', 'json'].includes(artifact.kind) ||
          artifact.sanitized !== true ||
          !SAFE_REFERENCE.test(artifact.reference),
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

export function createGovernanceEvidenceEnvelope(
  evidence: GovernanceEvidence,
): GovernanceEvidenceEnvelope {
  const validated = validateGovernanceEvidence(evidence);
  const canonical = canonicalGovernanceJson(validated as unknown as CanonicalJson);
  return {
    envelopeVersion: 1,
    evidence: validated,
    evidenceSha256: governanceEvidenceHash(canonical),
  };
}

export function verifyGovernanceEvidenceEnvelope(envelope: GovernanceEvidenceEnvelope) {
  if (
    Object.keys(envelope).some(
      (key) => !['envelopeVersion', 'evidence', 'evidenceSha256'].includes(key),
    ) ||
    envelope.envelopeVersion !== 1 ||
    !/^[a-f0-9]{64}$/u.test(envelope.evidenceSha256)
  ) {
    throw new Error('GOVERNANCE_EVIDENCE_ENVELOPE_INVALID');
  }
  const evidence = validateGovernanceEvidence(envelope.evidence);
  const actual = governanceEvidenceHash(
    canonicalGovernanceJson(evidence as unknown as CanonicalJson),
  );
  if (actual !== envelope.evidenceSha256) throw new Error('GOVERNANCE_EVIDENCE_TAMPERED');
  return envelope;
}

export async function writeGovernanceEvidenceEnvelope(input: {
  evidence: GovernanceEvidence;
  evidenceRoot: string;
  fileName: string;
}) {
  if (!/^[a-z0-9][a-z0-9._-]{2,120}\.evidence\.json$/u.test(input.fileName)) {
    throw new Error('GOVERNANCE_EVIDENCE_PATH_INVALID');
  }
  const root = path.resolve(input.evidenceRoot);
  const output = path.resolve(root, input.fileName);
  if (!output.startsWith(`${root}${path.sep}`)) {
    throw new Error('GOVERNANCE_EVIDENCE_PATH_INVALID');
  }
  const envelope = createGovernanceEvidenceEnvelope(input.evidence);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(output, `${canonicalGovernanceJson(envelope as unknown as CanonicalJson)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  return { output, sha256: envelope.evidenceSha256 };
}

export async function verifyGovernanceEvidenceFile(file: string) {
  const parsed = JSON.parse(
    await readFile(path.resolve(file), 'utf8'),
  ) as GovernanceEvidenceEnvelope;
  return verifyGovernanceEvidenceEnvelope(parsed);
}
