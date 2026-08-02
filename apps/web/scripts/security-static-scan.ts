import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
async function main() {
  const mode = process.argv[2];
  const repositoryRoot = new URL('../../..', import.meta.url);
  const { stdout } = await execute(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: repositoryRoot,
      encoding: 'buffer',
    },
  );
  const files = stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.endsWith('package-lock.json'))
    .filter((file) => !file.startsWith('.tmp/tsx/'));
  const findings: string[] = [];

  if (
    mode === 'governance' &&
    files.some((file) => /(?:^|\/)\.env\.staging(?:\.|$)/u.test(file) && !file.endsWith('.example'))
  ) {
    findings.push('repository: managed staging credential file is tracked');
  }

  for (const file of files) {
    if (mode === 'migrations' && !file.endsWith('/migration.sql')) continue;
    if (
      (mode === 'identity' ||
        mode === 'credentials' ||
        mode === 'client-tenant' ||
        mode === 'permissions' ||
        mode === 'governance') &&
      mode !== 'permissions' &&
      mode !== 'governance' &&
      !file.startsWith('apps/web/app/api/auth/') &&
      !file.startsWith('apps/web/app/api/account/security/') &&
      !file.startsWith('apps/web/components/portal/') &&
      !file.startsWith('apps/web/lib/identity') &&
      !file.startsWith('apps/web/lib/oidc') &&
      file !== '.env.example'
    ) {
      continue;
    }
    if (
      mode === 'permissions' &&
      !file.startsWith('apps/web/app/api/') &&
      !file.startsWith('apps/web/lib/organization-') &&
      !file.startsWith('apps/web/lib/platform-') &&
      !file.startsWith('apps/web/lib/governance-') &&
      file !== 'apps/web/lib/knowledge-store.ts' &&
      file !== 'apps/web/lib/team.ts' &&
      file !== 'apps/web/lib/portal-navigation.ts' &&
      !file.startsWith('apps/web/lib/oidc') &&
      file !== 'apps/web/components/portal/team-management.tsx'
    ) {
      continue;
    }
    if (
      mode === 'governance' &&
      !file.startsWith('apps/web/lib/governance-') &&
      file !== 'apps/web/lib/managed-staging-validation.ts' &&
      file !== 'apps/web/lib/managed-staging-probes.ts' &&
      file !== 'apps/web/lib/platform-owner-bootstrap.ts' &&
      file !== 'apps/web/lib/platform-support.ts' &&
      file !== 'apps/web/lib/platform-role-governance.ts' &&
      file !== 'apps/web/scripts/governance-operations.ts' &&
      file !== 'apps/web/app/api/admin/knowledge/[id]/visibility/route.ts' &&
      !file.endsWith('/20260802120000_governance_validation/migration.sql')
    ) {
      continue;
    }
    if (mode === 'defaults' && file !== '.env.example' && !file.startsWith('apps/web/lib/')) {
      continue;
    }
    let content: string;
    try {
      content = await readFile(new URL(file, repositoryRoot), 'utf8');
    } catch {
      continue;
    }
    if (
      mode === 'secrets' &&
      !file.endsWith('.example') &&
      /(?:sk-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(
        content,
      )
    ) {
      findings.push(`${file}: possible credential`);
    }
    if (
      mode === 'migrations' &&
      /\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE)|TRUNCATE\s+TABLE)\b/i.test(content)
    ) {
      findings.push(`${file}: destructive migration statement`);
    }
    if (
      mode === 'migrations' &&
      file.endsWith('/20260801120000_platform_governance/migration.sql')
    ) {
      if (/INSERT\s+INTO\s+"PlatformRoleAssignment"[\s\S]*FROM\s+"User"/iu.test(content)) {
        findings.push(`${file}: legacy user role is inferred as a platform assignment`);
      }
      if (/WHEN\s+"status"\s*=\s*'PUBLISHED'[\s\S]{0,120}'PUBLIC'/iu.test(content)) {
        findings.push(`${file}: legacy publication status is inferred as PUBLIC visibility`);
      }
    }
    if (
      (mode === 'identity' || mode === 'credentials') &&
      /\.(?:ts|tsx)$/u.test(file) &&
      /console\.(?:log|info|warn|error)\([^)]*(?:password|token|cookie|authorization|otp|recovery|secret|claims)/iu.test(
        content,
      )
    ) {
      findings.push(`${file}: identity credential may be logged`);
    }
    if (
      (mode === 'identity' || mode === 'client-tenant') &&
      file.startsWith('apps/web/components/portal/') &&
      content.startsWith("'use client'") &&
      /(?:companyId|organizationId|tenantId)/u.test(content)
    ) {
      findings.push(`${file}: client identity component contains a tenant identifier`);
    }
    if (
      (mode === 'identity' || mode === 'defaults') &&
      file === '.env.example' &&
      !/^MFA_ENCRYPTION_KEY=""$/mu.test(content)
    ) {
      findings.push(`${file}: MFA encryption key must not have a default`);
    }
    if (
      mode === 'defaults' &&
      file === '.env.example' &&
      (!/^SESSION_SECRET=""$/mu.test(content) || !/^RESEND_API_KEY=""$/mu.test(content))
    ) {
      findings.push(`${file}: production identity credentials must not have defaults`);
    }
    if (
      mode === 'defaults' &&
      file.startsWith('apps/web/lib/') &&
      /(?:SESSION_SECRET|MFA_ENCRYPTION_KEY|RESEND_API_KEY)\s*(?:\?\?|\|\|)\s*['"][^'"]+['"]/u.test(
        content,
      )
    ) {
      findings.push(`${file}: production credential has a source-code fallback`);
    }
    if (mode === 'permissions' && file.startsWith('apps/web/app/api/')) {
      if (/from ['"][^'"]*lib\/authorization['"]/u.test(content)) {
        findings.push(`${file}: API route uses the legacy role adapter`);
      }
      const inlineRoleChecks = content.match(
        /\b(?:session|authorization\.session|user|identity)\.role\s*(?:===|!==)\s*['"](?:ADMIN|CLIENT)['"]/gu,
      );
      const callbackProjection =
        file === 'apps/web/app/api/auth/oidc/callback/route.ts' &&
        inlineRoleChecks?.length === 1 &&
        inlineRoleChecks[0] === "identity.role === 'ADMIN'";
      if (inlineRoleChecks?.length && !callbackProjection) {
        findings.push(`${file}: inline API role authorization check`);
      }
    }
    if (
      mode === 'permissions' &&
      file === 'apps/web/lib/platform-permissions.ts' &&
      /(?:allowed|permission)[^\n]{0,80}(?:\?\?\s*true|\|\|\s*true)/u.test(content)
    ) {
      findings.push(`${file}: platform permission decision contains a permissive fallback`);
    }
    if (
      mode === 'permissions' &&
      file === 'apps/web/lib/knowledge-store.ts' &&
      (!content.includes('ownerScope') ||
        !content.includes('visibility') ||
        !content.includes('quarantinedAt'))
    ) {
      findings.push(`${file}: knowledge read path lacks ownership or quarantine enforcement`);
    }
    if (
      mode === 'permissions' &&
      file.startsWith('apps/web/lib/oidc') &&
      /(?:defaultRole|groupRoleMapping|groupMapping)[^\n]{0,120}(?:OWNER|['"]OWNER['"])/u.test(
        content,
      )
    ) {
      findings.push(`${file}: OIDC role mapping may assign OWNER`);
    }
    if (
      mode === 'permissions' &&
      file === 'apps/web/lib/organization-permissions.ts' &&
      /(?:allowed|permission)[^\n]{0,80}(?:\?\?\s*true|\|\|\s*true)/u.test(content)
    ) {
      findings.push(`${file}: permission decision contains a permissive fallback`);
    }
    if (
      mode === 'permissions' &&
      file === 'apps/web/lib/organization-audit.ts' &&
      /safeMetadata\([^)]*(?:email|documentText|requestContent|token|secret|claims)/iu.test(content)
    ) {
      findings.push(`${file}: organization audit may accept sensitive metadata`);
    }
    if (mode === 'governance' && file === 'apps/web/lib/platform-owner-bootstrap.ts') {
      for (const requiredControl of [
        'pg_advisory_xact_lock',
        'BOOTSTRAP FIRST PLATFORM OWNER',
        "metadata?.method !== 'TOTP'",
        "role: 'PLATFORM_OWNER'",
        'authorizationHash',
        'BOOTSTRAP_ALREADY_COMPLETED',
      ]) {
        if (!content.includes(requiredControl)) {
          findings.push(`${file}: missing bootstrap control ${requiredControl}`);
        }
      }
      if (/\bUserRole\b|\.role\s*===?\s*['"]ADMIN['"]/u.test(content)) {
        findings.push(`${file}: bootstrap depends on a legacy application role`);
      }
    }
    if (
      mode === 'governance' &&
      file.endsWith('/20260802120000_governance_validation/migration.sql') &&
      (/"(?:authorizationToken|token|password|cookie|secret)"/iu.test(content) ||
        !content.includes('KnowledgeArticle_organization_public_approval_check'))
    ) {
      findings.push(`${file}: governance migration stores a secret or lacks publication evidence`);
    }
    if (
      mode === 'governance' &&
      file === 'apps/web/scripts/governance-operations.ts' &&
      (/process\.argv\[[3-9]\]/u.test(content) || !content.includes('DEPLOYMENT_ENVIRONMENT'))
    ) {
      findings.push(`${file}: governance mutation accepts argv data or lacks environment binding`);
    }
    if (
      mode === 'governance' &&
      file === 'apps/web/lib/governance-evidence.ts' &&
      (!content.includes('SENSITIVE_KEY') || !content.includes('mode: 0o600'))
    ) {
      findings.push(`${file}: evidence redaction or file permissions are not enforced`);
    }
  }

  if (mode === 'governance') {
    const requiredControls: Record<string, string[]> = {
      'apps/web/lib/managed-staging-validation.ts': [
        'MANAGED_STAGING_ENVIRONMENT_DENIED',
        'MANAGED_STAGING_MANUAL_TRIGGER_REQUIRED',
        'LAST_OWNER_RECOVERY_DRILL_DENIED',
        "environment !== 'staging'",
      ],
      'apps/web/lib/governance-evidence.ts': [
        'canonicalGovernanceJson',
        'GOVERNANCE_EVIDENCE_TAMPERED',
        "flag: 'wx'",
      ],
      'apps/web/lib/governance-signoff.ts': [
        'operatorHash === signOff.reviewerHash',
        'GOVERNANCE_SIGN_OFF_TAMPERED',
        "flag: 'wx'",
      ],
      'apps/web/lib/governance-notification-validation.ts': [
        'SENSITIVE_KEY',
        'providerMessageId',
        'GOVERNANCE_NOTIFICATION_NOT_DELIVERED',
      ],
      'apps/web/lib/governance-invalidation-validation.ts': [
        'stalePublicResultAbsent',
        'foreignTenantDenied',
        'pollingDurationMs > 120_000',
      ],
      'apps/web/lib/governance-dependency-report.ts': [
        'DEPENDENCY_RISK_ACCEPTANCE_EXPIRED',
        "finding.severity === 'critical'",
      ],
      'apps/web/scripts/governance-operations.ts': [
        'GOVERNANCE_SIGN_OFF_CI_DENIED',
        'validateManagedStagingBoundary',
        "['audit', '--json']",
      ],
    };
    for (const [file, markers] of Object.entries(requiredControls)) {
      const content = await readFile(new URL(file, repositoryRoot), 'utf8');
      for (const marker of markers) {
        if (!content.includes(marker)) findings.push(`${file}: missing managed control ${marker}`);
      }
      if (/npm\s+audit\s+fix|audit[^\n]{0,80}--force/iu.test(content)) {
        findings.push(`${file}: dependency force remediation is forbidden`);
      }
    }
    const workflow = await readFile(new URL('.github/workflows/ci.yml', repositoryRoot), 'utf8');
    if (
      /governance:(?:preflight|bootstrap:execute|sign-off-create)/u.test(workflow) ||
      !workflow.includes('npm audit --omit=optional --audit-level=critical')
    ) {
      findings.push('.github/workflows/ci.yml: real managed operation or weakened audit gate');
    }
  }

  console.log(
    JSON.stringify({
      status: findings.length === 0 ? 'passed' : 'failed',
      mode,
      findings,
    }),
  );
  if (findings.length > 0) process.exitCode = 1;
}

void main().catch(() => {
  console.error(JSON.stringify({ status: 'failed', errorCode: 'STATIC_SCAN_FAILED' }));
  process.exitCode = 1;
});
