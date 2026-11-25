/**
 * Browser tests, for what only a browser shows; see TFOCUS, Where tests pay, Interface tests for what only an
 * interface shows. Each keeps to one subject: the web interface plays a Campaign as the engine API and the terminal
 * CLI do, a reload continues the Campaign, Global configuration survives a reload, and the Undo and Redo buttons take
 * the step that
 * `getAutosaveStatus()` reports. What the screen shows, e.g. sizes, colours, and wording, is checked by looking, and
 * the logic behind each view by the Vitest tests of `tests/web/`.
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

/**
 * Fails at once when an action of the scenario is rejected, e.g. after a retune leaves too little Money for a hire,
 * instead of leaving the web half waiting for a disabled button until the test times out.
 */
function committed(step: string, result: { ok: boolean; error?: { message: string } }): void {
  if (!result.ok) {
    throw new Error(`The scenario step "${step}" was rejected: ${result.error?.message ?? ''}`);
  }
}

async function viaApi(): Promise<unknown> {
  const engine = await startEngine();
  const { player, session } = engine;
  committed('new', await session.campaign.create({ seed: SEED }));
  committed('assign', await player.actions.assignAgents(['agent-2', 'agent-3'], 'Training'));
  committed('investigate', await player.actions.startInvestigation('criminal_organizations', ['agent-4']));
  committed('hire', await player.actions.hireAgents(1));
  committed('next', await player.actions.advanceTurn());
  committed('next', await player.actions.advanceTurn());
  committed('assign', await player.actions.assignAgents(['agent-5'], 'Training'));
  committed('hire', await player.actions.hireAgents(1));
  committed('undo', await session.timeline.undoAction());
  committed('next', await player.actions.advanceTurn());
  session.developer.enable();
  return inspected(engine);
}

async function viaCli(): Promise<unknown> {
  const engine = await startEngine();
  const cli = createCli(engine, { json: true, write: () => undefined });
  for (const command of [
    `new ${SEED}`,
    'assign Training agent-2 agent-3',
    'investigate criminal_organizations agent-4',
    'hire',
    'next',
    'next',
    'assign Training agent-5',
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

async function newCampaign(page: Page, seed: string): Promise<void> {
  await page.goto('/');
  await id(page, 'seed-input').fill(seed);
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toHaveText('1');
}

/** Opens the Agents View unless it is open; selecting the button of the open Detail view would close it. */
async function openAgents(page: Page): Promise<void> {
  if ((await id(page, 'view-agents').count()) === 0) {
    await id(page, 'nav-agents').click();
  }
  await expect(id(page, 'agents-grid')).toBeVisible();
}

/** Selects exactly `agents` in the Agents View, whatever the selection was. */
async function selectOnly(page: Page, agents: readonly string[]): Promise<void> {
  for (const row of await page.locator('[data-testid="agents-grid"] tbody tr').all()) {
    const testId = (await row.getAttribute('data-testid')) ?? '';
    const box = row.getByRole('checkbox');
    if (agents.some((agent) => testId === `agent-${agent}`)) {
      await box.check();
    } else if (await box.isChecked()) {
      await box.uncheck();
    }
  }
}

/**
 * CSCR, Autopilot settings: the Autopilot controls stay hidden until the "Show Autopilot controls" checkbox of the
 * developer tools, which Dev mode gates, turns Autopilot controls shown on; the controls show only while Dev mode is
 * enabled.
 */
async function showAutopilotControls(page: Page): Promise<void> {
  await id(page, 'open-settings').click();
  await id(page, 'open-developer').click();
  // The setting is stored asynchronously, so the checkbox is checked once Game storage holds it.
  // GUI, Developer tools, Gated by Dev mode: every other control waits for the "Dev mode" checkbox.
  await id(page, 'dev-mode').check();
  await id(page, 'dev-show-autopilot').click();
  await expect(id(page, 'dev-show-autopilot')).toBeChecked();
  await id(page, 'close-developer').click();
  await expect(id(page, 'autopilot-bar')).toBeVisible();
}

async function viaWeb(page: Page): Promise<unknown> {
  await newCampaign(page, SEED);
  await openAgents(page);
  await selectOnly(page, ['agent-2', 'agent-3']);
  await id(page, 'order-training').click();
  await id(page, 'nav-leads').click();
  await id(page, 'lead-criminal_organizations').click();
  await id(page, 'team-pick-agent-4').check();
  await id(page, 'investigate-criminal_organizations').click();
  await openAgents(page);
  await id(page, 'hire').click();
  await id(page, 'advance-turn').click();
  await afterAdvance(page, '2');
  // CSCR, Keyboard shortcuts: the N, H, and U keys press Advance turn, Hire, and Undo.
  await page.keyboard.press('n');
  await afterAdvance(page, '3');
  await openAgents(page);
  await selectOnly(page, ['agent-5']);
  await id(page, 'order-training').click();
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
  // What the Status bar and the Agents View show of the Current campaign.
  const shown = async (): Promise<string[]> => {
    await openAgents(page);
    return [
      await id(page, 'turn').innerText(),
      await id(page, 'money').innerText(),
      await id(page, 'agents-grid').locator('tbody').innerText(),
    ];
  };
  await newCampaign(page, 'reload');
  await id(page, 'advance-turn').click();
  await afterAdvance(page, '2');
  await openAgents(page);
  await selectOnly(page, ['agent-1']);
  await id(page, 'order-training').click();
  await expect(id(page, 'agent-agent-1')).toContainText('Training');
  await selectOnly(page, ['agent-2']);
  await id(page, 'order-training').click();
  await expect(id(page, 'agent-agent-2')).toContainText('Training');
  const beforeUndo = await shown();
  await id(page, 'undo').click();
  await expect(id(page, 'redo')).toBeEnabled();
  const afterUndo = await shown();
  // The Undone order must show, or the comparisons below could not fail.
  expect(afterUndo).not.toEqual(beforeUndo);

  await page.reload();
  await expect(id(page, 'turn')).toHaveText('2');
  expect(await shown()).toEqual(afterUndo);
  await expect(id(page, 'redo')).toBeEnabled();
  await id(page, 'redo').click();
  await expect(id(page, 'redo')).toBeDisabled();
  expect(await shown()).toEqual(beforeUndo);
});

test('Global configuration survives a reload of the browser', async ({ page }) => {
  await newCampaign(page, 'settings');
  await showAutopilotControls(page);
  await id(page, 'autopilot-toggle').click();
  // A Fixture value of Autopilot Turns, other than the one the field shows.
  const turns = String(Number(await id(page, 'autopilot-turns').inputValue()) + 7);
  await id(page, 'autopilot-turns').fill(turns);
  await id(page, 'autopilot-turns').press('Enter');
  // GUI, Changed settings: the row lists the value once Global configuration holds it.
  await id(page, 'open-settings').click();
  await expect(id(page, 'changed-settings')).toContainText(turns);
  await id(page, 'open-developer').click();
  await id(page, 'dev-reveal').check();
  await expect(id(page, 'dev-reveal')).toBeChecked();
  await id(page, 'close-developer').click();

  // A reload starts a new Session. GUI, Developer tools, Kept across Sessions: Dev mode on and Reveal hidden content on
  // survive it, and the GUI enables Dev mode once the Campaign is current again; CSCR, Autopilot settings: the
  // Autopilot controls stay shown and expanded, with the same Turns.
  await page.reload();
  await expect(id(page, 'autopilot-bar')).toBeVisible({ timeout: 60_000 });
  await expect(id(page, 'autopilot-turns')).toHaveValue(turns);
  await id(page, 'open-settings').click();
  await id(page, 'open-developer').click();
  await expect(id(page, 'dev-mode')).toBeChecked();
  await expect(id(page, 'dev-reveal')).toBeChecked();
  await expect(id(page, 'dev-reveal')).toBeEnabled();
});

test('Undo and Redo name the Autopilot step that getAutosaveStatus reports, and take it', async ({
  page,
}) => {
  await newCampaign(page, 'autopilot-step');
  // A Fixture Autopilot Autosave limit of 0: no Autopilot Autosave separates the Turns the Autopilot AI ends, so the
  // first undoToAutosave() loads the Engagement Autosave and crosses the Autopilot engagement; see TIMELINE, Autosave
  // navigation, Crossing an Autopilot engagement. With Autopilot Autosaves, the first step back would instead be a Turn
  // step to the last Turn the Autopilot AI ended, under CSCR, Undo and redo.
  await id(page, 'open-settings').click();
  await id(page, 'setting-autopilotAutosaveLimit').fill('0');
  await id(page, 'setting-autopilotAutosaveLimit').press('Enter');
  await expect(id(page, 'changed-settings')).toContainText('Autopilot Autosave limit');
  await id(page, 'close-settings').click();

  await showAutopilotControls(page);
  await id(page, 'autopilot-toggle').click();
  // CSCR, Autopilot controls, Turns: the Turns button, pressed at once as the field loses the focus, engages with the
  // number the field shows, not the Autopilot Turns stored before.
  await id(page, 'autopilot-turns').fill('1');
  await id(page, 'autopilot-many').click();
  // A Turn of an Autopilot AI can take longer than the default wait of an assertion.
  await expect(id(page, 'turn')).toHaveText('2', { timeout: 60_000 });
  await expect(id(page, 'autopilot-active')).toHaveCount(0);

  // CSCR, Undo and redo: each button names the step it takes before it is pressed.
  const label = (button: string) => id(page, button).locator('.label-swap > span:not(.label-off)');
  await expect(label('undo')).toHaveText('Undo Autopilot');
  await id(page, 'undo').click();
  await expect(id(page, 'turn')).toHaveText('1');
  await expect(id(page, 'undo')).toBeDisabled();
  await expect(label('redo')).toHaveText('Redo Autopilot');
  await id(page, 'redo').click();
  await expect(id(page, 'turn')).toHaveText('2');
});

test('VIS, Tables: pressing a group row of the Storage View folds its group, and pressing it again unfolds it', async ({
  page,
}) => {
  await newCampaign(page, 'fold-groups');
  await id(page, 'nav-storage').click();
  const weapons = id(page, 'storage-group-weapon');
  const fold = id(page, 'fold-weapon');
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(fold).toContainText('▾');
  const unfoldedRows = await weapons.locator('tr').count();
  expect(unfoldedRows).toBeGreaterThan(1);
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(fold).toContainText('▸');
  await expect(weapons.locator('tr')).toHaveCount(1);
  await fold.click();
  await expect(weapons.locator('tr')).toHaveCount(unfoldedRows);
});

test('VIS, Charts: the Full screen button shows a chart alone over a Scrim, and Escape returns it', async ({
  page,
}) => {
  await newCampaign(page, 'full-screen-chart');
  await id(page, 'advance-turn').click();
  await expect(id(page, 'turn')).toHaveText('2', { timeout: 60_000 });
  // The Turn summary, if shown, closes first.
  await page.keyboard.press('Escape');
  await id(page, 'nav-charts').click();
  const chart = id(page, 'money-flow-chart');
  const before = await chart.locator('svg').boundingBox();
  await id(page, 'money-flow-chart-full-screen').click();
  await expect(id(page, 'chart-scrim')).toBeVisible();
  const full = await id(page, 'chart-scrim').getByTestId('money-flow-chart').locator('svg').boundingBox();
  expect(full?.height ?? 0).toBeGreaterThan((before?.height ?? 0) * 1.5);
  await page.keyboard.press('Escape');
  await expect(id(page, 'chart-scrim')).toHaveCount(0);
  await expect(id(page, 'view-charts')).toBeVisible();
});
