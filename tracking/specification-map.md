# Specification map

## AGENT: Agents

- src/engine/mechanics/agents/
- src/engine/actions/actions.ts
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

## CLI: Command-Line Interface

No files.

## COMBAT: Combat

- src/engine/mechanics/combat/
- src/engine/state/types.ts
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/combat.test.ts
- tests/mechanics/review-gaps.test.ts

## CONFIG: Configuration

- src/engine/session/core.ts
- src/engine/session/global-configuration.ts
- src/engine/rules.ts
- src/engine/game-rules.ts
- src/engine/state/create.ts
- tests/foundation/configuration.test.ts

## CONV: Specification Conventions

No files.

## CORE: Core Concepts

No files.

## CSTATE: Campaign State

- src/engine/state/types.ts
- src/engine/state/create.ts
- src/engine/views/views.ts
- src/engine/rules.ts
- tests/engine/campaign.test.ts

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

## ECON: Economy and Upgrades

- src/engine/mechanics/economy/
- src/engine/actions/actions.ts
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

## GLOSS: Glossary Conventions

No files.

## GUI: Graphical User Interface

No files.

## HEADLESS: Headless First

- src/cli/
- tests/cli/
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
- tests/mechanics/leads-investigations.test.ts

## LEAD: Leads and Progression

- src/engine/mechanics/leads/
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/leads-investigations.test.ts

## LIFE: Campaign Lifecycle

- src/engine/session/core.ts
- src/engine/index.ts
- tests/foundation/lifecycle-and-saves.test.ts

## LOOP: Development Loop

No files.

## MISSION: Missions

- src/engine/mechanics/missions/
- src/engine/actions/actions.ts
- src/engine/turn/advance.ts
- src/engine/views/views.ts
- src/gdr/catalog.ts
- src/gdr/types.ts
- tests/mechanics/missions.test.ts
- tests/mechanics/review-gaps.test.ts

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

## PLACE: Implementation Placement

- content/SOURCE.md
- .node-version
- .gitignore
- package.json
- tests/architecture.test.ts

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
- src/engine/saves/
- src/engine/timeline/campaign-runtime.ts
- src/cli/file-storage.ts
- src/web/indexeddb-storage.ts
- tests/foundation/lifecycle-and-saves.test.ts
- tests/foundation/final-review.test.ts
- tests/cli/cli.test.ts
- tests/web/indexeddb-storage.test.ts
- scripts/measure.ts

## SCHEMA: Storage Schema

- src/engine/saves/
- src/engine/timeline/campaign-runtime.ts
- src/cli/file-storage.ts
- src/web/indexeddb-storage.ts

## STACK: Tech Stack Suggestion

No files.

## TERM: Terminology Conventions

No files.

## TIMELINE: Timeline

- src/engine/session/core.ts
- src/engine/timeline/
- tests/foundation/timeline.test.ts
- tests/foundation/final-review.test.ts

## TODOS: Outstanding Work Items

No files.

## TRACK: Specification Tracking

- tracking/specification-baseline.md
- tracking/specification-map.md
- scripts/check-records.ts

## TURN: Turn Advancement

- src/engine/turn/
- src/engine/game-rules.ts
- tests/mechanics/turn-advancement.test.ts

## UPDATES: Specification Updates

No files.

## WHIST: World History

- src/engine/index.ts
- src/engine/state/types.ts
- src/engine/state/summary.ts
- src/engine/turn/advance.ts
- src/engine/views/views.ts
- tests/engine/campaign.test.ts
- tests/foundation/timeline.test.ts
- tests/mechanics/turn-advancement.test.ts
