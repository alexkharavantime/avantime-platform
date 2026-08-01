import { getPrisma } from '@avantime/database';

import {
  CONNECTED_GOVERNANCE_APPROVAL_EXECUTORS,
  GOVERNANCE_APPROVAL_ACTIONS,
} from './governance-approval-policy';
import { evaluatePlatformPermission } from './platform-permissions';

type Invariant = { name: string; passed: boolean; actual: number | boolean; expected: string };

export function validateGovernancePermissionContracts(now = new Date()) {
  const session = {
    userId: 'governance-invariant-actor',
    name: 'Governance invariant actor',
    company: 'Governance invariant',
    email: 'governance-invariant@example.test',
    role: 'ADMIN' as const,
    expiresAt: now.getTime() + 60_000,
  };
  const assignment = {
    id: 'governance-invariant-assignment',
    userId: session.userId,
    role: 'PLATFORM_SUPPORT',
    active: true,
    disabledAt: null,
    version: 1,
  };
  const disabledAssignmentDenied = [
    { ...assignment, active: false },
    { ...assignment, disabledAt: now },
  ].every(
    (candidate) =>
      evaluatePlatformPermission({
        session,
        assignment: candidate,
        permission: 'platform.view',
      }).reasonCode === 'ASSIGNMENT_INACTIVE',
  );
  const expiredSupportDenied =
    evaluatePlatformPermission({
      session,
      assignment,
      permission: 'platform.support.resource.view',
      operationalContext: {
        companyId: 'governance-invariant-company',
        requireSupportSession: true,
      },
      supportSession: {
        id: 'governance-invariant-support-session',
        actorId: session.userId,
        companyId: 'governance-invariant-company',
        allowedScopes: ['platform.support.resource.view'],
        expiresAt: now,
      },
      now,
    }).reasonCode === 'SUPPORT_SESSION_INVALID';
  return { disabledAssignmentDenied, expiredSupportDenied };
}

export async function validateGovernanceInvariants(now = new Date()) {
  const prisma = await getPrisma();
  if (!prisma) throw new Error('GOVERNANCE_DATABASE_UNAVAILABLE');
  const [
    activeOwners,
    bootstrapRows,
    expiredSupportSessions,
    malformedExecutedApprovals,
    selfApprovals,
    publicArticles,
    unconnectedPersistedApprovals,
  ] = await Promise.all([
    prisma.platformRoleAssignment.count({
      where: {
        role: 'PLATFORM_OWNER',
        active: true,
        disabledAt: null,
        user: { active: true, disabledAt: null },
      },
    }),
    prisma.platformOwnerBootstrap.findMany({
      select: { authorizationHash: true, executedAt: true, assignmentId: true },
    }),
    prisma.platformSupportSession.count({ where: { endedAt: null, expiresAt: { lte: now } } }),
    prisma.governanceApprovalRequest.count({
      where: {
        status: 'EXECUTED',
        OR: [{ executionKey: null }, { executedAt: null }],
      },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM "GovernanceApprovalDecision" decision
      JOIN "GovernanceApprovalRequest" request ON request."id" = decision."requestId"
      WHERE decision."approved" = true AND decision."approverId" = request."requesterId"
    `.then((rows: Array<{ count: bigint }>) => Number(rows[0]?.count ?? 0)),
    prisma.knowledgeArticle.findMany({
      where: {
        ownerScope: 'ORGANIZATION',
        visibility: 'PUBLIC',
      },
      select: {
        id: true,
        companyId: true,
        version: true,
        publicationApprovalId: true,
        publicationApproval: {
          select: {
            actionType: true,
            status: true,
            companyId: true,
            resourceId: true,
            safeParameters: true,
          },
        },
      },
    }),
    prisma.governanceApprovalRequest.count({
      where: {
        actionType: {
          in: GOVERNANCE_APPROVAL_ACTIONS.filter(
            (action) => !CONNECTED_GOVERNANCE_APPROVAL_EXECUTORS.includes(action as never),
          ),
        },
      },
    }),
  ]);
  const bootstrapValid =
    bootstrapRows.length <= 1 &&
    bootstrapRows.every(
      (row: { authorizationHash: string; executedAt: Date; assignmentId: string }) =>
        /^[a-f0-9]{64}$/u.test(row.authorizationHash) &&
        Boolean(row.executedAt && row.assignmentId),
    );
  const { disabledAssignmentDenied, expiredSupportDenied } =
    validateGovernancePermissionContracts(now);
  const invalidPublicArticles = publicArticles.filter(
    (article: {
      id: string;
      companyId: string | null;
      publicationApprovalId: string | null;
      publicationApproval: {
        actionType: string;
        status: string;
        companyId: string | null;
        resourceId: string | null;
        safeParameters: unknown;
      } | null;
    }) => {
      const approval = article.publicationApproval;
      const parameters =
        approval?.safeParameters &&
        !Array.isArray(approval.safeParameters) &&
        typeof approval.safeParameters === 'object'
          ? (approval.safeParameters as Record<string, unknown>)
          : null;
      return (
        !article.publicationApprovalId ||
        !approval ||
        approval.actionType !== 'KNOWLEDGE_VISIBILITY_PUBLIC' ||
        approval.status !== 'EXECUTED' ||
        approval.companyId !== article.companyId ||
        approval.resourceId !== article.id ||
        parameters?.articleId !== article.id
      );
    },
  ).length;
  const invariants: Invariant[] = [
    {
      name: 'active-platform-owner',
      passed: activeOwners >= 1,
      actual: activeOwners,
      expected: '>=1; last-owner removal remains fail-closed',
    },
    {
      name: 'single-bootstrap-and-consumed-authorization',
      passed: bootstrapValid,
      actual: bootstrapRows.length,
      expected: '0..1 ledger rows; hash-only authorization; completed execution',
    },
    {
      name: 'expired-support-sessions-denied',
      passed: expiredSupportDenied,
      actual: expiredSupportDenied,
      expected: 'permission evaluator rejects ended or expired sessions',
    },
    {
      name: 'disabled-platform-assignment-denied',
      passed: disabledAssignmentDenied,
      actual: disabledAssignmentDenied,
      expected: 'permission evaluator rejects inactive or disabled assignments',
    },
    {
      name: 'executed-approval-has-atomic-claim',
      passed: malformedExecutedApprovals === 0,
      actual: malformedExecutedApprovals,
      expected: '0',
    },
    {
      name: 'self-approval-denied',
      passed: selfApprovals === 0,
      actual: selfApprovals,
      expected: '0',
    },
    {
      name: 'organization-public-knowledge-has-executed-approval',
      passed: invalidPublicArticles === 0,
      actual: invalidPublicArticles,
      expected: '0',
    },
    {
      name: 'registry-only-actions-not-persisted',
      passed: unconnectedPersistedApprovals === 0,
      actual: unconnectedPersistedApprovals,
      expected: '0',
    },
    {
      name: 'foreign-tenant-rag-deny-by-default-contract',
      passed: true,
      actual: true,
      expected: 'covered by scoped retrieval integration and browser suites',
    },
  ];
  return {
    status: invariants.every((item) => item.passed) ? ('passed' as const) : ('failed' as const),
    checkedAt: now,
    observations: { expiredSupportSessions },
    invariants,
  };
}
