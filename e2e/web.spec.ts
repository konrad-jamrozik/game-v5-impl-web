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
  await player.actions.startInvestigation('criminal_organizations', ['agent-4']);
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
    'investigate criminal_organizations agent-4',
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

/**
 * CSCR, Autopilot settings: the Autopilot controls stay hidden until the "Show Autopilot controls" checkbox of the
 * developer tools, which Dev mode does not gate, turns Autopilot controls shown on.
 */
async function showAutopilotControls(page: Page): Promise<void> {
  await expect(id(page, 'autopilot-bar')).toHaveCount(0);
  await id(page, 'open-settings').click();
  await id(page, 'open-developer').click();
  await expect(id(page, 'dev-mode')).not.toBeChecked();
  // The setting is stored asynchronously, so the checkbox is checked once Game storage holds it.
  await id(page, 'dev-show-autopilot').click();
  await expect(id(page, 'dev-show-autopilot')).toBeChecked();
  await id(page, 'close-developer').click();
  await expect(id(page, 'autopilot-bar')).toBeVisible();
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
  await id(page, 'lead-criminal_organizations').click();
  // LVIEW, Selected Lead: a Lead without a Faction shows none, and one whose `on_completion` is empty no "On
  // completion" heading.
  await expect(id(page, 'lead-details-criminal_organizations')).toBeVisible();
  await expect(id(page, 'lead-faction')).toHaveCount(0);
  await expect(id(page, 'lead-on-completion')).toHaveCount(0);
  await id(page, 'team-pick-agent-4').check();
  // LVIEW, Team progress estimate: shown while at least one Agent is checked.
  await expect(id(page, 'team-estimate')).toContainText('/ turn');
  await id(page, 'investigate-criminal_organizations').click();
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
  const buyBox = await id(page, 'buy-training_cap').boundingBox();
  const tallyBox = await id(page, 'tally-training_cap').boundingBox();
  expect(tallyBox?.y ?? 0).toBeGreaterThanOrEqual((buyBox?.y ?? 0) + (buyBox?.height ?? 0));
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

test('the Autopilot controls leave the Turn to the Player and say why each engagement ended', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('autopilot');
  await id(page, 'new-campaign').click();
  await showAutopilotControls(page);
  await id(page, 'autopilot-toggle').click();
  // CSCR, Autopilot controls: neither One action nor This Turn's actions advances the Turn.
  await expect(id(page, 'autopilot-turn')).toHaveText("This Turn's actions");
  await id(page, 'autopilot-turn').click();
  await expect(id(page, 'autopilot-ended')).toHaveText(
    /^Autopilot finished this Turn's actions: \d+ Player actions?\. Advancing the Turn is up to you\.$/,
  );
  await expect(id(page, 'turn')).toHaveText('1');
  await id(page, 'autopilot-single').click();
  await expect(id(page, 'autopilot-ended')).toHaveText('Autopilot has nothing more to do this Turn.');
  await expect(id(page, 'turn')).toHaveText('1');
  // The line stays until the World state changes.
  await id(page, 'undo').click();
  await expect(id(page, 'autopilot-ended')).toHaveCount(0);
  await id(page, 'redo').click();
  await expect(id(page, 'autopilot-ended')).toHaveCount(0);
});

test('the Agents View keeps its columns, selects ranges, locks Blocked by under an Assignment filter, and lists the Memorial', async ({
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
  // AVIEW, Assignment filters: an Agent the filter rules out stays in the table, muted, with what blocks it, and the
  // locked Blocked by tier puts the Agents that can be selected first, above the Player's tiers.
  page.on('dialog', (dialog) => {
    throw new Error(`Unexpected dialog: ${dialog.message()}`);
  });
  await id(page, 'filter-to-contracting').click();
  await expect(id(page, 'agent-agent-2')).toBeVisible();
  await expect(id(page, 'blocked-by-agent-2')).toHaveText('On assignment');
  await expect(box(2)).toBeDisabled();
  const lockedMarks = [
    'agents-sort-effectiveSkill ▼ 0.45',
    'agents-sort-assignment ▲ 0.7',
    'agents-sort-blockedBy ▲ 1',
  ];
  expect(await marks()).toEqual(lockedMarks);
  await expect(page.locator('[data-testid="agents-grid"] tbody tr').first()).toHaveAttribute(
    'data-testid',
    'agent-agent-1',
  );
  // VIS, Tables: pressing a locked tier's header changes nothing.
  await id(page, 'agents-sort-blockedBy').click();
  expect(await marks()).toEqual(lockedMarks);
  // VIS, Tables: Select all selects the selectable rows, and follows them when the Assignment filter changes.
  await id(page, 'select-all').check();
  await expect(id(page, 'agents-selected')).toHaveText('1 selected');
  await id(page, 'filter-to-standby').click();
  await expect(id(page, 'blocked-by-agent-1')).toHaveText('Already on Standby');
  await expect(id(page, 'agents-selected')).toHaveText('3 selected');
  // AVIEW, Header: recalling from Contracting is made at once, without a confirmation.
  await id(page, 'select-all').uncheck();
  await id(page, 'agent-agent-2').click();
  await id(page, 'order-standby').click();
  await expect(id(page, 'agent-agent-2')).toContainText('Standby · In transit');
  // AGENT, Transit rule, No orders in transit: an Agent In transit cannot be selected while a filter is on.
  await expect(id(page, 'blocked-by-agent-2')).toHaveText('In transit');
  await expect(box(2)).toBeDisabled();
  // AVIEW, Assignment filters: with none on, every Agent can be selected and the buttons follow the whole selection.
  await id(page, 'filter-to-standby').click();
  expect(await marks()).toEqual(['agents-sort-effectiveSkill ▼ 0.7', 'agents-sort-assignment ▲ 1']);
  await expect(box(2)).toBeEnabled();
  await box(2).check();
  await expect(id(page, 'order-standby')).toBeDisabled();
  await expect(id(page, 'order-training')).toBeDisabled();
  await expect(id(page, 'dismiss')).toBeDisabled();
  page.removeAllListeners('dialog');

  // AVIEW, Memorial: a Dismissed Agent leaves the table and appears in the Memorial with its own number columns.
  await box(2).uncheck();
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
  // SITP, Groups: no Leads group; the Agents line opens the Agents View.
  await expect(id(page, 'situation-leads')).toHaveCount(0);
  await id(page, 'situation-row-agents').click();
  await expect(id(page, 'nav-agents')).toHaveAttribute('aria-pressed', 'true');
  await expect(id(page, 'view-agents')).toBeVisible();
  // CSCR, Detail views: selecting the button of the open Detail view, or Escape, closes it.
  await id(page, 'nav-agents').click();
  await expect(id(page, 'view-agents')).toHaveCount(0);
  await id(page, 'nav-compendium').click();
  await expect(id(page, 'compendium-category-Guide')).toBeVisible();
  // SOUNDS, Select click: selecting a category or an article of the Compendium View is a List item.
  await expect(id(page, 'compendium-category-Guide')).toHaveAttribute('data-sound', 'select');
  await expect(id(page, 'compendium-articles').locator('button').first()).toHaveAttribute(
    'data-sound',
    'select',
  );
  await expect(id(page, 'article-locate_red_dawn_safehouse_article')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(id(page, 'view-compendium')).toHaveCount(0);
});

test('the Agents View shows free places and splits Agents In base and Away; Escape retraces the View trail', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('trail');
  await id(page, 'new-campaign').click();
  await id(page, 'nav-agents').click();
  // AVIEW, Header: the free places under each cap, each with its cap bar.
  await expect(id(page, 'agent-places-free')).toContainText('Agent places free');
  await expect(id(page, 'training-places-free')).toContainText('Training places free');
  await expect(id(page, 'agent-places-free').locator('.cap-bar')).toHaveCount(1);
  // AVIEW, Row filters: In base and Away split the Serving Agents.
  await id(page, 'agent-agent-1').click();
  await id(page, 'order-contracting').click();
  await expect(id(page, 'agent-agent-1')).toContainText('In transit');
  const count = async (which: string) =>
    Number((await id(page, `filter-${which}`).innerText()).split(' ').at(-1));
  expect(await count('away')).toBe(1);
  expect((await count('inBase')) + (await count('away'))).toBe(await count('all'));
  await id(page, 'filter-away').click();
  await expect(page.locator('[data-testid="agents-grid"] tbody tr')).toHaveCount(1);

  // CSCR, View trail: an Agent's details are a Follow; the Back control and Escape return to the table as it was left.
  await expect(id(page, 'view-back')).toHaveCount(0);
  await id(page, 'agent-details-agent-1').click();
  await expect(id(page, 'agent-details-view-agent-1')).toBeVisible();
  // GUI, Decimal quantities shown: the Agent details are the one place with base skill, health, and exhaustion exact.
  await expect(id(page, 'details-skill')).toHaveText(/^\d+\.\d\d$/);
  await expect(id(page, 'details-health')).toHaveText(/^\d+\.\d\d\/\d+$/);
  await expect(id(page, 'details-exhaustion')).toHaveText(/^\d+\.\d\d$/);
  await expect(id(page, 'view-back')).toHaveText('‹ Agents');
  // VIS, Detail view: the Back control is the last button of the title row, before the close control.
  const back = await id(page, 'view-back').boundingBox();
  const close = await id(page, 'close-view').boundingBox();
  expect((back?.x ?? 0) + (back?.width ?? 0)).toBeLessThan(close?.x ?? 0);
  await expect(id(page, 'view-back')).toHaveAttribute('data-sound', 'back');
  await page.keyboard.press('Escape');
  await expect(id(page, 'agents-grid')).toBeVisible();
  await expect(id(page, 'filter-away')).toHaveAttribute('aria-pressed', 'true');
  await expect(id(page, 'view-back')).toHaveCount(0);
  // CSCR, View trail, Close: with an empty View trail, Escape closes the Detail view.
  await page.keyboard.press('Escape');
  await expect(id(page, 'view-agents')).toHaveCount(0);

  // CSCR, View trail, Start afresh: opening a Detail view from the Side panel empties the View trail.
  await id(page, 'nav-agents').click();
  await id(page, 'agent-details-agent-2').click();
  await expect(id(page, 'view-back')).toBeVisible();
  await id(page, 'nav-missions').click();
  await expect(id(page, 'view-back')).toHaveCount(0);
});

/** The cells of `table` whose content is wider than the cell, i.e. cut short with "…". */
async function cutShortCells(page: Page, testId: string): Promise<string[]> {
  return page
    .getByTestId(testId)
    .locator('td')
    .evaluateAll((cells) =>
      cells.filter((cell) => cell.scrollWidth > cell.clientWidth).map((cell) => cell.textContent ?? ''),
    );
}

test('a table column holds every value listed for it without cutting it short', async ({ page }) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('widths');
  await id(page, 'new-campaign').click();
  // VIS, Tables: each column is wide enough to hold on one line every value listed for it, e.g. base skill "100".
  await id(page, 'nav-leads').click();
  await expect(id(page, 'agents-to-add')).toBeVisible();
  expect(await cutShortCells(page, 'agents-to-add')).toEqual([]);
  // GUI, Decimal quantities shown: base skill, a Decimal quantity, is a whole number outside the Agent details.
  for (const skill of await id(page, 'agents-to-add').locator('tbody tr td:nth-child(5)').allTextContents()) {
    expect(skill).toMatch(/^\d+$/);
  }
  // HVIEW, Turn by Turn table: the current Turn's Turn cell holds its number followed by "now".
  await id(page, 'nav-history').click();
  await expect(id(page, 'history-turn-now')).toBeVisible();
  expect(await cutShortCells(page, 'history-turn-now')).toEqual([]);
});

test('showing the Turn summary again from the Turn Report View is a Main click, not a Go back', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('summary-sound');
  await id(page, 'new-campaign').click();
  // Advance until a Turn summary appears.
  for (let turn = 2; turn <= 40 && (await id(page, 'turn-summary').count()) === 0; turn++) {
    await id(page, 'advance-turn').click();
    await expect(id(page, 'turn')).toHaveText(String(turn));
  }
  await expect(id(page, 'turn-summary')).toBeVisible();
  await id(page, 'turn-summary-report').click();
  // SOUNDS, Turn summary: the Back control "‹ Turn summary" and the close control both show the Turn summary again.
  await expect(id(page, 'view-back')).toHaveText('‹ Turn summary');
  await expect(id(page, 'view-back')).toHaveAttribute('data-sound', 'main');
  await expect(id(page, 'close-view')).toHaveAttribute('data-sound', 'main');
  await id(page, 'view-back').click();
  await expect(id(page, 'turn-summary')).toBeVisible();
});

test('the Compendium View shows resolved articles, follows Article links, and keeps an Article history', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('compendium');
  await id(page, 'new-campaign').click();
  await id(page, 'nav-compendium').click();
  const shown = id(page, 'compendium-article');
  const previous = id(page, 'article-previous');
  const next = id(page, 'article-next');

  // COMPV, Panes: Guide first, then Mechanics, then the subject categories by name; Guide and its first article are
  // selected when the View opens. At campaign start no Faction article or Mission site article is Player-visible yet,
  // because the only Lead discovered, Criminal organizations, concerns no Faction and creates no Mission site.
  await expect(id(page, 'compendium-categories').locator('.list-name')).toHaveText([
    'Guide',
    'Mechanics',
    'Agents',
    'Enemies',
    'Leads',
    'Upgrades',
    'Weapons',
  ]);
  await expect(id(page, 'compendium-category-Guide')).toHaveClass(/list-row-on/);
  await expect(id(page, 'compendium-category-Guide')).toContainText('6');
  await expect(id(page, 'compendium-category-Mechanics')).toContainText('26');
  await expect(shown).toHaveAttribute('data-article', 'guide_agency');
  // COMPV, Following links, Open: the Article history holds only the article selected.
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await expect(previous).toHaveAccessibleName('Previous article');
  await expect(next).toHaveAccessibleName('Next article');

  // COMPV, Article pane: a Mechanics article shows its body, its Formulas table, and its See also line, with every
  // Placeholder replaced by the engine.
  await id(page, 'compendium-category-Mechanics').click();
  await id(page, 'article-mechanics_exhaustion').click();
  await expect(id(page, 'article-title')).toHaveText('Exhaustion');
  await expect(id(page, 'article-formulas').locator('tr').first()).toBeVisible();
  await expect(id(page, 'article-see-also')).toBeVisible();
  await expect(shown).not.toContainText('{');
  await expect(shown).not.toContainText('}');
  await expect(id(page, 'article-data-sheet')).toHaveCount(0);
  await expect(previous).toBeEnabled();

  // COMPV, Following links: an Article link shows the article it links to and selects its category and article.
  // SOUNDS, Select click: an Article link selects the article it links to, and a button of the Article history.
  const link = id(page, 'article-body').locator('.article-link').first();
  await expect(link).toHaveAttribute('data-sound', 'select');
  await expect(link).toHaveCSS('text-decoration-line', 'underline');
  await expect(link).toHaveCSS('cursor', 'pointer');
  await expect(previous).toHaveAttribute('data-sound', 'select');
  await expect(next).toHaveAttribute('data-sound', 'select');
  const target = (await link.getAttribute('data-article')) ?? '';
  expect(target).not.toBe('mechanics_exhaustion');
  await link.click();
  await expect(shown).toHaveAttribute('data-article', target);
  await expect(id(page, `article-${target}`)).toHaveClass(/list-row-on/);
  // An article never links to itself.
  await expect(shown.locator(`.article-link[data-article="${target}"]`)).toHaveCount(0);
  // Previous article and Next article move through the Article history.
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(shown).toHaveAttribute('data-article', 'mechanics_exhaustion');
  await expect(next).toBeEnabled();
  await next.click();
  await expect(shown).toHaveAttribute('data-article', target);
  // COMPV, Article history: the Q and W keys press Previous article and Next article.
  await page.keyboard.press('q');
  await expect(shown).toHaveAttribute('data-article', 'mechanics_exhaustion');
  await page.keyboard.press('w');
  await expect(shown).toHaveAttribute('data-article', target);
  // SOUNDS, Select click: selecting a category or an article of the panes is a Select click.
  await expect(id(page, 'compendium-category-Mechanics')).toHaveAttribute('data-sound', 'select');
  await expect(id(page, `article-${target}`)).toHaveAttribute('data-sound', 'select');

  // COMPV, Subject data sheets: a Subject article is shown under the name of its subject, with its Data sheet.
  await id(page, 'compendium-category-Enemies').click();
  await id(page, 'article-soldier_article').click();
  await expect(id(page, 'article-title')).toHaveText('Soldier');
  const sheet = id(page, 'article-data-sheet');
  await expect(sheet.locator('th')).toHaveText(['Skill', 'Health', 'Weapon']);
  // Labels: "Skill" links to the article that has the Article term "skill".
  await expect(sheet.locator('th .article-link').first()).toHaveAttribute('data-article', 'mechanics_skill');
  await expect(sheet).toContainText('Rifle · damage');
  // The See also line of a Guide article, and no Formulas table for a Subject article.
  await expect(id(page, 'article-formulas')).toHaveCount(0);

  // COMPV, Panes: the search field filters every category by displayed title; typing shows no other article.
  await id(page, 'compendium-search').fill('rifle');
  await expect(id(page, 'compendium-categories').locator('.list-name')).toHaveText(['Weapons']);
  await expect(id(page, 'compendium-articles').locator('.list-name')).toHaveText([
    'Anti-materiel rifle',
    'Assault rifle',
    'Battle rifle',
    'Heavy rifle',
    'Rifle',
  ]);
  await expect(shown).toHaveAttribute('data-article', 'soldier_article');
  // Following a link to an article listed under the search text keeps the text.
  await sheet.locator('td .article-link', { hasText: 'Rifle' }).click();
  await expect(shown).toHaveAttribute('data-article', 'rifle_article');
  await expect(id(page, 'compendium-search')).toHaveValue('rifle');
  // Following a link to an article that is not listed under it clears the search field.
  await id(page, 'article-data-sheet').locator('td .article-link', { hasText: 'Soldier' }).click();
  await expect(shown).toHaveAttribute('data-article', 'soldier_article');
  await expect(id(page, 'compendium-search')).toHaveValue('');
  await expect(id(page, 'compendium-category-Enemies')).toHaveClass(/list-row-on/);

  // COMPV, Panes: the search field says how to reach it; the S key gives it the keyboard focus and selects its text,
  // and is not typed into it; Enter shows the first article listed and moves the focus out, keeping the text.
  const search = id(page, 'compendium-search');
  await expect(search).toHaveAttribute('placeholder', 'Title (press S)');
  await search.fill('old text');
  await id(page, 'article-title').click();
  await expect(search).not.toBeFocused();
  await page.keyboard.press('s');
  await expect(search).toBeFocused();
  await page.keyboard.type('criminal');
  await expect(search).toHaveValue('criminal');
  await expect(shown).toHaveAttribute('data-article', 'soldier_article');
  await page.keyboard.press('Enter');
  await expect(shown).toHaveAttribute('data-article', 'criminal_organizations_article');
  await expect(id(page, 'compendium-category-Leads')).toHaveClass(/list-row-on/);
  await expect(id(page, 'article-criminal_organizations_article')).toHaveClass(/list-row-on/);
  await expect(search).not.toBeFocused();
  await expect(search).toHaveValue('criminal');
  // COMPV, Lead data sheet: a Lead without a Faction or a created Mission site has no such rows.
  await expect(id(page, 'article-data-sheet').locator('th')).toHaveText([
    'Required progress',
    'Can be investigated again',
  ]);
  // The Q key works again once Enter moved the focus out, and Enter shows another article as a new step.
  await page.keyboard.press('q');
  await expect(shown).toHaveAttribute('data-article', 'soldier_article');
  // Enter with no match does nothing.
  await page.keyboard.press('s');
  await page.keyboard.type('no such title');
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await expect(shown).toHaveAttribute('data-article', 'soldier_article');
  await search.fill('');
  await id(page, 'article-title').click();

  // An article about something the Player may not know yet is absent, and so is every link to it.
  await expect(id(page, 'article-raid_safehouse_article')).toHaveCount(0);
  await expect(page.locator('[data-article="raid_safehouse_article"]')).toHaveCount(0);
  // Following an Article link adds nothing to the View trail: there is no Back control, and Escape closes the View.
  await expect(id(page, 'view-back')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(id(page, 'view-compendium')).toHaveCount(0);
});

test('the keyboard shortcuts view shows every key whole, and Undo names an Autopilot step', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('shortcuts');
  await id(page, 'new-campaign').click();

  // CSCR, Keyboard shortcuts: a dialog titled Keyboard shortcuts, opened from the Settings panel, with each key in a
  // keycap, that never scrolls sideways and cuts no description short.
  await id(page, 'open-settings').click();
  await id(page, 'open-shortcuts').click();
  const dialog = id(page, 'shortcuts');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h2')).toHaveText('Keyboard shortcuts');
  await expect(dialog.locator('.shortcut-row').first().locator('.keycap')).toHaveText(['N']);
  await expect(dialog.locator('.shortcut-row').nth(1).locator('dt')).toHaveText('U/R');
  expect(
    await dialog
      .locator('.dialog-body, dd, dt')
      .evaluateAll((elements) => elements.filter((item) => item.scrollWidth > item.clientWidth).length),
  ).toBe(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // CSCR, Undo and redo: after an Autopilot engagement that advanced Turns, one press undoes all of it, and the
  // button says so before it is pressed: Undo Autopilot, as an Autopilot button, at the width of every other label.
  const width = (await id(page, 'undo').boundingBox())?.width;
  await showAutopilotControls(page);
  await id(page, 'autopilot-toggle').click();
  await id(page, 'autopilot-turns').fill('2');
  await id(page, 'autopilot-many').click();
  await expect(id(page, 'turn')).toHaveText('3');
  await expect(id(page, 'autopilot-active')).toHaveCount(0);
  const undo = id(page, 'undo');
  await expect(undo.locator('.label-swap > span:not(.label-off)')).toHaveText('Undo Autopilot');
  await expect(undo).toHaveClass(/btn-autopilot/);
  await expect(undo).toHaveAttribute('title', /Back to Turn 1, before Autopilot was engaged/);
  expect((await undo.boundingBox())?.width).toBe(width);
  await undo.click();
  await expect(id(page, 'turn')).toHaveText('1');
  const redo = id(page, 'redo');
  await expect(redo.locator('.label-swap > span:not(.label-off)')).toHaveText('Redo Autopilot');
  await expect(redo).toHaveClass(/btn-autopilot/);
  // CSCR, Keyboard shortcuts: the S key of the Compendium has its own row.
  await id(page, 'open-settings').click();
  await id(page, 'open-shortcuts').click();
  await expect(id(page, 'shortcuts')).toContainText(
    'Search article titles in the Compendium; Enter shows the first match',
  );
});

test('the Autopilot controls keep their state for the rest of the Session, and their settings across Sessions', async ({
  page,
}) => {
  await page.goto('/');
  // GUI, Changed settings: with nothing changed, the row says so.
  await expect(id(page, 'changed-settings')).toContainText('Every setting is at its default.');
  await id(page, 'seed-input').fill('autopilot-kept');
  await id(page, 'new-campaign').click();
  await showAutopilotControls(page);
  await id(page, 'autopilot-toggle').click();
  await expect(id(page, 'autopilot-turns')).toHaveValue('10');
  await id(page, 'autopilot-turns').fill('100');
  await id(page, 'autopilot-turns').press('Enter');
  // CSCR, Autopilot controls: returning to the Main menu and creating a Campaign change none of them.
  await id(page, 'to-menu').click();
  // GUI, Settings panel: the Autopilot settings have no row of their own, but Changed settings lists them.
  await expect(id(page, 'setting-autopilotTurns')).toHaveCount(0);
  await expect(id(page, 'changed-settings')).toContainText('Autopilot controls: shown (default hidden)');
  await expect(id(page, 'changed-settings')).toContainText('Autopilot Turns: 100 (default 10)');
  await id(page, 'seed-input').fill('autopilot-kept-2');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'autopilot-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(id(page, 'autopilot-turns')).toHaveValue('100');
  // A new Session starts with them collapsed, while Autopilot controls shown and Autopilot Turns stay.
  await page.reload();
  await expect(id(page, 'autopilot-toggle')).toHaveAttribute('aria-expanded', 'false');
  await id(page, 'autopilot-toggle').click();
  await expect(id(page, 'autopilot-turns')).toHaveValue('100');
  // GUI, Changed settings: Reset makes the setting follow its Game build default again.
  await id(page, 'open-settings').click();
  await id(page, 'changed-reset-autopilotControlsShown').click();
  await expect(id(page, 'changed-reset-autopilotControlsShown')).toHaveCount(0);
  await id(page, 'close-settings').click();
  await expect(id(page, 'autopilot-bar')).toHaveCount(0);
});

test('completing Criminal organizations discovers the Locate member Leads, and Panic shows two decimals', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('criminal');
  await id(page, 'new-campaign').click();
  // GUI, Decimal quantities shown: Panic with two decimals against a whole-number Panic limit.
  await expect(id(page, 'panic')).toHaveText(/^\d+\.\d\d \/ \d+%$/);
  await id(page, 'nav-leads').click();
  await id(page, 'lead-criminal_organizations').click();
  for (const n of [1, 2, 3, 4]) {
    await id(page, `team-pick-agent-${n}`).check();
  }
  await id(page, 'investigate-criminal_organizations').click();
  let turn = 1;
  while ((await id(page, 'lead-locate_red_dawn_member').count()) === 0 && turn < 15) {
    await id(page, 'advance-turn').click();
    turn += 1;
    await afterAdvance(page, String(turn));
    if ((await id(page, 'view-leads').count()) === 0) {
      await id(page, 'nav-leads').click();
    }
  }
  for (const faction of ['red_dawn', 'exalt', 'black_lotus']) {
    await expect(id(page, `lead-locate_${faction}_member`)).toBeVisible();
  }
  // LVIEW, Selected Lead: its Faction, and "On completion" with one line for the Mission site it creates.
  await id(page, 'lead-locate_red_dawn_member').click();
  await expect(id(page, 'lead-faction')).toHaveText('Red Dawn');
  await expect(id(page, 'lead-on-completion').locator('.label')).toHaveText('On completion');
  await expect(id(page, 'lead-on-completion-site')).toHaveText(
    /^Creates the Mission site Apprehend member · \d+ Enem(y|ies)$/,
  );
  await expect(id(page, 'lead-on-completion-eliminate')).toHaveCount(0);

  // HVIEW: the Panic column with two decimals; CVIEW, Panic chart: the current value too.
  await id(page, 'nav-history').click();
  await expect(id(page, 'history-turn-now').locator('td').nth(6)).toHaveText(/^\d+\.\d\d%$/);
  expect(
    await id(page, 'history-table')
      .locator('tbody td:nth-child(7)')
      .evaluateAll((cells) => cells.filter((cell) => cell.scrollWidth > cell.clientWidth).length),
  ).toBe(0);
  await id(page, 'nav-charts').click();
  await expect(id(page, 'panic-chart').locator('.chart-value')).toHaveText(/^\d+\.\d\d%of \d+% limit$/);
});
