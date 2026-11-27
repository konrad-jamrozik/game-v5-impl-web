import { expect, test, type Page } from '@playwright/test';

// The browser draws its scrollbars, which headless Chromium otherwise hides, so that a scrolling list takes the room
// of its scrollbar as it does for the Player.
test.use({
  viewport: { width: 1408, height: 784 },
  launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
});

const id = (page: Page, testId: string) => page.getByTestId(testId);

/**
 * COMPV, Panes: the Articles pane is as wide as its longest title whichever article of the category is shown, so that
 * selecting another article never moves the Article pane, and its scrollbar, when the list scrolls, never squeezes a
 * title onto a second line. Reveal hidden content lists every article, so that the longest lists scroll.
 */
test('the Articles pane keeps its width whichever article is shown', async ({ page }) => {
  await page.goto('/');
  await id(page, 'preset-select').selectOption('showcase');
  await id(page, 'seed-input').fill('compendium');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toBeVisible({ timeout: 60_000 });
  await id(page, 'special-event-continue').click();
  await id(page, 'open-settings').click();
  await id(page, 'open-developer').click();
  await id(page, 'dev-mode').check();
  await id(page, 'dev-reveal').check();
  await id(page, 'close-developer').click();
  await id(page, 'nav-compendium').click();
  await expect(id(page, 'view-compendium')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  for (const tab of await page.locator('[data-testid^="compendium-category-"]').all()) {
    const name = (await tab.textContent()) ?? '';
    await tab.click();
    const rows = page.locator('[data-testid="compendium-articles"] .list-row');
    const count = await rows.count();
    const widths = new Set<number>();
    for (let index = 0; index < Math.min(4, count); index += 1) {
      await rows.nth(index).click();
      widths.add(Math.round((await id(page, 'compendium-articles').boundingBox())?.width ?? -1));
    }
    expect([...widths], `the widths of the Articles pane of ${name}`).toHaveLength(1);
    // No title wraps: every row is one line tall.
    const heights = await rows.evaluateAll((all) =>
      all.map((row) => Math.round(row.getBoundingClientRect().height)),
    );
    expect(new Set(heights).size, `the row heights of the Articles pane of ${name}`).toBeLessThanOrEqual(1);
  }
});
