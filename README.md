# game-v5-impl-web

An Implementation of the Game v5 specifications in TypeScript: a headless engine, a terminal CLI, and a web UI. Both
interfaces are adapters over the same engine API and implement no gameplay rule.

The specifications are in the sibling directory `../game-v5`. The GDR files in `content/` are a copy of its
`content/` directory; `content/SOURCE.md` names the commit they were copied from. The records that Implementation
Feedback requires are in `feedback/`: `specification-problems.md` and `implementation-decisions.md`. The records that
Specification Tracking requires are in `tracking/`: `specification-baseline.md` names the commit of the
specifications this Implementation conforms to, and `specification-map.md` lists the files that implement each
specification.

## Running it

Node 26.13.1 with its bundled npm is required; `.node-version` and the `engines` field pin it.

```sh
npm install
npm run check          # GDR build, format, lint, type check, records check, unit and property tests
npm run web:dev        # the web UI at http://localhost:5175
npm run cli            # the terminal CLI; type help
npm run cli -- --json  # the terminal CLI with one line of JSON per result, for scripts and LLM players
npm run test:browser   # Playwright tests of the web UI; first run: npx playwright install chromium
node scripts/simulate.ts 200   # 200 Campaigns played by the Basic Autopilot AI
node scripts/measure.ts        # Campaign save size and Advance turn time
```

## Deployment

Each push to `main` runs `.github/workflows/deploy-pages.yml`: `npm ci`, `npm run check`, and `npm run web:build`;
when they pass it deploys `dist/` to GitHub Pages at https://konrad-jamrozik.github.io/game-v5-impl-web/. The Vite
`base` is `./`, so the build runs under any path.

## Layout

Each layer imports only from the layers before it; ESLint and `tests/architecture.test.ts` enforce it.

| Folder       | Holds                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `src/kernel` | Exact rational numbers, the seeded random generator, identifiers, value helpers.                    |
| `src/gdr`    | GDR Types, validation of every GDR rule, and the catalog generated from `content/` at build time.   |
| `src/engine` | Foundation in `session`, `timeline`, `saves`; Mechanics in `mechanics`, `turn`, `actions`, `views`. |
| `src/ai`     | Autopilot AIs. They import only `engine/player-api.ts`, so they can see only Player API.            |
| `src/cli`    | The terminal CLI and Game storage as JSON files.                                                    |
| `src/web`    | The web UI and Game storage in IndexedDB.                                                           |

`src/engine/index.ts` is the engine API: `session`, `player`, `developer`, and `autopilotMemory`. Every operation
returns a result that is a value or an error with a code and a message; a failed operation changes nothing.

Campaign state is an immutable value. An action produces the next Committed state with Immer, the Timeline keeps the
Committed states of the current Turn, and a Campaign save stores the Turn-start state and the Timeline entries, which
loading replays.

## Tests

- `tests/mechanics` and `tests/foundation` turn the acceptance examples of each specification into tests, named by
  the abbreviation of the specification, e.g. `COMBAT` or `TLINE`.
- `tests/engine/campaign.test.ts` plays whole Campaigns through Player API: a scripted Victory and Defeat, 200
  Campaigns of the Basic Autopilot AI, Determinism, undo and redo as a property, and the Information boundary.
- `tests/cli` and `tests/web` cover the two storage layouts and the CLI.
- `e2e/web.spec.ts` plays the same Campaign through the engine API, the CLI, and the web UI in a browser, and
  requires the full Campaign state to be equal.

## The web UI

The web UI is the implementer's own design; see DEC-007. It makes no claim to conform to the UI family, which was
not read.

- **Main menu.** New-Campaign setup with the preset, its values and Preset edits, and an optional Campaign seed; the
  list of Campaign saves with a Load button each; and the Global configuration settings, i.e. the Autosave limit and
  the theme, dark or light.
- **Status bar.** Turn, money, funding, projected income and upkeep, Agents against the Agent cap, a Panic meter,
  each Faction with its Faction activity level, and the buttons Undo, Redo, earlier and later Autosave, Save, Main
  menu, and Advance turn.
- **Agents grid.** Always visible on the left. A sortable table of the Serving Agents built with TanStack Table.
  Clicking a row selects it. The toolbar above hires an Agent and assigns the selected Agents to Standby, Contracting,
  or Training, or dismisses them.
- **Panels.** On the right, one of five:
  - Mission sites: each with its Enemies, rewards, and penalties, the Combat rating of the selected team against
    the Enemies, and a Deploy button.
  - Leads: a tree in which each Lead is under the Leads it requires, with what blocks it, its Investigation
    progress, and buttons that start an Investigation or add the selected Agents to it.
  - Agency: caps, Upgrades with Buy buttons, Factions, and a field manual of the Player-visible GDR values.
  - Turn report: what the last Advance turn did, with every Combat report and its Combat log.
  - History: four line charts, the History entries as a table, and the Campaign instances no longer in play.
- **Autopilot bar.** Chooses an Autopilot AI and engages it for one Player action, until the Turn advances, or for a
  number of Turns; shows its progress and a Stop button.
- **Developer drawer.** Enables Dev mode, adds money or Agents, sets a random outcome override, and shows the full
  Campaign state.

A button is enabled only when `getAvailableActions()` or `previewDeployment()` says the action is available, and a
disabled button shows the engine's reason as its tooltip. Every error message shown is the engine's own. The UI
reads the engine through one store that caches the query results of one revision, so every part of the screen shows
the same Committed state.

After a reload the web UI continues the Campaign from its Current Autosave, including its Undone actions; see
DEC-023.

Keyboard shortcuts: `N` Advance turn, `U` and `R` undo and redo, `1` to `5` open a panel, `H` hire, `S`, `C`, `T`
assign the selected Agents, `A` select every Agent that can be assigned, `Esc` clear the selection, `` ` `` open the
Developer drawer, `?` list the shortcuts.

## The terminal CLI

One command per line; `help` lists them. Each command is one engine API operation, e.g. `new my-seed`, `agents`,
`assign Contracting agent-2 agent-3`, `investigate locate_red_dawn_member agent-4`, `deploy missionsite-12 agent-2`,
`next`, `undo`, `auto basic turns 10`, `dev on`, `inspect`. Game storage is the directory `.data`, or the one that
`--data <dir>` names.

## Measurements

Measured with `node scripts/measure.ts` on the development machine:

| Campaign                                                   | Turns | Advance turn                     | Largest Campaign save |
| ---------------------------------------------------------- | ----- | -------------------------------- | --------------------- |
| Longest of 20 Campaigns of the Basic Autopilot AI          | 117   | median 0.7 ms, max 2.3 ms a Turn | 114 KiB               |
| Stress Campaign with 300 Agents added by a cheat operation | 238   | median 3.4 ms, max 7.3 ms        | 255 KiB               |

The Save size limit is 100 MiB. With the thresholds of DEC-021 the Basic Autopilot AI won 200 of 200 Campaigns of
different Campaign seeds.
