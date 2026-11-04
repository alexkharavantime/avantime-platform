import { expect, test } from './fixtures';

// The server renders in its own time zone; the browser hydrates in the visitor's. Zones on both
// sides of UTC (and a +14 h one, where the local date differs from the server's for most of the day)
// make any time-zone-dependent server markup fail hydration (React #418).
const timeZones = ['UTC', 'Europe/Riga', 'America/Los_Angeles', 'Pacific/Kiritimati'] as const;

for (const timezoneId of timeZones) {
  test.describe(`security settings in browser time zone ${timezoneId}`, () => {
    test.use({ timezoneId });

    test('session times hydrate without mismatch and show the local time', async ({
      page,
      loginAs,
      assertNoBrowserErrors,
    }) => {
      await loginAs('tenantA');
      await page.goto('/ru/portal/settings/security');
      await expect(page.getByRole('heading', { level: 1, name: /Безопасность/ })).toBeVisible();
      const time = page.locator('time[datetime]').first();
      await expect(time).toBeVisible();
      const iso = await time.getAttribute('datetime');
      expect(iso).toBeTruthy();
      const expected = await page.evaluate(
        (value) => new Date(value).toLocaleString('ru-RU'),
        iso as string,
      );
      await expect(time).toHaveText(expected);
      expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(
        timezoneId,
      );
      await assertNoBrowserErrors();
    });
  });
}
