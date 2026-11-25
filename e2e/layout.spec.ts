/**
 * VIS, Reference window: in a window 1408 px wide and 784 px tall no screen scrolls sideways, and no heading, label, or
 * button wraps onto a second line. Only a browser lays a screen out, so this is a browser test: it walks every screen
 * and state of one Campaign of the showcase preset, as the capture script does, and looks at the layout of each.
 */
import { expect, test, type Page } from '@playwright/test';

/** VIS, Reference window. */
test.use({ viewport: { width: 1408, height: 784 } });

const id = (page: Page, testId: string) => page.getByTestId(testId);
const view = (page: Page, viewId: string) => id(page, `view-${viewId}`);

/**
 * Runs in the page: what breaks the Reference window in the layout as it stands, one line each; empty when it fits.
 * - A region that scrolls sideways: its content is wider than it is.
 * - A page wider than the window.
 * - A heading, a label, a table header, or a button whose own text takes more than one line.
 */
function layoutProblems(): string[] {
  const describe = (element: Element): string => {
    const parts: string[] = [];
    let node: Element | null = element;
    for (let depth = 0; node !== null && node !== document.body && depth < 4; depth += 1) {
      const testId = node.getAttribute('data-testid');
      const classes = typeof node.className === 'string' ? node.className.trim().split(/\s+/).join('.') : '';
      parts.unshift(
        testId === null
          ? `${node.tagName.toLowerCase()}${classes === '' ? '' : `.${classes}`}`
          : `[${testId}]`,
      );
      if (testId !== null) {
        break;
      }
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const linesOf = (element: Element): number => {
    const tops = new Set<number>();
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '') {
        const range = document.createRange();
        range.selectNodeContents(child);
        for (const rect of range.getClientRects()) {
          tops.add(Math.round(rect.top / 4));
        }
      }
    }
    return tops.size;
  };
  const problems: string[] = [];
  const pageOverflow = document.documentElement.scrollWidth - window.innerWidth;
  if (pageOverflow > 0) {
    problems.push(`the page is ${pageOverflow} px wider than the window`);
  }
  for (const element of document.querySelectorAll('body *')) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      continue;
    }
    const style = getComputedStyle(element);
    const over = element.scrollWidth - element.clientWidth;
    if (over > 1 && (style.overflowX === 'auto' || style.overflowX === 'scroll')) {
      problems.push(`${describe(element)} scrolls sideways by ${over} px`);
    }
    const oneLine =
      style.fontFamily.includes('Condensed') || element.tagName === 'TH' || element.tagName === 'BUTTON';
    if (oneLine && linesOf(element) > 1) {
      problems.push(`${describe(element)} wraps: "${(element.textContent ?? '').trim().slice(0, 60)}"`);
    }
  }
  return problems;
}

/** Looks at the screen as it stands, once its fonts are loaded, and fails with every problem of its layout. */
async function expectFits(page: Page, screen: string): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  expect(await page.evaluate(layoutProblems), `the layout of ${screen} in the Reference window`).toEqual([]);
}

/**
 * Opens a Detail view from the Side panel unless it is open. CSCR, Hiding the Side panel: the Compendium View leaves the
 * Side panel out, so it is closed first.
 */
async function open(page: Page, viewId: string): Promise<void> {
  if ((await view(page, viewId).count()) === 0) {
    if ((await view(page, 'compendium').count()) > 0) {
      await page.keyboard.press('Escape');
    }
    await id(page, `nav-${viewId}`).click();
  }
  await expect(view(page, viewId)).toBeVisible();
}

/** The Agents the deployment table of the selected Active Mission site offers, by Instance ID. */
async function deployable(page: Page): Promise<string[]> {
  const result: string[] = [];
  for (const box of await page.locator('[data-testid^="deploy-pick-"]').all()) {
    if (await box.isEnabled()) {
      result.push(((await box.getAttribute('data-testid')) ?? '').slice('deploy-pick-'.length));
    }
  }
  return result;
}

test('every screen of the Campaign screen fits the Reference window', async ({ page }) => {
  await page.goto('/');
  await id(page, 'preset-select').selectOption('showcase');
  await id(page, 'seed-input').fill('layout');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toBeVisible({ timeout: 60_000 });
  await expectFits(page, 'the Campaign screen');

  // CSCR, Autopilot controls: expanded, One action and Turn actions share one row of the Side panel.
  await id(page, 'open-settings').click();
  await id(page, 'open-developer').click();
  await id(page, 'dev-show-autopilot').click();
  await expect(id(page, 'dev-show-autopilot')).toBeChecked();
  await id(page, 'close-developer').click();
  await id(page, 'autopilot-toggle').click();
  await expect(id(page, 'autopilot-turn')).toBeVisible();
  await expectFits(page, 'the expanded Autopilot controls');
  const singleBox = await id(page, 'autopilot-single').boundingBox();
  const turnBox = await id(page, 'autopilot-turn').boundingBox();
  expect(Math.round(turnBox?.y ?? -1), 'Turn actions on the row of One action').toBe(
    Math.round(singleBox?.y ?? -2),
  );
  await id(page, 'autopilot-toggle').click();

  await open(page, 'agents');
  await expectFits(page, 'the Agents View');
  await id(page, 'filter-memorial').click();
  await expectFits(page, 'the Memorial');
  await id(page, 'filter-all').click();
  await id(page, 'agents-grid').locator('[data-testid^="agent-details-"]').first().click();
  await expectFits(page, 'the Agent details');

  await open(page, 'armory');
  await expectFits(page, 'the Armory View');

  await open(page, 'missions');
  const picks = (await deployable(page)).slice(0, 3);
  for (const agent of picks) {
    await id(page, `deploy-pick-${agent}`).check();
  }
  await expectFits(page, 'the Missions View');
  await id(page, 'missions-concluded').click();
  await expectFits(page, 'the Missions View with a Concluded Mission site');
  await id(page, 'missions-concluded').click();

  for (const viewId of ['leads', 'storage', 'upgrades', 'acquisitions', 'charts', 'history', 'compendium']) {
    await open(page, viewId);
    await expectFits(page, `the Detail view ${viewId}`);
  }
  // CSCR, Hiding the Side panel: the Compendium View leaves the status bar out, so it is closed first.
  await page.keyboard.press('Escape');

  await id(page, 'open-settings').click();
  await expectFits(page, 'the Settings panel');
  await id(page, 'open-shortcuts').click();
  await expectFits(page, 'the keyboard shortcuts');
  await id(page, 'close-shortcuts').click();

  // One Turn played by hand, for the Turn summary and the Combat of the Turn report.
  await open(page, 'missions');
  const team = (await deployable(page)).slice(0, 3);
  expect(team.length, 'Agents that can be deployed to the Active Mission site').toBeGreaterThan(0);
  for (const agent of team) {
    await id(page, `deploy-pick-${agent}`).check();
  }
  // GUI, Warning on deploying tired Agents: the scenario confirms the deployment of a tired Agent.
  page.on('dialog', (dialog) => void dialog.accept());
  await page.locator('[data-testid^="deploy-mission-site-"]').click();
  await expect(id(page, `deploy-pick-${team[0] ?? ''}`)).toHaveCount(0);
  const turn = Number(await id(page, 'turn').innerText());
  await id(page, 'advance-turn').click();
  await expect(id(page, 'turn')).toHaveText(String(turn + 1), { timeout: 60_000 });
  await expect(id(page, 'turn-summary')).toBeVisible();
  await expectFits(page, 'the Turn summary');
  await id(page, 'turn-summary-report').click();
  await expectFits(page, 'the Turn Report View');
  await view(page, 'report').locator('[data-testid^="combat-"]').first().click();
  await id(page, 'combat-log-toggle').click();
  await expect(id(page, 'combat-log')).toBeVisible();
  await expectFits(page, 'the Combat report');
  await id(page, 'visualize-combat').click();
  await expect(id(page, 'combat-replay')).toBeVisible();
  // CRPLAY, Whole screen: the Combat replay covers the status bar and the Side panel.
  const covered = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="advance-turn"]')?.getBoundingClientRect();
    const top =
      button === undefined
        ? null
        : document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2);
    return top?.closest('.replay-whole-screen') !== null;
  });
  expect(covered, 'the Advance turn button lies under the Combat replay').toBe(true);
  await expectFits(page, 'the Combat replay');
  await id(page, 'replay-options').click();
  await expectFits(page, 'the Combat replay with its options shown');
});

test('the Main menu and the Combat simulator fit the Reference window', async ({ page }) => {
  await page.goto('/');
  await expect(id(page, 'new-campaign')).toBeVisible();
  await expectFits(page, 'the Main menu');
  await page.goto('/?combat-simulator');
  await expect(id(page, 'combat-simulator')).toBeVisible();
  await expectFits(page, 'the Combat simulator');
  // CSIM, Layout: the Combat replay covers the Teams pane, and its close control shows the Teams pane again.
  await id(page, 'sim-fight').click();
  await expect(id(page, 'combat-replay')).toBeVisible();
  await expect(id(page, 'sim-fight')).toHaveCount(0);
  await expectFits(page, 'the Combat replay of the Combat simulator');
  await id(page, 'replay-options').click();
  await expectFits(page, 'the Combat replay of the Combat simulator with its options shown');
  await page.keyboard.press('Escape');
  await expect(id(page, 'sim-fight')).toBeVisible();
});

/** The box of an element, in whole px of the window. */
async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  return box === null
    ? null
    : {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
}

test('the Screen limit draws every screen at the size of the Reference window, centred in a larger window', async ({
  page,
}) => {
  // VIS, Screen limit: in a window of 1920 × 1080 the area starts 256 px from the left and 148 px from the top.
  const area = { x: 256, y: 148, width: 1408, height: 784 };
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(id(page, 'new-campaign')).toBeVisible();
  expect((await boxOf(page, '#root'))?.width, 'without the Screen limit a screen fills the window').toBe(
    1920,
  );

  // The store applies a setting after the click returns, so the checkbox is clicked and then waited for.
  await id(page, 'setting-screenLimit').click();
  await expect(id(page, 'setting-screenLimit')).toBeChecked();
  expect(await boxOf(page, '#root'), 'the area of the Main menu').toEqual(area);
  await expect(id(page, 'changed-settings')).toContainText('Screen limit: on (default off)');
  await expectFits(page, 'the Main menu under the Screen limit');

  await id(page, 'preset-select').selectOption('showcase');
  await id(page, 'seed-input').fill('layout');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toBeVisible({ timeout: 60_000 });
  expect(await boxOf(page, '.campaign'), 'the area of the Campaign screen').toEqual(area);
  for (const viewId of ['agents', 'armory', 'missions', 'history']) {
    await open(page, viewId);
    await expectFits(page, `the Detail view ${viewId} under the Screen limit`);
  }

  // Everything shown over a screen stays in the area, e.g. the Settings panel.
  await id(page, 'open-settings').click();
  const dialog = await boxOf(page, '[data-testid="settings"]');
  expect(dialog, 'the Settings panel').not.toBeNull();
  if (dialog !== null) {
    expect(dialog.y).toBeGreaterThanOrEqual(area.y);
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(area.y + area.height);
    expect(dialog.x).toBeGreaterThanOrEqual(area.x);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(area.x + area.width);
  }

  // Off again, the screen fills the window.
  await id(page, 'setting-screenLimit').click();
  await expect(id(page, 'setting-screenLimit')).not.toBeChecked();
  await id(page, 'close-settings').click();
  expect(await boxOf(page, '.campaign'), 'the Campaign screen without the Screen limit').toEqual({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  });
});
