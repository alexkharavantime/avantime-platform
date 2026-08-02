import {
  loadStagingConfiguration,
  summarizeStagingConfiguration,
} from '../lib/staging-configuration';

try {
  const configuration = loadStagingConfiguration();
  console.info(
    JSON.stringify({
      status: 'passed',
      configuration: summarizeStagingConfiguration(configuration),
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error instanceof Error ? error.message : 'STAGING_CONFIGURATION_INVALID',
    }),
  );
  process.exitCode = 1;
}
