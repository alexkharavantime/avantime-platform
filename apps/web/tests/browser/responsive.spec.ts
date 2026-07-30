import { expect, test } from './fixtures';

test.describe('@responsive portal layouts', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantA');
  });

  test('portal avoids horizontal overflow at the configured viewport', async ({
    page,
    assertNoBrowserErrors,
  }) => {
    await page.goto('/portal/team');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await assertNoBrowserErrors();
  });

  test('mobile navigation is modal, keyboard-contained and Escape-closeable', async ({ page }) => {
    const width = page.viewportSize()?.width ?? 1440;
    await page.goto('/portal');
    const menuButton = page.getByRole('button', { name: 'Меню' });
    if (width >= 1024) {
      await expect(menuButton).toBeHidden();
      await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
      return;
    }

    await menuButton.click();
    const dialog = page.getByRole('dialog', { name: 'Мобильная навигация' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Закрыть', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.locator(':focus')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(menuButton).toBeFocused();
  });
});
