# Specification map

## AGENT: Agents

- src/engine/mechanics/agents/
- src/engine/actions/actions.ts
- src/engine/turn/advance.ts
- src/engine/player-api.ts
- src/engine/state/types.ts
- src/engine/state/create.ts
- src/engine/state/invariants.ts
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/agents.test.ts
- tests/mechanics/review-gaps.test.ts

## AUTO: Autopilot

- src/engine/session/core.ts
- src/engine/index.ts
- src/engine/player-api.ts
- src/engine/timeline/campaign-runtime.ts
- src/ai/index.ts
- tests/foundation/autopilot.test.ts
- tests/foundation/final-review.test.ts
- tests/helpers/test-rules.ts

## AVIEW: Agents View

- src/web/screens/AgentsView.tsx
- src/engine/views/views.ts
- src/engine/player-api.ts
- src/engine/game-rules.ts
- src/engine/index.ts
- tests/mechanics/agents.test.ts
- e2e/web.spec.ts
- src/web/agent-selection.ts
- tests/web/agent-condition-and-selection.test.ts
- src/web/table-sort.ts
- src/web/artwork.ts
- src/web/screens/DetailView.tsx
- assets/images/
- src/web/styles.css

## BASICAI: Basic Autopilot AI

- src/ai/
- scripts/simulate.ts
- scripts/trace-campaign.ts
- tests/engine/campaign.test.ts

## BOOT: Bootstrap GDRs

- content/
- scripts/build-gdr.ts
- src/gdr/generated/
- tests/foundation/final-review.test.ts

## CINST: Campaign Instances

- src/engine/state/types.ts
- src/engine/state/create.ts
- src/engine/state/invariants.ts
- src/engine/turn/advance.ts
- src/engine/views/views.ts
- src/kernel/identifiers.ts
- tests/engine/campaign.test.ts
- tests/mechanics/review-gaps.test.ts
- src/engine/saves/encoding.ts
- tests/foundation/instance-ids.test.ts

## CLI: Command-Line Interface

- src/cli/
- tests/cli/
- e2e/web.spec.ts
- src/cli/cli.ts

## COMBAT: Combat

- src/engine/mechanics/combat/
- src/engine/state/types.ts
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/combat.test.ts
- tests/mechanics/review-gaps.test.ts

## COMP: Compendium

- content/compendium/encyclopedia_articles.yaml
- src/engine/mechanics/compendium/
- src/gdr/catalog.ts
- src/gdr/types.ts
- src/engine/views/views.ts
- src/engine/player-api.ts
- src/engine/game-rules.ts
- src/engine/index.ts
- tests/mechanics/compendium.test.ts
- tests/helpers/game.ts

## COMPV: Compendium View

- src/web/screens/CompendiumView.tsx
- src/web/store.ts
- e2e/web.spec.ts

## CONFIG: Configuration

- src/engine/session/core.ts
- src/engine/session/global-configuration.ts
- src/engine/rules.ts
- src/engine/game-rules.ts
- src/engine/state/create.ts
- tests/foundation/configuration.test.ts
- src/web/screens/MainMenu.tsx

## CONV: Specification Conventions

No files.

## CORE: Core Concepts

No files.

## CSCR: Campaign Screen

- src/web/screens/MusicControl.tsx
- src/web/screens/SettingsPanel.tsx
- src/web/screens/Globe.tsx
- src/web/screens/Campaign.tsx
- src/web/screens/DetailView.tsx
- src/web/screens/AutopilotBar.tsx
- src/web/styles.css
- e2e/web.spec.ts
- src/web/undo-redo.ts
- tests/web/undo-redo.test.ts
- src/web/ui.tsx
- src/web/store.ts

## CSTATE: Campaign State

- src/engine/state/types.ts
- src/engine/state/create.ts
- src/engine/views/views.ts
- src/engine/rules.ts
- tests/engine/campaign.test.ts

## CVIEW: Charts View

- src/web/screens/ChartsView.tsx
- src/web/screens/LineChart.tsx
- e2e/web.spec.ts

## DCONV: Design Specification Conventions

No files.

## DEPDIR: Gameplay Dependency Direction

- eslint.config.js
- tests/architecture.test.ts

## DETERM: Determinism and Randomness

- src/kernel/random.ts
- src/kernel/identifiers.ts
- src/engine/random.ts
- src/engine/turn/advance.ts
- src/engine/state/create.ts
- src/engine/session/core.ts
- tests/kernel/random.test.ts
- tests/engine/campaign.test.ts
- tests/foundation/lifecycle-and-saves.test.ts

## DEV: Developer Access

- src/engine/session/core.ts
- src/engine/index.ts
- src/engine/actions/actions.ts
- src/engine/random.ts
- src/engine/views/views.ts
- src/web/screens/DeveloperDrawer.tsx
- tests/foundation/autopilot.test.ts
- tests/foundation/final-review.test.ts
- tests/engine/campaign.test.ts

## DOM: Domain Model

- src/engine/state/
- src/engine/views/views.ts
- src/engine/game-rules.ts
- tests/helpers/game.ts
- tests/mechanics/review-gaps.test.ts
- src/engine/mechanics/missions/missions.ts
- src/engine/actions/actions.ts
- tests/foundation/instance-ids.test.ts

## ECON: Economy and Upgrades

- src/engine/mechanics/economy/
- src/engine/actions/actions.ts
- src/engine/turn/advance.ts
- src/engine/state/create.ts
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/economy.test.ts

## ENDING: Panic and Endings

- src/engine/mechanics/endings/
- src/engine/turn/advance.ts
- src/engine/actions/actions.ts
- tests/mechanics/endings.test.ts

## ENG: Engine Contract

- src/engine/index.ts
- src/engine/result.ts
- src/engine/rules.ts
- src/engine/game-rules.ts
- src/engine/session/core.ts
- src/engine/views/views.ts
- src/engine/actions/actions.ts
- src/cli/
- src/web/
- tests/engine/campaign.test.ts
- tests/foundation/
- tests/cli/cli.test.ts
- tests/helpers/
- e2e/web.spec.ts

## FACTION: Factions

- src/engine/mechanics/factions/
- src/engine/turn/advance.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/factions.test.ts

## FEEDBACK: Implementation Feedback

- feedback/implementation-decisions.md
- feedback/specification-problems.md
- scripts/check-records.ts

## GDR: Game Data Records

- src/gdr/
- scripts/build-gdr.ts
- content/
- tests/helpers/game.ts

## GHPAGES: GitHub Pages Deployment

- .github/workflows/deploy-pages.yml
- vite.config.ts

## GLOBE: Globe Integration

- public/globe/
- src/web/globe/
- src/web/screens/Globe.tsx
- package.json
- eslint.config.js
- .prettierignore
- e2e/web.spec.ts

## GLOSS: Glossary Conventions

No files.

## GUI: Graphical User Interface

- src/web/
- index.html
- tests/web/
- e2e/web.spec.ts

## HEADLESS: Headless First

- src/cli/
- tests/cli/
- e2e/web.spec.ts

## HVIEW: History View

- src/web/screens/HistoryView.tsx

## ICONV: Implementation Specification Conventions

No files.

## INDEX: Game Specification Index

No files.

## INVSTG: Investigations

- src/engine/mechanics/investigations/
- src/engine/actions/actions.ts
- src/engine/turn/advance.ts
- src/engine/views/views.ts
- src/engine/player-api.ts
- src/engine/index.ts
- src/engine/game-rules.ts
- src/engine/state/types.ts
- src/engine/state/invariants.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- content/investigations/investigation_parameters.yaml
- src/web/screens/LeadsView.tsx
- src/web/screens/TurnReportView.tsx
- src/web/interruption.ts
- src/web/format.ts
- src/web/progress-bar.ts
- src/web/turn-summary.ts
- tests/mechanics/leads-investigations.test.ts
- tests/mechanics/turn-advancement.test.ts
- tests/web/interruption.test.ts
- tests/web/progress-bar.test.ts
- tests/web/situation-and-summary.test.ts
- tests/engine/campaign.test.ts
- src/engine/session/core.ts

## LEAD: Leads and Progression

- src/engine/mechanics/leads/
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/leads-investigations.test.ts
- src/engine/player-api.ts
- src/engine/state/types.ts
- src/engine/turn/advance.ts
- src/web/screens/LeadsView.tsx
- src/web/screens/TurnReportView.tsx
- src/web/screens/HistoryView.tsx
- content/leads-and-progression/leads.yaml

## LICENSE: Implementation License

- LICENSE
- README.md
- package.json

## LIFE: Campaign Lifecycle

- src/engine/session/core.ts
- src/engine/index.ts
- tests/foundation/lifecycle-and-saves.test.ts

## LOOP: Development Loop

No files.

## LVIEW: Leads View

- src/web/screens/LeadsView.tsx
- src/web/screens/ProgressBar.tsx
- src/web/progress-bar.ts
- src/web/interruption.ts
- e2e/web.spec.ts
- src/web/agents-to-add.ts
- tests/web/agents-to-add.test.ts
- src/web/condition.tsx
- src/web/table-sort.ts

## MENU: Main Menu

- src/web/screens/MusicControl.tsx
- src/web/screens/SettingsPanel.tsx
- src/web/screens/MainMenu.tsx
- src/web/styles.css
- e2e/web.spec.ts
- src/web/store.ts
- src/web/ui.tsx
- tests/web/leave-campaign.test.ts

## MISSION: Missions

- src/engine/mechanics/missions/
- src/engine/actions/actions.ts
- src/engine/turn/advance.ts
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- src/engine/state/types.ts
- src/web/turn-summary.ts
- src/engine/state/invariants.ts
- tests/mechanics/missions.test.ts
- tests/mechanics/review-gaps.test.ts
- tests/web/situation-and-summary.test.ts

## MUSIC: Music

- assets/music/
- src/web/music.ts
- src/web/music-player.ts
- src/web/screens/MusicControl.tsx
- src/web/screens/SettingsPanel.tsx
- src/web/ui.tsx
- src/web/App.tsx
- src/engine/session/global-configuration.ts
- src/web/styles.css
- tests/web/music.test.ts
- e2e/web.spec.ts

## MVIEW: Missions View

- src/web/screens/MissionsView.tsx
- src/web/tired-deployment.ts
- src/web/artwork.ts
- src/web/screens/DetailView.tsx
- assets/images/
- src/web/styles.css

## NUMBERS: Numbers

- src/kernel/rational.ts
- src/kernel/values.ts
- src/kernel/errors.ts
- src/engine/state/invariants.ts
- src/gdr/catalog.ts
- tests/kernel/numbers.test.ts

## OVW: Overview Conventions

No files.

## PAPI: Player API

- src/engine/player-api.ts
- src/engine/index.ts
- src/engine/session/core.ts
- src/engine/views/views.ts
- src/engine/actions/actions.ts
- tests/engine/campaign.test.ts
- tests/foundation/autopilot.test.ts
- src/engine/game-rules.ts

## PLACE: Implementation Placement

- content/SOURCE.md
- assets/music/
- assets/sounds/
- src/web/sound-player.ts
- .node-version
- .gitignore
- package.json
- tests/architecture.test.ts
- assets/images/
- src/web/artwork.ts
- AGENTS.md
- .gitattributes
- README.md

## PLAN: Specification Work Plan and Backlog

No files.

## RECOVER: Agent Recovery

- src/engine/mechanics/recovery/
- src/engine/turn/advance.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/agents.test.ts
- tests/mechanics/turn-advancement.test.ts

## REL: Artifact Relationships

No files.

## SAVES: Saves

- src/engine/session/core.ts
- src/engine/index.ts
- src/engine/result.ts
- src/web/screens/MainMenu.tsx
- e2e/web.spec.ts
- src/engine/saves/
- src/engine/timeline/campaign-runtime.ts
- src/cli/file-storage.ts
- src/web/indexeddb-storage.ts
- tests/foundation/lifecycle-and-saves.test.ts
- tests/foundation/final-review.test.ts
- tests/cli/cli.test.ts
- tests/web/indexeddb-storage.test.ts
- scripts/measure.ts
- tests/foundation/timeline.test.ts
- src/engine/saves/storage.ts

## SCHEMA: Storage Schema

- src/engine/saves/
- src/engine/timeline/campaign-runtime.ts
- src/cli/file-storage.ts
- src/web/indexeddb-storage.ts

## SITP: Situation Panel

- src/web/screens/SituationPanel.tsx
- src/web/screens/ProgressCircle.tsx
- src/web/situation.ts
- src/web/completion.ts
- tests/web/situation-and-summary.test.ts
- e2e/web.spec.ts

## SOUNDS: Sounds

- assets/sounds/
- src/web/sounds.ts
- src/web/sound-player.ts
- src/web/App.tsx
- src/web/ui.tsx
- src/web/screens/Campaign.tsx
- src/web/screens/DetailView.tsx
- src/web/screens/TurnSummary.tsx
- src/web/screens/MainMenu.tsx
- src/web/screens/AgentsView.tsx
- src/web/screens/LeadsView.tsx
- src/web/screens/MissionsView.tsx
- src/web/screens/CompendiumView.tsx
- src/web/screens/TurnReportView.tsx
- src/web/screens/AutopilotBar.tsx
- src/web/screens/MusicControl.tsx
- src/web/screens/DeveloperDrawer.tsx
- src/web/screens/SettingsPanel.tsx
- src/web/tired-deployment.ts
- src/web/interruption.ts
- src/engine/session/global-configuration.ts
- tests/web/sounds.test.ts
- e2e/web.spec.ts

## STACK: Tech Stack Suggestion

No files.

## TERM: Terminology Conventions

No files.

## TIMELINE: Timeline

- src/engine/session/core.ts
- src/engine/timeline/
- tests/foundation/timeline.test.ts
- tests/foundation/final-review.test.ts
- src/engine/saves/
- src/web/screens/MainMenu.tsx

## TODOS: Outstanding Work Items

No files.

## TRACK: Specification Tracking

- tracking/specification-baseline.md
- tracking/specification-map.md
- scripts/check-records.ts

## TRVIEW: Turn Report View

- src/web/screens/TurnReportView.tsx
- src/web/format.ts
- src/web/turn-summary.ts
- src/web/screens/Campaign.tsx

## TSUM: Turn Summary

- src/web/screens/TurnSummary.tsx
- src/web/turn-summary.ts
- src/web/styles.css
- tests/web/situation-and-summary.test.ts
- src/web/screens/Campaign.tsx
- src/web/screens/TurnReportView.tsx

## TURN: Turn Advancement

- src/engine/turn/
- src/engine/game-rules.ts
- tests/mechanics/turn-advancement.test.ts

## UPDATES: Specification Updates

No files.

## UVIEW: Upgrades View

- src/web/screens/UpgradesView.tsx
- src/web/tally.ts
- tests/web/tally.test.ts
- e2e/web.spec.ts
- src/web/styles.css

## VIS: Visual Design

- index.html
- src/web/tally.ts
- tests/web/tally.test.ts
- src/web/styles.css
- src/web/ui.tsx
- src/web/screens/AgentsView.tsx
- src/web/screens/Campaign.tsx
- src/web/screens/HistoryView.tsx
- src/web/screens/LineChart.tsx
- src/web/screens/MainMenu.tsx
- src/web/screens/ProgressBar.tsx
- src/web/screens/SituationPanel.tsx
- src/web/screens/TurnSummary.tsx
- src/web/progress-bar.ts
- e2e/web.spec.ts
- src/web/screens/DetailView.tsx
- src/web/screens/ProgressCircle.tsx
- src/web/screens/MissionsView.tsx
- src/web/screens/LeadsView.tsx
- src/web/screens/UpgradesView.tsx
- src/web/screens/TurnReportView.tsx
- src/web/screens/ChartsView.tsx
- src/web/screens/CompendiumView.tsx
- src/web/row-selection.ts
- tests/web/row-selection.test.ts
- src/web/condition.tsx
- src/web/condition-scale.ts
- tests/web/agent-condition-and-selection.test.ts
- src/web/slider.ts
- tests/web/slider.test.ts
- tests/web/checkbox.test.ts
- src/web/screens/MusicControl.tsx
- src/web/table-sort.ts
- tests/web/table-sort.test.ts
- src/web/artwork.ts
- assets/images/
- content/visual-design/background_artworks.yaml
- src/gdr/catalog.ts
- src/gdr/types.ts
- src/engine/views/views.ts
- src/engine/player-api.ts
- src/engine/mechanics/compendium/compendium.ts
- src/web/screens/DeveloperDrawer.tsx
- tests/web/artwork.test.ts
- src/web/artwork-names.ts
- src/web/screens/SettingsPanel.tsx

## WHIST: World History

- src/engine/index.ts
- src/engine/state/types.ts
- src/engine/state/summary.ts
- src/engine/turn/advance.ts
- src/engine/views/views.ts
- tests/engine/campaign.test.ts
- tests/foundation/timeline.test.ts
- tests/mechanics/turn-advancement.test.ts
- src/web/turn-summary.ts
