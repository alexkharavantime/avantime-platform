import { isIP } from 'node:net';
import type { JsonWebKey } from 'node:crypto';

import { OidcValidationError, validateOidcProviderContract } from './oidc';
import type { OidcProviderContract } from './oidc';

const OIDC_FETCH_TIMEOUT_MS = 10_000;
const OIDC_MAX_RESPONSE_BYTES = 512 * 1024;
const ENV_SECRET_REFERENCE = /^env:([A-Z][A-Z0-9_]{1,99})$/u;

type JsonWebKeyWithKid = JsonWebKey & { kid: string; alg?: string; use?: string };
export type OidcFetch = typeof fetch;
export type OidcSecretResolver = (reference: string) => Promise<string>;

function isPrivateIp(hostname: string) {
  const version = isIP(hostname);
  if (version === 4) {
    const parts = hostname.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  return (
    version === 6 && (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd'))
  );
}

export function assertOidcNetworkUrl(
  value: string,
  environment: Record<string, string | undefined> = process.env,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OidcValidationError('OIDC_ENDPOINT_INVALID');
  }
  const mockLoopback =
    environment.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (
    (!mockLoopback && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.hash ||
    url.hostname.endsWith('.local') ||
    (!mockLoopback && (url.hostname === 'localhost' || isPrivateIp(url.hostname)))
  ) {
    throw new OidcValidationError('OIDC_ENDPOINT_INVALID');
  }
  if (environment.NODE_ENV === 'production') {
    const allowedHosts = new Set(
      (environment.OIDC_ALLOWED_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!allowedHosts.has(url.hostname.toLowerCase())) {
      throw new OidcValidationError('OIDC_ENDPOINT_NOT_ALLOWLISTED');
    }
  }
  return url.toString();
}

async function fetchOidcJson(
  url: string,
  init: RequestInit,
  fetcher: OidcFetch,
  environment: Record<string, string | undefined>,
) {
  const safeUrl = assertOidcNetworkUrl(url, environment);
  const response = await fetcher(safeUrl, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(OIDC_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new OidcValidationError('OIDC_UPSTREAM_REJECTED');
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (declaredLength > OIDC_MAX_RESPONSE_BYTES) {
    throw new OidcValidationError('OIDC_RESPONSE_TOO_LARGE');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > OIDC_MAX_RESPONSE_BYTES) {
    throw new OidcValidationError('OIDC_RESPONSE_TOO_LARGE');
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new OidcValidationError('OIDC_RESPONSE_INVALID');
  }
}

export async function discoverOidcProvider(input: {
  discoveryUrl: string;
  expectedIssuer: string;
  clientId: string;
  redirectUri: string;
  providerKey: string;
  fetcher?: OidcFetch;
  environment?: Record<string, string | undefined>;
}) {
  const environment = input.environment ?? process.env;
  const metadata = await fetchOidcJson(
    input.discoveryUrl,
    { method: 'GET', headers: { Accept: 'application/json' } },
    input.fetcher ?? fetch,
    environment,
  );
  if (
    metadata.issuer !== input.expectedIssuer ||
    typeof metadata.authorization_endpoint !== 'string' ||
    typeof metadata.token_endpoint !== 'string' ||
    typeof metadata.jwks_uri !== 'string'
  ) {
    throw new OidcValidationError('OIDC_DISCOVERY_MISMATCH');
  }
  const contract: OidcProviderContract = {
    key: input.providerKey,
    issuer: input.expectedIssuer,
    clientId: input.clientId,
    authorizationEndpoint: assertOidcNetworkUrl(metadata.authorization_endpoint, environment),
    tokenEndpoint: assertOidcNetworkUrl(metadata.token_endpoint, environment),
    jwksUri: assertOidcNetworkUrl(metadata.jwks_uri, environment),
    redirectUri: input.redirectUri,
  };
  return validateOidcProviderContract(contract, {
    allowMockLoopback: environment.NODE_ENV !== 'production',
  });
}

export async function fetchOidcJwks(input: {
  jwksUri: string;
  fetcher?: OidcFetch;
  environment?: Record<string, string | undefined>;
}) {
  const document = await fetchOidcJson(
    input.jwksUri,
    { method: 'GET', headers: { Accept: 'application/json' } },
    input.fetcher ?? fetch,
    input.environment ?? process.env,
  );
  if (!Array.isArray(document.keys) || document.keys.length === 0 || document.keys.length > 50) {
    throw new OidcValidationError('JWKS_INVALID');
  }
  const keys = document.keys.flatMap((candidate) => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate) ||
      typeof (candidate as Record<string, unknown>).kid !== 'string'
    ) {
      return [];
    }
    return [candidate as JsonWebKeyWithKid];
  });
  if (keys.length !== document.keys.length) throw new OidcValidationError('JWKS_INVALID');
  return { keys };
}

export async function exchangeOidcAuthorizationCode(input: {
  contract: OidcProviderContract;
  code: string;
  codeVerifier: string;
  clientSecret: string;
  fetcher?: OidcFetch;
  environment?: Record<string, string | undefined>;
}) {
  if (
    input.code.length < 8 ||
    input.code.length > 4_096 ||
    input.codeVerifier.length < 43 ||
    input.codeVerifier.length > 128 ||
    input.clientSecret.length < 8 ||
    input.clientSecret.length > 4_096
  ) {
    throw new OidcValidationError('TOKEN_EXCHANGE_INPUT_INVALID');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.contract.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.contract.redirectUri,
    code_verifier: input.codeVerifier,
  });
  const result = await fetchOidcJson(
    input.contract.tokenEndpoint,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
    input.fetcher ?? fetch,
    input.environment ?? process.env,
  );
  if (typeof result.id_token !== 'string' || result.id_token.length > 32_768) {
    throw new OidcValidationError('ID_TOKEN_MISSING');
  }
  return { idToken: result.id_token };
}

export const environmentOidcSecretResolver: OidcSecretResolver = async (reference) => {
  const match = ENV_SECRET_REFERENCE.exec(reference);
  if (!match) throw new OidcValidationError('SECRET_RESOLVER_UNAVAILABLE');
  const value = process.env[match[1]];
  if (!value) throw new OidcValidationError('CLIENT_SECRET_UNAVAILABLE');
  return value;
};
