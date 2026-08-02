import path from 'node:path';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { getPrisma } from '@avantime/database';

import {
  governanceEvidenceHash,
  type GovernanceEvidence,
  verifyGovernanceEvidenceFile,
  writeGovernanceEvidenceEnvelope,
} from '../lib/governance-evidence';
import {
  analyzeDependencyAudit,
  type DependencyRiskAcceptance,
  type NpmAuditReport,
} from '../lib/governance-dependency-report';
import {
  validateGovernanceInvalidationObservation,
  type GovernanceInvalidationObservation,
} from '../lib/governance-invalidation-validation';
import { validateGovernanceInvariants } from '../lib/governance-invariants';
import {
  validateGovernanceNotificationBundle,
  type GovernanceNotificationValidationBundle,
} from '../lib/governance-notification-validation';
import {
  type GovernanceSignOff,
  verifyGovernanceSignOffFile,
  writeGovernanceSignOff,
} from '../lib/governance-signoff';
import { createManagedStagingProbes } from '../lib/managed-staging-probes';
import {
  type LastOwnerRecoveryDrill,
  type ManagedCeremonyManifest,
  type ManagedStagingBoundary,
  runManagedStagingPreflight,
  validateLastOwnerRecoveryDrill,
  validateManagedCeremonyManifest,
  validateManagedStagingBoundary,
} from '../lib/managed-staging-validation';
import { expireStaleGovernanceApprovals } from '../lib/governance-approvals';
import {
  dryRunPlatformOwnerBootstrap,
  executePlatformOwnerBootstrap,
  type PlatformOwnerBootstrapInput,
} from '../lib/platform-owner-bootstrap';
import { terminatePlatformSupportSessionByOperator } from '../lib/platform-support';

const [command, subcommand, action] = process.argv.slice(2);
const environment = process.env.GOVERNANCE_OPERATION_ENVIRONMENT ?? '';
const repositoryRoot = path.resolve(new URL('../../..', import.meta.url).pathname);

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

function list(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function managedBoundary(): ManagedStagingBoundary {
  return {
    environment,
    deploymentEnvironment: required('DEPLOYMENT_ENVIRONMENT'),
    manualTrigger: process.env.GOVERNANCE_MANUAL_TRIGGER === 'true',
    operatorId: required('GOVERNANCE_OPERATOR_USER_ID'),
    mfaEventId: required('GOVERNANCE_OPERATOR_MFA_EVENT_ID'),
    authenticatedAt: required('GOVERNANCE_OPERATOR_AUTHENTICATED_AT'),
    externalSecretStoreReference: required('GOVERNANCE_SECRET_STORE_REFERENCE'),
    correlationId: required('GOVERNANCE_CORRELATION_ID'),
    confirmation: required('GOVERNANCE_MANAGED_CONFIRMATION'),
  };
}

async function readJsonEnvironment<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.resolve(required(name)), 'utf8')) as T;
}

async function npmAuditReport() {
  return new Promise<NpmAuditReport>((resolve, reject) => {
    execFile(
      'npm',
      ['audit', '--json'],
      { cwd: repositoryRoot, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout) => {
        try {
          const parsed = JSON.parse(stdout) as NpmAuditReport;
          if (!parsed.auditReportVersion)
            throw error ?? new Error('DEPENDENCY_AUDIT_REPORT_INVALID');
          resolve(parsed);
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
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
  if (command === 'preflight') {
    const boundary = managedBoundary();
    const commitSha = required('GOVERNANCE_COMMIT_SHA');
    const migrationVersion = required('GOVERNANCE_MIGRATION_VERSION');
    const report = await runManagedStagingPreflight(
      {
        boundary,
        commitSha,
        deployedCommitSha: required('DEPLOYED_COMMIT_SHA'),
        expectedMigrationVersion: migrationVersion,
        featureFlags: process.env,
        requiredFeatureFlags: list('GOVERNANCE_REQUIRED_FEATURE_FLAGS'),
        secrets: process.env,
        requiredSecretNames: list('GOVERNANCE_REQUIRED_SECRET_NAMES'),
      },
      createManagedStagingProbes({ expectedMigrationVersion: migrationVersion }),
    );
    if (
      list('GOVERNANCE_REQUIRED_FEATURE_FLAGS').length === 0 ||
      list('GOVERNANCE_REQUIRED_SECRET_NAMES').length === 0
    ) {
      throw new Error('PREFLIGHT_REQUIRED_CONFIGURATION_EMPTY');
    }
    const evidence: GovernanceEvidence = {
      schemaVersion: 1,
      generatedAt: report.checkedAt,
      environment: 'staging',
      ceremony: 'managed-preflight',
      status: report.status,
      correlationId: report.correlationId,
      commitSha,
      migrationVersion,
      actorHashes: [report.operatorHash],
      reviewerSignOff: null,
      records: report.checks.map((check) => ({
        type: check.gate,
        status: check.status,
        reference: check.reference,
        timestamp: report.checkedAt,
        expectedOutcome: 'Validation gate passes without mutation',
        actualOutcome: `${check.status}:${check.reference}`,
        details: { blocker: check.blocker },
      })),
    };
    const saved = await writeGovernanceEvidenceEnvelope({
      evidence,
      evidenceRoot: required('GOVERNANCE_EVIDENCE_DIRECTORY'),
      fileName: `managed-preflight-${governanceEvidenceHash(report.correlationId).slice(0, 16)}.evidence.json`,
    });
    if (report.status !== 'passed') process.exitCode = 1;
    return { report, evidence: saved };
  }
  const bootstrapDryRun =
    command === 'bootstrap-owner-dry-run' ||
    (command === 'staging' && subcommand === 'bootstrap' && action === 'dry-run');
  const bootstrapExecute =
    command === 'bootstrap-owner-execute' ||
    (command === 'staging' && subcommand === 'bootstrap' && action === 'execute');
  if (bootstrapDryRun) {
    if (environment === 'staging') validateManagedStagingBoundary(managedBoundary());
    return dryRunPlatformOwnerBootstrap(bootstrapInput());
  }
  if (bootstrapExecute) {
    if (environment === 'staging') validateManagedStagingBoundary(managedBoundary());
    return executePlatformOwnerBootstrap(bootstrapInput());
  }
  if (command === 'ceremony' && ['support', 'approval', 'knowledge'].includes(subcommand ?? '')) {
    validateManagedStagingBoundary(managedBoundary());
    const manifest = await readJsonEnvironment<ManagedCeremonyManifest>('GOVERNANCE_MANIFEST_PATH');
    if (manifest.ceremony !== subcommand) throw new Error('MANAGED_CEREMONY_TYPE_MISMATCH');
    return validateManagedCeremonyManifest(manifest);
  }
  if (command === 'ceremony' && subcommand === 'recovery') {
    validateManagedStagingBoundary(managedBoundary());
    return validateLastOwnerRecoveryDrill(
      await readJsonEnvironment<LastOwnerRecoveryDrill>('GOVERNANCE_MANIFEST_PATH'),
    );
  }
  if (command === 'validate' && subcommand === 'notifications') {
    validateManagedStagingBoundary(managedBoundary());
    return validateGovernanceNotificationBundle(
      await readJsonEnvironment<GovernanceNotificationValidationBundle>('GOVERNANCE_MANIFEST_PATH'),
    );
  }
  if (command === 'validate' && subcommand === 'invalidation') {
    validateManagedStagingBoundary(managedBoundary());
    return validateGovernanceInvalidationObservation(
      await readJsonEnvironment<GovernanceInvalidationObservation>('GOVERNANCE_MANIFEST_PATH'),
    );
  }
  if (command === 'evidence' && subcommand === 'verify') {
    return verifyGovernanceEvidenceFile(required('GOVERNANCE_EVIDENCE_FILE'));
  }
  if (command === 'sign-off' && subcommand === 'verify') {
    return verifyGovernanceSignOffFile(required('GOVERNANCE_SIGN_OFF_FILE'));
  }
  if (command === 'sign-off' && subcommand === 'create') {
    if (process.env.CI) throw new Error('GOVERNANCE_SIGN_OFF_CI_DENIED');
    validateManagedStagingBoundary(managedBoundary());
    const evidenceEnvelope = await verifyGovernanceEvidenceFile(
      required('GOVERNANCE_EVIDENCE_FILE'),
    );
    if (
      evidenceEnvelope.evidence.environment !== 'staging' ||
      evidenceEnvelope.evidence.commitSha !== required('GOVERNANCE_COMMIT_SHA') ||
      evidenceEnvelope.evidence.migrationVersion !== required('GOVERNANCE_MIGRATION_VERSION') ||
      evidenceEnvelope.evidence.correlationId !== required('GOVERNANCE_CORRELATION_ID')
    ) {
      throw new Error('GOVERNANCE_SIGN_OFF_EVIDENCE_MISMATCH');
    }
    const signOff: GovernanceSignOff = {
      schemaVersion: 1,
      environment: 'staging',
      ceremony: required('GOVERNANCE_SIGN_OFF_CEREMONY') as GovernanceSignOff['ceremony'],
      status: required('GOVERNANCE_SIGN_OFF_STATUS') as GovernanceSignOff['status'],
      commitSha: required('GOVERNANCE_COMMIT_SHA'),
      migrationVersion: required('GOVERNANCE_MIGRATION_VERSION'),
      correlationId: required('GOVERNANCE_CORRELATION_ID'),
      evidenceSha256: evidenceEnvelope.evidenceSha256,
      operatorHash: governanceEvidenceHash(required('GOVERNANCE_OPERATOR_USER_ID')),
      reviewerHash: governanceEvidenceHash(required('GOVERNANCE_REVIEWER_USER_ID')),
      operatorSignatureReference: required('GOVERNANCE_OPERATOR_SIGNATURE_REFERENCE'),
      reviewerSignatureReference: required('GOVERNANCE_REVIEWER_SIGNATURE_REFERENCE'),
      externalApprovalReference: required('GOVERNANCE_EXTERNAL_APPROVAL_REFERENCE'),
      signedAt: new Date().toISOString(),
      deviations: list('GOVERNANCE_SIGN_OFF_DEVIATIONS'),
      blockers: list('GOVERNANCE_SIGN_OFF_BLOCKERS'),
      riskReferences: list('GOVERNANCE_SIGN_OFF_RISKS'),
    };
    return writeGovernanceSignOff({
      signOff,
      evidenceRoot: required('GOVERNANCE_EVIDENCE_DIRECTORY'),
      fileName: `managed-${governanceEvidenceHash(signOff.correlationId).slice(0, 16)}.signoff.json`,
    });
  }
  if (command === 'dependency' && subcommand === 'report') {
    const policy = JSON.parse(
      await readFile(
        path.join(repositoryRoot, 'docs/security/dependency-risk-acceptances.json'),
        'utf8',
      ),
    ) as { schemaVersion: number; acceptances: DependencyRiskAcceptance[] };
    if (policy.schemaVersion !== 1) throw new Error('DEPENDENCY_RISK_POLICY_INVALID');
    const report = analyzeDependencyAudit({
      audit: await npmAuditReport(),
      acceptances: policy.acceptances,
    });
    if (report.status !== 'passed') process.exitCode = 1;
    return report;
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
    if (environment === 'staging') validateManagedStagingBoundary(managedBoundary());
    if (required('GOVERNANCE_CONFIRMATION') !== 'EXPIRE STALE APPROVALS') {
      throw new Error('GOVERNANCE_CONFIRMATION_REQUIRED');
    }
    return expireStaleGovernanceApprovals({
      actorId: process.env.GOVERNANCE_OPERATOR_USER_ID ?? null,
    });
  }
  if (command === 'terminate-support-session') {
    assertOperationEnvironment();
    if (environment === 'staging') validateManagedStagingBoundary(managedBoundary());
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
    if (environment === 'staging') validateManagedStagingBoundary(managedBoundary());
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
    return writeGovernanceEvidenceEnvelope({
      evidence,
      evidenceRoot: path.resolve(required('GOVERNANCE_EVIDENCE_DIRECTORY')),
      fileName: `${correlationId}.evidence.json`,
    });
  }
  throw new Error('GOVERNANCE_COMMAND_INVALID');
}

void main()
  .then((result) =>
    console.log(
      JSON.stringify({ status: process.exitCode ? 'failed' : 'passed', command, result }),
    ),
  )
  .catch((error: unknown) => {
    const errorCode = error instanceof Error ? error.message : 'GOVERNANCE_OPERATION_FAILED';
    console.error(JSON.stringify({ status: 'failed', command, errorCode }));
    process.exitCode = 1;
  });
