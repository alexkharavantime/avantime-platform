import { PrismaClient } from '@prisma/client';

import { BROWSER_DATABASE_URL, browserIdentities } from './environment';
import { expect, test } from './fixtures';

// The MFA enforcement date is an instant. The datetime-local input shows it in the browser's time
// zone; saving the policy without touching the input must keep the stored instant exactly.
const prisma = new PrismaClient({ datasourceUrl: BROWSER_DATABASE_URL });
const companyId = browserIdentities.identityOwner.companyId;
// Seconds and milliseconds are not shown by the input and must survive an unedited save.
const storedInstant = new Date('2031-01-15T06:45:37.250Z');
let originalPolicy: {
  mfaRequirement: 'OPTIONAL' | 'ADMINS' | 'ALL_MEMBERS';
  gracePeriodDays: number;
  enforcementAt: Date | null;
} | null = null;

const storedEnforcementAt = async () =>
  (
    await prisma.organizationIdentityPolicy.findUniqueOrThrow({
      where: { companyId },
      select: { enforcementAt: true },
    })
  ).enforcementAt?.toISOString() ?? null;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  originalPolicy = await prisma.organizationIdentityPolicy.findUnique({
    where: { companyId },
    select: { mfaRequirement: true, gracePeriodDays: true, enforcementAt: true },
  });
});

test.beforeEach(async () => {
  const policy = {
    mfaRequirement: 'OPTIONAL' as const,
    gracePeriodDays: 7,
    enforcementAt: storedInstant,
  };
  await prisma.organizationIdentityPolicy.upsert({
    where: { companyId },
    create: { companyId, ...policy },
    update: policy,
  });
});

test.afterAll(async () => {
  if (originalPolicy) {
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
  test.describe(`MFA enforcement date in browser time zone ${timezoneId}`, () => {
    test.use({ timezoneId });

    test('shows the local time, keeps the instant on an unedited save and saves an edit', async ({
      page,
      loginAs,
      assertNoBrowserErrors,
    }) => {
      await loginAs('identityOwner');
      await page.goto('/ru/portal/settings/security');
      const input = page.locator('input[type="datetime-local"]');
      await expect(input).toHaveValue(shown);

      const save = async () => {
        const response = page.waitForResponse(
          (candidate) =>
            new URL(candidate.url()).pathname === '/api/account/security/policy' &&
            candidate.request().method() === 'PUT',
        );
        await page.getByRole('button', { name: 'Сохранить политику' }).click();
        expect((await response).ok()).toBe(true);
        await expect(page.getByRole('status')).toHaveText('Политика MFA обновлена.');
      };

      await save();
      expect(await storedEnforcementAt()).toBe(storedInstant.toISOString());
      await expect(input).toHaveValue(shown);

      await input.fill(edited);
      await save();
      expect(await storedEnforcementAt()).toBe(savedEdit);
      await expect(input).toHaveValue(edited);

      // Reload: the saved instant is shown in this zone again, not shifted by its offset.
      await page.reload();
      await expect(input).toHaveValue(edited);
      await assertNoBrowserErrors();
    });
  });
}
