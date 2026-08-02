const RISK_ID = /^AR-DEP-\d{4}-\d{3}$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u;
const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/@<>=| -]{2,249}$/u;

export type DependencyRiskAcceptance = {
  id: string;
  packages: string[];
  exposure: 'runtime' | 'runtime-unreachable' | 'build-time' | 'development-only';
  compensatingControls: string[];
  owner: string;
  expiresAt: string;
  remediationTrigger: string;
};

type NpmAuditVulnerability = {
  name: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  isDirect: boolean;
  range: string;
  nodes: string[];
  fixAvailable: boolean | { name: string; version: string; isSemVerMajor: boolean };
  via: Array<
    string | { source: number; title: string; url: string; range: string; severity: string }
  >;
};

export type NpmAuditReport = {
  auditReportVersion: number;
  vulnerabilities: Record<string, NpmAuditVulnerability>;
  metadata?: { vulnerabilities?: Record<string, number> };
};

export function validateDependencyRiskAcceptance(
  acceptance: DependencyRiskAcceptance,
  now = new Date(),
) {
  if (
    !RISK_ID.test(acceptance.id) ||
    acceptance.packages.length === 0 ||
    !acceptance.packages.every((name) => PACKAGE_NAME.test(name)) ||
    acceptance.compensatingControls.length === 0 ||
    !acceptance.compensatingControls.every((value) => SAFE_REFERENCE.test(value)) ||
    !SAFE_REFERENCE.test(acceptance.owner) ||
    !SAFE_REFERENCE.test(acceptance.remediationTrigger) ||
    !Number.isFinite(Date.parse(acceptance.expiresAt))
  ) {
    throw new Error('DEPENDENCY_RISK_ACCEPTANCE_INVALID');
  }
  if (new Date(acceptance.expiresAt) <= now) throw new Error('DEPENDENCY_RISK_ACCEPTANCE_EXPIRED');
  return acceptance;
}

export function analyzeDependencyAudit(input: {
  audit: NpmAuditReport;
  acceptances: DependencyRiskAcceptance[];
  now?: Date;
}) {
  if (input.audit.auditReportVersion !== 2 || !input.audit.vulnerabilities) {
    throw new Error('DEPENDENCY_AUDIT_REPORT_INVALID');
  }
  const now = input.now ?? new Date();
  const acceptances = input.acceptances.map((acceptance) =>
    validateDependencyRiskAcceptance(acceptance, now),
  );
  const duplicateRiskIds = new Set<string>();
  for (const acceptance of acceptances) {
    if (duplicateRiskIds.has(acceptance.id))
      throw new Error('DEPENDENCY_RISK_ACCEPTANCE_DUPLICATE');
    duplicateRiskIds.add(acceptance.id);
  }
  const findings = Object.values(input.audit.vulnerabilities).map((finding) => {
    if (!PACKAGE_NAME.test(finding.name) || !Array.isArray(finding.nodes)) {
      throw new Error('DEPENDENCY_AUDIT_FINDING_INVALID');
    }
    const acceptance = acceptances.find((candidate) => candidate.packages.includes(finding.name));
    const blocked =
      finding.severity === 'critical' ||
      (['moderate', 'high'].includes(finding.severity) && !acceptance);
    return {
      package: finding.name,
      severity: finding.severity,
      direct: finding.isDirect,
      affectedRange: finding.range,
      dependencyPaths: finding.nodes,
      fixAvailable: finding.fixAvailable,
      advisoryUrls: finding.via
        .filter((item): item is Exclude<typeof item, string> => typeof item !== 'string')
        .map((item) => item.url),
      riskAcceptanceId: acceptance?.id ?? null,
      exposure: acceptance?.exposure ?? null,
      blocked,
    };
  });
  return {
    schemaVersion: 1 as const,
    status: findings.some((finding) => finding.blocked) ? ('failed' as const) : ('passed' as const),
    generatedAt: now.toISOString(),
    findings,
    activeRiskAcceptances: acceptances.map((acceptance) => ({
      id: acceptance.id,
      packages: acceptance.packages,
      exposure: acceptance.exposure,
      owner: acceptance.owner,
      expiresAt: acceptance.expiresAt,
      remediationTrigger: acceptance.remediationTrigger,
    })),
  };
}
