import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  governanceEvidenceHash,
  verifyGovernanceEvidenceFile,
  writeGovernanceEvidenceEnvelope,
  type GovernanceEvidence,
} from '../../lib/governance-evidence';
import { pollGovernanceCondition } from '../../lib/governance-invalidation-validation';
import {
  REQUIRED_GOVERNANCE_NOTIFICATION_EVENTS,
  validateGovernanceNotificationSet,
  type GovernanceNotificationReceipt,
} from '../../lib/governance-notification-validation';
import { verifyGovernanceSignOffFile, writeGovernanceSignOff } from '../../lib/governance-signoff';
import { validateLastOwnerRecoveryDrill } from '../../lib/managed-staging-validation';

test('managed simulation validates provider delivery, immutable evidence, reviewer and recovery policy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'avantime-governance-evidence-'));
  const now = new Date('2026-08-02T12:00:00.000Z');
  const operatorHash = governanceEvidenceHash('integration-operator');
  const reviewerHash = governanceEvidenceHash('integration-reviewer');
  try {
    let providerPolls = 0;
    const provider = await pollGovernanceCondition({
      timeoutMs: 1_000,
      intervalMs: 100,
      now: () => providerPolls * 100,
      wait: async () => undefined,
      check: async () => ++providerPolls >= 2,
    });
    assert.equal(provider.passed, true);

    const receipts: GovernanceNotificationReceipt[] = REQUIRED_GOVERNANCE_NOTIFICATION_EVENTS.map(
      (event, index) => ({
        schemaVersion: 1,
        environment: 'staging',
        event,
        correlationId: 'task-014-integration',
        receiptId: `receipt-${index}`,
        provider: 'provider-double',
        providerMessageId: `provider-message-${index}`,
        recipientHash: governanceEvidenceHash(`recipient-${index}`),
        templateId: `template-${event}`,
        status: 'delivered',
        attempts: providerPolls,
        attemptedAt: now.toISOString(),
        deliveredAt: now.toISOString(),
        failureCode: null,
        deadLetterVisible: false,
      }),
    );
    assert.equal(validateGovernanceNotificationSet(receipts).length, receipts.length);
    assert.throws(() =>
      validateGovernanceNotificationSet([
        { ...receipts[0]!, status: 'failed', deliveredAt: null },
        ...receipts.slice(1),
      ]),
    );

    const evidence: GovernanceEvidence = {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      environment: 'integration',
      ceremony: 'notification-validation',
      status: 'passed',
      correlationId: 'task-014-integration',
      commitSha: 'abcdef1234567',
      migrationVersion: '20260802120000_governance_validation',
      actorHashes: [operatorHash],
      reviewerSignOff: null,
      records: receipts.map((receipt) => ({
        type: receipt.event,
        status: 'passed',
        reference: receipt.receiptId,
        timestamp: receipt.deliveredAt!,
        expectedOutcome: 'Provider confirms delivery',
        actualOutcome: 'delivered',
        notificationIds: [receipt.providerMessageId],
      })),
    };
    const written = await writeGovernanceEvidenceEnvelope({
      evidence,
      evidenceRoot: root,
      fileName: 'task-014-integration.evidence.json',
    });
    assert.equal(
      (await verifyGovernanceEvidenceFile(written.output)).evidenceSha256,
      written.sha256,
    );
    await assert.rejects(() =>
      writeGovernanceEvidenceEnvelope({
        evidence,
        evidenceRoot: root,
        fileName: 'task-014-integration.evidence.json',
      }),
    );

    const signOff = await writeGovernanceSignOff({
      evidenceRoot: root,
      fileName: 'task-014-integration.signoff.json',
      signOff: {
        schemaVersion: 1,
        environment: 'staging',
        ceremony: 'managed-validation',
        status: 'passed',
        commitSha: 'abcdef1234567',
        migrationVersion: '20260802120000_governance_validation',
        correlationId: 'task-014-integration',
        evidenceSha256: written.sha256,
        operatorHash,
        reviewerHash,
        operatorSignatureReference: 'double:operator-signature',
        reviewerSignatureReference: 'double:reviewer-signature',
        externalApprovalReference: 'double:external-approval',
        signedAt: now.toISOString(),
        deviations: [],
        blockers: [],
        riskReferences: [],
      },
    });
    assert.equal((await verifyGovernanceSignOffFile(signOff.output)).signOffSha256, signOff.sha256);
    assert.equal(
      validateLastOwnerRecoveryDrill({
        schemaVersion: 1,
        environment: 'staging',
        mode: 'policy-drill',
        targetUserHash: governanceEvidenceHash('recovery-target'),
        operatorHash,
        reviewerHash,
        externalAuthorityReference: 'double:external-authority',
        operatorMfaReference: 'double:operator-mfa',
        reviewerMfaReference: 'double:reviewer-mfa',
        operatorAuthenticatedAt: now.toISOString(),
        reviewerAuthenticatedAt: now.toISOString(),
        temporaryGrantExpiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        correlationId: 'task-014-recovery',
        confirmation: 'DRILL LAST OWNER RECOVERY IN STAGING',
        now,
      }).status,
      'policy-validated',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
