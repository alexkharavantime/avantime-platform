import { validateProductionConfiguration } from '../lib/production-configuration';

try {
  const result = validateProductionConfiguration();
  console.log(JSON.stringify({ status: 'ready', component: 'production-configuration', result }));
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'unavailable',
      component: 'production-configuration',
      errorCode: 'PRODUCTION_CONFIGURATION_INVALID',
      message: error instanceof Error ? error.message : 'Production configuration is invalid.',
    }),
  );
  process.exitCode = 1;
}
