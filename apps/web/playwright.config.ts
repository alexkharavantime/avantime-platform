import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BROWSER_ARTIFACT_DIRECTORY,
  BROWSER_BASE_URL,
  browserServerEnvironment,
} from './tests/browser/environment';

const legacyMacChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const localChromiumExecutable =
  process.platform === 'darwin' && os.release().startsWith('20.') && existsSync(legacyMacChromePath)
    ? legacyMacChromePath
    : undefined;

export default defineConfig({
  testDir: './tests/browser',
  outputDir: BROWSER_ARTIFACT_DIRECTORY,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['line'],
    [
      'html',
      {
        outputFolder: path.resolve(BROWSER_ARTIFACT_DIRECTORY, '../playwright-report'),
        open: 'never',
      },
    ],
  ],
  use: {
    baseURL: BROWSER_BASE_URL,
    launchOptions: localChromiumExecutable
      ? { executablePath: localChromiumExecutable }
      : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run browser:server',
    url: `${BROWSER_BASE_URL}/portal/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: browserServerEnvironment,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-tablet',
      grep: /@responsive/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 } },
    },
    {
      name: 'chromium-mobile',
      grep: /@responsive/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
});
