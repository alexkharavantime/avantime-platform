import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import {
  decryptIdentitySecret,
  encryptIdentitySecret,
  getIdentityEncryptionKey,
} from './identity-encryption';
import { recordIdentitySecurityEvent } from './identity-security-events';
import { createOrganizationSecurityNotification } from './organization-audit';
import {
  discoverOidcProvider,
  environmentOidcSecretResolver,
  type OidcFetch,
  type OidcSecretResolver,
} from './oidc-http';
import type { AppSession } from './session';
import {
  evaluateOrganizationPermission,
  type OrganizationPermission,
} from './organization-permissions';

const SAFE_KEY = /^[a-z0-9][a-z0-9._-]{1,99}$/u;
const SAFE_TEXT = /^[\p{L}\p{N}][\p{L}\p{N} ._()/-]{1,119}$/u;
const SAFE_REFERENCE = /^(?:env:[A-Z][A-Z0-9_]{1,99}|secret-manager:\/\/[a-zA-Z0-9._/-]{3,300})$/u;
const SAFE_EVIDENCE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;
const SAFE_CLAIM = /^[a-zA-Z][a-zA-Z0-9._:-]{0,99}$/u;
const SAFE_DOMAIN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const MAX_REDIRECT_URIS = 5;

export type OidcProviderProfile = 'MICROSOFT_ENTRA_ID' | 'GOOGLE_WORKSPACE' | 'GENERIC_OIDC';
export type OidcOrganizationMappingMode =
  'STATIC' | 'PROVIDER_TENANT_CLAIM' | 'HOSTED_DOMAIN' | 'CLAIM';
export type OidcProviderSessionPolicy = 'PRESERVE_EXISTING' | 'REVOKE_ON_DISABLE';
export type OidcProviderValidationStatus =
  'NOT_VALIDATED' | 'METADATA_VALIDATED' | 'TENANT_VALIDATED' | 'REVALIDATION_REQUIRED' | 'FAILED';

export type OidcClaimMapping = {
  subject: string;
  email: string;
  emailVerified: string;
  tenant: string;
  groups: string;
  hostedDomain: string;
};

export type OidcProviderConfigurationInput = {
  key: string;
  profile: OidcProviderProfile;
  displayName: string;
  issuer: string;
  discoveryUrl: string;
  clientId: string;
  clientSecretReference?: string;
  redirectUris: string[];
  allowedEmailDomains: string[];
  organizationMappingMode: OidcOrganizationMappingMode;
  tenantMappingPolicy: Record<string, string | string[]>;
  claimMapping: Partial<OidcClaimMapping>;
  groupMapping: Record<string, 'CLIENT'>;
  defaultRole: 'CLIENT';
  sessionPolicy: OidcProviderSessionPolicy;
};

export class OidcProviderConfigurationError extends Error {
  constructor(readonly code: string) {
    super('OIDC provider configuration failed.');
  }
}

const providerSafeSelect = {
  id: true,
  key: true,
  kind: true,
  oidcProfile: true,
  displayName: true,
  companyId: true,
  issuer: true,
  clientId: true,
  clientSecretRefEncrypted: true,
  secretKeyVersion: true,
  discoveryUrl: true,
  authorizationEndpoint: true,
  tokenEndpoint: true,
  jwksUri: true,
  redirectUri: true,
  redirectUris: true,
  allowedDomains: true,
  organizationMappingMode: true,
  tenantMappingPolicy: true,
  claimMapping: true,
  groupRoleMapping: true,
  defaultRole: true,
  sessionPolicy: true,
  metadataRefreshedAt: true,
  metadataExpiresAt: true,
  validationStatus: true,
  validationEvidenceRef: true,
  createdBy: true,
  updatedBy: true,
  configurationVersion: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IdentityProviderSelect;

type OidcProviderRow = Prisma.IdentityProviderGetPayload<{
  select: typeof providerSafeSelect;
}>;

function requirePermissionTenant(session: AppSession, permission: OrganizationPermission) {
  const decision = evaluateOrganizationPermission(session, permission);
  if (!decision.allowed || !session.companyId) {
    throw new OidcProviderConfigurationError('ADMIN_TENANT_REQUIRED');
  }
  return session.companyId;
}

function validateHttpsUrl(value: string, kind: 'issuer' | 'discovery' | 'redirect') {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OidcProviderConfigurationError(`INVALID_${kind.toUpperCase()}_URL`);
  }
  const loopback =
    process.env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (
    (!loopback && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.hash ||
    (kind !== 'redirect' && url.search)
  ) {
    throw new OidcProviderConfigurationError(`INVALID_${kind.toUpperCase()}_URL`);
  }
  return url.toString();
}

function normalizeDomains(values: string[]) {
  const domains = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (domains.length > 50 || domains.some((domain) => !SAFE_DOMAIN.test(domain))) {
    throw new OidcProviderConfigurationError('INVALID_ALLOWED_DOMAINS');
  }
  return domains;
}

function normalizeRedirectUris(values: string[]) {
  const uris = [...new Set(values.map((value) => validateHttpsUrl(value.trim(), 'redirect')))];
  if (uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    throw new OidcProviderConfigurationError('INVALID_REDIRECT_ALLOWLIST');
  }
  const expectedOrigin = process.env.AUTH_PUBLIC_ORIGIN?.trim();
  if (
    expectedOrigin &&
    uris.some((value) => new URL(value).origin !== new URL(expectedOrigin).origin)
  ) {
    throw new OidcProviderConfigurationError('REDIRECT_ORIGIN_MISMATCH');
  }
  if (uris.some((value) => new URL(value).pathname !== '/api/auth/oidc/callback')) {
    throw new OidcProviderConfigurationError('INVALID_REDIRECT_ALLOWLIST');
  }
  return uris;
}

function normalizeClaimMapping(input: Partial<OidcClaimMapping>) {
  const defaults: OidcClaimMapping = {
    subject: 'sub',
    email: 'email',
    emailVerified: 'email_verified',
    tenant: 'tid',
    groups: 'groups',
    hostedDomain: 'hd',
  };
  const mapping = { ...defaults, ...input };
  if (Object.values(mapping).some((claim) => !SAFE_CLAIM.test(claim))) {
    throw new OidcProviderConfigurationError('INVALID_CLAIM_MAPPING');
  }
  return mapping;
}

function normalizeStringMap(
  value: Record<string, string | string[]>,
  code: string,
): Record<string, string | string[]> {
  const entries = Object.entries(value);
  if (
    entries.length > 50 ||
    entries.some(
      ([key, item]) =>
        !SAFE_CLAIM.test(key) ||
        (typeof item === 'string'
          ? item.length === 0 || item.length > 200
          : item.length > 50 ||
            item.some((candidate) => candidate.length === 0 || candidate.length > 200)),
    )
  ) {
    throw new OidcProviderConfigurationError(code);
  }
  return Object.fromEntries(
    entries.map(([key, item]) => [key, Array.isArray(item) ? [...new Set(item)] : item]),
  );
}

function normalizeGroupMapping(input: Record<string, 'CLIENT'>) {
  if (
    Object.keys(input).length > 100 ||
    Object.entries(input).some(
      ([group, role]) => group.length === 0 || group.length > 200 || role !== 'CLIENT',
    )
  ) {
    throw new OidcProviderConfigurationError('INVALID_GROUP_MAPPING');
  }
  return input;
}

function validateProfileRules(input: OidcProviderConfigurationInput, domains: string[]) {
  if (input.defaultRole !== 'CLIENT') {
    throw new OidcProviderConfigurationError('ADMIN_ROLE_MAPPING_FORBIDDEN');
  }
  if (input.profile === 'GOOGLE_WORKSPACE' && input.organizationMappingMode !== 'HOSTED_DOMAIN') {
    throw new OidcProviderConfigurationError('GOOGLE_HOSTED_DOMAIN_REQUIRED');
  }
  if (
    input.profile === 'GOOGLE_WORKSPACE' &&
    (input.issuer !== 'https://accounts.google.com' || domains.length === 0)
  ) {
    throw new OidcProviderConfigurationError('GOOGLE_PROVIDER_CONFIGURATION_INVALID');
  }
  if (
    input.profile === 'MICROSOFT_ENTRA_ID' &&
    input.organizationMappingMode !== 'PROVIDER_TENANT_CLAIM'
  ) {
    throw new OidcProviderConfigurationError('ENTRA_TENANT_CLAIM_REQUIRED');
  }
  if (
    input.profile === 'MICROSOFT_ENTRA_ID' &&
    (!Array.isArray(input.tenantMappingPolicy.allowedTenantIds) ||
      input.tenantMappingPolicy.allowedTenantIds.length === 0)
  ) {
    throw new OidcProviderConfigurationError('ENTRA_ALLOWED_TENANT_IDS_REQUIRED');
  }
  if (
    input.organizationMappingMode === 'CLAIM' &&
    (!Array.isArray(input.tenantMappingPolicy.allowedValues) ||
      input.tenantMappingPolicy.allowedValues.length === 0)
  ) {
    throw new OidcProviderConfigurationError('CLAIM_ALLOWED_VALUES_REQUIRED');
  }
}

export function validateOidcProviderConfigurationInput(input: OidcProviderConfigurationInput) {
  const key = input.key.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const issuer = validateHttpsUrl(input.issuer.trim(), 'issuer').replace(/\/$/u, '');
  const discoveryUrl = validateHttpsUrl(input.discoveryUrl.trim(), 'discovery');
  const clientId = input.clientId.trim();
  const domains = normalizeDomains(input.allowedEmailDomains);
  const redirectUris = normalizeRedirectUris(input.redirectUris);
  if (
    !SAFE_KEY.test(key) ||
    !SAFE_TEXT.test(displayName) ||
    clientId.length === 0 ||
    clientId.length > 300
  ) {
    throw new OidcProviderConfigurationError('INVALID_PROVIDER_CONFIGURATION');
  }
  if (input.clientSecretReference && !SAFE_REFERENCE.test(input.clientSecretReference.trim())) {
    throw new OidcProviderConfigurationError('INVALID_SECRET_REFERENCE');
  }
  validateProfileRules({ ...input, issuer }, domains);
  return {
    key,
    displayName,
    issuer,
    discoveryUrl,
    clientId,
    domains,
    redirectUris,
    claimMapping: normalizeClaimMapping(input.claimMapping),
    tenantMappingPolicy: normalizeStringMap(
      input.tenantMappingPolicy,
      'INVALID_TENANT_MAPPING_POLICY',
    ),
    groupMapping: normalizeGroupMapping(input.groupMapping),
  };
}

function safeJsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeStringArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === 'string' ? [item] : []))
    : [];
}

export function toSafeOidcProvider(row: OidcProviderRow) {
  return {
    id: row.id,
    key: row.key,
    profile: row.oidcProfile ?? ('GENERIC_OIDC' as const),
    displayName: row.displayName,
    issuer: row.issuer ?? '',
    discoveryUrl: row.discoveryUrl ?? '',
    clientId: row.clientId ?? '',
    hasClientSecretReference: Boolean(row.clientSecretRefEncrypted),
    secretKeyVersion: row.secretKeyVersion,
    redirectUris: safeStringArray(row.redirectUris),
    allowedEmailDomains: safeStringArray(row.allowedDomains),
    organizationMappingMode: row.organizationMappingMode,
    tenantMappingPolicy: safeJsonRecord(row.tenantMappingPolicy),
    claimMapping: safeJsonRecord(row.claimMapping),
    groupMapping: safeJsonRecord(row.groupRoleMapping),
    defaultRole: row.defaultRole,
    sessionPolicy: row.sessionPolicy,
    metadataRefreshedAt: row.metadataRefreshedAt?.toISOString() ?? null,
    metadataExpiresAt: row.metadataExpiresAt?.toISOString() ?? null,
    validationStatus: row.validationStatus,
    validationEvidenceRef: row.validationEvidenceRef,
    configurationVersion: row.configurationVersion,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadProvider(prisma: PrismaClient, companyId: string, id: string) {
  const row = await prisma.identityProvider.findFirst({
    where: { id, companyId, kind: 'OIDC' },
    select: providerSafeSelect,
  });
  if (!row) throw new OidcProviderConfigurationError('PROVIDER_NOT_FOUND');
  return row;
}

export async function listOidcProviders(session: AppSession) {
  const companyId = requirePermissionTenant(session, 'identity.providers.manage');
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  const rows = await prisma.identityProvider.findMany({
    where: { companyId, kind: 'OIDC' },
    select: providerSafeSelect,
    orderBy: { displayName: 'asc' },
  });
  return rows.map(toSafeOidcProvider);
}

export async function getOidcProvider(session: AppSession, id: string) {
  const companyId = requirePermissionTenant(session, 'identity.providers.manage');
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  return toSafeOidcProvider(await loadProvider(prisma, companyId, id));
}

export async function getOrganizationSsoPolicy(session: AppSession) {
  const companyId = requirePermissionTenant(session, 'identity.policy.manage');
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  const policy = await prisma.organizationIdentityPolicy.findUnique({
    where: { companyId },
    select: {
      ssoRequirement: true,
      ssoProviderId: true,
      ssoEnforcementAt: true,
      ssoGracePeriodDays: true,
      localLoginAllowed: true,
      configurationVersion: true,
    },
  });
  return {
    requirement: policy?.ssoRequirement ?? ('DISABLED' as const),
    providerId: policy?.ssoProviderId ?? null,
    enforcementAt: policy?.ssoEnforcementAt?.toISOString() ?? null,
    gracePeriodDays: policy?.ssoGracePeriodDays ?? 0,
    localLoginAllowed: policy?.localLoginAllowed ?? true,
    configurationVersion: policy?.configurationVersion ?? 0,
  };
}

export async function createOidcProvider(input: {
  session: AppSession;
  configuration: OidcProviderConfigurationInput;
  correlationId: string;
}) {
  const companyId = requirePermissionTenant(input.session, 'identity.providers.manage');
  const normalized = validateOidcProviderConfigurationInput(input.configuration);
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  const encryptedReference = input.configuration.clientSecretReference
    ? encryptIdentitySecret(
        input.configuration.clientSecretReference.trim(),
        'oidc-client-secret-ref',
      )
    : null;
  const keyVersion = encryptedReference ? getIdentityEncryptionKey().version : null;
  const created = await prisma.identityProvider.create({
    data: {
      key: normalized.key,
      kind: 'OIDC',
      oidcProfile: input.configuration.profile,
      displayName: normalized.displayName,
      companyId,
      issuer: normalized.issuer,
      clientId: normalized.clientId,
      clientSecretRefEncrypted: encryptedReference,
      secretKeyVersion: keyVersion,
      discoveryUrl: normalized.discoveryUrl,
      redirectUri: normalized.redirectUris[0],
      redirectUris: normalized.redirectUris,
      allowedDomains: normalized.domains,
      organizationMappingMode: input.configuration.organizationMappingMode,
      tenantMappingPolicy: normalized.tenantMappingPolicy,
      claimMapping: normalized.claimMapping,
      groupRoleMapping: normalized.groupMapping,
      defaultRole: 'CLIENT',
      sessionPolicy: input.configuration.sessionPolicy,
      createdBy: input.session.userId,
      updatedBy: input.session.userId,
    },
    select: providerSafeSelect,
  });
  await recordIdentitySecurityEvent({
    context: {
      userId: input.session.userId,
      companyId,
      correlationId: input.correlationId,
    },
    action: 'identity.provider.created',
    result: 'SUCCEEDED',
    metadata: {
      providerId: created.id,
      configurationVersion: created.configurationVersion,
      validationStatus: created.validationStatus,
    },
    notify: true,
    target: { type: 'identity-provider', id: created.id },
  });
  return toSafeOidcProvider(created);
}

export async function updateOidcProvider(input: {
  session: AppSession;
  providerId: string;
  expectedVersion: number;
  configuration: OidcProviderConfigurationInput;
  controlledIssuerRevalidation: boolean;
  correlationId: string;
}) {
  const companyId = requirePermissionTenant(input.session, 'identity.providers.manage');
  const normalized = validateOidcProviderConfigurationInput(input.configuration);
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  const current = await loadProvider(prisma, companyId, input.providerId);
  if (current.configurationVersion !== input.expectedVersion) {
    throw new OidcProviderConfigurationError('CONFIGURATION_VERSION_CONFLICT');
  }
  const issuerChanged = current.issuer !== normalized.issuer;
  if (issuerChanged && !input.controlledIssuerRevalidation) {
    throw new OidcProviderConfigurationError('ISSUER_REVALIDATION_REQUIRED');
  }
  const encryptedReference = input.configuration.clientSecretReference
    ? encryptIdentitySecret(
        input.configuration.clientSecretReference.trim(),
        'oidc-client-secret-ref',
      )
    : current.clientSecretRefEncrypted;
  const updated = await prisma.identityProvider.updateMany({
    where: {
      id: current.id,
      companyId,
      configurationVersion: input.expectedVersion,
    },
    data: {
      key: normalized.key,
      oidcProfile: input.configuration.profile,
      displayName: normalized.displayName,
      issuer: normalized.issuer,
      clientId: normalized.clientId,
      clientSecretRefEncrypted: encryptedReference,
      secretKeyVersion: encryptedReference ? getIdentityEncryptionKey().version : null,
      discoveryUrl: normalized.discoveryUrl,
      redirectUri: normalized.redirectUris[0],
      redirectUris: normalized.redirectUris,
      allowedDomains: normalized.domains,
      organizationMappingMode: input.configuration.organizationMappingMode,
      tenantMappingPolicy: normalized.tenantMappingPolicy,
      claimMapping: normalized.claimMapping,
      groupRoleMapping: normalized.groupMapping,
      defaultRole: 'CLIENT',
      sessionPolicy: input.configuration.sessionPolicy,
      authorizationEndpoint: null,
      tokenEndpoint: null,
      jwksUri: null,
      metadataRefreshedAt: null,
      metadataExpiresAt: null,
      validationStatus: issuerChanged ? 'REVALIDATION_REQUIRED' : 'NOT_VALIDATED',
      validationEvidenceRef: null,
      enabled: false,
      updatedBy: input.session.userId,
      configurationVersion: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new OidcProviderConfigurationError('CONFIGURATION_VERSION_CONFLICT');
  }
  const row = await loadProvider(prisma, companyId, current.id);
  await recordIdentitySecurityEvent({
    context: {
      userId: input.session.userId,
      companyId,
      correlationId: input.correlationId,
    },
    action: 'identity.provider.updated',
    result: 'SUCCEEDED',
    metadata: {
      providerId: row.id,
      configurationVersion: row.configurationVersion,
      validationStatus: row.validationStatus,
      ...(issuerChanged ? { reasonCode: 'CONTROLLED_ISSUER_CHANGE' } : {}),
    },
    notify: true,
    target: { type: 'identity-provider', id: row.id },
  });
  return toSafeOidcProvider(row);
}

export async function setOidcProviderEnabled(input: {
  session: AppSession;
  providerId: string;
  enabled: boolean;
  expectedVersion: number;
  correlationId: string;
  secretResolver?: OidcSecretResolver;
}) {
  const companyId = requirePermissionTenant(input.session, 'identity.providers.manage');
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  const provider = await loadProvider(prisma, companyId, input.providerId);
  if (provider.configurationVersion !== input.expectedVersion) {
    throw new OidcProviderConfigurationError('CONFIGURATION_VERSION_CONFLICT');
  }
  if (
    input.enabled &&
    (provider.validationStatus !== 'TENANT_VALIDATED' ||
      !provider.clientSecretRefEncrypted ||
      !provider.authorizationEndpoint ||
      !provider.tokenEndpoint ||
      !provider.jwksUri ||
      !provider.metadataExpiresAt ||
      provider.metadataExpiresAt <= new Date())
  ) {
    throw new OidcProviderConfigurationError('PROVIDER_VALIDATION_REQUIRED');
  }
  if (input.enabled) {
    try {
      const reference = decryptOidcClientSecretReference(
        provider.clientSecretRefEncrypted as string,
      );
      await (input.secretResolver ?? environmentOidcSecretResolver)(reference);
    } catch {
      throw new OidcProviderConfigurationError('CLIENT_SECRET_UNAVAILABLE');
    }
  }
  await prisma.$transaction(async (database: Prisma.TransactionClient) => {
    const changed = await database.identityProvider.updateMany({
      where: {
        id: provider.id,
        companyId,
        configurationVersion: input.expectedVersion,
      },
      data: {
        enabled: input.enabled,
        updatedBy: input.session.userId,
        configurationVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new OidcProviderConfigurationError('CONFIGURATION_VERSION_CONFLICT');
    }
    if (!input.enabled && provider.sessionPolicy === 'REVOKE_ON_DISABLE') {
      await database.userSession.updateMany({
        where: { identityProviderId: provider.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });
  const row = await loadProvider(prisma, companyId, provider.id);
  await recordIdentitySecurityEvent({
    context: {
      userId: input.session.userId,
      companyId,
      correlationId: input.correlationId,
    },
    action: input.enabled ? 'identity.provider.enabled' : 'identity.provider.disabled',
    result: 'SUCCEEDED',
    metadata: {
      providerId: row.id,
      configurationVersion: row.configurationVersion,
      validationStatus: row.validationStatus,
    },
    notify: true,
    target: { type: 'identity-provider', id: row.id },
  });
  return toSafeOidcProvider(row);
}

export function decryptOidcClientSecretReference(encrypted: string) {
  return decryptIdentitySecret(encrypted, 'oidc-client-secret-ref');
}

export function validateOidcEvidenceReference(value: string) {
  if (!SAFE_EVIDENCE_REFERENCE.test(value)) {
    throw new OidcProviderConfigurationError('INVALID_VALIDATION_EVIDENCE');
  }
  return value;
}

export async function refreshOidcProviderMetadata(input: {
  session: AppSession;
  providerId: string;
  expectedVersion: number;
  correlationId: string;
  fetcher?: OidcFetch;
  now?: Date;
}) {
  const companyId = requirePermissionTenant(input.session, 'identity.providers.manage');
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  const provider = await loadProvider(prisma, companyId, input.providerId);
  if (
    provider.configurationVersion !== input.expectedVersion ||
    !provider.discoveryUrl ||
    !provider.issuer ||
    !provider.clientId ||
    !provider.redirectUri
  ) {
    throw new OidcProviderConfigurationError('CONFIGURATION_VERSION_CONFLICT');
  }
  const contract = await discoverOidcProvider({
    discoveryUrl: provider.discoveryUrl,
    expectedIssuer: provider.issuer,
    clientId: provider.clientId,
    redirectUri: provider.redirectUri,
    providerKey: provider.key,
    fetcher: input.fetcher,
  });
  const now = input.now ?? new Date();
  const nextStatus =
    provider.validationStatus === 'TENANT_VALIDATED'
      ? 'TENANT_VALIDATED'
      : ('METADATA_VALIDATED' as const);
  const updated = await prisma.identityProvider.updateMany({
    where: {
      id: provider.id,
      companyId,
      configurationVersion: input.expectedVersion,
    },
    data: {
      authorizationEndpoint: contract.authorizationEndpoint,
      tokenEndpoint: contract.tokenEndpoint,
      jwksUri: contract.jwksUri,
      metadataRefreshedAt: now,
      metadataExpiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
      validationStatus: nextStatus,
      updatedBy: input.session.userId,
      configurationVersion: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new OidcProviderConfigurationError('CONFIGURATION_VERSION_CONFLICT');
  }
  const row = await loadProvider(prisma, companyId, provider.id);
  await recordIdentitySecurityEvent({
    context: {
      userId: input.session.userId,
      companyId,
      correlationId: input.correlationId,
    },
    action: 'identity.provider.metadata_refreshed',
    result: 'SUCCEEDED',
    metadata: {
      providerId: row.id,
      configurationVersion: row.configurationVersion,
      validationStatus: row.validationStatus,
    },
    target: { type: 'identity-provider', id: row.id },
  });
  return toSafeOidcProvider(row);
}

export async function recordOidcTenantValidationFromCallback(input: {
  session: AppSession;
  providerId: string;
  expectedVersion: number;
  authorizationRequestId: string;
  correlationId: string;
  now?: Date;
}) {
  const companyId = requirePermissionTenant(input.session, 'identity.providers.manage');
  const evidenceReference = validateOidcEvidenceReference(
    `oidc-validation:${input.authorizationRequestId}`,
  );
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  const provider = await loadProvider(prisma, companyId, input.providerId);
  const now = input.now ?? new Date();
  const authorization = await prisma.oidcAuthorizationRequest.findFirst({
    where: {
      id: input.authorizationRequestId,
      providerId: provider.id,
      userId: input.session.userId,
      purpose: 'PROVIDER_VALIDATION',
      consumedAt: { not: null },
      validatedAt: { not: null },
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (
    !authorization ||
    provider.configurationVersion !== input.expectedVersion ||
    provider.validationStatus !== 'METADATA_VALIDATED' ||
    !provider.metadataExpiresAt ||
    provider.metadataExpiresAt <= now ||
    !provider.clientSecretRefEncrypted
  ) {
    throw new OidcProviderConfigurationError('EXTERNAL_VALIDATION_PREREQUISITES_MISSING');
  }
  const updated = await prisma.identityProvider.updateMany({
    where: {
      id: provider.id,
      companyId,
      configurationVersion: input.expectedVersion,
      validationStatus: 'METADATA_VALIDATED',
    },
    data: {
      validationStatus: 'TENANT_VALIDATED',
      validationEvidenceRef: evidenceReference,
      updatedBy: input.session.userId,
      configurationVersion: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new OidcProviderConfigurationError('CONFIGURATION_VERSION_CONFLICT');
  }
  const row = await loadProvider(prisma, companyId, provider.id);
  await recordIdentitySecurityEvent({
    context: {
      userId: input.session.userId,
      companyId,
      correlationId: input.correlationId,
    },
    action: 'identity.provider.tenant_validated',
    result: 'SUCCEEDED',
    metadata: {
      providerId: row.id,
      configurationVersion: row.configurationVersion,
      validationStatus: row.validationStatus,
    },
    notify: true,
    target: { type: 'identity-provider', id: row.id },
  });
  return toSafeOidcProvider(row);
}

export async function updateOrganizationSsoPolicy(input: {
  session: AppSession;
  requirement: 'DISABLED' | 'OPTIONAL' | 'REQUIRED';
  providerId: string | null;
  enforcementAt: string | null;
  gracePeriodDays: number;
  localLoginAllowed: boolean;
  expectedVersion: number;
  correlationId: string;
}) {
  const companyId = requirePermissionTenant(input.session, 'identity.policy.manage');
  if (
    !Number.isSafeInteger(input.gracePeriodDays) ||
    input.gracePeriodDays < 0 ||
    input.gracePeriodDays > 365 ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    (input.requirement === 'DISABLED' && input.providerId !== null) ||
    (input.requirement !== 'DISABLED' && !input.providerId) ||
    (input.requirement === 'REQUIRED' && input.localLoginAllowed)
  ) {
    throw new OidcProviderConfigurationError('INVALID_SSO_POLICY');
  }
  const enforcementAt = input.enforcementAt ? new Date(input.enforcementAt) : null;
  if (enforcementAt && Number.isNaN(enforcementAt.getTime())) {
    throw new OidcProviderConfigurationError('INVALID_SSO_POLICY');
  }
  const prisma = (await getPrisma()) as PrismaClient | null;
  if (!prisma) throw new OidcProviderConfigurationError('DATABASE_UNAVAILABLE');
  if (input.providerId) {
    const provider = await loadProvider(prisma, companyId, input.providerId);
    if (
      provider.validationStatus !== 'TENANT_VALIDATED' ||
      (input.requirement === 'REQUIRED' && !provider.enabled)
    ) {
      throw new OidcProviderConfigurationError('PROVIDER_VALIDATION_REQUIRED');
    }
  }
  const existing = await prisma.organizationIdentityPolicy.findUnique({
    where: { companyId },
    select: { configurationVersion: true },
  });
  if ((existing?.configurationVersion ?? 0) !== input.expectedVersion) {
    throw new OidcProviderConfigurationError('CONFIGURATION_VERSION_CONFLICT');
  }
  const policy = existing
    ? await prisma.organizationIdentityPolicy.update({
        where: { companyId },
        data: {
          ssoRequirement: input.requirement,
          ssoProviderId: input.providerId,
          ssoEnforcementAt: enforcementAt,
          ssoGracePeriodDays: input.gracePeriodDays,
          localLoginAllowed: input.requirement === 'DISABLED' ? true : input.localLoginAllowed,
          updatedBy: input.session.userId,
          configurationVersion: { increment: 1 },
        },
      })
    : await prisma.organizationIdentityPolicy.create({
        data: {
          companyId,
          ssoRequirement: input.requirement,
          ssoProviderId: input.providerId,
          ssoEnforcementAt: enforcementAt,
          ssoGracePeriodDays: input.gracePeriodDays,
          localLoginAllowed: input.requirement === 'DISABLED' ? true : input.localLoginAllowed,
          updatedBy: input.session.userId,
        },
      });
  await recordIdentitySecurityEvent({
    context: {
      userId: input.session.userId,
      companyId,
      correlationId: input.correlationId,
    },
    action: 'identity.policy.updated',
    result: 'SUCCEEDED',
    metadata: {
      reasonCode: `SSO_${input.requirement}`,
      configurationVersion: policy.configurationVersion,
      ...(input.providerId ? { providerId: input.providerId } : {}),
    },
    notify: true,
    target: { type: 'organization-policy', id: companyId },
  });
  if (input.requirement === 'REQUIRED') {
    await createOrganizationSecurityNotification({
      session: input.session,
      targetUserId: input.session.userId,
      title: 'Политика обязательного SSO изменена',
    });
  }
  return {
    requirement: policy.ssoRequirement,
    providerId: policy.ssoProviderId,
    enforcementAt: policy.ssoEnforcementAt?.toISOString() ?? null,
    gracePeriodDays: policy.ssoGracePeriodDays,
    localLoginAllowed: policy.localLoginAllowed,
    configurationVersion: policy.configurationVersion,
  };
}
