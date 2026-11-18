# game-v5-impl-web

An Implementation of the Game v5 specifications in TypeScript: a headless engine, a terminal CLI, and a web UI. Both
interfaces are adapters over the same engine API and implement no gameplay rule.

The specifications are in the sibling directory `../game-v5`. The GDR files in `content/` are a copy of its
`content/` directory; `content/SOURCE.md` names the commit they were copied from. The Soundtrack in `assets/music/`
is an unchanged copy of its `assets/music/` directory, and the web UI plays it. The Sound set in `assets/sounds/` is an
unchanged copy of the sound files of its `assets/sounds/` directory, and the web UI plays each Sound in answer to the
Player's clicks. The Background artwork in
`assets/images/` is an unchanged copy of the images of its `assets/images/` directory, and the web UI shows each
image behind the Detail view its BackgroundArtwork GDR names. The records that Implementation
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

The web UI follows Graphical User Interface, and DEC-007 settles the screens that it leaves open. It looks as Visual
Design states: the Field HUD direction, with its Design tokens in `src/web/styles.css` and its three typefaces loaded
from Google Fonts; DEC-034 gives the light theme.

- **Main menu.** The Campaign saves grouped by Campaign, with a Load and a Delete button on each Campaign save and a
  Delete Campaign button on each Campaign, every deletion confirmed first; New-Campaign setup with the preset, its
  values and Preset edits, and an optional Campaign seed; and the Global configuration settings, i.e. the Autosave limit and
  the theme, dark or light.
- **Status bar.** Turn, money, funding, projected income and upkeep, Agents against the Agent cap, a Panic meter,
  each Faction with its Faction activity level, and the buttons Undo, Redo, earlier and later Autosave, Save, Main
  menu, and Advance turn.
- **Globe stage.** The rest of the screen, left of the Side panel: a rotating Earth that the Player can drag and zoom,
  copied unchanged from the Spec repo's `lib/globe/` (DEC-043). Its buttons at the bottom left stop and start its
  rotation, show its clouds in full, at half opacity, or not at all, and set the day and night speed to 1×, 2×, 4×, or
  stopped. It loads on first show, stops drawing while a Detail view covers it, and shows a message in its place
  without WebGL 2. Imagery: NASA Blue Marble and Earth at Night, in the public domain.
- **Side panel.** On the right, 400 px wide: a button for each Detail view, the compact Situation panel, in which
  each item takes one line, e.g. an Active Investigation with its Progress circle and Completion estimate, and opens
  its Detail view, and a footer with the Autopilot controls, collapsed to one row until expanded.
- **Detail views.** One at a time, opened and closed from the Side panel or with `Esc`:
  - Operations: Missions (Mission sites, their Enemies and Consequences, and deploying a team), Leads (the Discovered
    Leads in groups, the selected Lead with its Progress bar, and its Investigation's team), Agents (a sortable table
    of the Serving Agents built with TanStack Table, with Hire, the Assignment buttons, Dismiss, and each Agent's
    details), and Upgrades (one card per Upgrade with what one more purchase changes).
  - Records: Turn report (what the last Advance turn did, with each Combat report and its Combat log), History (the
    Turn by Turn table), Charts (Panic, money, Serving Agents, and funding), and Compendium (the Player-visible
    Encyclopedia articles, by category, with a search field).
- **Autopilot controls.** Choose an Autopilot AI and engage it for one Player action, until the Turn advances, or for
  a number of Turns; show its progress and a Stop button.
- **Developer drawer.** Enables Dev mode, adds money or Agents, sets a random outcome override, and shows the full
  Campaign state.

A button is enabled only when `getAvailableActions()` or `previewDeployment()` says the action is available, and a
disabled button shows the engine's reason as its tooltip. Every error message shown is the engine's own. The UI
reads the engine through one store that caches the query results of one revision, so every part of the screen shows
the same Committed state.

After a reload the web UI continues the Campaign from its Current Autosave, including its Undone actions; see
DEC-023.

Keyboard shortcuts: `N` Advance turn, `U` and `R` undo and redo, `1` to `8` open or close a Detail view, `Esc` close
it, `H` hire, `S`, `C`, `T` assign the Agents selected in the Agents view, `A` select every Agent that can be
assigned, `` ` `` open the Developer drawer, `?` list the shortcuts.

## The terminal CLI

One command per line; `help` lists them. The CLI follows Command-Line Interface, and DEC-027 settles what it leaves
open. Each command is one engine API operation, e.g. `new my-seed`, `agents`,
`assign Contracting agent-2 agent-3`, `investigate locate_red_dawn_member agent-4`, `deploy mission-site-1 agent-2`,
`next`, `undo`, `auto basic turns 10`, `dev on`, `inspect`. Each prints the whole result of its operation: as
indented `key: value` lines and tables, or with `--json` as one line of JSON. Game storage is the directory `.data`, or the one that
`--data <dir>` names.

## Measurements

Measured with `node scripts/measure.ts` on the development machine:

| Campaign                                                   | Turns | Advance turn                     | Largest Campaign save |
| ---------------------------------------------------------- | ----- | -------------------------------- | --------------------- |
| Longest of 20 Campaigns of the Basic Autopilot AI          | 117   | median 0.7 ms, max 2.3 ms a Turn | 114 KiB               |
| Stress Campaign with 300 Agents added by a cheat operation | 238   | median 3.4 ms, max 7.3 ms        | 255 KiB               |

The Save size limit is 100 MiB. With the thresholds of DEC-021 the Basic Autopilot AI won 200 of 200 Campaigns of
different Campaign seeds.

## License

This Implementation is licensed under the Creative Commons Attribution-NonCommercial 4.0 International license
(CC BY-NC 4.0), the license of the specifications it implements; see [LICENSE](LICENSE). Its dependencies keep their
own licenses.
