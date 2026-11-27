/**
 * VIS, Tables: each column is wide enough for the widest value of its quantity, its Digit grouping commas included,
 * e.g. "1,234" for a skill or a Combat rating, so that a veteran Agent's row late in a long Campaign is never cut
 * short; each header holds its label with its sort arrow; and a table fits its view in the Reference window. Only a
 * browser lays a table out, so this is a browser test. It gives a Campaign of the showcase preset large values, walks
 * the views that show them, and looks at every table cell. For a widest value the Campaign does not reach, e.g. a Turn
 * of four digits or the longest Enemy label, it also lays out a copy of a row holding that value.
 */
import { expect, test, type Page } from '@playwright/test';

/** VIS, Reference window. */
test.use({ viewport: { width: 1408, height: 784 } });

const id = (page: Page, testId: string) => page.getByTestId(testId);
const view = (page: Page, viewId: string) => id(page, `view-${viewId}`);

/**
 * Runs in the page: rewrites every Campaign save so that its Turn-start state holds large values: a base skill of four
 * digits for every Agent, i.e. 9,999 for one Serving Agent in three, with exhaustion 999, and 9,000 for another, whose
 * Combat rating then has four digits too; a health, a weapon damage, and an armor of 999 for the rest; 999 experience
 * and Enemies killed for every Agent; money of eight digits; and Storage counts of five. The saves hold no Player
 * action after the Turn start, so the state loads exactly so.
 */
async function enlargeValues(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('game-v5-impl-web', 1);
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('IndexedDB cannot be opened'));
      };
    });
    const transaction = database.transaction('bodies', 'readwrite');
    const bodies = transaction.objectStore('bodies');
    const keys: IDBValidKey[] = await new Promise((resolve) => {
      const request = bodies.getAllKeys();
      request.onsuccess = () => {
        resolve(request.result);
      };
    });
    for (const key of keys) {
      const text: string = await new Promise((resolve) => {
        const request = bodies.get(key);
        request.onsuccess = () => {
          resolve(request.result as string);
        };
      });
      const body = JSON.parse(text) as {
        entries: unknown[];
        turnStart: {
          world: {
            current: {
              agency: { state: { money: number; storage: Record<string, number> } };
              agents: Record<string, { state: Record<string, unknown> }>;
            };
          };
        };
      };
      if (body.entries.length > 0) {
        throw new Error('the save holds Player actions after its Turn start');
      }
      const current = body.turnStart.world.current;
      current.agency.state.money = 12_345_678;
      for (const item of Object.keys(current.agency.state.storage)) {
        current.agency.state.storage[item] = 12_345;
      }
      let serving = 0;
      for (const agent of Object.values(current.agents)) {
        const state = agent.state;
        state['skillHundredths'] = 999_900;
        state['experience'] = 999;
        state['enemiesKilled'] = 999;
        // AGENT, Service record: a Terminated Agent keeps its final values.
        if (state['finalMaxHealth'] === null) {
          if (serving % 3 === 0) {
            state['exactExhaustionHundredths'] = 99_900;
          } else if (serving % 3 === 1) {
            state['skillHundredths'] = 100;
            state['baseHealth'] = 999;
            state['baseWeaponDamage'] = 999;
            state['baseArmor'] = 999;
          } else {
            state['skillHundredths'] = 900_000;
          }
          serving += 1;
        }
      }
      bodies.put(JSON.stringify(body), key);
    }
    await new Promise((resolve) => {
      transaction.oncomplete = resolve;
    });
  });
}

/** What a table may cut short, and the widest values to lay out in it, by its name. */
interface TableRules {
  /** The header of the table's one column of free text, which VIS, Tables lets cut a value short. */
  readonly freeText?: string;
  /** The widest value of a column, by its header, or by "#" and its index for a table without headers. */
  readonly widest?: Readonly<Record<string, string>>;
}

/**
 * Runs in the page: what breaks VIS, Tables in the tables shown, one line each; empty when nothing does.
 * - A table wider than the box that holds it.
 * - A cell cut short: its content is wider than its box, or than the box of an element in it that clips, or its text
 *   ends in "…", except in the column of free text.
 * - A widest value that a copy of the table's first full body row, holding it, cuts short. The copy is laid out after
 *   the rows and removed at once.
 * A table is named by its test ID or else by the nearest test ID around it; a name in `rules` ending in "*" names every
 * table whose name starts with what precedes it.
 */
function tableProblems(rules: Record<string, TableRules>): { problems: string[]; seen: string[] } {
  const problems: string[] = [];
  const seen: string[] = [];
  const clips = (element: Element): boolean => {
    const style = getComputedStyle(element);
    return style.overflowX !== 'visible' || style.textOverflow === 'ellipsis';
  };
  const isCut = (cell: Element): boolean =>
    [cell, ...cell.querySelectorAll('*')].some(
      (element) =>
        element.getBoundingClientRect().width > 0 &&
        clips(element) &&
        element.scrollWidth > element.clientWidth,
    );
  for (const table of document.querySelectorAll('table')) {
    const box = table.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      continue;
    }
    const name =
      table.getAttribute('data-testid') ??
      table.closest('[data-testid]')?.getAttribute('data-testid') ??
      table.className;
    const ruleName = Object.keys(rules).find(
      (key) => key === name || (key.endsWith('*') && name.startsWith(key.slice(0, -1))),
    );
    const rule = ruleName === undefined ? {} : (rules[ruleName] ?? {});
    if (ruleName !== undefined) {
      seen.push(ruleName);
    }
    let holder = table.parentElement;
    while (holder !== null && holder !== document.body && !clips(holder)) {
      holder = holder.parentElement;
    }
    if (holder !== null && box.width > holder.clientWidth + 0.5) {
      problems.push(`${name} is ${Math.round(box.width)} px wide in a box of ${holder.clientWidth} px`);
    }
    const headers = [...table.querySelectorAll('thead tr:first-child th')].map((th) =>
      (th.textContent ?? '').replace(/[▲▼]/g, '').trim(),
    );
    const columnName = (column: number) => headers[column] ?? `#${column}`;
    for (const row of table.querySelectorAll('tr')) {
      let column = 0;
      for (const cell of row.children) {
        const header = columnName(column);
        column += (cell as HTMLTableCellElement).colSpan;
        if ((cell as HTMLTableCellElement).colSpan > 1 || rule.freeText === header) {
          continue;
        }
        const text = (cell.textContent ?? '').trim();
        if (isCut(cell) || text.endsWith('…')) {
          problems.push(`${name}, ${header}: "${text}" is cut short`);
        }
      }
    }
    const widest = rule.widest ?? {};
    const full = [...table.querySelectorAll('tbody tr')].find((row) =>
      [...row.children].every((cell) => (cell as HTMLTableCellElement).colSpan === 1),
    );
    if (Object.keys(widest).length > 0 && full !== undefined) {
      const copy = full.cloneNode(true) as HTMLTableRowElement;
      full.parentElement?.appendChild(copy);
      [...copy.children].forEach((cell, column) => {
        const value = widest[columnName(column)];
        if (value !== undefined) {
          cell.textContent = value;
          if (isCut(cell)) {
            problems.push(`${name}, ${columnName(column)}: the widest value "${value}" is cut short`);
          }
        }
      });
      copy.remove();
    }
  }
  return { problems, seen };
}

/** Four digits with their comma, the widest skill, Combat rating, and Turn. */
const FOUR = '1,234';

/**
 * VIS, Tables: the free-text column and the widest values of each table. A Combat rating, a skill, an experience, and
 * a Turn take four digits; an exhaustion, a health, an armor, a damage, a count of Missions or Enemies killed, and an
 * experience gained three; a participant the longest Enemy label with a two-digit number. Money takes eight digits and
 * a change of money six; a Storage count five, and a price four, as the dearest Item's does.
 */
const RULES: Record<string, TableRules> = {
  'agents-grid': { widest: { CR: FOUR, Health: '123/123', 'Exh.': '123' } },
  'memorial-grid': {
    freeText: 'Where',
    widest: {
      Base: FOUR,
      'Exp.': FOUR,
      Ended: FOUR,
      Cause: 'Killed by high-commander-12',
      Missions: '123',
      Turns: FOUR,
      Kills: '123',
    },
  },
  'participation-grid': { widest: { Turn: `Turn ${FOUR}` } },
  'storage-table': {
    widest: { Owned: '12,345', 'Equip.': '123', 'Avail.': '12,345', Price: FOUR, Value: FOUR },
  },
  'equip-grid': {
    widest: {
      CR: FOUR,
      'Equip.': `+${FOUR}`,
      Skill: FOUR,
      Base: FOUR,
      'Exp.': FOUR,
      Health: '123/123',
      'Exh.': '123',
    },
  },
  'current-team': { widest: { Skill: FOUR } },
  'agents-to-add': { widest: { Skill: FOUR, 'Exh.': '123' } },
  'deploy-grid': { widest: { CR: FOUR, 'Exh.': '123' } },
  'concluded-agents': { widest: { Skill: `${FOUR} → ${FOUR}`, Health: '123 → 123' } },
  'concluded-enemies': {
    widest: { Enemy: 'high-commander-12', Skill: `${FOUR} → ${FOUR}`, Health: '123 → 123' },
  },
  'history-table': {
    freeText: 'Events',
    widest: {
      Turn: FOUR,
      Money: '12,345,678',
      Spent: '−123,456',
      Income: '+123,456',
      Upkeep: '−123,456',
      Panic: '100.00%',
    },
  },
  'combat-participants': {
    widest: {
      Participant: 'high-commander-12',
      Base: FOUR,
      Skill: `${FOUR} → ${FOUR}`,
      Health: '123 → 123/123',
      Armor: '123 → 123',
      'Exh.': '123 → 123',
      Dealt: '123',
      Taken: '123',
      Exp: '+123',
      Condition: 'Incapacitated',
    },
  },
  'combat-ratings': { widest: { Agents: FOUR, Enemies: FOUR } },
  'combat-log': {
    freeText: 'Result',
    widest: {
      Attacker: 'high-commander-12',
      Defender: 'high-commander-12',
      'Hit chance': `99.9% (${FOUR} vs ${FOUR})`,
    },
  },
  'campaign-*': { widest: { '#0': 'Furthest progress Autosave', '#1': `T${FOUR} A123` } },
};

/** The tables of RULES that a look has found, so that the test can tell that it looked at each. */
const looked = new Set<string>();

/**
 * Looks at the tables shown, once their fonts are loaded, and fails with every problem; the test goes on to the
 * other screens, so that one run names every problem.
 */
async function expectWhole(page: Page, screen: string): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const { problems, seen } = await page.evaluate(tableProblems, RULES);
  for (const name of seen) {
    looked.add(name);
  }
  expect.soft(problems, `the tables of ${screen}`).toEqual([]);
}

/** Opens a Detail view from the Side panel unless it is open, closing a view that leaves the Side panel out first. */
async function open(page: Page, viewId: string): Promise<void> {
  if ((await view(page, viewId).count()) === 0) {
    if ((await view(page, 'compendium').count()) > 0 || (await view(page, 'storage').count()) > 0) {
      await page.keyboard.press('Escape');
    }
    await id(page, `nav-${viewId}`).click();
  }
  await expect(view(page, viewId)).toBeVisible();
}

/** VIS, Tables: sorts the table by each of its column headers in turn and looks at it each time, its arrow shown. */
async function sortByEach(page: Page, headerPrefix: string, screen: string): Promise<void> {
  for (const header of await page.locator(`[data-testid^="${headerPrefix}"]`).all()) {
    await header.click();
    await expectWhole(page, `${screen} sorted by ${(await header.getAttribute('data-testid')) ?? ''}`);
  }
}

test('no table cuts the widest values short, and every table fits its view', async ({ page }) => {
  await page.goto('/');
  await id(page, 'preset-select').selectOption('showcase');
  await id(page, 'seed-input').fill('table-widths');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(async () => (await indexedDB.databases()).length), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await enlargeValues(page);
  // MENU: opening the game resumes the Campaign played last, here from its enlarged save.
  await page.goto('/');
  await expect(id(page, 'turn')).toBeVisible({ timeout: 60_000 });
  await expect(id(page, 'money')).toHaveText('12,345,678');

  await open(page, 'agents');
  await expectWhole(page, 'the Agents View');
  await sortByEach(page, 'agents-sort-', 'the Agents View');
  await id(page, 'filter-memorial').click();
  await expectWhole(page, 'the Memorial');
  await sortByEach(page, 'memorial-sort-', 'the Memorial');
  await id(page, 'filter-all').click();
  // The details of an Agent with a Participation history, for its table.
  const agents = await id(page, 'agents-grid').locator('[data-testid^="agent-details-"]').allTextContents();
  for (const agent of agents) {
    await id(page, `agent-details-${agent}`).click();
    if ((await id(page, 'participation-grid').count()) > 0) {
      break;
    }
    await page.keyboard.press('Escape');
  }
  await expect(id(page, 'participation-grid')).toBeVisible();
  await expectWhole(page, 'the Agent details');

  await open(page, 'storage');
  await expectWhole(page, 'the Storage View');
  await open(page, 'agents');
  await id(page, 'open-equip').click();
  await expect(id(page, 'equip-view')).toBeVisible();
  await expectWhole(page, 'the Equip table');
  await sortByEach(page, 'equip-sort-', 'the Equip table');
  await page.keyboard.press('Escape');
  await expect(id(page, 'equip-view')).toHaveCount(0);

  await open(page, 'leads');
  await expectWhole(page, 'the Leads View');
  await sortByEach(page, 'team-sort-', 'the Leads View');
  await open(page, 'missions');
  await expectWhole(page, 'the Missions View');
  await sortByEach(page, 'deploy-sort-', 'the Missions View');
  await id(page, 'missions-concluded').click();
  await expectWhole(page, 'the Missions View with a Concluded Mission site');
  await id(page, 'missions-concluded').click();
  await open(page, 'history');
  await expectWhole(page, 'the History View');

  // One Turn played with Agents of four-digit skills, for a Combat report of them.
  await open(page, 'missions');
  const team: string[] = [];
  for (const box of await page.locator('[data-testid^="deploy-pick-"]').all()) {
    if (await box.isEnabled()) {
      team.push(((await box.getAttribute('data-testid')) ?? '').slice('deploy-pick-'.length));
    }
  }
  expect(team.length, 'Agents that can be deployed to the Active Mission site').toBeGreaterThan(0);
  for (const agent of team.slice(0, 4)) {
    await id(page, `deploy-pick-${agent}`).check();
  }
  await expectWhole(page, 'the Missions View with a team picked');
  // GUI, Warning on deploying tired Agents: the scenario confirms the deployment of a tired Agent.
  page.on('dialog', (dialog) => void dialog.accept());
  await page.locator('[data-testid^="deploy-mission-site-"]').click();
  await id(page, 'advance-turn').click();
  await expect(id(page, 'turn-summary')).toBeVisible({ timeout: 60_000 });
  await expectWhole(page, 'the Turn summary');
  await id(page, 'turn-summary-report').click();
  await expectWhole(page, 'the Turn Report View');
  await view(page, 'report').locator('[data-testid^="combat-"]').first().click();
  await id(page, 'combat-log-toggle').click();
  await expect(id(page, 'combat-log')).toBeVisible();
  await expectWhole(page, 'the Combat report');
  await open(page, 'history');
  await expectWhole(page, 'the History View after a Turn');

  await id(page, 'to-menu').click();
  await expect(id(page, 'saves-table')).toBeVisible();
  await expectWhole(page, 'the Main menu');
  expect([...looked].sort(), 'the tables looked at').toEqual(Object.keys(RULES).sort());
});
