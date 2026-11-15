# Implementation decisions

## DEC-001: Implementation name

- **Category:** Asked by the specifications
- **Affected specifications:** PLACE, Implementation directory: "Which name an Implementation uses within these
  constraints is the Implementer's choice."
- **Description:** The Implementation directory is named `game-v5-impl-web`.
- **Options considered:** `game-v5-impl-web`; `game-v5-impl-ts`; `game-v5-impl-1`.
- **Option chosen:** `game-v5-impl-web`.
- **Why:** It follows the recommended `game-v5-impl-` prefix, matches no other directory in the parent directory, and
  names the platform. The project owner confirmed the name.
- **Links:** None.

## DEC-002: Tech Stack Suggestion not read; own technology stack

- **Category:** Treatment of guidance
- **Affected specifications:** Tech Stack Suggestion (Implementation family, Guidance), whole document. Its Spec ID
  and its wording are not given because the document was not read; About the Implementation family, Tech Stack Suggestion,
  describes it: "It suggests a technology stack for an implementation that uses a browser as its GUI."
- **Description:** Used a different approach. On the project owner's instruction the implementer did not read Tech
  Stack Suggestion, so the stack was chosen independently: strict TypeScript 6.0.3 on Node 26.13.1; one npm package
  with layered source folders; Immer for immutable Campaign state; hand-written exact rationals on `bigint` and a
  hand-written seeded generator; the `yaml` parser at build time and Zod for GDR validation; React 19 with Vite 8 and
  TanStack Table 8 for the web UI, with hand-written CSS and SVG charts; IndexedDB in the browser and JSON files for
  the CLI behind one storage interface; Vitest, fast-check, and Playwright for tests; typescript-eslint and Prettier.
  TypeScript 6.0.3 is used instead of the latest release 7.0.2 because typescript-eslint 8.72.2 supports TypeScript
  below 6.1 only, and TanStack Table 8.21.3 instead of 9 because its API is the one the implementer knows.
- **Options considered:** Read and follow Tech Stack Suggestion; choose an independent stack.
- **Option chosen:** An independent stack.
- **Why:** The project owner instructed the implementer never to read Tech Stack Suggestion, so that the stack is an
  independent choice.
- **Links:** None.

## DEC-003: Gameplay Dependency Direction followed

- **Category:** Treatment of guidance
- **Affected specifications:** DEPDIR, Dependency direction: "Gameplay functions should receive only the inputs and
  dependencies they need"; "User interface code ... depends on game behavior only through the engine API".
- **Description:** Used as is. Mechanics functions under `src/engine/mechanics/` receive the values, GDRs, and random
  source they need and never the whole Campaign state; only the Turn advancement steps and the action pipeline hold
  Campaign state and pass parts of it down. Campaign instances hold no reference to Campaign state. The CLI and the
  web UI import only the public engine API, and the Basic Autopilot AI imports only the Player API and Autopilot
  memory API types; a lint rule and `tests/architecture.test.ts` enforce both.
- **Options considered:** Follow the guidance; pass Campaign state to every function.
- **Option chosen:** Follow the guidance.
- **Why:** Narrow inputs make it easy to check that game behavior consults nothing outside Campaign state.
- **Links:** None.

## DEC-004: Stored quantities are safe integers

- **Category:** Gap resolution
- **Affected specifications:** NUMBERS, Exact evaluation: "a stored quantity and an intermediate result that exceed
  what its machine representation holds must be handled with a wider exact representation."
- **Description:** Every stored quantity is a JavaScript number holding a whole number from -(2^53 - 1) to 2^53 - 1.
  Every formula is evaluated on exact `bigint` rationals of unlimited size and rounded only where the formula names a
  rounding, so no intermediate result is limited. A result that is to be stored and lies outside that range is
  reported as an engine defect, never wrapped, saturated, or approximated, and a cheat operation whose input would
  take a stored quantity outside the range is rejected. Every commit checks that Campaign state holds no number that
  is not a safe whole number.
- **Options considered:** Store every quantity as `bigint`; store quantities as safe integers and report overflow as
  a defect.
- **Option chosen:** Safe integers with an overflow defect.
- **Why:** No quantity of the Bootstrap GDRs can approach 2^53 in a playable Campaign, plain numbers serialize to
  JSON and display without conversion, and an overflow is reported rather than silently changing an outcome.
- **Links:** PROB-001

## DEC-005: Random outcomes from a counter-based generator

- **Category:** Asked by the specifications
- **Affected specifications:** DETERM, Scope of the guarantee: "how random outcomes are derived from the Campaign
  seed, the order of random draws ... are the Implementer's choice". DETERM, Campaign seed: "Which one it chooses is
  the Implementer's choice".
- **Description:** The Campaign seed text is hashed into a 128-bit key. Campaign state holds that key and a counter
  of values drawn. Each 32-bit value is a mixing function of the key and the counter, written with 32-bit integer
  operations only. A uniform whole-number outcome and a Probability `n / d` use rejection sampling over whole
  numbers, so each is exact. Random draws happen in the order the code decides them. A Campaign seed the engine
  chooses is 10 characters from letters and digits, drawn from the random source the adapter supplies.
- **Options considered:** A library generator; a hand-written stateful generator; a hand-written counter-based
  generator.
- **Option chosen:** A hand-written counter-based generator.
- **Why:** Its state is a few stored whole numbers, a key derived from the Campaign seed and a counter, it is identical on every machine, and it needs no dependency.
- **Links:** None.

## DEC-006: Identifier formats

- **Category:** Asked by the specifications
- **Affected specifications:** DETERM, Unique identifiers: "The format of every identifier is the Implementer's
  choice."
- **Description:** An Instance ID is the Campaign instance Type in lowercase, a hyphen, and a number, e.g.
  `agent-7`. All seven Campaign instance Types take their numbers from one counter in Campaign state, so Instance IDs
  are unique across the Types. Campaign IDs, Campaign save IDs, and Autopilot engagement IDs are Independent
  identifiers that the adapter's identifier source supplies, e.g. a random UUID. A Campaign seed the engine chooses
  has 10 characters taken from the letters and digits without the look-alikes `I`, `O`, `l`, `0`, and `1`, picked
  by whole numbers that the adapter's random source supplies.
- **Options considered:** One counter for each Type; one shared counter; random identifiers.
- **Option chosen:** One shared counter for Instance IDs; adapter-supplied identifiers for Independent identifiers.
- **Why:** A shared counter makes uniqueness across Types hold by construction and is reproduced by replay.
- **Links:** None.

## DEC-007: The web UI is the implementer's own design

- **Category:** Treatment of guidance
- **Affected specifications:** The UI family (non-behavioural guidance), all documents. Their wording is not quoted
  because the documents were not read.
- **Description:** Used a different approach. On the project owner's instruction the implementer did not read any UI
  family document. The web UI is the implementer's own design, described in the README, and the Implementation makes
  no claim to conform to the UI family. It follows ENG, API hierarchy and Information boundary: it is an adapter over
  the engine API and shows nothing Player API does not return.
- **Options considered:** Read and follow the UI family; design the UI independently.
- **Option chosen:** An independent design.
- **Why:** The project owner instructed the implementer never to read the UI family.
- **Links:** None.

## DEC-008: Storage Schema followed for the Timeline and Campaign saves

- **Category:** Treatment of guidance
- **Affected specifications:** SCHEMA, Suggested approach: "In memory, share what did not change"; "In a Campaign
  save, store the Turn-start state and the Timeline entries"; "Store Autopilot memory beside the Timeline entries".
- **Description:** Used as is, for everything the document suggests. In memory each Committed state of the current
  Turn is an immutable value produced by Immer that shares its unchanged parts with the one before it. A Campaign
  save holds the Turn-start state, the ordered Timeline entries, the number of Undone actions, and the Autopilot
  memory written at each Committed state; loading rebuilds the other Committed states by replay. Game storage holds no
  copy of a GDR. The Current Autosave is rewritten whole after every change, with the encoded Turn-start state reused
  between writes, and Autosaves share no stored data with each other. DEC-023 states the physical layout, which the
  document leaves as a TODO.
- **Options considered:** Full copies; patches; replay with shared in-memory states.
- **Option chosen:** Replay with shared in-memory states, as suggested.
- **Why:** It is compact, needs no reverse changes, and relies only on guarantees the specifications already give.
- **Links:** None.

## DEC-009: Engine API signatures, results, and errors

- **Category:** Asked by the specifications
- **Affected specifications:** ENG, API hierarchy: "exact signatures, argument Types, and results are the
  implementer's choice". ENG, Committed state integrity: "Exact error representations and asynchronous operation
  results are the implementer's choice."
- **Description:** Every operation returns a result object that is either a success with a value or a failure with one
  error code, a message holding only Player-visible information, and, for a rejected gameplay action, a stable reason
  identifier. Nothing is thrown to the caller; an engine defect is returned as the error code `engine_defect` and
  commits nothing. Queries and the operations that touch only Session state are synchronous. Every operation that
  can write to Game storage returns a Promise, and a successful result lists the Autosaves that could not be written.
  An action with no effect returns success with `committed: false` and is not a Player action.
  `setPresetEdit(preset, value)` takes the value as a pair of the Campaign configuration value's key and its new
  value, and `removePresetEdit(preset, value)` takes the key. One operation is added to `session.autopilot`:
  `whenDisengaged(engagementId)`, which resolves with the disengagement result.
- **Options considered:** Throwing exceptions; result objects.
- **Option chosen:** Result objects.
- **Why:** A caller, e.g. an LLM player through the CLI, can handle every failure as data, and a rejection cannot be
  mistaken for a defect.
- **Links:** None.

## DEC-010: Campaign save encoding, Autosave identifiers, and the order of Committed states

- **Category:** Asked by the specifications
- **Affected specifications:** SAVES, Campaign save contents: "How a Campaign save is encoded and stored is the
  Implementer's choice." TIMELINE, Autosave navigation: "A Committed state is later than another Committed state of
  the same Campaign when one or more Player actions lead from the other to it".
- **Description:** A Campaign save is one JSON text with a format number and the Game build identifier. The Game
  build identifier is the package version joined with a hash of the GDRs; a Campaign save whose identifier differs is
  rejected as Incompatible Game build. Each Committed state reached by a Player action receives a stamp, an
  Independent identifier, and a Campaign save holds the stamps of every Committed state from campaign creation to the
  saved one. Committed state A is earlier than B exactly when the stamp of A is among the stamps leading to B. Stamps
  are kept beside the Timeline and are not Campaign state. The Current, Engagement, and Return Autosaves of a
  Campaign each have one fixed Campaign save ID derived from the Campaign ID, and a Turn-end Autosave has one derived
  from the Campaign ID and its Turn, so writing one replaces the earlier one.
- **Options considered:** Comparing Turn numbers and action counts; a hash chain of actions; a stamp for each
  Committed state.
- **Option chosen:** A stamp for each Committed state.
- **Why:** It distinguishes lines of play exactly, including after a Campaign save of another line of play is loaded,
  and costs a few bytes for each Player action.
- **Links:** None.

## DEC-011: Global configuration settings of this Game build

- **Category:** Gap resolution
- **Affected specifications:** CONFIG, Global configuration: "Interface preferences belong to Global configuration,
  e.g. volume, language, and tutorial popups. So does a setting that governs the engine without being consulted by
  game behavior, e.g. the Autosave limit".
- **Description:** This Game build has exactly two Global configuration settings: the Autosave limit, a whole number
  of at least 0 with the Game build default 5, and the interface theme, `dark` or `light` with the Game build default
  `dark`. The game has no sound and one language, so it offers no volume or language setting.
- **Options considered:** Only the Autosave limit; the Autosave limit and the settings the interfaces need.
- **Option chosen:** The Autosave limit and the theme.
- **Why:** These are the settings this Implementation reads; a setting nothing reads would mislead the player.
- **Links:** PROB-002

## DEC-012: Execution budget of an Autopilot AI

- **Category:** Gap resolution
- **Affected specifications:** AUTO, Autopilot lifecycle and concurrency: "Autopilot disengages as AI failed when the
  Autopilot AI reports an error, produces no valid action, or exhausts its configured finite execution budget."
- **Description:** The engine runs an Autopilot AI in steps. A step that ends without committing a Player action
  disengages Autopilot as AI failed, and so does a step that reports an error. A step that makes more than 100,000
  calls of Player API and Autopilot memory API disengages Autopilot as AI failed at that call, and every later call
  of that step fails with `engagement_ended`. Player actions committed before the failure remain.
- **Options considered:** A wall-clock limit; a limit on engine calls and on steps without progress.
- **Option chosen:** A limit on engine calls and on steps without progress.
- **Why:** It is independent of the machine, so the same Autopilot AI fails at the same point everywhere.
- **Links:** PROB-003

## DEC-013: No operation changes Campaign configuration during play

- **Category:** Gap resolution
- **Affected specifications:** CONFIG, Changing Campaign configuration during play: "An accepted change is committed
  atomically as one Timeline entry". CONFIG, TODOs: "Only two Campaign configuration values exist so far ... both
  fixed after Campaign creation, so neither is adjustable during play."
- **Description:** The engine API offers no operation that changes Campaign configuration during play, because no
  Campaign configuration value is adjustable during play. `getPreset` reports each value as fixed after creation.
- **Options considered:** An operation that always rejects; no operation.
- **Option chosen:** No operation.
- **Why:** An operation that can never succeed adds nothing a caller can use, and its signature is itself a TODO.
- **Links:** PROB-004

## DEC-014: GDR identifiers and YAML property naming

- **Category:** Gap resolution
- **Affected specifications:** GDR, GDR authoring format: "each states an identifier, a Type, and the values of that
  Type's properties."
- **Description:** A GDR states its identifier as `id` and its Type as `type`, and property names are lowercase
  words joined by underscores, as the Bootstrap GDR files are authored. A GDR identifier is a lowercase letter
  followed by lowercase letters, digits, and underscores, and it is unique among the GDRs of its Type. A reference
  names the Type it expects, so two GDRs of different Types may share an identifier. A file holds GDRs of one Type.
- **Options considered:** Identifiers unique in the whole Game build; identifiers unique within a Type.
- **Option chosen:** Unique within a Type.
- **Why:** Every reference in the specifications states the Type of its target, so this is the weakest rule that
  makes every reference resolve, and it accepts the Bootstrap GDR files unchanged.
- **Links:** PROB-005

## DEC-015: Queries for retained Campaign instances, Turn series, and GDR properties

- **Category:** Gap resolution
- **Affected specifications:** ENG, Current state, Turn report, and history: "Player API returns what is true now
  and what happened earlier through three queries."
- **Description:** `getCurrentState()` returns the Campaign instances that participate in current gameplay: the
  Agency, Serving Agents, Factions, Active Investigations, Leads with Lead progression, Mission sites that are Active
  or whose Mission is Deployed, and Deployed Missions. `getHistory()` returns the rest of World history that is
  Player-visible: the History entries, both Turn series of money in full, and the retained Campaign instances, i.e.
  Killed and Dismissed Agents, Completed and Abandoned Investigations, the other Mission sites with their Enemies,
  and Won and Lost Missions. Two queries are added to `player.queries`: `getGameData()` returns the Player-visible
  properties of the GDRs, and `previewDeployment(missionSite, agents)` returns the Combat rating of a team and of a
  Mission site's Enemies and whether `deployAgents` would be accepted, so that no interface or Autopilot AI computes
  a Combat rating itself.
- **Options considered:** Returning retained Campaign instances from `getCurrentState()`; a fourth query for them;
  returning them from `getHistory()`.
- **Option chosen:** Returning them from `getHistory()`, with two added queries for GDR properties and previews.
- **Why:** It keeps the stated rule that `getCurrentState()` returns nothing retained only in World history, and
  every Player-visible value has exactly one query that returns it.
- **Links:** PROB-006

## DEC-016: Contents of the Turn report and of a History entry

- **Category:** Gap resolution
- **Affected specifications:** CSTATE, Turn report and history: "What the Turn report and each History entry hold of
  a value is stated by the specification owning that value."
- **Description:** The Turn report holds, for the Advance turn that ended Turn t: the Agents that arrived; the
  income and upkeep with the money after each; each skill gained by Training; for each Active Investigation its
  progress gain, its progress, whether it completed, and the Mission site it created; for each resolved Mission its
  result, its Killed Agents, its survivors by destination, its consequence, and the Lead whose win it recorded,
  together with its complete Combat report; the Cancelled and the Expired Mission sites with their consequences; for
  each Faction that escalated or operated, its new Faction activity level and the Response Mission site it created;
  each Agent's recovery; Panic, funding, and money before and after; and the Campaign ending, if one was recorded.
  It holds no hidden value: no Faction countdown, no Probability of a past Investigation completion outcome, and not
  the Pending panic change as such. A History entry holds the Turn number, a reduced form of the Turn-start state
  and of the Turn-end state, i.e. money, funding, Panic, and the numbers of Serving Agents, Active Investigations,
  and Active Mission sites, and a reduced form of the Turn report: income, upkeep, each Mission with its result, its
  Combat outcome and number of Combat rounds, and which Agents were Killed, wounded, or unharmed, the Investigations
  completed, the Mission sites created, Expired, and Cancelled, the Factions that escalated, Panic, money, and
  funding afterwards, and the Campaign ending.
- **Options considered:** A History entry that repeats the whole Turn report; a reduced History entry.
- **Option chosen:** A reduced History entry without the Combat log.
- **Why:** The Combat log is the large part of a Turn report, and CSTATE requires a History entry to bound what is
  retained.
- **Links:** PROB-007

## DEC-017: An Attempted Mission site stays current while its Mission is Deployed

- **Category:** Conflict resolution
- **Affected specifications:** MISSION, Mission site properties: "A Mission site in a final state no longer
  participates in current gameplay and is retained in World history".
- **Description:** A Mission site participates in current gameplay while it is Active and while it is Attempted and
  its Mission is Deployed, together with its Enemies. It is retained in World history once it is Expired or
  Cancelled, or once its Mission is Won or Lost. `getCurrentState()` and `getHistory()` divide Mission sites and
  their Enemies accordingly.
- **Options considered:** Treating every Attempted Mission site as retained; treating it as current while its
  Mission is Deployed.
- **Option chosen:** Current while its Mission is Deployed.
- **Why:** Its Enemies fight in the next Advance turn, and the player needs to see what the team is deployed
  against.
- **Links:** PROB-008

## DEC-018: Random outcome names, draw order, and creation order

- **Category:** Asked by the specifications
- **Affected specifications:** DETERM, Scope of the guarantee: "the order of random draws, the order in which
  Campaign instances are created within one Player action, and the sequence and format of generated Campaign-scoped
  identifiers" are the Implementer's choice. TURN, Values a step uses: "The order in which an implementation
  processes the Campaign instances within one step is the Implementer's choice".
- **Description:** Each named random outcome has a name in code: `combat.hit.<Combatant>` and
  `combat.damage.<Combatant>` for the next attack of a Combatant, `investigation.completion.<Investigation>`,
  `faction.<Faction>.levelDuration`, `faction.<Faction>.operationInterval`, `faction.<Faction>.operationLevel`, and
  `mission.archetypeSelection.<Faction>`. Random values are drawn in the order the code decides the outcomes. Within
  a Turn advancement step, Campaign instances are processed in the order they were created, and the Mission sites a
  step creates are created after the step has processed every Campaign instance, in that same order, so that the
  generated Instance IDs do not depend on the processing order. A weighted choice and the uniform MissionSiteArchetype
  selection draw one whole number below the sum of the weights.
- **Options considered:** Drawing all outcomes of a step in advance; drawing each when it is decided.
- **Option chosen:** Drawing each when it is decided, with creations ordered canonically.
- **Why:** It is the simplest order, and tests can fix any named outcome and shuffle the processing order.
- **Links:** None.

## DEC-019: Full Campaign state inspection

- **Category:** Gap resolution
- **Affected specifications:** DEV, Inspection contract: "Full Campaign state inspection presents each Campaign
  instance as its four properties, Instance ID, Archetype reference, Constants, and State".
- **Description:** `developer.queries.getCampaignState()` returns a detached copy of Campaign state in its conceptual
  hierarchy: `campaignConfiguration` and `worldState`, the latter divided into `currentWorldState` and
  `worldHistory`. Current world state holds the Campaign seed, the generator state, the pending random outcome
  overrides, the turn number, Panic and the Campaign ending values, Lead progression, and the Campaign instances that
  participate in current gameplay. World history holds the Turn report, the History entries, the Turn series, and the
  retained Campaign instances. Every Campaign instance is an object with exactly `id`, `archetype`, `constants`, and
  `state`. With Dev mode disabled the query and every cheat operation fail with the error code `dev_mode_disabled`,
  during an Autopilot engagement with `autopilot_active`, without a Current campaign with `no_current_campaign`, and
  for an Autopilot AI with `unauthorized`. Disabling Dev mode revokes access at once, because every call checks it.
- **Options considered:** Returning the stored layout; returning the conceptual hierarchy.
- **Option chosen:** The conceptual hierarchy.
- **Why:** It shows a reader the composition that CSTATE states, whatever the storage layout is.
- **Links:** PROB-009

## DEC-020: Random outcome overrides

- **Category:** Gap resolution
- **Affected specifications:** DEV, Random outcome overrides: "the Session controller names a random outcome and one
  of its possible values, and when that random outcome is next decided it takes the supplied value".
- **Description:** The cheat operation `developer.actions.overrideRandomOutcome(outcome, value)` takes the name of a
  random outcome under DEC-018 and a value: true or false for a hit or an Investigation completion outcome, a whole
  number for a damage, Level duration, Operation interval, or Operation level outcome, and a MissionSiteArchetype
  identifier for a MissionSiteArchetype selection outcome. It is rejected when the name matches no random outcome,
  when the Campaign instance it names does not exist, or when the value is of the wrong kind. An accepted override
  is a pending override in Current world state, visible through inspection, and one Timeline entry. It applies once:
  the next time that outcome is decided it takes the value and the override is removed, without drawing from the
  generator. Whether the value is one of the possible values is known only when the outcome is decided, e.g. the
  range of a damage outcome; a value that is not possible then is discarded and the outcome is drawn as usual. A
  second override of the same outcome replaces the first. An override whose outcome is never decided stays pending.
- **Options considered:** Overrides that apply until cleared; overrides that apply once.
- **Option chosen:** Overrides that apply once.
- **Why:** It matches "when that random outcome is next decided" and keeps replay exact, because the pending
  overrides are Campaign state.
- **Links:** PROB-009

## DEC-021: Thresholds and procedure of the Basic Autopilot AI

- **Category:** Asked by the specifications
- **Affected specifications:** BASICAI, Goals: "The exact thresholds of the goals, e.g. how large a safety margin is,
  are the Implementer's choice".
- **Description:** A Rested Agent has exhaustion of at most 5, and of at most 25 for urgent income. The Agent
  reserve is 20% of the roster, rounded down. The Expected income target is 120% of projected upkeep. The Savings
  floor is five turns of half the projected upkeep. A team needs a Combat rating above 120% of the Enemies' Combat
  rating and one Agent for every three Enemies. Agents investigating Leads number 1 plus 1 for every 10 Agents. The
  target roster is 8 plus 4 for each Upgrade bought whose effect improves Agents, not for the cap Upgrades. The
  Transport cap and the Training cap are each kept at 50% of the roster. The Basic Autopilot AI decides one Player
  action at a time: after every Player action it reads the current state and starts its Turn routine again, so that
  it plays the same whatever its Autopilot limit is. A team is formed in the order of preference BASICAI states and,
  when that order gives no winning team, with the most capable Rested Agents first. Among equally good choices it
  takes the first in the order of the roster, of the Mission sites, or of the Leads. Among Agents of equal preference the one with the higher effective skill comes first, then the order of
  the roster. The Expected income target and the Savings floor are rounded up. It buys nothing while Expected income
  is below projected upkeep, it hires before it buys Agent cap, and the Upgrade it counts as improving Agents is the
  one with the effect `agent_weapon_damage`. A Player action that was rejected is not tried again in that Turn. With
  these thresholds it won
  200 of 200 Campaigns of different Campaign seeds, in a median of 91 Turns.
- **Options considered:** The game-ts starting values unchanged; values tuned against whole Campaigns.
- **Option chosen:** Tuned values.
- **Why:** With a roster target that counts every Upgrade, each Agent cap purchase called for the next and the
  roster grew without bound, and with a Transport cap of 25% of the roster no team could win `raid_hq`.
- **Links:** None.

## DEC-022: Properties and name of a Campaign configuration preset

- **Category:** Gap resolution
- **Affected specifications:** ECON, Campaign configuration values: "Each Campaign configuration preset supplies
  both, as the properties named below."
- **Description:** A GDR of Type CampaignConfiguration has exactly `starting_money` and `starting_funding` apart from
  `id` and `type`; any other property makes the Game build defective. `listPresets()` reports the identifier of a
  preset as its name.
- **Options considered:** Accepting unknown properties; exact properties.
- **Option chosen:** Exact properties.
- **Why:** Every other GDR Type is validated for exact properties, and a preset supplies a value for every Campaign
  configuration value and nothing else.
- **Links:** PROB-010

## DEC-023: Physical layout of Game storage in files and in the browser

- **Category:** Gap resolution
- **Affected specifications:** SCHEMA, TODOs: "Describe one physical layout covering every part of Game storage".
- **Description:** Game storage is one Global configuration record and one record for each Campaign save, made of a
  small header (Campaign save ID, Campaign ID, kind, Turn, Game build, and the stamp of DEC-010) and a JSON text
  body; an Autosave is an ordinary Campaign save record whose kind names the Autosave. The engine
  reads and writes Game storage through one interface with six operations: read and write the Global configuration
  text, list the Campaign save headers, and read, write, and delete one Campaign save. Two layouts implement it. The
  terminal CLI keeps a data directory, `.data` unless `--data` names another: `global-configuration.json`, and in
  `saves/` two files for each Campaign save, `<Campaign save ID>.header.json` and `<Campaign save ID>.body.json`, with the
  Campaign save ID encoded for a file name; the body is written first, and each file is written to a temporary file
  and renamed, so that a failed write leaves the earlier file whole. The web UI keeps one IndexedDB database named `game-v5-impl-web` with three object stores:
  `configuration` with the Global configuration text under the key `global`, and `headers` and `bodies` keyed by
  Campaign save ID, written in one transaction. Tests use a third, in-memory layout. Beside Game storage the web UI
  keeps the Campaign ID of the Current campaign in the browser's session storage, and after a reload it loads that
  Campaign's Current Autosave through `session.saves.load`; this is a convenience of the interface, not a part of
  Game storage, and without it a Session starts at the Main menu.
- **Options considered:** One file or record for each Campaign save; a header and a body for each.
- **Option chosen:** A header and a body for each.
- **Why:** Listing the Campaign saves and choosing an Autosave to navigate to read only the small headers, never a
  body.
- **Links:** PROB-014

## DEC-024: The Agent reserve may be deployed to a Mission site

- **Category:** Conflict resolution
- **Affected specifications:** BASICAI, Glossary: "so that it can still react to an urgent Mission site". BASICAI,
  Goals, Keep Agents fit: "the Agent reserve stays untouched, except for urgent income".
- **Description:** The Basic Autopilot AI forms a team for a Mission site, and judges whether a Lead's Mission site
  is winnable, from every Rested Agent, including those of the Agent reserve. The Agent reserve is kept away from
  Training, Contracting, and Investigations only, and it goes to Contracting for urgent income.
- **Options considered:** Keeping the Agent reserve out of every team; letting a team draw on it.
- **Option chosen:** Letting a team draw on it.
- **Why:** The Glossary states what the Agent reserve is for, and a reserve that no Mission site may use would serve
  no purpose.
- **Links:** PROB-011

## DEC-025: A Campaign always has its Current Autosave

- **Category:** Conflict resolution
- **Affected specifications:** LIFE, Campaign selection: "no Campaign save, so the Session has no Current save".
  LIFE, Acceptance examples, Closing does not save: "No Campaign save exists afterwards". SAVES, Autosaves: "When a
  Campaign is created or loaded, and whenever what a Campaign save holds changes for the Current campaign".
- **Description:** The engine follows SAVES: it writes the Current Autosave when a Campaign is created and after
  every change, and closing the Campaign leaves it in Game storage. The two statements of LIFE are read as being
  about Campaign saves that are not Autosaves: a new Campaign has no Current save, closing writes no Campaign save,
  and after closing a Campaign that was never saved the list of Campaign saves holds only its Autosaves.
- **Options considered:** Writing no Autosave until the first manual save; following SAVES.
- **Option chosen:** Following SAVES.
- **Why:** SAVES states that the Current Autosave cannot be turned off and exists so that play can resume after the
  Session ends for whatever reason.
- **Links:** PROB-012

## DEC-026: Change notification beside the four namespaces

- **Category:** Gap resolution
- **Affected specifications:** ENG, API hierarchy: "The complete namespace inventory is `session`, `player`,
  `developer`, and `autopilotMemory`."
- **Description:** The engine object that an adapter receives has two members outside the four namespaces:
  `subscribe(listener)`, which calls the listener after anything a query could report has changed and returns a
  function that stops it, and `getRevision()`, a number that changes with every such change. They read and change no
  Campaign state, return no game value, and are not given to an Autopilot AI.
- **Options considered:** An adapter that polls the queries on a timer; a change notification.
- **Option chosen:** A change notification.
- **Why:** During an Autopilot engagement the Committed state changes without a call from the interface, and an
  interface has to show each change.
- **Links:** PROB-013

## DEC-027: The terminal CLI

- **Category:** Asked by the specifications
- **Affected specifications:** ENG, API hierarchy: "Every user interface, e.g. a terminal or browser interface, is an
  adapter over the same API".
- **Description:** Beside the web UI the Implementation has a terminal CLI. It reads one command per line, and each
  command is one engine API operation: the Session commands `status`, `new`, `close`, `presets`, `preset`, `select`,
  `edit`, `unedit`, `saves`, `load`, `save`, `saveas`, `config`, `set`, `reset`; the queries `state`, `agents`,
  `leads`, `investigations`, `sites`, `missions`, `factions`, `upgrades`, `report`, `history`, `retained`, `actions`,
  `gamedata`, `preview`; the Player actions `assign`, `hire`, `dismiss`, `buy`, `investigate`, `join`, `deploy`,
  `next`; the navigation commands `timeline`, `undo`, `redo`, `undoall`, `redoall`, `autosaves`, `back`, `forward`;
  `ais` and `auto` for Autopilot, where `auto` waits for the disengagement; and `dev`, `inspect`, `addmoney`,
  `addagents`, `override` for Developer access. It prints tables for a person, or with `--json` one line of JSON for
  each result, which is the result object of the operation. It shows the Campaign seed only while Dev mode is
  enabled. A line it cannot turn into an operation is answered with the code `invalid_command` and calls nothing.
  The keyboard shortcuts of the web UI are listed in the README.
- **Options considered:** A web UI only; a web UI and a terminal CLI.
- **Option chosen:** Both.
- **Why:** A terminal with JSON results lets a script or an LLM player play a whole Campaign, and comparing it with
  the web UI tests that both are equivalent to the engine API.
- **Links:** None.

## DEC-028: Error codes and results of operations the specifications leave open

- **Category:** Asked by the specifications
- **Affected specifications:** ENG, Committed state integrity: "Exact error representations and asynchronous operation
  results are the implementer's choice."
- **Description:** The error codes are `no_current_campaign`, `unauthorized`, `autopilot_active`,
  `dev_mode_disabled`, `engagement_ended`, `invalid_input`, `rejected`, `campaign_ended`, `no_target`,
  `incompatible_game_build`, `corrupt_campaign_save`, `unreadable_campaign_save`, `save_size_limit_exceeded`,
  `unwritable_campaign_save`, and `engine_defect`. Listing the Campaign saves when Game storage cannot be read fails
  with `unreadable_campaign_save`, and a Global configuration that cannot be written fails with
  `unwritable_campaign_save` and keeps the earlier value. A Campaign save whose body names another Campaign save ID
  than the one asked for is a Corrupt Campaign save. Removing a Preset edit that does not exist succeeds. A Campaign
  seed given as null counts as not supplied. Invalid stored Global configuration values are reported by
  `globalConfiguration.get()` as problems and by nothing else. Disengaging an Autopilot engagement that has ended
  succeeds with its earlier result, and the status of an ended Autopilot engagement stays available for the Session.
  Engaging Autopilot on a Campaign that has ended is accepted and ends at once as Campaign ended with no Player
  action. Autopilot memory must be plain data that JSON can hold. A Probability is reported as a pair of whole
  numbers: as text in the views, because the pair can exceed the safe whole numbers, and as numbers in the Combat
  log, where it cannot. Full Campaign state inspection and `getGameData()` return frozen values. Lowering the
  Autosave limit removes every Turn-end Autosave above the new limit when the next Turn ends.
- **Options considered:** A separate error code for each failure of Game storage; reusing the load and save reasons.
- **Option chosen:** Reusing the load and save reasons.
- **Why:** The reasons already say what an interface has to tell the player: Game storage could not be read or
  written.
- **Links:** None.

## DEC-029: Starting values of the Basic Autopilot AI used with modifications

- **Category:** Treatment of guidance
- **Affected specifications:** BASICAI, Goals: "Appendix: Derivation from game-ts gives proven starting values."
- **Description:** Used with modifications. The thresholds start from the values of the appendix; DEC-021 states the
  values the Implementation uses and why some differ: the target roster counts only the Upgrades that improve Agents,
  and the Transport cap and the Training cap are each kept at 50% of the roster.
- **Options considered:** The suggested values unchanged; values tuned against whole Campaigns.
- **Option chosen:** Tuned values.
- **Why:** With the suggested values the roster grew without bound and no team could win the last Mission site.
- **Links:** None.
