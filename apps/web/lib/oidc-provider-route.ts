import type { OidcProviderConfigurationInput } from './oidc-provider-configuration';

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function stringMap(value: unknown): Record<string, string | string[]> | null {
  const record = objectValue(value);
  if (
    !record ||
    Object.values(record).some(
      (item) =>
        typeof item !== 'string' &&
        (!Array.isArray(item) || item.some((candidate) => typeof candidate !== 'string')),
    )
  ) {
    return null;
  }
  return record as Record<string, string | string[]>;
}

export function parseOidcProviderConfiguration(
  body: Record<string, unknown>,
): OidcProviderConfigurationInput | null {
  const redirectUris = stringArray(body.redirectUris);
  const allowedEmailDomains = stringArray(body.allowedEmailDomains);
  const tenantMappingPolicy = stringMap(body.tenantMappingPolicy);
  const claimMapping = objectValue(body.claimMapping);
  const groupMapping = objectValue(body.groupMapping);
  if (
    'companyId' in body ||
    'tenantId' in body ||
    'organizationId' in body ||
    typeof body.key !== 'string' ||
    !['MICROSOFT_ENTRA_ID', 'GOOGLE_WORKSPACE', 'GENERIC_OIDC'].includes(String(body.profile)) ||
    typeof body.displayName !== 'string' ||
    typeof body.issuer !== 'string' ||
    typeof body.discoveryUrl !== 'string' ||
    typeof body.clientId !== 'string' ||
    (body.clientSecretReference !== undefined && typeof body.clientSecretReference !== 'string') ||
    !redirectUris ||
    !allowedEmailDomains ||
    !['STATIC', 'PROVIDER_TENANT_CLAIM', 'HOSTED_DOMAIN', 'CLAIM'].includes(
      String(body.organizationMappingMode),
    ) ||
    !tenantMappingPolicy ||
    !claimMapping ||
    !groupMapping ||
    body.defaultRole !== 'CLIENT' ||
    !['PRESERVE_EXISTING', 'REVOKE_ON_DISABLE'].includes(String(body.sessionPolicy))
  ) {
    return null;
  }
  if (
    Object.values(claimMapping).some((value) => typeof value !== 'string') ||
    Object.values(groupMapping).some((value) => value !== 'CLIENT')
  ) {
    return null;
  }
  return {
    key: body.key,
    profile: body.profile as OidcProviderConfigurationInput['profile'],
    displayName: body.displayName,
    issuer: body.issuer,
    discoveryUrl: body.discoveryUrl,
    clientId: body.clientId,
    clientSecretReference:
      typeof body.clientSecretReference === 'string' ? body.clientSecretReference : undefined,
    redirectUris,
    allowedEmailDomains,
    organizationMappingMode:
      body.organizationMappingMode as OidcProviderConfigurationInput['organizationMappingMode'],
    tenantMappingPolicy,
    claimMapping,
    groupMapping: groupMapping as Record<string, 'CLIENT'>,
    defaultRole: 'CLIENT',
    sessionPolicy: body.sessionPolicy as OidcProviderConfigurationInput['sessionPolicy'],
  };
}
