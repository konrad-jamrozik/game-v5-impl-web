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

  await id(page, 'agent-agent-2').click();
  await id(page, 'agent-agent-3').click();
  await id(page, 'order-contracting').click();
  await page.keyboard.press('Escape');
  await id(page, 'agent-agent-4').click();
  await id(page, 'tab-leads').click();
  await id(page, 'investigate-locate_red_dawn_member').click();
  await page.keyboard.press('Escape');
  await id(page, 'hire').click();
  await id(page, 'advance-turn').click();
  await afterAdvance(page, '2');
  await page.keyboard.press('n');
  await afterAdvance(page, '3');
  await id(page, 'tab-agency').click();
  await id(page, 'buy-training_cap').click();
  await page.keyboard.press('h');
  await page.keyboard.press('u');
  await expect(id(page, 'redo')).toBeEnabled();
  await id(page, 'advance-turn').click();
  await afterAdvance(page, '4');

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

test('actions are offered only when the engine says they are available', async ({ page }) => {
  await page.goto('/');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'order-standby')).toBeDisabled();
  await expect(id(page, 'undo')).toBeDisabled();
  await id(page, 'tab-agency').click();
  await expect(id(page, 'buy-transport_cap')).toBeDisabled();
  await expect(id(page, 'buy-transport_cap')).toHaveAttribute('title', /costs 1000/);
  await id(page, 'open-developer').click();
  await expect(id(page, 'dev-add-money')).toBeDisabled();
  await id(page, 'dev-mode').check();
  await id(page, 'dev-add-money').click();
  await expect(id(page, 'money')).toHaveText('1500');
  await expect(id(page, 'buy-transport_cap')).toBeEnabled();
});

test('the Situation panel is always in view and a row shows its item', async ({ page }) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('situation');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'situation')).toBeVisible();
  await id(page, 'tab-history').click();
  await expect(id(page, 'situation')).toBeVisible();
  await id(page, 'situation-row-locate_red_dawn_member').click();
  await expect(id(page, 'tab-leads')).toHaveAttribute('aria-selected', 'true');
  await expect(id(page, 'lead-locate_red_dawn_member')).toBeVisible();
});

test('Autopilot plays a Campaign to its ending and the interface stays usable', async ({ page }) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('autopilot');
  await id(page, 'new-campaign').click();
  await id(page, 'autopilot-turns').fill('400');
  await id(page, 'autopilot-many').click();
  await expect(id(page, 'ending')).toBeVisible({ timeout: 90_000 });
  await expect(id(page, 'advance-turn')).toBeDisabled();
  await id(page, 'tab-history').click();
  await expect(page.locator('.chart svg')).toHaveCount(4);
  await id(page, 'tab-report').click();
  await expect(id(page, 'turn-report')).toContainText('Campaign ending');
  await id(page, 'autosave-back').click();
  await expect(id(page, 'ending')).toHaveCount(0);

  await id(page, 'to-menu').click();
  await expect(id(page, 'saves-table')).toBeVisible();
  await id(page, 'setting-theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the Main menu deletes a Campaign save and a whole Campaign after a confirmation', async ({ page }) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('deleting');
  await id(page, 'new-campaign').click();
  await id(page, 'advance-turn').click();
  await afterAdvance(page, '2');
  await id(page, 'to-menu').click();
  const rows = id(page, 'saves-table').locator('tbody tr');
  await expect(rows).not.toHaveCount(0);
  const before = await rows.count();

  // A declined confirmation deletes nothing.
  page.once('dialog', (dialog) => void dialog.dismiss());
  await rows.first().getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(before);

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('cannot be undone');
    void dialog.accept();
  });
  await rows.first().getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(before - 1);

  page.once('dialog', (dialog) => void dialog.accept());
  await id(page, 'saves-table').getByRole('button', { name: 'Delete Campaign' }).first().click();
  await expect(id(page, 'saves-table')).toHaveCount(0);
});
