/** VIS, Window check: a viewport smaller than the Reference window stops play until it is large enough. */
import { expect, test, type Page } from '@playwright/test';

const id = (page: Page, testId: string) => page.getByTestId(testId);

test('a window smaller than the Reference window is refused until it is large enough', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('/');
  await expect(id(page, 'window-check')).toHaveAttribute('data-state', 'small');
  await expect(id(page, 'window-check-lack')).toContainText('208 px wider and 84 px taller');
  await expect(id(page, 'window-check-arrow-right')).toHaveCount(1);
  await expect(id(page, 'window-check-arrow-down')).toHaveCount(1);
  await expect(id(page, 'window-check-picture')).toBeVisible();

  // Blocking: every control beneath is disabled, also once the dialog is removed by other means.
  await expect(id(page, 'new-campaign')).toBeDisabled();
  await expect(id(page, 'open-settings')).toBeDisabled();
  await id(page, 'window-check').evaluate((dialog) => {
    dialog.parentElement?.remove();
  });
  await expect(id(page, 'new-campaign')).toBeDisabled();
  await page.reload();
  await expect(id(page, 'window-check')).toHaveAttribute('data-state', 'small');

  // Only the height lacks: one arrow, down.
  await page.setViewportSize({ width: 1500, height: 700 });
  await expect(id(page, 'window-check-arrow-right')).toHaveCount(0);
  await expect(id(page, 'window-check-arrow-down')).toHaveCount(1);

  // Large enough: the dialog turns to success and waits for Continue.
  await page.setViewportSize({ width: 1500, height: 950 });
  await expect(id(page, 'window-check')).toHaveAttribute('data-state', 'fixed');
  await expect(id(page, 'window-check')).toContainText('Window large enough');
  await expect(id(page, 'new-campaign')).toBeDisabled();
  await id(page, 'window-check-continue').click();
  await expect(id(page, 'window-check')).toHaveCount(0);
  await expect(id(page, 'new-campaign')).toBeEnabled();

  // Shrinking again shows the dialog again.
  await page.setViewportSize({ width: 1400, height: 950 });
  await expect(id(page, 'window-check')).toHaveAttribute('data-state', 'small');
  await expect(id(page, 'new-campaign')).toBeDisabled();
});
