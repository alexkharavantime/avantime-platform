const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,299}$/u;
const PLACEHOLDER = /(?:change.?me|placeholder|example|todo|pending)/iu;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value || !SAFE_REFERENCE.test(value) || PLACEHOLDER.test(value)) {
    throw new Error(`${name} is missing or invalid.`);
  }
  return value;
}

function requiredTrue(name: string) {
  if (process.env[name] !== 'true') throw new Error(`${name} must be true.`);
}

function main() {
  const environment = required('IDENTITY_CEREMONY_ENVIRONMENT');
  if (!['staging', 'production'].includes(environment)) {
    throw new Error('IDENTITY_CEREMONY_ENVIRONMENT must be staging or production.');
  }
  const secretManagerReference = required('IDENTITY_SECRET_MANAGER_REFERENCE');
  const keyVersion = required('MFA_ENCRYPTION_KEY_VERSION');
  const emergencyRevokeDrillId = required('IDENTITY_EMERGENCY_REVOKE_DRILL_ID');
  const recoveryDrillId = required('IDENTITY_RECOVERY_DRILL_ID');
  const approvalReference = required('IDENTITY_SECURITY_OWNER_APPROVAL');
  requiredTrue('IDENTITY_FIRST_ADMIN_ENROLLED');
  requiredTrue('AUTH_ADMIN_MFA_REQUIRED');
  if (!process.env.MFA_ENCRYPTION_KEY) {
    throw new Error('MFA_ENCRYPTION_KEY must be injected by the secret manager.');
  }
  console.log(
    JSON.stringify({
      status: 'passed',
      environment,
      secretManagerReference,
      keyVersion,
      firstAdminEnrolled: true,
      adminMfaEnforced: true,
      emergencyRevokeDrillId,
      recoveryDrillId,
      approvalReference,
      checkedAt: new Date().toISOString(),
      secretMaterialCaptured: false,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'failed',
      errorCode: 'IDENTITY_CEREMONY_INCOMPLETE',
      message: error instanceof Error ? error.message : 'Identity ceremony check failed.',
    }),
  );
  process.exitCode = 1;
}
