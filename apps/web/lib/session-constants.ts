export const SESSION_COOKIE = 'avantime_session';
export const MFA_ENROLLMENT_COOKIE = 'avantime_mfa_enrollment';
export const MFA_ENROLLMENT_COOKIE_PATH = '/api/account/security/mfa/totp';
export const MFA_ENROLLMENT_TTL_SECONDS = 15 * 60;
export const MFA_ENROLLMENT_CHALLENGE_TTL_MS = MFA_ENROLLMENT_TTL_SECONDS * 1_000;
