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
 * Opens a Detail view from the Side panel unless it is open. CSCR, Hiding the Side panel: the Compendium View and the
 * Storage View leave the Side panel out, so either is closed first.
 */
async function open(page: Page, viewId: string): Promise<void> {
  if ((await view(page, viewId).count()) === 0) {
    if ((await view(page, 'compendium').count()) > 0 || (await view(page, 'storage').count()) > 0) {
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
  await id(page, 'advanced-options').click();
  await id(page, 'preset-select').selectOption('showcase');
  await id(page, 'seed-input').fill('layout');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toBeVisible({ timeout: 60_000 });
  // TSUM, Special events: the welcome stands over the Campaign just created.
  await expect(id(page, 'special-event')).toBeVisible();
  await expectFits(page, 'the welcome Special event');
  await id(page, 'special-event-continue').click();
  // TUTOR, Tutorial intro: it follows the welcome while Tutorials on is true, and its page never scrolls.
  await expect(id(page, 'special-event')).toHaveAttribute('data-trigger', 'tutorial_intro');
  await expectFits(page, 'the Tutorial intro');
  await id(page, 'special-event-continue').click();
  await expect(id(page, 'special-event')).toHaveCount(0);
  await expectFits(page, 'the Campaign screen');

  // CSCR, Autopilot controls: expanded, One action and Turn actions share one row of the Side panel.
  await id(page, 'open-settings').click();
  await id(page, 'open-developer').click();
  // GUI, Developer tools, Gated by Dev mode: every other control waits for the "Dev mode" checkbox.
  await id(page, 'dev-mode').check();
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
  await id(page, 'open-memorial').click();
  await expectFits(page, 'the Memorial');
  await page.keyboard.press('Escape');
  await id(page, 'agents-grid').locator('[data-testid^="agent-details-"]').first().click();
  await expectFits(page, 'the Agent details');

  // AVIEW, Equip table: condensed, it fits the Reference window without scrolling sideways.
  await open(page, 'storage');
  await open(page, 'agents');
  await id(page, 'open-equip').click();
  await expect(id(page, 'equip-view')).toBeVisible();
  await expect(id(page, 'equip-grid').locator('[data-testid^="weapon-"]').first()).toBeVisible();
  await expectFits(page, 'the Equip table');
  await page.keyboard.press('Escape');
  await expect(id(page, 'equip-view')).toHaveCount(0);
  await expect(id(page, 'view-agents')).toBeVisible();

  await open(page, 'missions');
  const picks = (await deployable(page)).slice(0, 3);
  for (const agent of picks) {
    await id(page, `deploy-pick-${agent}`).check();
  }
  await expectFits(page, 'the Missions View');
  await id(page, 'missions-concluded').click();
  await expectFits(page, 'the Missions View with a Concluded Mission site');
  await id(page, 'missions-concluded').click();

  for (const viewId of ['leads', 'storage', 'upgrades', 'charts', 'history', 'compendium']) {
    await open(page, viewId);
    await expectFits(page, `the Detail view ${viewId}`);
  }
  // COMPV, Panes: Enter shows the first match and leaves the search field; Escape then clears the search text and
  // keeps the Compendium View open, and only an Escape with the field empty closes it.
  await page.keyboard.press('s');
  await page.keyboard.type('agent');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(id(page, 'compendium-search')).toHaveValue('');
  await expect(view(page, 'compendium')).toBeVisible();
  // CSCR, Hiding the Side panel: the Compendium View leaves the status bar out, so it is closed first.
  await page.keyboard.press('Escape');
  await expect(view(page, 'compendium')).toHaveCount(0);

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
  const turn = Number((await id(page, 'turn').innerText()).replaceAll(',', ''));
  await id(page, 'advance-turn').click();
  await expect(id(page, 'turn')).toHaveText(String(turn + 1), { timeout: 60_000 });
  await expect(id(page, 'turn-summary')).toBeVisible();
  await expectFits(page, 'the Turn summary');
  // TSUM, Stepping through events: the Turn summary opens at its first Summary event, a Mission, and steps through
  // them with "›", "‹", and the arrow keys.
  await expect(id(page, 'summary-count')).toHaveText(/^1 \/ /);
  await expect(id(page, 'summary-kind')).toContainText('Mission');
  await expect(id(page, 'summary-prev')).toBeDisabled();
  const total = Number((await id(page, 'summary-count').innerText()).split('/')[1]?.trim());
  if (total > 1) {
    await id(page, 'summary-next').click();
    await expect(id(page, 'summary-count')).toHaveText(`2 / ${total}`);
    await expectFits(page, 'the second Summary event');
    await page.keyboard.press('ArrowLeft');
    await expect(id(page, 'summary-count')).toHaveText(`1 / ${total}`);
  }
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
  // MENU, Layout: the title, the browser tab's title, and no Music control; MENU, New Campaign: the fields under
  // Advanced options are folded when the Main menu opens.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Continuity – Demo');
  await expect(page).toHaveTitle('Continuity Demo');
  await expect(id(page, 'music-title')).toHaveCount(0);
  await expect(id(page, 'advanced-fields')).toHaveCount(0);
  await id(page, 'open-settings').click();
  // MUSIC, Music control in the Settings panel: the Music playback row; MUSIC, Playback, Start: the music plays on the
  // Main menu, at the latest from the first click, so the Track title names the Current Track and Skip is enabled.
  await expect(id(page, 'settings-music-toggle')).toBeVisible();
  await expect(id(page, 'settings-music-title')).toContainText('♪');
  await expect(id(page, 'settings-music-skip')).toBeEnabled();
  // VIS, Close controls: the Settings panel's close control stands in the dialog's upper right corner, on the title's
  // line, above the Music playback row rather than over it.
  const dialogBox = await id(page, 'settings').boundingBox();
  const closeBox = await id(page, 'close-settings').boundingBox();
  const playbackBox = await id(page, 'settings-music-control').boundingBox();
  expect(dialogBox !== null && closeBox !== null && closeBox.y - dialogBox.y <= 24).toBe(true);
  expect(closeBox !== null && playbackBox !== null && closeBox.y + closeBox.height <= playbackBox.y).toBe(
    true,
  );
  await id(page, 'close-settings').click();
  await expectFits(page, 'the Main menu');
  await id(page, 'advanced-options').click();
  await expect(id(page, 'preset-select')).toBeVisible();
  await expectFits(page, 'the Main menu with its Advanced options unfolded');
  await page.goto('/?combat-simulator');
  await expect(id(page, 'combat-simulator')).toBeVisible();
  await expectFits(page, 'the Combat simulator');
  // CSIM, Teams: the Enemies' side stands to the right of the Agents' side.
  const agentsBox = await id(page, 'sim-agents').boundingBox();
  const enemiesBox = await id(page, 'sim-enemies').boundingBox();
  expect(enemiesBox!.x).toBeGreaterThanOrEqual(agentsBox!.x + agentsBox!.width);
  // CSIM, Fighting the Combat, New seed: it changes the seed and fights nothing.
  await id(page, 'sim-new-seed').click();
  await expect(id(page, 'sim-seed')).not.toHaveValue('combat-simulator');
  await expect(id(page, 'combat-replay')).toHaveCount(0);
  // CSIM, Layout: the Combat replay covers the Teams pane, and its close control shows the Teams pane again.
  await id(page, 'sim-fight').click();
  await expect(id(page, 'combat-replay')).toBeVisible();
  await expect(id(page, 'sim-fight')).toHaveCount(0);
  // CSIM, Fighting the Combat: the title row gives the Combat outcome.
  await expect(id(page, 'sim-replay-outcome')).toHaveText(/\S/);
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

  // MENU, Layout: the Settings panel opens from the Settings button of the header.
  await id(page, 'open-settings').click();
  // The store applies a setting after the click returns, so the checkbox is clicked and then waited for.
  await id(page, 'setting-screenLimit').click();
  await expect(id(page, 'setting-screenLimit')).toBeChecked();
  expect(await boxOf(page, '#root'), 'the area of the Main menu').toEqual(area);
  await expect(id(page, 'changed-settings')).toContainText('Screen limit: on (default off)');
  await id(page, 'close-settings').click();
  await expectFits(page, 'the Main menu under the Screen limit');

  await id(page, 'advanced-options').click();
  await id(page, 'preset-select').selectOption('showcase');
  await id(page, 'seed-input').fill('layout');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toBeVisible({ timeout: 60_000 });
  await id(page, 'special-event-continue').click();
  // TUTOR, Tutorial intro: it follows the welcome while Tutorials on is true.
  await expect(id(page, 'special-event')).toHaveAttribute('data-trigger', 'tutorial_intro');
  await id(page, 'special-event-continue').click();
  expect(await boxOf(page, '.campaign'), 'the area of the Campaign screen').toEqual(area);
  for (const viewId of ['agents', 'storage', 'missions', 'history']) {
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
