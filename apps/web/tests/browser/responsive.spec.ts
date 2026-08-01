import { expect, test } from './fixtures';

test.describe('@responsive portal layouts', () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs('tenantA');
  });

  test('portal avoids horizontal overflow at the configured viewport', async ({
    page,
    assertNoBrowserErrors,
  }, testInfo) => {
    await page.goto('/portal/team');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowingElements: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 10)
        .map((element) => ({
          className: element.className,
          right: element.getBoundingClientRect().right,
          tagName: element.tagName,
        })),
    }));
    await testInfo.attach('responsive-layout', {
      body: Buffer.from(JSON.stringify(layout, null, 2)),
      contentType: 'application/json',
    });
    expect(layout.scrollWidth - layout.clientWidth).toBeLessThanOrEqual(1);
    await assertNoBrowserErrors();
  });

  test('mobile navigation is modal, keyboard-contained and Escape-closeable', async ({
    page,
  }, testInfo) => {
    const width = page.viewportSize()?.width ?? 1440;
    await page.goto('/portal');
    const menuButton = page.getByRole('button', { name: 'Меню', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Мобильная навигация' });
    const states: Record<string, unknown> = {};
    const activeElement = () =>
      page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        const label = element?.getAttribute('aria-label');
        const text =
          element instanceof HTMLAnchorElement || element instanceof HTMLButtonElement
            ? element.textContent?.trim().slice(0, 100)
            : undefined;
        return element
          ? {
              accessibleName: label ?? text ?? null,
              id: element.id,
              role: element.getAttribute('role'),
              tagName: element.tagName,
            }
          : null;
      });
    const menuState = async () => {
      const menuButtonCount = await menuButton.count();
      return {
        activeElement: await activeElement(),
        dialogCount: await dialog.count(),
        dialogVisible: await dialog.isVisible(),
        menuButtonCount,
        menuButtonExpanded:
          menuButtonCount === 1 ? await menuButton.getAttribute('aria-expanded') : null,
        menuButtonVisible: menuButtonCount === 1 && (await menuButton.isVisible()),
      };
    };

    states.beforeOpen = await menuState();
    if (width >= 1024) {
      await expect(menuButton).toBeHidden();
      await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
      states.desktop = await menuState();
      await testInfo.attach('responsive-navigation', {
        body: Buffer.from(JSON.stringify(states, null, 2)),
        contentType: 'application/json',
      });
      return;
    }

    await menuButton.click();
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Закрыть', exact: true })).toBeFocused();
    states.beforeTab = await menuState();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.locator(':focus')).toBeVisible();
    states.afterTab = await menuState();
    states.beforeEscape = await menuState();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(menuButton).toBeFocused();
    states.afterEscape = await menuState();
    await testInfo.attach('responsive-navigation', {
      body: Buffer.from(JSON.stringify(states, null, 2)),
      contentType: 'application/json',
    });
  });
});
