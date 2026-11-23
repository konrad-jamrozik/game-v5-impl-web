# game-v5-impl-web

An Implementation of the Game v5 specifications in TypeScript: a headless engine, a terminal CLI, and a web UI. Both
interfaces are adapters over the same engine API and implement no gameplay rule.

The specifications are in the sibling directory `../game-v5`. The GDR files in `content/` are a copy of its
`content/` directory, without its Cut content. The Soundtrack in `assets/music/tracks/` is an unchanged copy of its
`assets/music/tracks/` directory, and the web UI plays it. The Sound set in `assets/sounds/` is an unchanged copy of
the sound files of its `assets/sounds/` directory, and the web UI plays each Sound in answer to the Player's clicks.
The Background artwork in `assets/images/` is an unchanged copy of the images of its `assets/images/` directory, and
the web UI shows each image behind the Detail view its BackgroundArtwork GDR names. The globe in `src/web/globe/` and
`public/globe/` is an unchanged copy of the code and the maps of its `lib/globe/` directory, and `LICENSE` is a copy
of its license.

`npm run sync:spec` mirrors every one of these copies from a commit of the Spec repo, `origin/main` of `../game-v5`
unless `--rev` and `--from` name another: it adds, replaces, and deletes files until each copy equals its original,
and with `--check` it only reports the differences. The copies are never edited by hand. Each commit that follows the
specifications names the Spec repo commit it follows in a `Spec: <full hash>` trailer of its message; the script
prints that line. Where the specifications are silent, the code decides, and no file records such a choice.

## Running it

Node 26.13.1 with its bundled npm is required; `.node-version` and the `engines` field pin it.

```sh
npm install
npm run check          # the quick check: GDR build, format, lint, type check, unit and property tests
npm run check:full     # the full check: the quick check, the tests at their large size, and the Playwright tests
npm run fix            # format and apply the lint fixes
npm run sync:spec      # mirror the copies from the Spec repo; add -- --check to only report the differences
npm run web:dev        # the web UI at http://localhost:5175
npm run cli            # the terminal CLI; type help
npm run cli -- --json  # the terminal CLI with one line of JSON per result, for scripts and LLM players
npm run test:browser   # Playwright tests of the web UI; first run: npx playwright install chromium
node scripts/measure.ts        # Campaign save size and Advance turn time
```

## Deployment

Each push to `main` runs `.github/workflows/deploy-pages.yml`, which runs `npm run web:build` and deploys `dist/` to
GitHub Pages at https://konrad-jamrozik.github.io/game-v5-impl-web/. It runs no check, so run `npm run check` before
every push. `.github/workflows/daily-check.yml` runs `npm run check:full` once a day on a clean machine and deploys
nothing. The Vite `base` is `./`, so the build runs under any path.

## Layout

Each layer imports only from the layers before it; the lint rules in `vite.config.ts` and
`tests/architecture.test.ts` enforce it. The toolchain is Vite+ (`vp`): Oxfmt formats, Oxlint lints with the
type-aware rules, Vitest tests, and Vite builds, all configured in `vite.config.ts`.

| Folder       | Holds                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `src/kernel` | Exact rational numbers, the seeded random generator, identifiers, value helpers.                    |
| `src/gdr`    | GDR Types, validation of every GDR rule, and the catalog generated from `content/` at build time.   |
| `src/engine` | Foundation in `session`, `timeline`, `saves`; Mechanics in `mechanics`, `turn`, `actions`, `views`. |
| `src/ai`     | Autopilot AIs. They import only `engine/player-api.ts`, so they can see only Player API.            |
| `src/cli`    | The terminal CLI and Game storage as JSON files.                                                    |
| `src/web`    | The web UI and Game storage in IndexedDB.                                                           |

`src/engine/index.ts` is the engine API: `session`, `player`, and `developer`. Every operation returns a result that
is a value or an error with a code and a message; a failed operation changes nothing.

Each World state is an immutable value. An action produces the next World state with Immer, the Timeline keeps
the World states of the current Turn with its Timeline pointer, and a Campaign save stores the Turn-start state,
the Timeline entries, the Timeline pointer, and the Campaign configuration in force, and loading replays the entries.

## Tests

- `tests/mechanics` and `tests/foundation` turn the acceptance examples of each specification into tests, named by
  the abbreviation of the specification, e.g. `COMBAT` or `TLINE`.
- `tests/engine/campaign.test.ts` plays whole Campaigns through Player API: a scripted Victory and Defeat,
  Campaigns of the Basic Autopilot AI within the limits of CTEST, Determinism, undo and redo as a property, and the Information boundary.
- `tests/cli` and `tests/web` cover the two storage layouts and the CLI.
- `e2e/web.spec.ts` plays the same Campaign through the engine API, the CLI, and the web UI in a browser, and
  requires the full Campaign state to be equal.

## The web UI

The web UI follows Graphical User Interface, and the code settles what that leaves open. It looks as Visual Design
states: the Field HUD direction, with its Design tokens in `src/web/styles.css` and its three typefaces loaded from
Google Fonts, in a dark theme only.

- **Main menu.** The Campaign saves grouped by Campaign, with a Load and a Delete button on each Campaign save and a
  Delete Campaign button on each Campaign, every deletion confirmed first; New-Campaign setup with the preset, its
  values and Preset edits, and an optional Campaign seed; and the Global configuration settings, e.g. the Autosave
  limit.
- **Status bar.** Turn, money, funding, projected income and upkeep, Agents against the Agent cap, a Panic meter,
  each Faction with its Faction activity level, and the buttons Undo, Redo, earlier and later Autosave, Save, Main
  menu, and Advance turn.
- **Globe stage.** The rest of the screen, left of the Side panel: a rotating Earth that the Player can drag and zoom,
  copied unchanged from the Spec repo's `lib/globe/`. Its buttons at the bottom left stop and start its
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
    Turn by Turn table, whose Missions link to their Mission sites), Charts (Panic, money, Serving Agents, and
    funding), and Compendium (the Player-visible Guide, Mechanics, and Subject articles by category, with a search
    field, links between articles, and a Data sheet for each subject).
- **Autopilot controls.** Choose an Autopilot AI and engage it for One action or This Turn's actions, neither of which
  advances the Turn, or for a number of Turns; show its progress and a Stop button, and, when the engagement ends, a
  line that says why, until Autopilot is engaged again or the World state changes.
- **Developer drawer.** Enables Dev mode, adds money or Agents, sets a random outcome override, and shows the full
  Campaign state.

A button is enabled only when `getAvailableActions()` or `previewDeployment()` says the action is available, and a
disabled button shows the engine's reason as its tooltip. Every error message shown is the engine's own. The UI
reads the engine through one store that caches the query results of one revision, so every part of the screen shows
the same World state.

After a reload the web UI continues the Campaign from its Current Autosave, including its Undone actions.

Keyboard shortcuts: `N` Advance turn, `U` and `R` undo and redo, `1` to `8` open or close a Detail view, `Esc` close
it, `H` hire, `S`, `C`, `T` assign the Agents selected in the Agents view, `A` select every Agent that can be
assigned, `` ` `` open the Developer drawer, `?` list the shortcuts.

## Screenshots

`npm run screens:capture` builds and serves the game as the browser tests do, plays one fixed scripted Campaign
through the web UI in Chromium, and writes one PNG per screen and state, e.g. `main-menu.png` or
`missions-view-concluded.png`, to the Spec repo's `docs/images/screens/`, which the screen specifications show. The
option `--out <dir>` writes them elsewhere. The script removes the PNG files there that it no longer writes. It takes
a few minutes, writes outside this repository, and is neither a test nor part of `npm run check`.

The pictures are generated: never edit one by hand, and run the script again whenever the UI changes. When a picture
and the game disagree, the game is right. The script keeps them deterministic, so two runs write the same files: a
fixed window of 1440 × 900, a fixed clock and fixed random values in the page, reduced motion, which keeps the globe
still, no CSS animations or transitions, and every font and image loaded before each picture. Where play alone would
take long, the scenario uses Dev mode, e.g. Random outcome overrides under which one Agent is Killed for the Memorial.

## The terminal CLI

One command per line; `help` lists them. The CLI follows Command-Line Interface, and the code settles what that
leaves open. Each command is one engine API operation, e.g. `new my-seed`, `agents`,
`assign Contracting agent-2 agent-3`, `investigate locate_red_dawn_member agent-4`, `deploy mission-site-1 agent-2`,
`next`, `undo`, `auto basic turns 10`, `dev on`, `inspect`. Each prints the whole result of its operation: as
indented `key: value` lines and tables, or with `--json` as one line of JSON. Game storage is the directory `.data`, or the one that
`--data <dir>` names.

## Measurements

Measured with `node scripts/measure.ts` on the development machine:

| Campaign                                                   | Turns | Advance turn                    | Largest Campaign save |
| ---------------------------------------------------------- | ----- | ------------------------------- | --------------------- |
| A Campaign of the Basic Autopilot AI, 200 Turns played     | 201   | median 5.9 ms, max 55 ms a Turn | 680 KiB               |
| Stress Campaign with 300 Agents added by a cheat operation | 301   | median 4.7 ms, max 89 ms        | 669 KiB               |

The Save size limit is 100 MiB. Under CTEST, Limits, the script plays at most 2 Campaigns of the Basic Autopilot AI,
each of at most 200 Turns, and measures no balance.

## License

This Implementation is licensed under the Creative Commons Attribution-NonCommercial 4.0 International license
(CC BY-NC 4.0), the license of the specifications it implements; see [LICENSE](LICENSE). Its dependencies keep their
own licenses.
