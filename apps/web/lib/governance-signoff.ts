import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalGovernanceJson, governanceEvidenceHash } from './governance-evidence';

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;

export type GovernanceSignOff = {
  schemaVersion: 1;
  environment: 'staging';
  ceremony: 'bootstrap' | 'support' | 'approval' | 'knowledge' | 'recovery' | 'managed-validation';
  status: 'passed' | 'failed';
  commitSha: string;
  migrationVersion: string;
  correlationId: string;
  evidenceSha256: string;
  operatorHash: string;
  reviewerHash: string;
  operatorSignatureReference: string;
  reviewerSignatureReference: string;
  externalApprovalReference: string;
  signedAt: string;
  deviations: string[];
  blockers: string[];
  riskReferences: string[];
};

export type GovernanceSignOffEnvelope = {
  envelopeVersion: 1;
  signOff: GovernanceSignOff;
  signOffSha256: string;
};

function validateReferences(values: string[]) {
  return values.every((value) => SAFE_REFERENCE.test(value));
}

export function validateGovernanceSignOff(signOff: GovernanceSignOff) {
  const allowedKeys = new Set([
    'schemaVersion',
    'environment',
    'ceremony',
    'status',
    'commitSha',
    'migrationVersion',
    'correlationId',
    'evidenceSha256',
    'operatorHash',
    'reviewerHash',
    'operatorSignatureReference',
    'reviewerSignatureReference',
    'externalApprovalReference',
    'signedAt',
    'deviations',
    'blockers',
    'riskReferences',
  ]);
  if (
    Object.keys(signOff).some((key) => !allowedKeys.has(key)) ||
    signOff.schemaVersion !== 1 ||
    signOff.environment !== 'staging' ||
    !['bootstrap', 'support', 'approval', 'knowledge', 'recovery', 'managed-validation'].includes(
      signOff.ceremony,
    ) ||
    !['passed', 'failed'].includes(signOff.status) ||
    !/^[a-f0-9]{7,64}$/u.test(signOff.commitSha) ||
    !SAFE_REFERENCE.test(signOff.migrationVersion) ||
    !SAFE_REFERENCE.test(signOff.correlationId) ||
    !SHA256.test(signOff.evidenceSha256) ||
    !SHA256.test(signOff.operatorHash) ||
    !SHA256.test(signOff.reviewerHash) ||
    signOff.operatorHash === signOff.reviewerHash ||
    !SAFE_REFERENCE.test(signOff.operatorSignatureReference) ||
    !SAFE_REFERENCE.test(signOff.reviewerSignatureReference) ||
    !SAFE_REFERENCE.test(signOff.externalApprovalReference) ||
    !Number.isFinite(Date.parse(signOff.signedAt)) ||
    !validateReferences(signOff.deviations) ||
    !validateReferences(signOff.blockers) ||
    !validateReferences(signOff.riskReferences)
  ) {
    throw new Error('GOVERNANCE_SIGN_OFF_INVALID');
  }
  if (
    signOff.status === 'passed' &&
    (signOff.blockers.length > 0 || signOff.deviations.length > 0)
  ) {
    throw new Error('GOVERNANCE_SIGN_OFF_BLOCKED');
  }
  return signOff;
}

export function createGovernanceSignOffEnvelope(signOff: GovernanceSignOff) {
  const validated = validateGovernanceSignOff(signOff);
  const canonical = canonicalGovernanceJson(validated);
  return {
    envelopeVersion: 1 as const,
    signOff: validated,
    signOffSha256: governanceEvidenceHash(canonical),
  };
}

export function verifyGovernanceSignOffEnvelope(envelope: GovernanceSignOffEnvelope) {
  if (
    Object.keys(envelope).some(
      (key) => !['envelopeVersion', 'signOff', 'signOffSha256'].includes(key),
    ) ||
    envelope.envelopeVersion !== 1 ||
    !SHA256.test(envelope.signOffSha256)
  ) {
    throw new Error('GOVERNANCE_SIGN_OFF_INVALID');
  }
  const signOff = validateGovernanceSignOff(envelope.signOff);
  if (governanceEvidenceHash(canonicalGovernanceJson(signOff)) !== envelope.signOffSha256) {
    throw new Error('GOVERNANCE_SIGN_OFF_TAMPERED');
  }
  return envelope;
}

export async function writeGovernanceSignOff(input: {
  signOff: GovernanceSignOff;
  evidenceRoot: string;
  fileName: string;
}) {
  if (!/^[a-z0-9][a-z0-9._-]{2,120}\.signoff\.json$/u.test(input.fileName)) {
    throw new Error('GOVERNANCE_SIGN_OFF_PATH_INVALID');
  }
  const root = path.resolve(input.evidenceRoot);
  const output = path.resolve(root, input.fileName);
  if (!output.startsWith(`${root}${path.sep}`)) throw new Error('GOVERNANCE_SIGN_OFF_PATH_INVALID');
  const envelope = createGovernanceSignOffEnvelope(input.signOff);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(output, `${canonicalGovernanceJson(envelope)}\n`, { mode: 0o600, flag: 'wx' });
  return { output, sha256: envelope.signOffSha256 };
}

export async function verifyGovernanceSignOffFile(file: string) {
  return verifyGovernanceSignOffEnvelope(
    JSON.parse(await readFile(path.resolve(file), 'utf8')) as GovernanceSignOffEnvelope,
  );
}
