import path from 'node:path';

import { getPrisma } from '@avantime/database';

import {
  governanceEvidenceHash,
  type GovernanceEvidence,
  writeGovernanceEvidence,
} from '../lib/governance-evidence';
import { validateGovernanceInvariants } from '../lib/governance-invariants';
import { expireStaleGovernanceApprovals } from '../lib/governance-approvals';
import {
  dryRunPlatformOwnerBootstrap,
  executePlatformOwnerBootstrap,
  type PlatformOwnerBootstrapInput,
} from '../lib/platform-owner-bootstrap';
import { terminatePlatformSupportSessionByOperator } from '../lib/platform-support';

const command = process.argv[2];
const environment = process.env.GOVERNANCE_OPERATION_ENVIRONMENT ?? '';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function assertOperationEnvironment() {
  if (
    !['integration', 'staging'].includes(environment) ||
    process.env.DEPLOYMENT_ENVIRONMENT !== environment
  ) {
    throw new Error('GOVERNANCE_OPERATION_ENVIRONMENT_DENIED');
  }
}

function bootstrapInput(): PlatformOwnerBootstrapInput {
  assertOperationEnvironment();
  const authorizationExpiresAt = new Date(required('GOVERNANCE_BOOTSTRAP_EXPIRES_AT'));
  if (!Number.isFinite(authorizationExpiresAt.getTime())) {
    throw new Error('GOVERNANCE_BOOTSTRAP_EXPIRY_INVALID');
  }
  return {
    environment,
    expectedEnvironment: required('DEPLOYMENT_ENVIRONMENT'),
    targetUserId: required('GOVERNANCE_BOOTSTRAP_TARGET_USER_ID'),
    targetEmail: required('GOVERNANCE_BOOTSTRAP_TARGET_EMAIL'),
    sessionEvidenceId: required('GOVERNANCE_BOOTSTRAP_SESSION_ID'),
    mfaEventEvidenceId: required('GOVERNANCE_BOOTSTRAP_MFA_EVENT_ID'),
    authorizationId: required('GOVERNANCE_BOOTSTRAP_AUTHORIZATION_ID'),
    authorizationExpiresAt,
    authorizationToken: required('GOVERNANCE_BOOTSTRAP_TOKEN'),
    expectedAuthorizationHash: required('GOVERNANCE_BOOTSTRAP_TOKEN_SHA256'),
    confirmation: required('GOVERNANCE_CONFIRMATION'),
  };
}

async function database() {
  const prisma = await getPrisma();
  if (!prisma) throw new Error('GOVERNANCE_DATABASE_UNAVAILABLE');
  return prisma;
}

async function main() {
  if (command === 'bootstrap-owner-dry-run') {
    return dryRunPlatformOwnerBootstrap(bootstrapInput());
  }
  if (command === 'bootstrap-owner-execute') {
    return executePlatformOwnerBootstrap(bootstrapInput());
  }
  if (command === 'list-owners') {
    const prisma = await database();
    const owners = await prisma.platformRoleAssignment.findMany({
      where: { role: 'PLATFORM_OWNER' },
      select: { userId: true, active: true, version: true, disabledAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      owners: owners.map((owner: Record<string, unknown>) => ({
        userHash: governanceEvidenceHash(String(owner.userId)),
        active: owner.active,
        version: owner.version,
        disabledAt: owner.disabledAt,
        createdAt: owner.createdAt,
      })),
    };
  }
  if (command === 'inspect-approvals') {
    const prisma = await database();
    return {
      approvals: await prisma.governanceApprovalRequest.findMany({
        where: { status: { in: ['REQUESTED', 'APPROVED'] } },
        select: {
          id: true,
          actionType: true,
          scope: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    };
  }
  if (command === 'inspect-support-sessions') {
    const prisma = await database();
    const sessions = await prisma.platformSupportSession.findMany({
      select: {
        id: true,
        actorId: true,
        companyId: true,
        reasonCode: true,
        ticketReference: true,
        expiresAt: true,
        endedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      sessions: sessions.map((item: Record<string, unknown>) => ({
        id: item.id,
        actorHash: governanceEvidenceHash(String(item.actorId)),
        companyHash: governanceEvidenceHash(String(item.companyId)),
        reasonCode: item.reasonCode,
        ticketReference: item.ticketReference,
        expiresAt: item.expiresAt,
        endedAt: item.endedAt,
      })),
    };
  }
  if (command === 'expire-stale-approvals') {
    assertOperationEnvironment();
    if (required('GOVERNANCE_CONFIRMATION') !== 'EXPIRE STALE APPROVALS') {
      throw new Error('GOVERNANCE_CONFIRMATION_REQUIRED');
    }
    return expireStaleGovernanceApprovals({
      actorId: process.env.GOVERNANCE_OPERATOR_USER_ID ?? null,
    });
  }
  if (command === 'terminate-support-session') {
    assertOperationEnvironment();
    return terminatePlatformSupportSessionByOperator({
      operatorUserId: required('GOVERNANCE_OPERATOR_USER_ID'),
      supportSessionId: required('GOVERNANCE_SUPPORT_SESSION_ID'),
      confirmation: required('GOVERNANCE_CONFIRMATION'),
    });
  }
  if (command === 'validate-invariants') {
    return validateGovernanceInvariants();
  }
  if (command === 'export-evidence') {
    assertOperationEnvironment();
    const report = await validateGovernanceInvariants();
    const generatedAt = new Date();
    const correlationId = required('GOVERNANCE_EVIDENCE_CORRELATION_ID');
    const evidence: GovernanceEvidence = {
      schemaVersion: 1,
      generatedAt: generatedAt.toISOString(),
      environment: environment as GovernanceEvidence['environment'],
      ceremony: 'invariants',
      status: report.status,
      correlationId,
      commitSha: required('GOVERNANCE_EVIDENCE_COMMIT_SHA'),
      migrationVersion: '20260802120000_governance_validation',
      actorHashes: process.env.GOVERNANCE_OPERATOR_USER_ID
        ? [governanceEvidenceHash(process.env.GOVERNANCE_OPERATOR_USER_ID)]
        : [],
      reviewerSignOff: null,
      records: report.invariants.map((item) => ({
        type: item.name,
        status: item.passed ? 'passed' : 'failed',
        timestamp: generatedAt.toISOString(),
        expectedOutcome: item.expected,
        actualOutcome: String(item.actual),
        details: {
          passed: item.passed,
          actual: item.actual,
        },
      })),
    };
    return writeGovernanceEvidence({
      evidence,
      evidenceRoot: path.resolve(required('GOVERNANCE_EVIDENCE_DIRECTORY')),
      fileName: `${correlationId}.json`,
    });
  }
  throw new Error('GOVERNANCE_COMMAND_INVALID');
}

void main()
  .then((result) => console.log(JSON.stringify({ status: 'passed', command, result })))
  .catch((error: unknown) => {
    const errorCode = error instanceof Error ? error.message : 'GOVERNANCE_OPERATION_FAILED';
    console.error(JSON.stringify({ status: 'failed', command, errorCode }));
    process.exitCode = 1;
  });
