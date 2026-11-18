/**
 * Browser tests. The same Campaign is played three ways, through the engine API, the terminal CLI, and the web
 * interface, and the full Campaign state must come out equal: an interface adds no gameplay rule of its own.
 */
import { expect, test, type Page } from '@playwright/test';
import { AUTOPILOT_AIS } from '../src/ai/index.ts';
import { createCli } from '../src/cli/cli.ts';
import { MemoryStorage, createEngine, type Engine } from '../src/engine/index.ts';

const SEED = 'equivalence';

async function startEngine(): Promise<Engine> {
  let counter = 0;
  return createEngine(
    {
      storage: new MemoryStorage(),
      newId: () => {
        counter += 1;
        return `id-${counter}`;
      },
      randomNumbers: (count) => Array.from({ length: count }, (_, index) => index + 1),
    },
    { autopilotAis: [...AUTOPILOT_AIS] },
  );
}

function inspected(engine: Engine): unknown {
  const result = engine.developer.queries.getCampaignState();
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return JSON.parse(JSON.stringify(result.value));
}

async function viaApi(): Promise<unknown> {
  const engine = await startEngine();
  const { player, session } = engine;
  await session.campaign.create({ seed: SEED });
  await player.actions.assignAgents(['agent-2', 'agent-3'], 'Contracting');
  await player.actions.startInvestigation('locate_red_dawn_member', ['agent-4']);
  await player.actions.hireAgent();
  await player.actions.advanceTurn();
  await player.actions.advanceTurn();
  await player.actions.purchaseUpgrade('training_cap');
  await player.actions.hireAgent();
  await session.timeline.undoAction();
  await player.actions.advanceTurn();
  session.developer.enable();
  return inspected(engine);
}

async function viaCli(): Promise<unknown> {
  const engine = await startEngine();
  const cli = createCli(engine, { json: true, write: () => undefined });
  for (const command of [
    `new ${SEED}`,
    'assign Contracting agent-2 agent-3',
    'investigate locate_red_dawn_member agent-4',
    'hire',
    'next',
    'next',
    'buy training_cap',
    'hire',
    'undo',
    'next',
    'dev on',
  ]) {
    await cli.execute(command);
  }
  return inspected(engine);
}

const id = (page: Page, testId: string) => page.getByTestId(testId);

/**
 * Waits for the Turn an Advance turn requested through the GUI ends in, and dismisses its Turn summary when the
 * Advance turn did something the Turn summary lists. The Turn summary appears in the same render as the new Turn.
 */
async function afterAdvance(page: Page, turn: string): Promise<void> {
  await expect(id(page, 'turn')).toHaveText(turn);
  if ((await id(page, 'turn-summary').count()) > 0) {
    await id(page, 'turn-summary-continue').click();
  }
  await expect(id(page, 'turn-summary')).toHaveCount(0);
}

async function viaWeb(page: Page): Promise<unknown> {
  await page.goto('/');
  await id(page, 'seed-input').fill(SEED);
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toHaveText('1');

  await id(page, 'nav-agents').click();
  await id(page, 'agent-agent-2').click();
  await id(page, 'agent-agent-3').click();
  await id(page, 'order-contracting').click();
  await id(page, 'nav-leads').click();
  await id(page, 'lead-locate_red_dawn_member').click();
  await id(page, 'team-pick-agent-4').check();
  // LVIEW, Team progress estimate: shown while at least one Agent is checked.
  await expect(id(page, 'team-estimate')).toContainText('/ turn');
  await id(page, 'investigate-locate_red_dawn_member').click();
  await id(page, 'nav-agents').click();
  await id(page, 'hire').click();
  await id(page, 'advance-turn').click();
  await afterAdvance(page, '2');
  await page.keyboard.press('n');
  await afterAdvance(page, '3');
  await id(page, 'nav-upgrades').click();
  await id(page, 'buy-training_cap').click();
  // UVIEW, Upgrade cards: a tally of the Acquisitions below the Buy button.
  await expect(id(page, 'tally-training_cap').locator('.tally-square')).toHaveCount(1);
  await expect(id(page, 'tally-agent_cap')).toHaveCount(0);
  await page.keyboard.press('h');
  await page.keyboard.press('u');
  await expect(id(page, 'redo')).toBeEnabled();
  await id(page, 'advance-turn').click();
  await afterAdvance(page, '4');

  // GUI, Settings panel: the developer tools open from the Tools row of the Settings panel.
  await id(page, 'open-settings').click();
  await id(page, 'open-developer').click();
  await id(page, 'dev-mode').check();
  await id(page, 'dev-inspect').click();
  return JSON.parse(await id(page, 'dev-state').innerText());
}

test('the web interface, the terminal CLI, and the engine API play the same Campaign', async ({ page }) => {
  const api = await viaApi();
  expect(await viaCli()).toEqual(api);
  expect(await viaWeb(page)).toEqual(api);
});

test('a reload continues the Campaign from its Current Autosave, with its Undone actions', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('reload');
  await id(page, 'new-campaign').click();
  await id(page, 'nav-agents').click();
  await id(page, 'hire').click();
  await id(page, 'advance-turn').click();
  await afterAdvance(page, '2');
  await id(page, 'hire').click();
  await id(page, 'hire').click();
  await id(page, 'undo').click();
  await expect(id(page, 'money')).toHaveText('370');

  await page.reload();
  await expect(id(page, 'turn')).toHaveText('2');
  await expect(id(page, 'money')).toHaveText('370');
  await expect(id(page, 'redo')).toBeEnabled();
  await id(page, 'redo').click();
  await expect(id(page, 'money')).toHaveText('320');
});

test('the Agents View keeps its columns, selects ranges, guards re-assigning, and lists the Memorial', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'new-campaign').click();
  await id(page, 'nav-agents').click();
  const columns = () =>
    page
      .locator('[data-testid="agents-grid"] thead th')
      .evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().width)));
  const before = await columns();
  const box = (n: number) => id(page, `agent-agent-${n}`).getByRole('checkbox');
  // VIS, Checkboxes: a checkbox is a 16 px square.
  const size = await box(1).boundingBox();
  expect([size?.width, size?.height]).toEqual([16, 16]);

  // VIS, Tables: clicking agent-4 and then Shift-clicking agent-2 selects agent-2 to agent-4.
  await id(page, 'agent-agent-4').click();
  await id(page, 'agent-agent-2').click({ modifiers: ['Shift'] });
  for (const n of [2, 3, 4]) {
    await expect(box(n)).toBeChecked();
  }
  await expect(box(1)).not.toBeChecked();
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  await id(page, 'order-contracting').click();
  // VIS, Tables: an Assignment that gains "· In transit" moves and resizes no column.
  await expect(id(page, 'agent-agent-2')).toContainText('In transit');
  expect(await columns()).toEqual(before);
  // VIS, Tables: a wider window moves and resizes no column; the spare width lies after the last column.
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: (viewport?.width ?? 1280) + 400, height: viewport?.height ?? 720 });
  expect(await columns()).toEqual(before);
  if (viewport !== null) {
    await page.setViewportSize(viewport);
  }

  // VIS, Tables: sort tiers. Sorting by Assignment and then by effective skill orders by effective skill first, and
  // each header shows its arrow at the opacity of its tier.
  const marks = () =>
    page
      .locator('[data-testid="agents-grid"] thead .sort-mark')
      .evaluateAll((items) =>
        items.map(
          (item) =>
            `${item.closest('th')?.dataset['testid']} ${item.textContent} ${getComputedStyle(item).opacity}`,
        ),
      );
  await id(page, 'agents-sort-assignment').click();
  await id(page, 'agents-sort-effectiveSkill').click();
  expect(await marks()).toEqual(['agents-sort-effectiveSkill ▼ 1', 'agents-sort-assignment ▲ 0.7']);
  const skills = await page
    .locator('[data-testid="agents-grid"] tbody tr td:nth-child(3)')
    .evaluateAll((cells) => cells.map((cell) => Number(cell.textContent)));
  expect(skills).toEqual([...skills].sort((a, b) => b - a));
  // Pressing a lower tier's header makes it the first tier with the direction it had.
  await id(page, 'agents-sort-assignment').click();
  expect(await marks()).toEqual(['agents-sort-effectiveSkill ▼ 0.7', 'agents-sort-assignment ▲ 1']);
  await expect(id(page, 'agents-sort-assignment')).toHaveAttribute('aria-sort', 'ascending');

  await id(page, 'advance-turn').click();
  await afterAdvance(page, '2');
  // AVIEW, Selection filters: an Agent the filter rules out stays in the table, muted, with its reason.
  page.on('dialog', (dialog) => {
    throw new Error(`Unexpected dialog: ${dialog.message()}`);
  });
  await id(page, 'filter-to-contracting').click();
  await expect(id(page, 'agent-agent-2')).toBeVisible();
  await expect(id(page, 'reason-agent-2')).toHaveText('On assignment');
  await expect(box(2)).toBeDisabled();
  // VIS, Tables: Select all selects the selectable rows, and follows them when Allow re-assigning changes.
  await id(page, 'select-all').check();
  await expect(id(page, 'agents-selected')).toHaveText('1 selected');
  await id(page, 'allow-reassigning').check();
  await expect(id(page, 'reason-agent-2')).toHaveText('Already on Contracting');
  await id(page, 'filter-to-standby').click();
  await expect(id(page, 'agents-selected')).toHaveText('3 selected');
  // AVIEW, Re-assigning: with Allow re-assigning checked, recalling from Contracting asks no confirmation.
  await id(page, 'select-all').uncheck();
  await id(page, 'agent-agent-2').click();
  await id(page, 'order-standby').click();
  await expect(id(page, 'agent-agent-2')).toContainText('Standby · In transit');
  // AGENT, Transit rule, Re-routing: an Agent In transit can be assigned again and stays In transit.
  await id(page, 'filter-to-standby').click();
  await expect(box(2)).toBeEnabled();
  page.removeAllListeners('dialog');

  // AVIEW, Memorial: a Dismissed Agent leaves the table and appears in the Memorial with its own number columns.
  await id(page, 'allow-reassigning').uncheck();
  await expect(id(page, 'agents-selected')).toHaveText('0 selected');
  await id(page, 'agent-agent-1').click();
  page.once('dialog', (dialog) => void dialog.accept());
  await id(page, 'dismiss').click();
  await expect(id(page, 'agent-agent-1')).toHaveCount(0);
  await id(page, 'filter-memorial').click();
  await expect(id(page, 'memorial-agent-1')).toContainText('Dismissed');
  await expect(id(page, 'memorial-agent-1')).toContainText('T2');
});

test('controls stay still: a note never sets its row height and a changed value never moves a button', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('still');
  await id(page, 'new-campaign').click();
  await id(page, 'nav-upgrades').click();
  const undoBefore = await id(page, 'undo').boundingBox();
  // VIS, Alignment: the row of a Buy button is as tall as the button, whatever the note beside it.
  const rows = page.locator('.upgrade-buy');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    const rowBox = await row.boundingBox();
    const buttonBox = await row.locator('.btn').boundingBox();
    expect(rowBox?.height).toBe(buttonBox?.height);
  }
  // VIS, Controls stay still: buying changes Money in the Status bar and moves no button there.
  await id(page, 'buy-training_cap').click();
  await expect(id(page, 'undo')).toBeEnabled();
  expect(await id(page, 'undo').boundingBox()).toEqual(undoBefore);
});

test('the Situation panel stays in view beside a Detail view and an item opens its Detail view', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('situation');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'situation')).toBeVisible();
  await id(page, 'nav-history').click();
  await expect(id(page, 'view-history')).toBeVisible();
  await expect(id(page, 'situation')).toBeVisible();
  await id(page, 'situation-row-locate_red_dawn_member').click();
  await expect(id(page, 'nav-leads')).toHaveAttribute('aria-pressed', 'true');
  await expect(id(page, 'lead-details-locate_red_dawn_member')).toBeVisible();
  // CSCR, Detail views: selecting the button of the open Detail view, or Escape, closes it.
  await id(page, 'nav-leads').click();
  await expect(id(page, 'view-leads')).toHaveCount(0);
  await id(page, 'nav-compendium').click();
  await expect(id(page, 'compendium-category-Guide')).toBeVisible();
  // SOUNDS, Main click: selecting a category or an article of the Compendium View opens it to be read.
  await expect(id(page, 'compendium-category-Guide')).toHaveAttribute('data-sound', 'main');
  await expect(id(page, 'compendium-articles').locator('button').first()).toHaveAttribute(
    'data-sound',
    'main',
  );
  await expect(id(page, 'article-locate_red_dawn_safehouse_article')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(id(page, 'view-compendium')).toHaveCount(0);
});
