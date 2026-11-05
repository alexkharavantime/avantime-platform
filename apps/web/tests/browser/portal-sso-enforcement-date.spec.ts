import { PrismaClient } from '@prisma/client';

import { BROWSER_DATABASE_URL, browserIdentities } from './environment';
import { expect, test } from './fixtures';

// The SSO enforcement date is an instant. The datetime-local input shows it in the browser's time
// zone; saving the policy without touching the input must keep the stored instant exactly, and the
// other SSO rules (confirmation of REQUIRED, versioning, password sign-in) stay as they were.
const prisma = new PrismaClient({ datasourceUrl: BROWSER_DATABASE_URL });
const companyId = browserIdentities.identityAdmin.companyId;
const storedInstant = new Date('2031-01-15T06:45:37.250Z');
const policyFields = {
  ssoRequirement: true,
  ssoProviderId: true,
  ssoEnforcementAt: true,
  ssoGracePeriodDays: true,
  localLoginAllowed: true,
  configurationVersion: true,
} as const;
let originalPolicy: Awaited<ReturnType<typeof readPolicy>> | null = null;
let policyExisted = false;

function readPolicy() {
  return prisma.organizationIdentityPolicy.findUniqueOrThrow({
    where: { companyId },
    select: policyFields,
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const existing = await prisma.organizationIdentityPolicy.findUnique({
    where: { companyId },
    select: policyFields,
  });
  policyExisted = existing !== null;
  originalPolicy = existing;
});

test.beforeEach(async () => {
  const policy = {
    ssoRequirement: 'DISABLED' as const,
    ssoProviderId: null,
    ssoEnforcementAt: storedInstant,
    ssoGracePeriodDays: 5,
    localLoginAllowed: true,
  };
  await prisma.organizationIdentityPolicy.upsert({
    where: { companyId },
    create: { companyId, ...policy },
    update: policy,
  });
});

test.afterAll(async () => {
  if (policyExisted && originalPolicy) {
    await prisma.organizationIdentityPolicy.update({ where: { companyId }, data: originalPolicy });
  } else {
    await prisma.organizationIdentityPolicy.deleteMany({ where: { companyId } });
  }
  await prisma.$disconnect();
});

const cases = [
  {
    timezoneId: 'UTC',
    shown: '2031-01-15T06:45',
    edited: '2031-02-01T09:30',
    savedEdit: '2031-02-01T09:30:00.000Z',
  },
  {
    timezoneId: 'Europe/Riga',
    shown: '2031-01-15T08:45',
    edited: '2031-07-01T09:30',
    savedEdit: '2031-07-01T06:30:00.000Z',
  },
  {
    timezoneId: 'America/Los_Angeles',
    shown: '2031-01-14T22:45',
    edited: '2031-02-01T09:30',
    savedEdit: '2031-02-01T17:30:00.000Z',
  },
] as const;

for (const { timezoneId, shown, edited, savedEdit } of cases) {
  test.describe(`SSO enforcement date in browser time zone ${timezoneId}`, () => {
    test.use({ timezoneId });

    test('shows the local time, keeps the instant on an unedited save and saves an edit', async ({
      page,
      loginAs,
      assertNoBrowserErrors,
    }) => {
      await loginAs('identityAdmin');
      const open = async () => {
        await page.goto('/ru/portal/settings/security/identity-providers');
        await expect(page.getByRole('heading', { name: 'Политика SSO организации' })).toBeVisible();
      };
      const input = page.locator('input[type="datetime-local"]');
      const save = async () => {
        const response = page.waitForResponse(
          (candidate) =>
            new URL(candidate.url()).pathname ===
              '/api/account/security/identity-providers/policy' &&
            candidate.request().method() === 'PUT',
        );
        await page.getByRole('button', { name: 'Сохранить политику SSO' }).click();
        expect((await response).ok()).toBe(true);
        await expect(page.getByRole('status')).toHaveText('Политика SSO обновлена.');
      };

      await open();
      await expect(input).toHaveValue(shown);
      const before = await readPolicy();

      await save();
      const unedited = await readPolicy();
      expect(unedited.ssoEnforcementAt?.toISOString()).toBe(storedInstant.toISOString());
      expect(unedited).toMatchObject({
        ssoRequirement: 'DISABLED',
        ssoProviderId: null,
        ssoGracePeriodDays: 5,
        localLoginAllowed: true,
        configurationVersion: before.configurationVersion + 1,
      });

      await open();
      await expect(input).toHaveValue(shown);
      await input.fill(edited);
      await save();
      expect((await readPolicy()).ssoEnforcementAt?.toISOString()).toBe(savedEdit);

      await open();
      await expect(input).toHaveValue(edited);

      // REQUIRED still needs the typed confirmation: a dismissed prompt changes nothing.
      const beforeRequired = await readPolicy();
      page.once('dialog', (dialog) => void dialog.dismiss());
      await page.getByLabel('Режим').selectOption('REQUIRED');
      await page.getByRole('button', { name: 'Сохранить политику SSO' }).click();
      await expect(page.getByRole('status')).toHaveText('Изменение обязательного SSO отменено.');
      expect(await readPolicy()).toEqual(beforeRequired);
      await assertNoBrowserErrors();
    });
  });
}
