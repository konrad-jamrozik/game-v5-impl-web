# Specification map

## AGENT: Agents

- tests/mechanics/whole-number-arithmetic.test.ts
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
- tests/mechanics/decimal-quantities.test.ts
- tests/mechanics/incapacitation-agreement.test.ts
- tests/helpers/game.ts
- src/engine/state/summary.ts
- tests/foundation/history-chart-values.test.ts

## APPERF: Autopilot Performance

- src/engine/views/views.ts
- src/kernel/values.ts
- src/kernel/rational.ts
- src/engine/session/core.ts
- src/engine/actions/actions.ts
- src/engine/mechanics/conditions/conditions.ts
- src/engine/mechanics/leads/leads.ts
- src/engine/mechanics/agents/agents.ts
- src/engine/mechanics/combat/combat.ts
- src/engine/turn/advance.ts
- src/engine/rules.ts
- src/engine/game-rules.ts
- src/engine/player-api.ts
- src/ai/world-state-changes.ts
- src/ai/basic/basic-autopilot-ai.ts
- tests/mechanics/whole-number-arithmetic.test.ts
- tests/foundation/action-results.test.ts

## AUTO: Autopilot

- src/engine/session/core.ts
- src/engine/index.ts
- src/engine/player-api.ts
- src/ai/index.ts
- src/cli/cli.ts
- src/web/screens/AutopilotBar.tsx
- tests/foundation/autopilot.test.ts
- tests/foundation/final-review.test.ts
- tests/engine/campaign.test.ts
- tests/helpers/test-rules.ts
- tests/foundation/autopilot-autosaves.test.ts

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
- src/web/cap-bar.ts
- tests/web/cap-bar.test.ts
- src/web/place.tsx
- src/web/enemy-labels.ts
- tests/web/enemy-labels.test.ts
- src/web/memorial.ts
- tests/web/memorial.test.ts
- tests/web/combat-share.test.ts
- src/web/screens/Campaign.tsx
- src/web/screens/TurnReportView.tsx

## BASICAI: Basic Autopilot AI

- src/ai/world-state-changes.ts
- tests/foundation/action-results.test.ts
- src/ai/
- tests/engine/basic-autopilot-ai.test.ts
- tests/engine/campaign.test.ts
- tests/mechanics/initiative-operation-level.test.ts
- src/engine/views/views.ts

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

- tests/mechanics/whole-number-arithmetic.test.ts
- src/engine/mechanics/combat/
- src/engine/state/types.ts
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/combat.test.ts
- tests/mechanics/review-gaps.test.ts
- tests/mechanics/detached-combat.test.ts
- src/engine/turn/advance.ts
- src/cli/cli.ts

## COMP: Compendium

- src/engine/mechanics/compendium/
- src/gdr/catalog.ts
- src/gdr/types.ts
- src/engine/views/views.ts
- src/engine/player-api.ts
- src/engine/game-rules.ts
- src/engine/index.ts
- tests/mechanics/compendium.test.ts
- tests/helpers/game.ts
- content/compendium/compendium_articles/
- src/gdr/compendium-articles.ts
- src/cli/cli.ts
- tests/cli/cli.test.ts

## COMPV: Compendium View

- src/web/screens/CompendiumView.tsx
- src/web/store.ts
- e2e/web.spec.ts
- src/web/compendium.ts
- tests/web/compendium.test.ts
- src/web/styles.css
- src/engine/views/views.ts
- src/engine/player-api.ts
- src/web/reveal.ts
- tests/web/reveal.test.ts

## COND: Conditions

- src/engine/mechanics/conditions/
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/leads-investigations.test.ts
- tests/mechanics/initiative-won-with-enemy.test.ts

## CONFIG: Configuration

- src/engine/session/core.ts
- src/engine/session/global-configuration.ts
- src/engine/rules.ts
- src/engine/game-rules.ts
- src/engine/state/create.ts
- tests/foundation/configuration.test.ts
- tests/foundation/configuration-replay.test.ts
- src/web/screens/MainMenu.tsx
- src/engine/index.ts
- src/engine/timeline/campaign-runtime.ts
- src/engine/saves/encoding.ts
- src/cli/cli.ts
- tests/helpers/test-rules.ts
- src/web/changed-settings.ts
- tests/web/changed-settings.test.ts

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
- src/web/view-trail.ts
- src/web/place.tsx
- tests/web/view-trail.test.ts
- src/web/faction-activity.ts
- tests/web/faction-activity.test.ts
- src/web/autopilot-controls.ts
- tests/web/lead-completion.test.ts
- src/web/screens/DeveloperDrawer.tsx
- src/web/screens/SituationPanel.tsx
- src/web/side-panel.ts
- tests/web/chart-range.test.ts

## CSTATE: Campaign State

- src/engine/state/types.ts
- src/engine/state/create.ts
- src/engine/views/views.ts
- src/engine/rules.ts
- src/engine/game-rules.ts
- src/engine/timeline/campaign-runtime.ts
- tests/engine/campaign.test.ts
- tests/helpers/engine.ts

## CTEST: Campaign Tests

- tests/engine/campaign.test.ts
- tests/cli/cli.test.ts
- scripts/measure.ts
- vite.config.ts

## CVIEW: Charts View

- src/web/screens/ChartsView.tsx
- src/web/screens/LineChart.tsx
- e2e/web.spec.ts
- src/web/faction-activity.ts
- tests/web/faction-activity.test.ts
- src/web/styles.css
- src/web/agency-charts.ts
- src/web/screens/SeriesChart.tsx
- tests/web/agency-charts.test.ts
- tests/mechanics/combat-strength-values.test.ts
- src/web/chart-range.ts
- src/web/screens/LastTurnsCheckbox.tsx
- tests/web/chart-range.test.ts

## DCONV: Design Specification Conventions

No files.

## DEPDIR: Gameplay Dependency Direction

- vite.config.ts
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
- src/engine/mechanics/combat/detached-combat.ts
- tests/mechanics/detached-combat.test.ts
- tests/mechanics/initiative-operation-level.test.ts
- src/cli/cli.ts
- src/engine/rules.ts
- src/engine/game-rules.ts
- src/web/reveal.ts
- src/web/store.ts
- tests/web/reveal.test.ts
- tests/mechanics/compendium.test.ts
- src/engine/mechanics/compendium/compendium.ts

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

- tests/mechanics/contracting-cap.test.ts
- src/engine/mechanics/economy/
- src/engine/actions/actions.ts
- src/engine/turn/advance.ts
- src/engine/state/create.ts
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/economy.test.ts
- src/engine/game-rules.ts
- tests/foundation/action-record.test.ts
- src/engine/player-api.ts
- src/engine/mechanics/agents/agents.ts
- src/engine/mechanics/recovery/recovery.ts
- tests/mechanics/decimal-quantities.test.ts
- src/engine/state/summary.ts
- tests/foundation/history-chart-values.test.ts

## EFFECT: Effect Lists

- src/gdr/catalog.ts
- src/gdr/types.ts
- src/engine/mechanics/missions/missions.ts
- src/engine/turn/advance.ts
- content/factions/faction_operation_levels.yaml
- content/leads-and-progression/leads.yaml
- content/missions/mission_site_archetypes.yaml
- tests/helpers/game.ts
- tests/mechanics/missions.test.ts
- tests/mechanics/leads-investigations.test.ts

## ENDING: Panic and Endings

- src/engine/mechanics/endings/
- src/engine/turn/advance.ts
- src/engine/actions/actions.ts
- tests/mechanics/endings.test.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/helpers/game.ts
- src/engine/state/invariants.ts
- src/engine/views/views.ts
- src/engine/player-api.ts

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
- src/engine/state/create.ts
- src/engine/state/invariants.ts
- src/engine/views/views.ts
- src/engine/player-api.ts
- src/engine/mechanics/compendium/compendium.ts

## FEEDBACK: Implementation Feedback

- feedback/implementation-decisions.md
- feedback/specification-problems.md
- scripts/check-records.ts

## GDR: Game Data Records

- src/gdr/
- scripts/build-gdr.ts
- content/
- tests/helpers/game.ts
- tests/mechanics/factions.test.ts
- tests/mechanics/compendium.test.ts

## GDRS: GDRs

- content/
- scripts/build-gdr.ts
- src/gdr/generated/
- tests/foundation/final-review.test.ts
- tests/mechanics/compendium.test.ts

## GHPAGES: GitHub Pages Deployment

- .github/workflows/deploy-pages.yml
- vite.config.ts
- .github/workflows/daily-check.yml
- package.json
- README.md
- tests/engine/campaign.test.ts

## GLOBE: Globe Integration

- public/globe/
- src/web/globe/
- src/web/screens/Globe.tsx
- package.json
- vite.config.ts
- e2e/web.spec.ts

## GLOSS: Glossary Conventions

No files.

## GUI: Graphical User Interface

- src/web/
- index.html
- tests/web/
- e2e/web.spec.ts
- src/web/view-trail.ts
- src/web/place.tsx
- src/web/enemy-labels.ts
- tests/web/enemy-labels.test.ts
- src/web/memorial.ts
- tests/web/memorial.test.ts
- src/web/changed-settings.ts
- tests/web/changed-settings.test.ts
- src/web/enemy-groups.ts
- tests/web/enemy-groups.test.ts

## HEADLESS: Headless First

- src/cli/
- tests/cli/
- e2e/web.spec.ts

## HVIEW: History View

- src/web/screens/HistoryView.tsx
- src/web/history-actions.ts
- tests/web/history-actions.test.ts
- src/web/styles.css
- src/web/history-rows.ts
- tests/web/history-rows.test.ts
- src/web/screens/Campaign.tsx
- e2e/web.spec.ts

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
- src/web/format.ts
- src/web/progress-bar.ts
- src/web/turn-summary.ts
- tests/mechanics/leads-investigations.test.ts
- tests/mechanics/turn-advancement.test.ts
- tests/web/progress-bar.test.ts
- tests/web/situation-and-summary.test.ts
- tests/engine/campaign.test.ts
- src/engine/session/core.ts

## LEAD: Leads and Progression

- tests/mechanics/contracting-cap.test.ts
- src/engine/mechanics/leads/
- src/engine/mechanics/conditions/
- src/engine/state/create.ts
- src/engine/actions/actions.ts
- src/engine/saves/encoding.ts
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
- src/ai/basic/basic-autopilot-ai.ts
- tests/helpers/game.ts
- tests/foundation/final-review.test.ts
- tests/mechanics/initiative-operation-level.test.ts
- src/cli/cli.ts
- tests/mechanics/initiative-won-with-enemy.test.ts

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
- e2e/web.spec.ts
- src/web/agents-to-add.ts
- tests/web/agents-to-add.test.ts
- src/web/condition.tsx
- src/web/table-sort.ts
- src/web/lead-completion.ts
- tests/web/lead-completion.test.ts

## MENU: Main Menu

- src/web/screens/MusicControl.tsx
- src/web/screens/SettingsPanel.tsx
- src/web/screens/MainMenu.tsx
- src/web/styles.css
- e2e/web.spec.ts
- src/web/store.ts
- src/web/ui.tsx
- tests/web/leave-campaign.test.ts
- src/web/save-rows.ts
- tests/web/save-rows.test.ts

## MISSION: Missions

- src/engine/mechanics/missions/
- src/engine/mechanics/conditions/
- tests/mechanics/leads-investigations.test.ts
- tests/mechanics/combat-side-order.test.ts
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
- tests/mechanics/incapacitation-agreement.test.ts
- src/engine/mechanics/combat/combat.ts
- tests/web/situation-and-summary.test.ts
- tests/mechanics/combat-strength-values.test.ts
- src/engine/state/summary.ts
- tests/mechanics/initiative-won-with-enemy.test.ts

## MUSIC: Music

- assets/music/tracks/
- content/music/music_parameters.yaml
- src/gdr/catalog.ts
- src/gdr/types.ts
- src/engine/index.ts
- src/engine/mechanics/compendium/compendium.ts
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
- src/web/combat-share.ts
- tests/web/combat-share.test.ts
- src/web/place.tsx
- src/web/deploy-table.ts
- src/web/mission-outcome.ts
- tests/web/mission-outcome.test.ts
- tests/web/deploy-table.test.ts
- src/web/table-sort.ts
- src/web/tired-deployment.ts
- src/web/artwork.ts
- src/web/screens/DetailView.tsx
- assets/images/
- src/web/styles.css
- src/engine/views/views.ts
- src/engine/player-api.ts
- src/web/enemy-groups.ts
- tests/web/enemy-groups.test.ts

## NUMBERS: Numbers

- tests/mechanics/whole-number-arithmetic.test.ts
- src/kernel/rational.ts
- src/kernel/values.ts
- src/kernel/errors.ts
- src/engine/state/invariants.ts
- src/gdr/catalog.ts
- tests/kernel/numbers.test.ts
- src/engine/mechanics/agents/agents.ts
- src/engine/mechanics/combat/combat.ts
- src/engine/mechanics/economy/economy.ts
- src/engine/mechanics/recovery/recovery.ts
- src/engine/saves/encoding.ts
- src/web/format.ts
- tests/mechanics/decimal-quantities.test.ts

## OVW: Overview Conventions

No files.

## PAPI: Player API

- src/ai/world-state-changes.ts
- tests/foundation/action-results.test.ts
- src/engine/player-api.ts
- src/engine/index.ts
- src/engine/session/core.ts
- src/engine/views/views.ts
- src/engine/actions/actions.ts
- tests/engine/campaign.test.ts
- tests/foundation/autopilot.test.ts
- tests/foundation/action-preview.test.ts
- src/engine/game-rules.ts
- src/web/screens/AgentsView.tsx

## PLACE: Implementation Placement

- content/SOURCE.md
- assets/music/tracks/
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
- src/engine/views/views.ts
- tests/mechanics/missions.test.ts

## REL: Artifact Relationships

No files.

## REUSE: Rule Reuse

- src/engine/mechanics/combat/combat.ts
- src/engine/turn/advance.ts
- src/engine/mechanics/combat/detached-combat.ts
- tests/mechanics/detached-combat.test.ts
- src/engine/actions/actions.ts
- tests/mechanics/incapacitation-agreement.test.ts

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
- src/engine/saves/encoding.ts
- tests/foundation/autopilot-autosaves.test.ts

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
- src/web/condition.tsx
- e2e/web.spec.ts
- src/web/screens/Campaign.tsx

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
- src/web/row-selection.ts
- src/web/place.tsx
- src/engine/session/global-configuration.ts
- tests/web/sounds.test.ts
- e2e/web.spec.ts
- src/web/screens/HistoryView.tsx

## STACK: Tech Stack Suggestion

No files.

## TERM: Terminology Conventions

No files.

## TESTVAL: Test Values

- tests/
- e2e/

## TFOCUS: Test Focus

- tests/
- e2e/
- playwright.config.ts

## TIMELINE: Timeline

- tests/foundation/timeline-lineage.test.ts
- src/engine/session/core.ts
- src/engine/timeline/
- tests/foundation/timeline.test.ts
- tests/foundation/final-review.test.ts
- src/engine/saves/
- src/web/screens/MainMenu.tsx
- tests/foundation/autopilot-autosaves.test.ts

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
- src/web/combat-log.ts
- tests/web/combat-log.test.ts
- src/web/place.tsx
- src/web/styles.css
- src/web/enemy-labels.ts
- src/web/consequences.tsx
- tests/web/compendium.test.ts

## TSUM: Turn Summary

- src/web/screens/TurnSummary.tsx
- src/web/turn-summary.ts
- src/web/styles.css
- tests/web/situation-and-summary.test.ts
- src/web/screens/Campaign.tsx
- src/web/screens/TurnReportView.tsx
- src/web/consequences.tsx
- src/web/view-trail.ts
- tests/web/view-trail.test.ts

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
- src/engine/views/views.ts
- src/engine/player-api.ts
- tests/mechanics/economy.test.ts

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
- src/web/cap-bar.ts
- tests/web/cap-bar.test.ts
- src/web/combat-log.ts
- tests/web/combat-log.test.ts
- src/web/consequences.tsx
- src/web/format.ts
- tests/web/consequences.test.ts
- tests/web/compendium.test.ts
- src/web/undo-redo.ts
- tests/web/undo-redo.test.ts
- src/web/agency-charts.ts
- src/web/screens/SeriesChart.tsx
- src/web/chart-range.ts
- src/web/screens/LastTurnsCheckbox.tsx
- tests/web/chart-range.test.ts

## WHIST: History and Turn Report

- src/engine/index.ts
- src/engine/state/types.ts
- src/engine/state/summary.ts
- src/engine/turn/advance.ts
- src/engine/views/views.ts
- tests/engine/campaign.test.ts
- tests/foundation/timeline.test.ts
- tests/mechanics/turn-advancement.test.ts
- src/web/turn-summary.ts
- src/engine/game-rules.ts
- src/engine/state/create.ts
- tests/foundation/action-record.test.ts
- src/engine/player-api.ts
- src/web/store.ts
- src/cli/cli.ts
- tests/cli/cli.test.ts
- tests/foundation/history-chart-values.test.ts
- tests/mechanics/combat-strength-values.test.ts
