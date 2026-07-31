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

  for (const file of files) {
    if (mode === 'migrations' && !file.endsWith('/migration.sql')) continue;
    if (
      (mode === 'identity' ||
        mode === 'credentials' ||
        mode === 'client-tenant' ||
        mode === 'permissions') &&
      mode !== 'permissions' &&
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
      file !== 'apps/web/lib/team.ts' &&
      file !== 'apps/web/lib/portal-navigation.ts' &&
      !file.startsWith('apps/web/lib/oidc') &&
      file !== 'apps/web/components/portal/team-management.tsx'
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
