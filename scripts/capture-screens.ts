/**
 * Captures one screenshot of the built web game per screen and state, for the screen specifications of the Spec repo.
 * Usage: npm run screens:capture [-- --out <dir>]
 *
 * It builds and serves the game as `playwright.config.ts` does, plays one fixed scripted Campaign through the user
 * interface in Chromium, and writes one PNG per picture to the output directory, by default
 * `../game-v5/docs/images/screens`, removing the PNG files there that it no longer writes. The pictures are generated:
 * nobody edits them, and where a picture and the game disagree, the game is right.
 *
 * The pictures are deterministic, so that running the script twice writes byte-identical files:
 * - a fixed window of WINDOW, at one device pixel per CSS pixel, in the game's one dark theme;
 * - a fixed clock, and fixed values of `Math.random` and `crypto.randomUUID`, e.g. for save times and Campaign IDs;
 * - reduced motion, under which the globe starts still and stays still, and CSS animations and transitions switched
 *   off; the globe is drawn with WebGL in software (SwiftShader), the same on every run;
 * - every font and image loaded before each picture is taken.
 *
 * The scenario plays one Campaign of at most 3 + AUTOPILOT_TURNS + 2 × MAX_WAIT_TURNS Turns, within CTEST, Limits. It
 * records no result of play other than the pictures.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import config from '../playwright.config.ts';

/**
 * The window every picture is taken in; whole-screen pictures have this size, except the Main menu, which is shown
 * whole when it is longer.
 */
const WINDOW = { width: 1440, height: 900 };
const SEED = 'screens';
/** The Turns the Autopilot AI plays after the scripted opening, so that the views have ordinary content. */
const AUTOPILOT_TURNS = 14;
/** The time the fixed clock shows, e.g. in the save times of the Main menu. */
const CLOCK = new Date('2026-01-15T12:00:00Z');
/** The most Turns the scenario advances by hand while it waits for an Active Mission site. */
const MAX_WAIT_TURNS = 10;

const root = resolve(import.meta.dirname, '..');
const outArg = process.argv.indexOf('--out');
const outDir = resolve(
  root,
  outArg >= 0 ? (process.argv[outArg + 1] ?? '') : '../game-v5/docs/images/screens',
);

const baseURL = config.use?.baseURL ?? 'http://127.0.0.1:5176';
const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
const written = new Set<string>();

/** Starts the web server of `playwright.config.ts`, or reuses one already serving its URL, as the tests do. */
async function startServer(): Promise<ChildProcess | null> {
  if (server === undefined) {
    throw new Error('playwright.config.ts names no web server');
  }
  const url = server.url ?? baseURL;
  const up = async () => {
    try {
      return (await fetch(url)).ok;
    } catch {
      return false;
    }
  };
  if (await up()) {
    console.log(`Reusing the server at ${url}`);
    return null;
  }
  const child = spawn(server.command, { cwd: root, shell: true, stdio: 'inherit' });
  const deadline = Date.now() + (server.timeout ?? 120_000);
  while (!(await up())) {
    if (Date.now() > deadline || child.exitCode !== null) {
      stopServer(child);
      throw new Error(`The server did not start at ${url}`);
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  return child;
}

function stopServer(child: ChildProcess | null): void {
  if (child?.pid === undefined || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }
}

/** Fixes every value of the page that would otherwise differ between runs; runs before the game's own scripts. */
function fixRandomness(): void {
  let seed = 0x5eed;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let uuid = 0;
  crypto.randomUUID = () => {
    uuid += 1;
    const hex = (uuid * 2654435761 + 0x1234567).toString(16).padStart(12, '0').slice(-12);
    return `${hex.slice(0, 8)}-0000-4000-8000-${hex}`;
  };
}

const NO_MOTION = '*, *::before, *::after { animation: none !important; transition: none !important; }';

const id = (page: Page, testId: string) => page.getByTestId(testId);

/** Waits until fonts, images, and the layout have settled, and leaves no hover or focus on any control. */
async function settle(page: Page): Promise<void> {
  if ((await page.locator('style#no-motion').count()) === 0) {
    await page.addStyleTag({ content: NO_MOTION }).then((tag) =>
      tag.evaluate((node) => {
        (node as HTMLStyleElement).id = 'no-motion';
      }),
    );
  }
  if ((await page.locator('.notice-error').count()) > 0) {
    throw new Error(`The game reported an error: ${await page.locator('.notice-error').first().innerText()}`);
  }
  while ((await page.locator('.notice-close').count()) > 0) {
    await page.locator('.notice-close').first().click();
  }
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await document.fonts.ready;
    const urls = new Set<string>();
    for (const element of document.querySelectorAll('*')) {
      const match = /url\("?([^")]+)"?\)/.exec(getComputedStyle(element).backgroundImage);
      if (match?.[1] !== undefined) {
        urls.add(match[1]);
      }
    }
    for (const image of document.images) {
      urls.add(image.currentSrc || image.src);
    }
    await Promise.all(
      [...urls].map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode().catch(() => undefined);
      }),
    );
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise((done) => requestAnimationFrame(done));
    }
  });
  // Chromium first rasterizes a scaled image at low quality and redraws it at full quality soon after.
  await page.waitForTimeout(500);
  // The globe, when it is in view, has loaded its maps and drawn them.
  if (await page.locator('.globe-hud:not([hidden])').isVisible()) {
    await expect(page.locator('.globe-controls:not([hidden])')).toBeVisible({ timeout: 120_000 });
    await page.evaluate(async () => {
      for (let frame = 0; frame < 5; frame += 1) {
        await new Promise((done) => requestAnimationFrame(done));
      }
    });
  }
}

function target(name: string): string {
  written.add(`${name}.png`);
  return join(outDir, `${name}.png`);
}

/** A picture of the whole window; with `fullPage`, of the whole page, e.g. a Main menu longer than the window. */
async function shootWindow(page: Page, name: string, fullPage = false): Promise<void> {
  await settle(page);
  // A frame of the globe, drawn in software, can take seconds.
  await page.screenshot({
    path: target(name),
    animations: 'disabled',
    caret: 'hide',
    fullPage,
    timeout: 300_000,
  });
  console.log(`captured ${name}`);
}

/**
 * A picture of one element. A Detail view whose body scrolls is shown whole: the window grows by as much as its body
 * would scroll, for this picture only.
 */
async function shootElement(page: Page, name: string, element: Locator): Promise<void> {
  await expect(element).toBeVisible();
  const overflow = await element.evaluate((node) => {
    const body = node.querySelector('.detail-body');
    return body === null ? 0 : body.scrollHeight - body.clientHeight;
  });
  if (overflow > 0) {
    await page.setViewportSize({ width: WINDOW.width, height: WINDOW.height + overflow });
  }
  await settle(page);
  await element.screenshot({ path: target(name), animations: 'disabled', caret: 'hide' });
  if (overflow > 0) {
    await page.setViewportSize(WINDOW);
  }
  console.log(`captured ${name}`);
}

const view = (page: Page, viewId: string) => id(page, `view-${viewId}`);

/** Opens a Detail view from the Side panel unless it is open. */
async function open(page: Page, viewId: string): Promise<void> {
  if ((await view(page, viewId).count()) === 0) {
    await id(page, `nav-${viewId}`).click();
  }
  await expect(view(page, viewId)).toBeVisible();
}

/** Closes the open Detail view, if any, so that the globe shows. */
async function closeViews(page: Page): Promise<void> {
  while ((await page.locator('[data-testid^="view-"]').count()) > 0) {
    await page.keyboard.press('Escape');
  }
}

async function currentTurn(page: Page): Promise<number> {
  return Number(await id(page, 'turn').innerText());
}

/** Advances the Turn with the Advance turn button; returns whether a Turn summary appeared. */
async function advance(page: Page): Promise<boolean> {
  const turn = await currentTurn(page);
  await id(page, 'advance-turn').click();
  await expect(id(page, 'turn')).toHaveText(String(turn + 1), { timeout: 60_000 });
  return (await id(page, 'turn-summary').count()) > 0;
}

async function dismissSummary(page: Page): Promise<void> {
  if ((await id(page, 'turn-summary').count()) > 0) {
    await id(page, 'turn-summary-continue').click();
  }
  await expect(id(page, 'turn-summary')).toHaveCount(0);
}

/** Selects exactly `agents` in the Agents View. */
async function selectAgents(page: Page, agents: readonly string[]): Promise<void> {
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

async function openDeveloperTools(page: Page): Promise<void> {
  await id(page, 'open-settings').click();
  await id(page, 'open-developer').click();
  await expect(id(page, 'developer-drawer')).toBeVisible();
}

/** The parts of the full Campaign state of the Developer tools that the scenario reads. */
interface CampaignState {
  readonly timeline: {
    readonly turnStartState: {
      readonly liveWorldState: {
        readonly agents: readonly {
          readonly id: string;
          readonly state: {
            readonly healthLostHundredths: number;
            readonly baseHealth: number;
            readonly exactExhaustionHundredths: number;
          };
        }[];
        readonly missionSites: readonly {
          readonly id: string;
          readonly state: { readonly lifecycle: string; readonly enemies: readonly string[] };
        }[];
        readonly enemies: readonly {
          readonly id: string;
          readonly state: { readonly skill: number; readonly baseWeaponDamage: number };
        }[];
      };
    };
  };
}

/** Reads the full Campaign state; Dev mode must be enabled and the Developer tools open. */
async function inspect(page: Page): Promise<CampaignState> {
  await id(page, 'dev-inspect').click();
  const text = await id(page, 'dev-state').innerText();
  await id(page, 'dev-inspect').click();
  return JSON.parse(text) as CampaignState;
}

async function override(page: Page, outcome: string, value: string): Promise<void> {
  await id(page, 'dev-outcome').fill(outcome);
  await id(page, 'dev-value').fill(value);
  await id(page, 'dev-override').click();
  await expect(page.locator('.notice-error')).toHaveCount(0);
}

/**
 * The Random outcome overrides of the first Combat round under which the lone `agent` is Killed rather than
 * Incapacitated: the Agent misses, and in the order the Enemies attack, each hits for its highest damage while the
 * Agent keeps enough health to stay able to fight, until one hit kills; null when no such order of hits exists.
 */
function killingOverrides(
  state: CampaignState['timeline']['turnStartState']['liveWorldState'],
  agent: string,
  site: string,
): [string, string][] | null {
  const fighter = state.agents.find((item) => item.id === agent);
  const enemyIds = state.missionSites.find((item) => item.id === site)?.state.enemies ?? [];
  if (fighter === undefined) {
    return null;
  }
  const maxHealth = fighter.state.baseHealth * 100;
  let health = maxHealth - fighter.state.healthLostHundredths;
  const enemies = enemyIds
    .map((enemy) => state.enemies.find((item) => item.id === enemy))
    .filter((enemy) => enemy !== undefined);
  // COMBAT: a side attacks in order of effective skill, highest first; an Enemy that is not hurt fights at its skill.
  const order = [...enemies].sort((a, b) => b.state.skill - a.state.skill);
  const result: [string, string][] = [[`combat.hit.${agent}`, 'false']];
  for (const enemy of order) {
    const damage = Math.floor(enemy.state.baseWeaponDamage * 1.5);
    if (damage * 100 >= health) {
      result.push([`combat.hit.${enemy.id}`, 'true'], [`combat.damage.${enemy.id}`, String(damage)]);
      return result;
    }
    if (health - damage * 100 > maxHealth * 0.15) {
      health -= damage * 100;
      result.push([`combat.hit.${enemy.id}`, 'true'], [`combat.damage.${enemy.id}`, String(damage)]);
    } else {
      result.push([`combat.hit.${enemy.id}`, 'false']);
    }
  }
  return null;
}

/** The Active Mission sites the Missions View lists, by Instance ID. */
async function activeSites(page: Page): Promise<string[]> {
  await open(page, 'missions');
  const ids = await page
    .locator('[data-testid="view-missions"] .pane-list [data-testid^="site-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid')?.slice('site-'.length) ?? ''));
  return ids.filter((item) => item !== '');
}

/** The Agents the deployment table of the selected Active Mission site offers, by Instance ID. */
async function deployable(page: Page): Promise<string[]> {
  const boxes = page.locator('[data-testid^="deploy-pick-"]');
  const result: string[] = [];
  for (const box of await boxes.all()) {
    if (await box.isEnabled()) {
      result.push(((await box.getAttribute('data-testid')) ?? '').slice('deploy-pick-'.length));
    }
  }
  return result;
}

/**
 * Advances Turns until an Active Mission site appears, deploys one Agent to it alone, and sets the Random outcome
 * overrides under which that Agent is Killed in its Combat, so that the Memorial and the Concluded Mission sites have
 * a Killed Agent. Leaves the Turn summary of that Combat open.
 */
async function loseAnAgent(page: Page): Promise<void> {
  for (let waited = 0; waited <= MAX_WAIT_TURNS; waited += 1) {
    const sites = await activeSites(page);
    for (const site of sites) {
      await id(page, `site-${site}`).click();
      const agents = await deployable(page);
      if (agents.length === 0) {
        continue;
      }
      await openDeveloperTools(page);
      if (!(await id(page, 'dev-mode').isChecked())) {
        await id(page, 'dev-mode').click();
        await expect(id(page, 'dev-mode')).toBeChecked();
      }
      const state = (await inspect(page)).timeline.turnStartState.liveWorldState;
      // The least exhausted Agent, so that the deployment needs no confirmation and exhaustion does not weaken it.
      const exhaustion = (agent: string) =>
        state.agents.find((item) => item.id === agent)?.state.exactExhaustionHundredths ?? Infinity;
      const agent = [...agents]
        .sort((a, b) => exhaustion(a) - exhaustion(b))
        .find((item) => killingOverrides(state, item, site) !== null);
      if (agent === undefined) {
        await id(page, 'close-developer').click();
        continue;
      }
      for (const [outcome, value] of killingOverrides(state, agent, site) ?? []) {
        await override(page, outcome, value);
      }
      await id(page, 'dev-mode').click();
      await expect(id(page, 'dev-mode')).not.toBeChecked();
      await id(page, 'close-developer').click();
      await id(page, `deploy-pick-${agent}`).check();
      await id(page, `deploy-${site}`).click();
      await expect(id(page, `deploy-pick-${agent}`).or(page.locator('.notice-error'))).toHaveCount(0);
      if (!(await advance(page))) {
        throw new Error('The Advance turn after the deployment showed no Turn summary');
      }
      return;
    }
    await advance(page);
    await dismissSummary(page);
  }
  throw new Error(`No Mission site took a lone Agent within ${MAX_WAIT_TURNS} Turns`);
}

async function play(page: Page): Promise<void> {
  await page.goto(baseURL);
  await id(page, 'seed-input').fill(SEED);
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toHaveText('1');

  // The scripted opening: Training, two Investigations, a hire, and two Turns. A Detail view stays open over the globe
  // until its picture is taken: the globe, drawn in software, would slow every step.
  await open(page, 'agents');
  await selectAgents(page, ['agent-2', 'agent-3']);
  await id(page, 'order-training').click();
  await open(page, 'leads');
  for (const [lead, agent] of [
    ['contracting_opportunities', 'agent-4'],
    ['criminal_organizations', 'agent-5'],
  ] as const) {
    await id(page, `lead-${lead}`).click();
    await id(page, `team-pick-${agent}`).check();
    await id(page, `investigate-${lead}`).click();
  }
  await open(page, 'agents');
  await id(page, 'hire').click();
  await advance(page);
  await dismissSummary(page);
  await advance(page);
  await dismissSummary(page);

  // The Autopilot AI plays on.
  await openDeveloperTools(page);
  // The setting is stored asynchronously, so the checkbox is checked once Game storage holds it.
  await id(page, 'dev-show-autopilot').click();
  await expect(id(page, 'dev-show-autopilot')).toBeChecked();
  await id(page, 'close-developer').click();
  await id(page, 'autopilot-toggle').click();
  await id(page, 'autopilot-turns').fill(String(AUTOPILOT_TURNS));
  await open(page, 'upgrades');
  const before = await currentTurn(page);
  await id(page, 'autopilot-many').click();
  await expect(id(page, 'turn')).toHaveText(String(before + AUTOPILOT_TURNS), { timeout: 600_000 });
  await expect(id(page, 'autopilot-active')).toHaveCount(0, { timeout: 60_000 });
}

async function capture(page: Page): Promise<void> {
  await play(page);
  await shootElement(page, 'autopilot-footer', page.locator('.side-footer'));

  await loseAnAgent(page);
  await shootElement(page, 'turn-summary', id(page, 'turn-summary'));
  await id(page, 'turn-summary-report').click();
  await shootElement(page, 'turn-report-view', view(page, 'report'));
  await view(page, 'report').locator('[data-testid^="combat-"]').first().click();
  await id(page, 'combat-log-toggle').click();
  await expect(id(page, 'combat-log')).toBeVisible();
  await shootElement(page, 'combat-report', view(page, 'report'));

  // A new Turn with an Active Mission site to deploy to.
  for (let waited = 0; (await activeSites(page)).length === 0; waited += 1) {
    if (waited >= MAX_WAIT_TURNS) {
      throw new Error(`No Active Mission site appeared within ${MAX_WAIT_TURNS} Turns`);
    }
    await advance(page);
    await dismissSummary(page);
  }
  await shootElement(page, 'situation-panel', id(page, 'situation'));

  await open(page, 'agents');
  const onStandby = await page
    .locator('[data-testid="agents-grid"] tbody tr')
    .filter({ hasText: 'Standby' })
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid')?.slice('agent-'.length) ?? ''));
  await selectAgents(page, onStandby.slice(0, 2));
  await shootWindow(page, 'campaign-screen-view');
  await shootElement(page, 'agents-view', view(page, 'agents'));
  await id(page, 'filter-memorial').click();
  await shootElement(page, 'agents-memorial', view(page, 'agents'));
  // The Killed Agent, whose Participation history holds its Missions.
  await id(page, 'memorial-grid').locator('[data-testid^="agent-details-"]').first().click();
  await shootElement(page, 'agent-details', view(page, 'agents'));

  await open(page, 'missions');
  const picks = await deployable(page);
  for (const agent of picks.slice(0, 3)) {
    await id(page, `deploy-pick-${agent}`).check();
  }
  await shootElement(page, 'missions-view', view(page, 'missions'));
  await id(page, 'missions-concluded').click();
  await shootElement(page, 'missions-view-concluded', view(page, 'missions'));

  await open(page, 'leads');
  await shootElement(page, 'leads-view', view(page, 'leads'));
  await open(page, 'upgrades');
  await shootElement(page, 'upgrades-view', view(page, 'upgrades'));
  await open(page, 'charts');
  await shootElement(page, 'charts-view', view(page, 'charts'));
  await open(page, 'history');
  // The Player actions of the scripted opening.
  await id(page, 'history-actions-1').click();
  await shootElement(page, 'history-view', view(page, 'history'));
  await open(page, 'compendium');
  await id(page, 'compendium-category-Mechanics').click();
  await id(page, 'compendium-articles').getByRole('button', { name: 'Exhaustion', exact: true }).click();
  await shootElement(page, 'compendium-view', view(page, 'compendium'));
  await id(page, 'compendium-category-Enemies').click();
  await id(page, 'compendium-articles').getByRole('button', { name: 'Soldier', exact: true }).click();
  await shootElement(page, 'compendium-view-subject', view(page, 'compendium'));

  await id(page, 'open-settings').click();
  await shootElement(page, 'settings-panel', page.getByRole('dialog'));
  await id(page, 'open-shortcuts').click();
  await shootElement(page, 'keyboard-shortcuts', id(page, 'shortcuts'));
  await id(page, 'close-shortcuts').click();

  await id(page, 'save').click();
  await expect(page.locator('.notice')).toHaveCount(1);
  await page.locator('.notice-close').click();

  // The globe, last: while it is drawn in software, the page barely responds.
  await closeViews(page);
  await shootWindow(page, 'campaign-screen');
}

/**
 * The Main menu, in a new page of the same browser context: it shares Game storage, so it lists the Campaign just
 * played, and it starts at the Main menu, because a page continues a Campaign only after a reload of itself.
 */
async function captureMainMenu(page: Page): Promise<void> {
  await page.goto(baseURL);
  await expect(id(page, 'new-campaign')).toBeVisible();
  await expect(id(page, 'saves-table')).toBeVisible();
  await shootWindow(page, 'main-menu', true);
}

mkdirSync(outDir, { recursive: true });
const child = await startServer();
// The globe is drawn with WebGL in software, the same on every run; the colour profile is fixed, and the page is
// rasterized on the CPU by one thread, because parallel rasterization of the scaled artwork varies by a shade.
const browser = await chromium.launch({
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--force-color-profile=srgb',
    '--disable-gpu-rasterization',
    '--num-raster-threads=1',
  ],
});
try {
  const context = await browser.newContext({
    viewport: WINDOW,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  context.setDefaultTimeout(30_000);
  await context.addInitScript(fixRandomness);
  await context.clock.setFixedTime(CLOCK);
  for (const step of [capture, captureMainMenu]) {
    const page = await context.newPage();
    try {
      await step(page);
    } catch (error) {
      const failure = join(tmpdir(), 'capture-screens-failure.png');
      await page.screenshot({ path: failure, timeout: 10_000 }).catch(() => undefined);
      console.error(`The page when the capture failed: ${failure}`);
      throw error;
    }
    await page.close();
  }
  for (const file of readdirSync(outDir)) {
    if (file.endsWith('.png') && !written.has(file)) {
      rmSync(join(outDir, file));
      console.log(`removed ${file}`);
    }
  }
  console.log(`${written.size} pictures in ${outDir}`);
} finally {
  await browser.close();
  stopServer(child);
}
