# Implementation decisions

## DEC-001: Implementation name

- **Category:** Asked by the specifications
- **Affected specifications:** PLACE, Implementation repo: "Which name an Implementation uses within these
  constraints is the Implementer's choice."
- **Description:** The Implementation repo is named `game-v5-impl-web`.
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
  reported as an engine defect, never wrapped, saturated, or approximated, and a Player cheat action whose input would
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

- **Category:** Conflict resolution
- **Affected specifications:** DETERM, Unique identifiers: "The format of every identifier is the Implementer's
  choice." CINST, Campaign instance identity: "It is the Type's name in lowercase with each space replaced by a hyphen,
  then a hyphen, then a number. Each Campaign instance Type numbers its Campaign instances from 1 in the order they are
  created".
- **Description:** An Instance ID follows CINST: the Type's name in lowercase with each space replaced by a hyphen, a
  hyphen, and that Type's creation count, e.g. `agent-7` or `mission-site-1`. Campaign state holds one counter for
  each Campaign instance Type, so an undone creation frees its number when the Timeline restores the earlier Committed
  state. Campaign IDs, Campaign save IDs, and Autopilot engagement IDs are Independent identifiers that the adapter's
  identifier source supplies, e.g. a random UUID. A Campaign seed the engine chooses has 10 characters taken from the
  letters and digits without the look-alikes `I`, `O`, `l`, `0`, and `1`, picked by whole numbers that the
  adapter's random source supplies.
- **Options considered:** Following DETERM and keeping one shared counter; following CINST for Instance IDs.
- **Option chosen:** Following CINST for Instance IDs, and DETERM for every other identifier.
- **Why:** CINST owns Campaign instance identity and states the format exactly, so DETERM's general freedom can only
  still apply to the identifiers CINST does not cover. Specification revision
  1d687e0d80958e13831a8689e2db9c14ceb66143 settles the conflict the same way: DETERM now leaves only the format of an
  Independent identifier to the Implementer.
- **Links:** PROB-019

## DEC-007: The screens of the web UI

- **Category:** Gap resolution
- **Affected specifications:** MENU, Overview: "The GUI opens at the Main menu, the Session state with no Current
  campaign". MENU, Layout: "The card of the Campaign of the most recent Campaign save has the Accent top edge." CSCR,
  TODOs: "List the other screens the Player needs while a Campaign is current".
- **Description:** The web UI opens at the Main menu, which offers New-Campaign setup, the list of Campaign saves
  grouped by Campaign with Load, Delete, and Delete Campaign buttons, each deletion confirmed first, and the Global
  configuration settings. The card of the Campaign whose Campaign saves reach the latest Turn took the Accent top edge
  in place of the Campaign of the most recent Campaign save, because the list reported no time at which a Campaign
  save was written; Specification revision ef784eef02d431975327f0a09fd25cebb3e52659 overrode that part: the list now reports that time,
  and the card of the Campaign of the most recent Campaign save takes the Accent top edge. The
  Leads panel shows only discovered Leads, each with its Lead status, as a tree whose roots are the Leads that no
  listed Lead leads to, since a Won Response Mission can discover a Lead that no discovered Lead creates the
  MissionSiteArchetype of. While a Campaign is current it showed a status bar with Advance turn, Timeline
  navigation, and saving; the Agents grid; one of five panels, Mission sites, Leads, Agency, Turn report, and History;
  an Autopilot bar; and a Developer drawer. Specification commit e19a220aa261bbcbaecbe0725bedda08f655a2ee overrode the
  Campaign screen part and the Leads tree: CSCR now fixes the status bar, the Side panel with its navigation,
  Situation panel, and Autopilot footer, and the eight Detail views, which the Implementation follows; the status bar
  keeps Advance turn, Timeline navigation, and saving, and the Developer drawer stays. It follows ENG, API hierarchy, and PAPI,
  Information boundary: it is an adapter over the engine API and shows no gameplay information that the engine API
  does not return.
- **Options considered:** One screen per game concept, reached through a menu; one Campaign screen with the Agents
  always visible beside a chosen panel.
- **Option chosen:** One Campaign screen with the Agents always visible.
- **Why:** Most Player actions combine Agents with a Mission site, a Lead, or an Assignment, so the Agents stay in
  view while the Player picks the other part.
- **Links:** PROB-017, PROB-027

## DEC-008: Storage Schema followed for the Timeline and Campaign saves

- **Category:** Treatment of guidance
- **Affected specifications:** SCHEMA, Suggested approach: "In memory, share what did not change"; "In a Campaign
  save, store the Turn-start state and the Player actions". SCHEMA, Replay: "the Campaign configuration changes made
  during the Turn are stored with the Timeline entries they preceded".
- **Description:** Used as is, for everything the document suggests. In memory each World state of the current
  Turn is an immutable value produced by Immer that shares its unchanged parts with the one before it. A Campaign
  save holds the Turn-start state, the ordered Timeline entries, the Timeline pointer as the number of entries that
  are not Undone actions, and the Campaign configuration in force; a Timeline entry committed under a Campaign
  configuration that a change made differ from that of the World state before it holds that configuration, and
  loading rebuilds the other World states by replay, each entry under its own. Each World state keeps the
  Campaign configuration it was produced under; the Session keeps the one in force beside the Timeline. The History
  and the Turn report are kept inside each World state, so a Campaign save holds them in its Turn-start state and
  replay reproduces them. Game storage holds no copy of a GDR. The Current Autosave is rewritten whole after every
  change, with the encoded Turn-start state reused between writes, and Autosaves share no stored data with each other.
  DEC-023 states the physical layout, which the document leaves as a TODO. Until specification revision
  44c112e3731ec5d173c4eddb7956c4a46dbf46c5 removed Autopilot memory, a Campaign save also held the Autopilot memory
  written at each World state; a Campaign save written then still loads, its Autopilot memory ignored and its
  Campaign configuration taken from its saved World state, because the Campaign state it holds and the rules its
  Timeline entries replay under are unchanged.
- **Options considered:** Full copies; patches; replay with shared in-memory states.
- **Option chosen:** Replay with shared in-memory states, as suggested.
- **Why:** It is compact, needs no reverse changes, and relies only on guarantees the specifications already give.
- **Links:** None.

## DEC-009: Engine API signatures, results, and errors

- **Category:** Asked by the specifications
- **Affected specifications:** ENG, API hierarchy: "exact signatures, argument Types, and results are the
  implementer's choice". ENG, World state integrity: "Exact error representations and asynchronous operation
  results are the implementer's choice."
- **Description:** Every operation returns a result object that is either a success with a value or a failure with one
  error code, a message holding only Player-visible information, and, for a rejected gameplay action, a stable reason
  identifier. Nothing is thrown to the caller; an engine defect is returned as the error code `engine_defect` and
  commits nothing. Queries and the operations that touch only Session state are synchronous. Every operation that
  can write to Game storage returns a Promise, and a successful result lists the Autosaves that could not be written.
  An action with no effect returns success with `committed: false` and is not a Player action. An Advance turn that an
  Autopilot AI requests and the engine withholds under AUTO, Autopilot limits, returns success with
  `committed: false` and `withheld: true`. `session.campaignConfiguration.set(values)` takes the values as an object
  from each Campaign configuration value's key to its new value, and returns success with no value.
  `setPresetEdit(preset, value)` takes the value as a pair of the Campaign configuration value's key and its new
  value, and `removePresetEdit(preset, value)` takes the key. One operation is added to `session.autopilot`:
  `whenDisengaged(engagementId)`, which resolves with the disengagement result.
- **Options considered:** Throwing exceptions; result objects.
- **Option chosen:** Result objects.
- **Why:** A caller, e.g. an LLM player through the CLI, can handle every failure as data, and a rejection cannot be
  mistaken for a defect.
- **Links:** None.

## DEC-010: Campaign save encoding, Autosave identifiers, and the order of World states

- **Category:** Asked by the specifications
- **Affected specifications:** SAVES, Campaign save contents: "How a Campaign save is encoded and stored is the
  Implementer's choice." TIMELINE, Autosave navigation: "A World state is later than another World state of
  the same Campaign when one or more Player actions lead from the other to it".
- **Description:** A Campaign save is one JSON text with a format number, the Game build identifier, and the time it
  was last written, an ISO 8601 UTC time taken from the host's clock and kept beside the Campaign state. The Game
  build identifier is the package version joined with a hash of the GDRs; a Campaign save whose identifier differs is
  rejected as Incompatible Game build. Each World state reached by a Player action receives a stamp, an
  Independent identifier, and a Campaign save holds the stamps of every World state from campaign creation to the
  saved one. World state A is earlier than B exactly when the stamp of A is among the stamps leading to B. Stamps
  are kept beside the Timeline and are not Campaign state. The Current, Engagement, and Return Autosaves of a
  Campaign each have one fixed Campaign save ID derived from the Campaign ID, and a Turn-end Autosave has one derived
  from the Campaign ID and its Turn, so writing one replaces the earlier one. The package version changes whenever
  the Campaign state a save holds, or the rules its Timeline entries replay under, change incompatibly, e.g. 0.2.0
  for specification commits 0558ca9bc3c3126195925e66217f6d6174f6b368 and 59ccadfc6728d372f5eadb01026ff2d22256c11e,
  which ended re-routing and added the Action record.
- **Options considered:** Comparing Turn numbers and action counts; a hash chain of actions; a stamp for each
  World state.
- **Option chosen:** A stamp for each World state.
- **Why:** It distinguishes lines of play exactly, including after a Campaign save of another line of play is loaded,
  and costs a few bytes for each Player action.
- **Links:** None.

## DEC-011: Global configuration settings of this Game build

- **Category:** Gap resolution
- **Affected specifications:** CONFIG, Global configuration: "Interface preferences belong to Global configuration,
  e.g. volume, language, and tutorial popups. So does a setting that governs the engine without being consulted by
  game behavior, e.g. the Autosave limit".
- **Description:** This Game build has exactly five Global configuration settings: the Autosave limit, a whole
  number of at least 0 with the Game build default 5; Music on and Music volume, under MUSIC, Music settings, since
  4594d57d7fd5629eb491f9749e7775a05395671a; and Sounds on and Sounds volume, under SOUNDS, Sound settings, since
  7d818a25333f1fbcd53aefd0a354dad88714d682. The interface theme setting was removed under
  741432de4c8152c73ac65baeda155412f847b01c, which makes any setting that switches themes out of scope, as DEC-034
  records. The game has one language, so it offers no language setting.
- **Options considered:** Only the Autosave limit; the Autosave limit and the settings the interfaces need.
- **Option chosen:** The Autosave limit and the settings the interfaces need, now Music on, Music volume, Sounds on,
  and Sounds volume.
- **Why:** These are the settings this Implementation reads; a setting nothing reads would mislead the player.
- **Links:** PROB-002

## DEC-012: Execution budget of an Autopilot AI

- **Category:** Gap resolution
- **Affected specifications:** AUTO, Autopilot lifecycle and concurrency: "Autopilot disengages as AI failed when the
  Autopilot AI reports an error, produces no valid action, or exhausts its configured finite execution budget." AUTO,
  same section: "That budget prevents indefinitely repeated invalid actions, an Autopilot AI that makes no progress,
  and one that never requests Advance turn".
- **Description:** The engine runs an Autopilot AI in steps. A step that ends without committing a Player action and
  without having an Advance turn withheld disengages Autopilot as AI failed, and so does a step that reports an
  error. A step that makes more than 100,000 calls of Player API disengages Autopilot as AI failed at that call, and
  every later call of that step fails with `engagement_ended`. An Autopilot AI that commits 10,000 Player actions
  other than Advance turn in one Turn of its Autopilot engagement, counted from engagement or from its last Advance
  turn, disengages as AI failed, because it never requests Advance turn. Player actions committed before the failure
  remain.
- **Options considered:** A wall-clock limit; a limit on engine calls, on steps without progress, and on Player
  actions in one Turn.
- **Option chosen:** A limit on engine calls, on steps without progress, and on Player actions in one Turn.
- **Why:** It is independent of the machine, so the same Autopilot AI fails at the same point everywhere.
- **Links:** PROB-003

## DEC-013: Changing Campaign configuration during play

- **Category:** Gap resolution
- **Affected specifications:** CONFIG, Changing Campaign configuration during play: "`session.campaignConfiguration.set(values)`
  is the one operation that changes Campaign configuration during play." CONFIG, TODOs: "Define what
  `session.campaignConfiguration.set(values)` reports" and "Only two Campaign configuration values exist so far ...
  both fixed after Campaign creation, so neither is adjustable during play."
- **Description:** The engine API offered no operation that changes Campaign configuration during play, because no
  Campaign configuration value is adjustable during play and CONFIG named none. Specification revision
  44c112e3731ec5d173c4eddb7956c4a46dbf46c5 overrode that: CONFIG now names `session.campaignConfiguration.set(values)`
  as a Session API operation, which the engine offers and the CLI reaches as `adjust`. It validates the whole
  request before it changes anything, rejecting with `invalid_input` a value that does not exist, is fixed after
  creation, or is not permitted; it needs a Current campaign and is unavailable during an Autopilot engagement. An
  accepted change replaces the Current Autosave and reports no value; a request that changes nothing is accepted
  and writes nothing. The change is not a Timeline entry: the Session keeps the Campaign configuration in force
  beside the Timeline, undo, redo, and Autosave navigation keep it, a load takes the one of the Campaign save, and
  each Player action is committed under it, under DEC-008. In this Game build no value is adjustable during play,
  so every accepted request changes nothing; the test rules make one value adjustable to exercise the rules.
- **Options considered:** An operation that always rejects; no operation; the operation CONFIG names.
- **Option chosen:** The operation CONFIG names, since 44c112e3731ec5d173c4eddb7956c4a46dbf46c5.
- **Why:** ENG, API hierarchy, now lists it in the required starter operation inventory, and the CLI must reach every
  Session API operation.
- **Links:** PROB-004, PROB-036

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
- **Affected specifications:** WHIST, Current state, Turn report, and history: "Player API returns what is true now
  and what happened earlier through three queries."
- **Description:** `getCurrentState()` returns the Campaign instances that participate in current gameplay: the
  Agency, Serving Agents, Factions, Active Investigations, Leads with whether each prerequisite holds, Mission sites that are Active
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
- **Superseded in part:** Specification revision 163e921efbabf3bdaca1724eb1fa2a180644b6bd states, under WHIST, Current state, Turn report,
  and history, that `getHistory()` returns every Retired Campaign instance, so that part is now conformance. The two
  added queries remain this decision.
- **Links:** PROB-006

## DEC-016: Contents of the Turn report and of a History entry

- **Category:** Gap resolution
- **Affected specifications:** WHIST, Turn report and history: "What the Turn report and each History entry hold of
  a value is stated by the specification owning that value." INVSTG, Turn report and MISSION, Turn report: "The
  History entry of the Turn the Advance turn ends holds the same list, unreduced."
- **Description:** The Turn report holds, for the Advance turn that ended Turn t: the Agents that arrived; the income
  and upkeep with the money after each; for each Agent on Training its Training gain outcome, its base skill, and its
  exhaustion afterwards; each Forced return, with the Work Assignment it ended; for each Active Investigation its
  progress gain, whether it became Assessed, whether it completed, the progress its Forced returns cost under INVSTG,
  Progress loss, its progress afterwards, whether Forced returns left it Abandoned, and the Mission site it created; for
  each resolved Mission its result, its Killed Agents, its survivors by destination, its consequence, and the Lead whose
  win it recorded, together with its complete Combat report; the Cancelled and the Expired Mission sites with their
  consequences; for each Faction that escalated or operated, its new Faction activity level and the Response Mission
  site it created; each Agent's recovery; Panic, funding, and money before and after; and the Campaign ending, if one
  was recorded. It holds no hidden value: no Faction countdown, no Actual required progress of an Investigation, and not
  the Pending panic change as such. Specification commit 438b909e6ef6bf0cd581856d790a318ac8879628 replaced the random
  Investigation completion outcome, whose Probability the Turn report used to leave out, by the hidden Actual required
  progress and Progress loss; the Investigation part of the Turn report was updated to follow it. A History entry holds
  the Turn number, a reduced form of the Turn-start state and of the Turn-end state, i.e. money, funding, Panic, and the
  numbers of Serving Agents, Active Investigations, and Active Mission sites, and a reduced form of the Turn report:
  income, upkeep, each Mission with its result, its Combat outcome and number of Combat rounds, and which Agents were
  Killed, wounded, or unharmed, the Investigations completed, the Mission sites created, Expired, and Cancelled, the
  Factions that escalated, Panic, money, and funding afterwards, and the Campaign ending. Specification commit
  e75994ed06c02b1cc9b015543ba7fb38e8db6978 made two lists owned by the mechanics: INVSTG, Turn report requires the
  Investigations completed, each by Instance ID with the gain of its last Progress gain in hundredths, and MISSION, Turn
  report requires the Mission sites created, Expired, and Cancelled, each by Instance ID; the Turn report holds them as
  `investigationsCompleted`, `createdMissionSites`, `expiredMissionSites`, and `cancelledMissionSites`, and the History
  entry holds the same four lists unreduced instead of the Instance IDs alone it held for the Investigations completed.
  Specification commit 59ccadfc6728d372f5eadb01026ff2d22256c11e added the Action record: a History entry also holds
  `actions`, each item the operation's name, its arguments as called, and its money change. Specification commit
  cc4d6a246a64d200440eec6f09cf4d953e0724c9 adopted this decision's contents as the Turn report sections of the
  mechanics, and made the Turn report list every Forced return in Agent order rather than step by step. The copies
  of each Mission site's MissionSiteArchetype and kind that the Turn report and the History entry keep go beyond what
  the specifications require. Specification commit 6c57a15eed3fde76cf1ce32c2e1a95516926fbb9 made a History entry keep,
  for each Mission, each participant's current health and effective skill at Combat start and at Combat end and its
  final condition, each side's Combat rating at Combat start and at Combat end, and the Consequences that applied, and
  for each Expired Mission site the Consequences that applied; the History entry holds them as `participants`,
  `ratingsStart`, `ratingsEnd`, `consequence`, and `expiredConsequences`, and the Campaign save format moved to 12.
- **Options considered:** A History entry that repeats the whole Turn report; a reduced History entry.
- **Option chosen:** A reduced History entry without the Combat log.
- **Why:** The Combat log is the large part of a Turn report, and WHIST requires a History entry to bound what is
  retained.
- **Links:** PROB-007

## DEC-017: An Attempted Mission site stays current while its Mission is Deployed

- **Category:** Conflict resolution
- **Affected specifications:** MISSION, Mission site properties: "A Mission site in a final state no longer
  participates in current gameplay and is retained in World history".
- **Description:** A Mission site participates in current gameplay while it is Active and while it is Attempted and
  its Mission is Deployed, together with its Enemies. It is retained in World history once it is Expired or
  Cancelled, or once its Mission is Won or Lost. `getCurrentState()` and `getHistory()` divide Mission sites and
  their Enemies accordingly. Since 4a22cee51b5e5052c5003f5dbf6389edb183c220 the lifecycle state Attempted is named
  Deployed, and the Implementation uses that name.
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
  `combat.damage.<Combatant>` for the next attack of a Combatant, `agent.trainingGain.<Agent>` for the Training gain
  outcome, `investigation.requiredProgress.<Lead>` for the Required progress outcome of the next Investigation of that
  Lead, drawn by `startInvestigation` after every precondition holds and before the Investigation's Instance ID is
  generated, `faction.<Faction>.levelDuration`, `faction.<Faction>.operationInterval`, `faction.<Faction>.operationLevel`, and
  `mission.archetypeSelection.<Faction>`. Random values are drawn in the order the code decides the outcomes. Within
  a Turn advancement step, Campaign instances are processed in the order they were created, and the Mission sites a
  step creates are created after the step has processed every Campaign instance, in that same order, so that the
  generated Instance IDs do not depend on the processing order. A weighted choice and the uniform MissionSiteArchetype
  selection draw one whole number below the sum of the weights.
- **Options considered:** Drawing all outcomes of a step in advance; drawing each when it is decided.
- **Option chosen:** Drawing each when it is decided, with creations ordered canonically.
- **Why:** It is the simplest order, and tests can fix any named outcome and shuffle the processing order. The
  Required progress outcome is named by its Lead, because the Investigation it belongs to does not exist until the
  outcome is drawn, and a Lead has at most one Active Investigation, so the name identifies the outcome.
- **Update:** Specification commit 438b909e6ef6bf0cd581856d790a318ac8879628 removed the Investigation completion outcome,
  named `investigation.completion.<Investigation>`, and added the Required progress outcome.
- **Links:** None.

## DEC-019: Full Campaign state inspection

- **Category:** Gap resolution
- **Affected specifications:** DEV, Inspection contract: "Full Campaign state inspection presents each Campaign
  instance as its four properties, Instance ID, Archetype reference, Constants, and State".
- **Description:** `developer.queries.getCampaignState()` returns a detached copy of Campaign state in its conceptual
  hierarchy under CSTATE, Campaign state composition, as specification revision
  44c112e3731ec5d173c4eddb7956c4a46dbf46c5 redrew it: `timeline`, with the `turnStartState` and the
  `timelineEntries`, each a `playerAction` with the `worldState` it produced; `timelinePointer`, the number of
  Timeline entries that are not Undone actions; `history`, with the History entries and the recorded values of each
  Turn series for the ended Turns; `campaignConfiguration`, the one in force; and `turnReport`. Each World state is
  divided into `liveWorldState`, which holds the Campaign seed, the generator state, the pending random outcome
  overrides, the turn number, Panic and the Campaign ending values, and the Campaign instances still in play, and
  `retiredWorldState`, which holds the Campaign instances that have left play. Every Campaign instance is an object
  with exactly `id`, `archetype`, `constants`, and `state`. Before that revision it returned `campaignConfiguration`
  and a `worldState` divided into `currentWorldState` and `worldHistory`. With Dev mode disabled the query and every Player cheat action fail with the error code `dev_mode_disabled`,
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
- **Description:** The Player cheat action `developer.actions.overrideRandomOutcome(outcome, value)` takes the name of a
  random outcome under DEC-018 and a value: true or false for a hit or a Training gain outcome, a whole number for a
  damage, Required progress, Level duration, Operation interval, or Operation level outcome, and a
  MissionSiteArchetype identifier for a MissionSiteArchetype selection outcome. It is rejected when the name matches
  no random outcome, when the Campaign instance or, for a Required progress outcome, the Lead GDR it names does not
  exist, or when the value is of the wrong kind. An accepted override
  is a pending override in Current world state, visible through inspection, and one Timeline entry. It applies once:
  the next time that outcome is decided it takes the value and the override is removed, without drawing from the
  generator. Whether the value is one of the possible values is known only when the outcome is decided, e.g. the
  range of a damage outcome; a value that is not possible then is discarded and the outcome is drawn as usual. A
  second override of the same outcome replaces the first. An override whose outcome is never decided stays pending.
- **Options considered:** Overrides that apply until cleared; overrides that apply once.
- **Option chosen:** Overrides that apply once.
- **Why:** It matches "when that random outcome is next decided" and keeps replay exact, because the pending
  overrides are Campaign state.
- **Update:** Specification commit 438b909e6ef6bf0cd581856d790a318ac8879628 replaced the Investigation completion outcome, a
  true-or-false outcome, by the whole-number Required progress outcome. Specification commit
  a4fbc4d24b254e2e567a1c5f393a3dcb984a18a1 overrode the discarding of an impossible damage value: COMBAT, Damage outcome now says a supplied damage outcome
  "must be one of the whole numbers from `lo` to `hi`; any other value is rejected and never applied", so an override
  of a damage outcome is rejected when its value is outside the bounds that the Combatant's weapon damage gives when
  the override is requested. A pending value that a later change of weapon damage puts outside the bounds, e.g. a
  purchased Upgrade, is still discarded when the outcome is decided, so it is never applied.
- **Links:** PROB-009

## DEC-021: Thresholds and procedure of the Basic Autopilot AI

- **Category:** Asked by the specifications
- **Affected specifications:** BASICAI, Goals: "The exact thresholds of the goals, e.g. how large a safety margin is,
  are the Implementer's choice".
- **Description:** A Rested Agent has exhaustion of at most 5, and of at most 25 for urgent income, and is always
  Fit for work. The Recall threshold is 30, the game-ts value: an Agent on Contracting or Training whose exhaustion
  is above 30 is recalled to Standby. Expected income sums each contracting Agent's contribution from its current
  effective skill and rounds down once, as ECON, Agency income does. The Agent
  reserve is 20% of the roster, rounded down. The Expected income target is 120% of projected upkeep. The Savings
  floor is five turns of half the projected upkeep. A team needs a Combat rating above 120% of the Enemies' Combat
  rating and one Agent for every three Enemies. Agents investigating Leads number 1 plus 1 for every 10 Agents. The
  target roster is 8 plus 4 for each Upgrade bought whose effect improves Agents, not for the cap Upgrades. The
  Transport cap and the Training cap are kept at 25% and 30% of the roster, the game-ts values. The Basic Autopilot AI decides one Player
  action at a time: after every Player action it reads the current state and starts its Turn routine again, so that
  it plays the same whatever its Autopilot limit is. A team is formed in the order of preference BASICAI states and,
  when that order gives no winning team, with the most capable Rested Agents first. Among equally good choices it
  takes the first in the order of the roster, of the Mission sites, or of the Leads. Among Agents of equal preference the one with the higher effective skill comes first, then the order of
  the roster. The Expected income target and the Savings floor are rounded up. It buys nothing while Expected income
  is below projected upkeep, and it hires before it buys Agent cap. Otherwise it rotates among the Upgrades other than
  the Cap Upgrades: it buys the one bought least often, the cheaper first among equals, and buys nothing while that
  one costs more than its budget. A Player action that was rejected is not tried again in that Turn. With these
  thresholds it won 200 of 200 Campaigns of different Campaign seeds, in a median of 233 Turns (minimum 197, maximum
  281), at specification revision e3bd230499aa61d126f94320c17f8d3347f54be3. With the Transport cap and Training cap at 50% it had won 200 of 200 in a
  median of 214 Turns after the Base health and Rate Upgrades of specification commit
  a7dfd0a94b474cdea154c0d2b4935ccce9a795d4. Before them, when the only Upgrade improving Agents was the one with the
  effect `agent_weapon_damage`, the median was 192 Turns, after the Investigation rework of
  specification commit 438b909e6ef6bf0cd581856d790a318ac8879628, i.e. a rolled Actual required progress, team efficiency,
  and Progress loss; after the exhaustion rework of specification commit e10913ff6cb326b4834eaa45c02d71ce5cbebf92 the
  median was 172 Turns, and before it 91 Turns.
- **Options considered:** The game-ts starting values unchanged; values tuned against whole Campaigns.
- **Option chosen:** Tuned values.
- **Why:** With a roster target that counts every Upgrade, each Agent cap purchase called for the next and the
  roster grew without bound. The Transport cap and Training cap compare as follows over the same 100 Campaign seeds at
  specification revision e3bd230499aa61d126f94320c17f8d3347f54be3: at 25% and 30% the Basic Autopilot AI won 100 of 100, in a median of 232 Turns,
  with a median final roster of 44; at 50% each it won 94 of 100 and lost 6 at the Panic limit, in a median of 267
  Turns. When the only Upgrade improving Agents was the Weapon damage Upgrade, the roster stayed small, 25% of it gave
  no team large enough to win `raid_hq`, and 50% was kept instead; the roster now grows with five such Upgrades, so
  the game-ts values win again.
- **Update:** The Transport cap and Training cap were 50% each until the comparison above at specification revision
  e3bd230499aa61d126f94320c17f8d3347f54be3.
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

## DEC-026: Change notification beside the namespaces

- **Category:** Gap resolution
- **Affected specifications:** ENG, API hierarchy: "The complete namespace inventory is `session`, `player`, and
  `developer`."
- **Description:** The engine object that an adapter receives has two members outside the three namespaces, four
  before specification revision 44c112e3731ec5d173c4eddb7956c4a46dbf46c5 removed `autopilotMemory`:
  `subscribe(listener)`, which calls the listener after anything a query could report has changed and returns a
  function that stops it, and `getRevision()`, a number that changes with every such change. They read and change no
  Campaign state, return no game value, and are not given to an Autopilot AI.
- **Options considered:** An adapter that polls the queries on a timer; a change notification.
- **Option chosen:** A change notification.
- **Why:** During an Autopilot engagement the World state changes without a call from the interface, and an
  interface has to show each change.
- **Links:** PROB-013

## DEC-027: The terminal CLI

- **Category:** Gap resolution
- **Affected specifications:** CLI, Reach of the CLI: "Every Session API and Player API operation under API hierarchy
  is reachable through the CLI, and so is every Developer API operation while Dev mode is enabled." CLI, Output forms:
  "Both forms carry exactly what the engine API returns". CLI, TODOs: "TODO: State how the CLI names operations and
  their arguments, and how a caller discovers the available ones".
- **Description:** The CLI reads one command per line, and each command is one engine API operation: the Session
  commands `status`, `new`, `close`, `presets`, `preset`, `setup`, `select`, `edit`, `unedit`, `adjust`, `saves`,
  `load`, `save`, `delete`, `deletecampaign`, `config`, `set`, `reset`; the queries `state`, `report`, `history`, `actions`,
  `gamedata`, `preview`, and `agents`, `leads`, `investigations`, `sites`, `missions`, `factions`,
  `upgrades`, `retained`, which each print that part of the current state or of the history; the Player actions
  `assign`, `hire`, `dismiss`, `buy`, `investigate`, `join`, `deploy`, `next`; the navigation commands
  `timeline`, `undo`, `redo`, `undoall`, `redoall`, `autosaves`, `back`, `forward`; `ais`, `engage`,
  `autostatus`, `disengage`, and `wait` for Autopilot, with `auto` engaging and waiting in one command and the
  Autopilot limits written `single`, `turn` for `turnActions`, and `turns <count>`; and `dev`,
  `inspect`, `addmoney`, `addagents`, `override` for Developer access. `help` lists the commands. The readable
  form prints the whole result as indented `key: value` lines, with a list of flat records as a table; `--json`
  prints each result as one line of JSON, the result object of the operation with the command name. Both forms carry
  every value of the result. The CLI shows the Campaign seed only while Dev mode is enabled. A line it cannot turn
  into an operation is answered with the code `invalid_command` and calls nothing.
- **Options considered:** Readable output as hand-picked summaries and tables; readable output as the whole result.
- **Option chosen:** The whole result in both forms.
- **Why:** A person reading the terminal and a script reading JSON then learn the same, and no rule of what to leave
  out has to be kept in step with the engine API.
- **Links:** PROB-016

## DEC-028: Error codes and results of operations the specifications leave open

- **Category:** Asked by the specifications
- **Affected specifications:** ENG, World state integrity: "Exact error representations and asynchronous operation
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
  action. A Probability is reported as a pair of whole
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

## DEC-030: GitHub Pages Deployment followed

- **Category:** Treatment of guidance
- **Affected specifications:** GHPAGES, Continuous integration workflow: "The CI workflow is what turns a push into a
  deployment: it repeats the Implementation's checks on a clean machine and deploys only their result."
- **Description:** Used as is. The Engine designer asked for a public repository under their personal GitHub account,
  and the web Game build is static files, so both Deployment prerequisites hold. The repository is
  `konrad-jamrozik/game-v5-impl-web`; `.github/workflows/deploy-pages.yml` runs `npm ci`, `npm run check`, and
  `npm run web:build` on each push to `main` and deploys `dist/` to GitHub Pages; the Vite `base` is `./`.
- **Options considered:** Follow the guidance; deploy by hand from the implementer's machine.
- **Option chosen:** Follow the guidance.
- **Why:** Every pushed change is checked on a clean machine before players reach it, with no step left to the
  implementer.
- **Links:** None.

## DEC-031: Specification Updates followed

- **Category:** Treatment of guidance
- **Affected specifications:** UPDATES, Finding what changed: "The difference between the Specification baseline and
  the target Specification revision is the complete list of changes to apply, so it is suggested to be computed first
  and read before anything else."
- **Description:** Used as is. An update of the Implementation computes the difference of `docs/specs` and `content`
  between the Specification baseline and the target Specification revision, sorts each changed passage into editorial
  or normative, reaches the affected files through the Specification map, and moves the Specification baseline in the
  same commit that brings the Implementation into conformance. `npm run check:records` checks the two tracking
  records: the form of the Specification baseline, the order of the Specification map sections, and that every listed
  path exists.
- **Options considered:** Following the guidance; reviewing the whole Implementation against the specifications at
  every update.
- **Option chosen:** Following the guidance.
- **Why:** Most changes to the specifications are editorial, and the difference shows that without reading any
  unchanged specification.
- **Links:** None.

## DEC-032: Headless First followed

- **Category:** Treatment of guidance
- **Affected specifications:** HEADLESS, Headless milestone: "The Headless milestone is reached when each of the
  following can be done through the Command-Line Interface alone."
- **Description:** Used as is. The terminal CLI reaches the Headless milestone: `new` creates a Campaign and `next`
  plays it to its end, `save` and `load` save and load it, `undo`, `redo`, `back`, and `forward` undo and redo
  within and across Turns, `auto` engages Autopilot, and `dev on` with `inspect`, `addmoney`, `addagents`, and
  `override` uses the Developer API. A change to the engine API is made reachable through the CLI in the same change,
  and `e2e/web.spec.ts` plays the same Campaign through the engine API, the CLI, and the web UI.
- **Options considered:** Following the guidance; keeping the web UI as the only complete interface.
- **Option chosen:** Following the guidance.
- **Why:** The CLI already covers every engine API operation, so the whole game stays playable headlessly at no
  extra cost.
- **Links:** None.

## DEC-033: An Agent on Recovery arrives Recovering

- **Category:** Conflict resolution
- **Affected specifications:** AGENT, Transit rule: "or Recovering when its Assignment is Recovery". TURN, The steps,
  step 1 Transit: "The Agent becomes At assignment and keeps its Assignment."
- **Description:** In the Transit step an In transit Agent whose Assignment is Recovery becomes Recovering; every other
  In transit Agent becomes At assignment. Both keep their Assignment.
- **Options considered:** Following Agents; following Turn Advancement.
- **Option chosen:** Following Agents.
- **Why:** Agents owns Agent status and its invariant, which a Recovery Agent that is At assignment would break; the
  step table of Turn Advancement restates the Transit rule of Agents and links to it.
- **Links:** PROB-015

## DEC-034: The light theme keeps the roles of the dark Design tokens

- **Category:** Gap resolution
- **Affected specifications:** VIS, Design tokens: "The interface has a dark theme only; the light theme is a TODO."
  VIS, TODOs: "TODO: Define the light theme's Design tokens under Colours, since the Settings panel lets the Player
  choose a light theme".
- **Description:** The web UI draws the dark theme with exactly the Design tokens of VIS. The light theme, which the
  theme setting of DEC-011 selects, gives every colour token of VIS a light value of the same role in
  `src/web/styles.css`, e.g. a light Background and a darker orange Accent, and keeps every font, size, and spacing.
- **Options considered:** Removing the light theme; keeping it with values of the same roles.
- **Option chosen:** Keeping it with values of the same roles.
- **Why:** The theme setting is part of the Global configuration of this Game build, and VIS states that the Settings
  panel lets the Player choose a light theme, so removing it would drop a setting the specifications still expect.
  Specification commit 741432de4c8152c73ac65baeda155412f847b01c overrode this decision: VIS, Design tokens now
  states that "a light theme, and any setting that switches themes, is out of scope", so the Implementation removed
  its light theme and its Theme setting, and the web UI draws the dark theme only.
- **Links:** PROB-018

## DEC-035: Leads discovered in an Advance turn are listed in Game build order

- **Category:** Gap resolution
- **Affected specifications:** LEAD, Turn report: "holds the Leads discovered in it: every Lead that is discovered in
  the World state that Advance turn commits and is not discovered in the World state before it, each by its
  GDR identifier."
- **Description:** The Turn report and the History entry list the Leads discovered in an Advance turn in the order of
  the Lead GDRs in the Game build's catalog.
- **Options considered:** Game build order; order of GDR identifiers; order of the Missions whose wins discovered them.
- **Option chosen:** Game build order.
- **Why:** It is fixed by the Game build, so the list is the same on every replay, and it is the order in which every
  other view lists Leads.
- **Links:** PROB-020

## DEC-036: How the Basic Autopilot AI measures a Lead's place in its Faction's chain

- **Category:** Gap resolution
- **Affected specifications:** BASICAI, Keep Mission sites coming: "Among such Leads, one whose Won Mission site makes
  a Faction Eliminated comes first, then the one furthest along its Faction's chain, i.e. the one with the longest
  chain of discovered Leads behind it, each creating the MissionSiteArchetype a prerequisite of the next names."
- **Description:** The Basic Autopilot AI sorts the Leads it could win on two keys: a Lead whose Won Mission site
  makes a Faction Eliminated first, then the length of the longest path of discovered Leads of the same Faction behind
  it, not counting the Lead itself, longest first. Equal Leads keep the order Player API lists them in.
- **Options considered:** Counting the Lead itself or not; Leads of every Faction or of the same Faction; the longest
  path or the number of Leads behind it.
- **Option chosen:** The longest path of discovered Leads of the same Faction, not counting the Lead itself.
- **Why:** "behind it" and "its Faction's chain" read most directly that way, and only the order matters, so counting
  the Lead itself would change nothing.
- **Links:** PROB-021, DEC-060. Overridden by Specification revision ef44fdc642094f1b969d5e7ea048ccf6019bee60, which
  replaces Lead prerequisites with the Condition `discovered_when` and makes it not Player-visible, so the path of
  prerequisites can no longer be read; DEC-060 measures the chain instead.

## DEC-037: A move from Standby to Training follows the Transit rule, not the stale Acceptance examples

- **Category:** Conflict resolution
- **Affected specifications:** AGENT, Transit rule; ECON, Acceptance examples, The first three Advance turns; TURN,
  Acceptance examples, The first two Advance turns of a Campaign.
- **Description:** `assignAgents` makes an Agent moved between Standby and Training At assignment at once. The tests
  of the two examples follow the Transit rule: a3 does not arrive in the first Advance turn, gains base skill 1 in it,
  and has base skill 101 after it and 102 after the second, with exhaustion 1 and 2 from its work on Training; every
  other figure of the examples is unchanged.
- **Options considered:** Follow the Transit rule and adjust the examples' figures; follow the examples and keep the
  move to Training In transit.
- **Option chosen:** Follow the Transit rule.
- **Why:** The rule is normative and was changed on purpose, and AGENT, Assigning Agents states it again, as do the
  Acceptance examples of Agents, e.g. Training growth; the two examples were not updated with it.
- **Links:** PROB-022

## DEC-038: The Bootstrap AgentParameters values are those the specifications' examples read

- **Category:** Conflict resolution
- **Affected specifications:** AGENT, AgentParameters; AGENT, Agent GDR validation; AGENT, Acceptance examples; BOOT,
  Values that differ from game-ts.
- **Description:** The Implementation's `content/agents/agent_parameters.yaml` has exactly the properties AGENT,
  AgentParameters lists, with the values the Acceptance examples of AGENT read: `initial_roster_size` 4,
  `exhaustion_incapacitation` 100, `exhaustion_free_points` 30, `skill_penalty_pct_per_exhaustion` 1,
  `exhaustion_per_attack` 1, `exhaustion_per_defense` 1, `exhaustion_per_mission` 5, `exhaustion_per_pct_killed` 1,
  `exhaustion_per_contracting_turn` 1, `exhaustion_per_training_turn` 1, `exhaustion_per_investigation_turn` 1,
  `exhaustion_work_start_max` 30, `exhaustion_work_limit` 70, and `training_skill_gain_per_turn` 1. It stopped
  copying the specifications' file until Specification revision 91fc82bff04323b75d171653db7f0f63f7449f73 gave that
  file exactly these properties and values; since then the Implementation copies it again, and with it the
  properties of Mission growth that Specification revision 7985a451a43f4fcaba960b80ca50d8d888cc9cd0 added:
  `skill_gain_per_attack_hit` 4, `skill_gain_per_attack_miss` 2, `skill_gain_per_defense_hit` 1,
  `skill_gain_per_defense_miss` 2, and `skill_gain_per_mission_survived` [30, 25, 20, 15].
- **Options considered:** Copy the specifications' YAML file unchanged; take the values the Acceptance examples and
  BOOT state.
- **Option chosen:** The values the Acceptance examples and BOOT state.
- **Why:** The unchanged file fails Agent GDR validation, so no Campaign could be created, and every Acceptance example
  of AGENT, COMBAT, ECON, INVSTG, MISSION, RECOVER, and TURN reads the new values.
- **Links:** PROB-023

## DEC-039: Player API reports a hidden value that exists as the text `unknown`

- **Category:** Asked by the specifications
- **Affected specifications:** INVSTG, Player-visible information: "The Actual required progress of every
  Investigation, and the Required progress and Required progress range of a discovered Lead that is not an Assessed
  Lead, are reported as unknown, not as absent, because the values exist." LEAD, Player-visible information: "Apart
  from a `required_progress` that Assessment has not yet revealed, which is reported as unknown". ENG, API surfaces:
  "exact signatures, argument Types, and results are the implementer's choice."
- **Description:** A value that exists but is hidden from the player is reported as the text `unknown`, of the Type
  `Unknown`, and an absent value as `null`. `InvestigationView.actualRequiredProgress` is always `unknown`.
  `LeadView.requiredProgress` and `LeadView.requiredProgressRange` hold the Required progress and the Required
  progress range, `{ min, max }`, once `LeadView.assessed` is true, and `unknown` before. Investigation progress and
  the projected progress gain are reported in hundredths of a progress point, as Campaign state stores them.
- **Options considered:** Leaving a hidden value out of the result; `null`; a separate flag beside a placeholder
  value; the text `unknown`.
- **Option chosen:** The text `unknown`.
- **Why:** It keeps unknown apart from absent, which is `null`, as the specifications require, and the hidden value
  never appears in the result, so the Information boundary holds.
- **Links:** None.

## DEC-040: The GUI learns an Investigation's Progress loss from a Player API query

- **Category:** Asked by the specifications
- **Affected specifications:** GUI, Confirming interrupted Assignments: "it also names each Investigation that loses
  members, with its Investigation progress before and after the loss, under Progress loss in Investigations, and each
  that becomes Abandoned and loses all its progress". ENG, API surfaces: "exact signatures, argument Types, and
  results are the implementer's choice."
- **Description:** The Player API query `player.queries.previewProgressLoss(agents)` returns, for each Active
  Investigation with a member among the listed Agents that can be assigned, its Investigation progress now, its
  progress after those Agents leave under INVSTG, Progress loss, and whether it would become Abandoned. It reads only
  Player-visible information. The GUI's confirmation shows those values in progress points, e.g. "4.49 to 3.36", and
  for an Investigation that becomes Abandoned the progress it loses. The Leads panel shows an Investigation's
  progress against its Lead's Required progress range once the Lead is an Assessed Lead, e.g. "progress 4.49 of at
  least 30, up to 45", and "of unknown" before, with its projected progress gain for the next Advance turn.
- **Options considered:** Computing Progress loss in the GUI from the effective skill the Agents grid shows; a Player
  API query that applies the engine's rule.
- **Option chosen:** A Player API query.
- **Update:** Specification commit 0558ca9bc3c3126195925e66217f6d6174f6b368 removed Confirming interrupted
  Assignments from the GUI, so the confirmation and the `previewProgressLoss` query were removed; the Leads panel
  part of this decision still applies.
- **Why:** Every user interface is an adapter over the engine API and implements no gameplay rule of its own, so the
  rule stays in one place and the confirmation always agrees with the action.
- **Links:** None.

## DEC-041: Where a Situation panel row shows its item, and what an Advance turn shows

- **Category:** Gap resolution
- **Affected specifications:** GUI, Situation panel: "Selecting a row shows that item where the Campaign screen
  details it". GUI, Turn summary: "it offers to open the full Turn report".
- **Description:** An Active Investigation row and a Lead to investigate row select the Leads tab and scroll to that
  Lead's card, which holds its Investigation; an Active Mission site row selects the Mission sites tab and scrolls to
  that Mission site's card; the shown card is outlined in Accent for a moment. The Free Training places group head
  selects the Agency tab, which shows the Training cap. The Agents on Standby row selects those Agents in the Agents
  panel, ready for an order. An Advance turn the Player requests through the GUI no longer switches to the Turn report
  tab: the Turn summary reports what needs knowing and its "Open Turn report" action selects that tab. While the Turn
  summary is open, the screen behind it takes no keyboard shortcut, and Escape dismisses it, as does its primary
  Continue button.
- **Options considered:** Rows that open a separate detail view; rows that select the existing tabs and scroll to the
  item; keeping the switch to the Turn report tab after every Advance turn.
- **Option chosen:** Rows that select the existing tabs and scroll to the item, and no automatic tab switch.
  Specification commit e19a220aa261bbcbaecbe0725bedda08f655a2ee overrode the rows' targets: SITP, Groups now has each item open
  the Detail view that details it with that item selected, the Agents line opening the Agents View, and the Turn
  summary's offer opens the Turn Report View. The Turn summary still never opens on its own after an Advance turn.
- **Why:** The existing tabs already detail every one of these items, so a row reaches it in one action without a new
  screen, and the Turn summary replaces the automatic switch, so the Player keeps the tab being worked in.
- **Links:** PROB-024

## DEC-042: A Progress bar clamps progress beyond the range to its end

- **Category:** Gap resolution
- **Affected specifications:** GUI, Progress bar: "the bar spans 0 to the greatest value of the Lead's Required
  progress range". VIS, Progress bars: "The Required progress and the greatest value of the range are written under
  the tick and under the bar's end".
- **Description:** Every position on a Progress bar is clamped to the bar: a fill, preview segment, last-gain segment,
  or completion mark past the greatest value of the range ends at the bar's end, and the labels under it still give
  the actual values, e.g. the final Investigation progress. Labels within 8% of the bar's width of each other overlap.
  The Required progress label under the tick is also left out when the progress before the last Advance turn, which
  the Implementation writes under the bar, overlaps it, because the Turn summary row already gives the range.
  Specification revision 91fc82bff04323b75d171653db7f0f63f7449f73 adopted the clamping and states which value of the
  range the final Investigation progress displaces, which the Implementation follows. The Required progress and the greatest value
  of the range are written as whole progress points, e.g. "3" and "4", Investigation progress as whole progress points rounded down, and its gains with
  two decimals. The number of Turns of a Completed Investigation is the Turn the Advance turn ended minus its Turn
  started, as in the Situation panel.
- **Options considered:** Clamping to the bar's end; widening the scale to the progress; leaving the overflow
  undrawn.
- **Option chosen:** Clamping to the bar's end.
- **Why:** The bar keeps the scale the specification states, so every bar of the same Lead reads alike, and the
  values written under it stay exact.
- **Links:** PROB-025

## DEC-043: Globe Integration used as is

- **Category:** Treatment of guidance
- **Affected specifications:** GLOBE, every section.
- **Description:** Used as is. The four maps are copied unchanged into `public/globe/`, and `globe.js`,
  `globe-scene.js`, `globe.css`, and `globe.d.ts` unchanged into `src/web/globe/`, which the formatter and the linter
  leave out; three.js is a dependency at 0.159.0. `src/web/screens/Globe.tsx`, the component of `lib/globe/README.md`,
  mounts the globe in the Globe stage, hides it while a Detail view covers the Globe stage, and disposes of it with the
  Campaign screen. The suggested test is a browser test of the Campaign screen without WebGL 2, and the other browser
  tests that do not concern the globe also run without WebGL 2. Specification commit b2af76a4e82b0167a5fe852ac842e6a737007840 replaced the earlier TypeScript port of the globe with these copied files.
- **Options considered:** Following the recipe as it is; porting the globe to TypeScript.
- **Option chosen:** Following the recipe as it is.
- **Why:** The copied files carry the globe's controls and failure handling exactly as the reference viewer has them,
  and a later change to `lib/globe/` is applied by copying the files again.
- **Links:** None.

## DEC-044: Autosave navigation prefers the Return Autosave among targets with the same World state

- **Category:** Gap resolution
- **Affected specifications:** TIMELINE, Autosave navigation: "Loads the target holding the earliest World state
  that is later than the Current world state."
- **Description:** When two targets of Autosave navigation hold the same World state, `redoToAutosave()` and
  `undoToAutosave()` load the Return Autosave if it is one of them, so that the last `redoToAutosave()` loads the
  Return Autosave as TIMELINE's acceptance example expects. Between the Engagement Autosave and the Disengagement
  Autosave of an engagement that committed nothing, which one is loaded does not change the World state reached.
- **Options considered:** Preferring the Return Autosave; preferring the most recently written target.
- **Option chosen:** Preferring the Return Autosave.
- **Why:** The Return Autosave holds the line of play the Player left by going back, including its Undone actions,
  which is what redo across Turns exists to restore.
- **Superseded in part:** Specification revision ef784eef02d431975327f0a09fd25cebb3e52659 states, under TIMELINE, Autosave navigation,
  Equal targets, that the Return Autosave is loaded when it is one of two targets holding equal World states, for
  `undoToAutosave()` as for `redoToAutosave()`, so that part is now conformance. Between two other such targets, e.g.
  the Engagement and Disengagement Autosaves of an engagement that committed nothing, which one is loaded remains this
  decision: the one found first.
- **Links:** PROB-026

## DEC-045: An Encyclopedia article's subject must identify exactly one GDR

- **Category:** Gap resolution
- **Affected specifications:** COMP, Encyclopedia article GDR validation: "Subject exists: A `subject` identifies a
  GDR of the Game build whose Type is not EncyclopediaArticle." COMP, Article visibility: "Its subject is
  Player-visible in that World state".
- **Description:** A `subject` that identifies GDRs of more than one Type other than EncyclopediaArticle fails rule 4,
  Subject exists, so every article has one subject and one subject Type. For a subject Type that COMP's informative
  table does not list, the article follows what Player API reports: it is always Player-visible for a parameter GDR,
  FactionActivityLevel, FactionOperationLevel, AgencyArchetype, InvestigationArchetype, or MissionArchetype, which
  Player API reports in every World state, and never for CampaignConfiguration or ConfigurationParameters, which
  no Player-visible value includes. No Bootstrap article has such a subject.
- **Options considered:** Rejecting an ambiguous subject; taking the first GDR in Game build order.
- **Option chosen:** Rejecting an ambiguous subject.
- **Why:** COMP reports a data defect rather than repairing content, and a silent choice could show an article about
  a GDR the Player may not know yet.
- **Links:** PROB-028

## DEC-046: Queries that preview `assignAgents` for the Agents View

- **Category:** Gap resolution
- **Affected specifications:** AVIEW, Header: "A button is enabled only when pressing it would succeed with the
  current selection" and "It would succeed when the engine would accept the Player action it makes". AVIEW, Agent
  filters: the filter toggle "shows only the Serving Agents that the button would succeed with if that Agent alone
  were selected".
- **Description:** Two queries are added to `player.queries`. `previewAssignAgents(agents, assignment)` returns
  whether `assignAgents` would accept those Agents and that Assignment in the Current world state, with the
  rejection reason and message when it would not, and changes nothing. `previewAssignAgentsAlone()` reports, for each
  of Standby, Contracting, and Training, the Agents that `assignAgents` would accept on their own. It is a query of its
  own rather than part of `getAvailableActions()`, because it tries the action once per Agent and Assignment and an
  Autopilot AI asks for the available actions often. Both apply the action to a copy of Current world state, so they agree with `assignAgents`
  exactly and reveal nothing that its error would not.
- **Options considered:** The GUI applying the preconditions of Assigning Agents itself; a preview query.
- **Option chosen:** A preview query, plus the per-Agent lists for the filter toggles.
- **Why:** As with `previewDeployment` under DEC-015, no interface repeats a game rule, so a change to the
  preconditions of `assignAgents` cannot leave the buttons and filters behind. Specification commit
  0558ca9bc3c3126195925e66217f6d6174f6b368 renamed the filter toggles Assignment filters; `previewAssignAgentsAlone()`
  still decides which Agents one of them lets the Player select.
- **Links:** PROB-029

## DEC-047: Re-routing an Agent In transit asks no confirmation

- **Category:** Gap resolution
- **Affected specifications:** GUI, Confirming interrupted Assignments; AGENT, Transit rule, Re-routing.
- **Description:** The confirmation of interrupted Assignments names only Agents At assignment on Contracting or an
  Investigation. An Agent In transit is re-routed without a confirmation, because it is not working yet and arrives
  when it would have arrived.
- **Options considered:** Confirming every Agent whose Assignment is Contracting or an Investigation; confirming only
  Agents At assignment.
- **Option chosen:** Confirming only Agents At assignment.
- **Why:** The confirmation guards against losing work and an Advance turn, and re-routing loses neither.
  Specification commit 0558ca9bc3c3126195925e66217f6d6174f6b368 overrode this decision: an Agent In transit can no
  longer be assigned, and the GUI asks no confirmation of interrupted Assignments at all, so the Implementation
  removed the confirmation.
- **Links:** PROB-030

## DEC-048: The Soundtrack is bundled from `assets/music/tracks/`

- **Category:** Asked by the specifications
- **Affected specifications:** PLACE, Music in an Implementation: "its Game build must serve that copy rather than the
  `assets/music/tracks/` directory of the Spec repo; e.g., a web Implementation built with Vite copies the files to
  `public/music/`."
- **Description:** The copy of the Soundtrack is kept in `assets/music/tracks/`, the same path as in the Spec repo, and
  the web UI lists it with Vite's `import.meta.glob`, which also emits each file into the Game build. Adding a Track
  file adds it to the Soundtrack with no list to edit.
- **Options considered:** `public/music/` with a hand-kept list of file names; the path of the Spec repo listed by
  `import.meta.glob`.
- **Option chosen:** The path of the Spec repo, `assets/music/tracks/`, listed by `import.meta.glob`.
- **Why:** A hand-kept list can fall out of step with the files, and the same path as in the Spec repo makes the copy
  easy to compare. Specification revision f629d129c47dfbaba5ae6540c73bf0e8fdd0b2cd moved the Soundtrack of the Spec
  repo from `assets/music/` to `assets/music/tracks/`, so the copy moved with it.
- **Links:** None.

## DEC-049: The Sound set is bundled from `assets/sounds/`

- **Category:** Asked by the specifications
- **Affected specifications:** PLACE, Sounds in an Implementation: "its Game build must serve that copy rather than the
  `assets/sounds/` directory of the Spec repo; e.g., a web Implementation built with Vite copies the files to
  `public/sounds/`."
- **Description:** The copy of the Sound set is kept in `assets/sounds/`, the same path as in the Spec repo, without its
  README, which is not a Sound. The web UI finds each Sound with Vite's `import.meta.glob`, which also emits each file
  into the Game build, as DEC-048 does for the Soundtrack.
- **Options considered:** `public/sounds/` with a hand-kept list of file names; `assets/sounds/` listed by
  `import.meta.glob`.
- **Option chosen:** `assets/sounds/` listed by `import.meta.glob`.
- **Why:** The Soundtrack is bundled the same way, and the same path as in the Spec repo makes the copy easy to compare.
- **Links:** DEC-048.

## DEC-050: An Assign to button follows the engine, not the Header example

- **Category:** Conflict resolution
- **Affected specifications:** AVIEW, Header; AGENT, Assigning Agents, precondition 6.
- **Description:** A button of Assign to is enabled exactly when `previewAssignAgents` reports that the engine would
  accept its `assignAgents` with the whole selection. With an Agent on Contracting and an Agent on Standby selected,
  every button of Assign to is therefore disabled, Standby included, because the Agent on Standby already has that
  Assignment.
- **Options considered:** Following the example by leaving out of the action the selected Agents that already have the
  Assignment; following the rule of the Header and the engine's precondition.
- **Option chosen:** Following the rule of the Header and the engine's precondition.
- **Why:** The rule and the precondition are normative and agree with each other, and a button that sent a different
  list of Agents than the Player selected would hide what it does.
- **Links:** PROB-031

## DEC-051: Developer inspection leaves out the current Turn's Action record

- **Category:** Conflict resolution
- **Affected specifications:** WHIST, Action record, Kept during the Turn; DEV, full Campaign state inspection.
- **Description:** The Action record of the current Turn is kept in World history as `currentActions`, which undo,
  redo, and load restore with the rest of the World state, but no query returns it, not even Developer
  inspection. Every History entry's Action record is returned in full by `getHistory()` and by inspection.
- **Options considered:** Inspection returning it as part of full Campaign state; no query returning it.
- **Option chosen:** No query returning it.
- **Why:** WHIST states the exception specifically, and the same Player actions are already visible to the Session
  controller through the Timeline.
- **Superseded:** Specification revision e8c0df392d633573975c72dd71f2dc4be1447718 drops the exception (WHIST, Open
  History entry): `getHistory()` returns the current Turn's Action record in its `openEntry`, and Developer inspection
  returned it as `currentActions` of World history. Since specification revision
  44c112e3731ec5d173c4eddb7956c4a46dbf46c5 the Action record of the current Turn is read off the Timeline, so
  Developer inspection returns it as the Player actions of the Timeline entries up to the Timeline pointer, under
  DEC-019.
- **Links:** PROB-032

## DEC-052: Stale examples yield to the rules they illustrate

- **Category:** Conflict resolution
- **Affected specifications:** AGENT, Acceptance examples, Assigning Agents; INVSTG, Abandonment; AGENT, Agents that
  can be assigned.
- **Description:** `assignAgents([a1, a5], Training)` with a5 already on Training is rejected with the error of
  precondition 6, `already_assigned`, the first failed precondition in the order AGENT lists them; the test checks a1's
  precondition 8, `agents_not_in_base`, with a1 alone. `assignAgents` to Contracting of an Agent on an Investigation is
  rejected, and the last members of two Investigations leave both in one Player action only when recalled to Standby.
- **Options considered:** Reporting the precondition the example names; reporting the first failed precondition in
  the listed order.
- **Option chosen:** Reporting the first failed precondition in the listed order.
- **Why:** The action is rejected as a whole either way, and the normative preconditions decide what is accepted.
- **Links:** PROB-033, PROB-034

## DEC-053: An excluded Track file is left out of the copy of the Soundtrack

- **Category:** Asked by the specifications
- **Affected specifications:** MUSIC, Soundtrack: a file "that the Excluded tracks section of the directory's
  `README.md` names" is not a Track "and it is never played". PLACE, Music in an Implementation: the Implementation
  holds "its own copy of every Track file".
- **Description:** A file the Excluded tracks section of `assets/music/README.md` in the Spec repo names, e.g.
  `GEO-3.opus`, is not copied into `assets/music/` of this repository, so `import.meta.glob` under DEC-048 never lists
  it. A Specification update that removes a file from that section copies it back.
- **Options considered:** Copying the README and leaving out the files it names at build time; leaving the excluded
  files out of the copy.
- **Option chosen:** Leaving the excluded files out of the copy.
- **Why:** The copy then holds exactly the Tracks, the Game build carries no file it never plays, and DEC-048 needs no
  list to read.
- **Superseded in part:** Specification revision c1ad3ed71949da59ac10f90795e852b2e0f27b2d moves the list of excluded
  files from the music README into the GDR `music` (MUSIC, Soundtrack). The Game build now reads that list and plays
  no file it names, through `isTrack` in `src/web/music.ts`, so a copied file the GDR excludes is never played. The
  copy still leaves out every excluded file that the Spec repo holds, so the Game build carries no file it never plays.
  Since Specification revision f629d129c47dfbaba5ae6540c73bf0e8fdd0b2cd, the Spec repo holds the Soundtrack in
  `assets/music/tracks/`, and the copy is in `assets/music/tracks/` of this repository.
- **Links:** None.

## DEC-054: `getHistory()` returns the Open History entry as `openEntry`

- **Category:** Asked by the specifications
- **Affected specifications:** WHIST, Current state, Turn report, and history: `getHistory()` returns "every History
  entry, in Turn order, from Turn 1, followed by the Open History entry".
- **Description:** `HistoryView` keeps `entries` for the History entries and adds `openEntry` for the Open History
  entry, which holds `turn`, `turnStart`, `turnEnd`, and `actions` like a History entry and has no `report`. It is
  derived on each query from `currentTurnStart`, `currentActions`, and the current state, never stored.
- **Options considered:** Appending the Open History entry to `entries`, with an optional `report`; a separate
  `openEntry` field after `entries`.
- **Option chosen:** A separate `openEntry` field.
- **Why:** Every History entry keeps its Turn report part, so code that reads `entries`, e.g. the Charts View, still
  reads only ended Turns, while the order the specification states is kept: `openEntry` is the Turn after the last of
  `entries`.
- **Links:** None.

## DEC-055: Acceptance examples run on a test Game build with Red Dawn only

- **Category:** Asked by the specifications
- **Affected specifications:** FACTION, LEAD, MISSION, PANIC, and TURN, Acceptance examples: each uses "a test Game
  build that supplies the Bootstrap GDRs without the FactionArchetypes `exalt` and `black_lotus` and their Leads".
- **Description:** `RED_DAWN_ONLY_FILES` in `tests/helpers/game.ts` is that test Game build, and also leaves out the
  Encyclopedia articles about the left-out GDRs, which COMP, Encyclopedia article GDR validation, would otherwise
  reject. The shared test catalog `gdrs` and `rawGdrs()` start from it. Tests of the Bootstrap GDRs themselves, e.g.
  BOOT and the COMP article count, and whole Campaigns played by the Basic Autopilot AI, use the full Bootstrap GDRs.
- **Options considered:** Rewriting every example test for three Factions; one test Game build shared by all of them.
- **Option chosen:** One shared test Game build.
- **Why:** It is the Game build the examples state, so their injected outcomes and values hold unchanged.
  Specification revision ebf476870dd65ea148ccf55ebef33d6cf57fc7ac deleted every Acceptance examples section; the
  tests written from them stay, as tests of the rules, on the same test Game build.
- **Links:** None.

## DEC-056: Decimal quantities are held in fields named for hundredths, and a Combat holds every Combatant in hundredths

- **Category:** Asked by the specifications
- **Affected specifications:** NUMBERS, Decimal quantities, which states only that a Decimal quantity is held as its
  whole number of hundredths and leaves the field layout to the implementer; AGENT, Agent properties and Exhaustion and Exact
  exhaustion; COMBAT, Combat report; ECON, Rate Upgrades; RECOVER, Turn report.
- **Description:** Every Decimal quantity is a JavaScript whole number of hundredths in a field whose name ends in
  `Hundredths`, e.g. an Agent's `skillHundredths`, `currentHealthHundredths`, and `exactExhaustionHundredths`, the
  Rate Upgrade rates of the Agency view, and every Upgrade's `incrementHundredths`, a Rate Upgrade's being a Decimal
  quantity and any other's a whole number times 100. An Agent's whole exhaustion is never stored; it is computed as
  `exhaustionOf`. A Combat reads and changes its Combatants in the hundredths form of an Agent: an Enemy's whole base
  skill, current health, and exhaustion are multiplied by 100 before the Combat and divided back into its stored
  whole values after it, which is exact because a Combat changes them only by whole numbers. The Combat report
  therefore holds base skill, current health, health removed, damage dealt, and damage taken in hundredths for both
  sides, and the whole exhaustion; the GUI shows each as a whole number, an Agent's rounded down, under GUI, Decimal quantities shown. The Save format
  number moved from 7 to 8, so a Save of the earlier format, which held these values in units, is rejected rather
  than misread.
- **Options considered:** Keeping the field names and changing their unit; fields named for hundredths. One Combat
  report field whose unit depends on the side; hundredths for both sides.
- **Option chosen:** Fields named for hundredths, and hundredths for both sides of a Combat report.
- **Why:** A field whose unit changed silently would be misread by any code not updated with it; the new names made
  every reader fail to compile until it was updated. One unit per Combat report field keeps the report uniform, and
  an Enemy's value in hundredths is still exactly its whole value.
- **Update:** Specification revision 9f17570197ece7aad7cfed35c432f25f581d8a2b made current health a Derived value:
  an Agent now stores `healthLostHundredths` and an Enemy `healthLost`, and a Combat holds an Agent, like an Enemy, in
  a copy with its current health, effective max health, and effective weapon damage, whose current health and Exact
  exhaustion are written back after it; see DEC-059.
- **Links:** Specification revision 349ab4a4b2d9527ce37d2261cc36cfb26bd3b724.

## DEC-057: Undo and redo are checked against the Current world state, not complete Campaign state

- **Category:** Conflict resolution
- **Affected specifications:** TIMELINE, Acceptance examples, Action undo and redo; CSTATE, Campaign state
  composition; TIMELINE, Action navigation.
- **Description:** The tests of undo and redo, e.g. the property test in `tests/engine/campaign.test.ts`, require
  that after each undo and redo the Current world state, the History, the Turn report, and the Campaign
  configuration equal those first reached there, and leave the rest of the Timeline, i.e. its Undone actions and
  its Timeline pointer, out of the comparison. Tests that compare two Campaigns played by the same Player actions
  still compare complete Campaign state, Timeline included.
- **Options considered:** Comparing complete Campaign state, which the rules make impossible after an undo; comparing
  what Returning to a World state guarantees.
- **Option chosen:** Comparing what Returning to a World state guarantees.
- **Why:** TIMELINE, Returning to a World state, states the guarantee, and an undo is defined to change the
  Timeline pointer, which complete Campaign state now holds.
- **Links:** PROB-035

## DEC-058: Where the Combat report and the Turn report hold Mission growth

- **Category:** Asked by the specifications
- **Affected specifications:** COMBAT, Combat report: "How the Turn report organizes its Combat reports is left to
  the implementation."; MISSION, Turn report; AGENT, Mission growth; TRVIEW, Combat report.
- **Description:** Each participant of a Combat report has a `combatSkillGain`: a whole number for an Agent, Killed
  or not, and `null` for an Enemy, which has none. Each Mission resolved in the Turn report has a `growth` list with
  one entry per survivor, in the order of its Current team, holding its survival skill gain, its Mission skill gain,
  and its base skill, in hundredths, and Experience after them; a Killed Agent has no entry. The Turn Report View's
  Skill gained column reads a survivor's Mission skill gain and survival skill gain from that list and its combat
  skill gain from the Combat report, and shows a Killed Agent's combat skill gain struck through. The Save format
  number moved from 8 to 9, because a Save of the earlier format holds Agents without Experience.
- **Options considered:** A separate growth record beside the Combat reports; the growth inside each Mission
  resolved, beside its Killed Agents and survivors.
- **Option chosen:** The growth inside each Mission resolved.
- **Why:** MISSION, Turn report, lists the gains with the rest of what resolving the Mission did, and the Combat
  report already holds the combat skill gain, so nothing is held twice.
- **Links:** Specification revision 7985a451a43f4fcaba960b80ca50d8d888cc9cd0.

## DEC-059: How the effective max health, current health, and effective weapon damage are held and reported

- **Category:** Asked by the specifications
- **Affected specifications:** AGENT, Effective max health and current health, Effective weapon damage, Agent
  properties, and Service record; COMBAT, Enemy properties and Combat report; ECON, Weapon damage Upgrade and Max
  health Upgrade; ENG, Derived value consistency, which leaves how a Derived value is computed to the implementer.
- **Description:** An Agent stores `healthLostHundredths`, `baseHealth`, `baseWeaponDamage`, and, once Terminated,
  `finalMaxHealth` and `finalWeaponDamage`; an Enemy stores `healthLost` and `baseWeaponDamage`. No Upgrade purchase
  changes an Agent: the effective max health, current health, and effective weapon damage are computed from the
  Upgrade bonus of the World state each time a rule or a view reads them, by `effectiveMaxHealth`,
  `agentCurrentHealthHundredths`, and `effectiveWeaponDamage`. A rule that changes current health, i.e. a Combat or
  Agent recovery, changes the health lost by the opposite amount. The Agent view reports `currentHealthHundredths`,
  `healthLostHundredths`, `baseHealth`, `effectiveMaxHealth`, `baseWeaponDamage`, `effectiveWeaponDamage`,
  `finalMaxHealth`, and `finalWeaponDamage`; a Combat report participant's starting values hold `maxHealth`, the
  effective max health, and `weaponDamage`, the effective weapon damage. The Agents View shows the effective max
  health under current health and in the Memorial, and the effective weapon damage in the Damage column and the
  Agent details. The Save format number moved from 9 to 10, because a Save of the earlier format holds current
  health and upgraded base values instead of health lost.
- **Options considered:** Keeping current health stored and moving it with each purchase; storing health lost and
  deriving the rest. Naming the Agent view fields for the effective values; reusing the old field names with the
  new meaning.
- **Option chosen:** Storing health lost and deriving the rest, with fields named for the effective values.
- **Why:** The specifications make health lost the stored value and require that buying an Upgrade rewrites no
  Agent value; a field whose meaning changed under an old name would be misread by code not updated with it.
- **Links:** Specification revision 9f17570197ece7aad7cfed35c432f25f581d8a2b.

## DEC-060: The Basic Autopilot AI reads a Lead's place in its Faction's chain from the Turns of discovery

- **Category:** Conflict resolution
- **Affected specifications:** BASICAI, Keep Mission sites coming: "the one with the longest chain of discovered Leads
  behind it, each creating the MissionSiteArchetype a prerequisite of the next names." LEAD, Player-visible
  information: "The `discovered_when` of any Lead, and whether it or any part of it holds | No".
- **Description:** Behind a discovered Lead are the discovered Leads of the same Faction that were discovered in an
  earlier Turn, as the History entries' Leads discovered report it; a Lead discovered at campaign creation counts as
  discovered before the first Turn. The Basic Autopilot AI sorts by that count, most first, after the Leads whose Won
  Mission site makes a Faction Eliminated. Equal Leads keep the order Player API lists them in.
- **Options considered:** Reading `discovered_when` from the GDRs; counting Won Missions against the Faction; the
  order of discovery from History.
- **Option chosen:** The order of discovery from History.
- **Why:** An Autopilot AI sees only Player API, and what discovers a Lead is not Player-visible, while the Turn in
  which each Lead was discovered is; with the Bootstrap GDRs it orders each Faction's Leads exactly as the chain of
  prerequisites did.
- **Links:** PROB-037, DEC-036

## DEC-061: Stale mentions of Lead prerequisites are read as the Lead's `discovered_when`

- **Category:** Conflict resolution
- **Affected specifications:** BOOT, Leads: "it has no prerequisites and creates `apprehend_member`" and "names its
  prerequisite Leads"; MECH, Leads and Progression: "It owns what a Lead describes, Lead prerequisites, Lead
  availability"; DOM, Glossary, Lead availability: "as far as its prerequisites, its own earlier results, and its
  Faction allow".
- **Description:** Wherever a specification still speaks of a Lead's prerequisites, the Implementation reads it as
  the Condition `discovered_when` of LEAD, Lead discovery, and implements only LEAD's rules.
- **Options considered:** Reading prerequisites as `discovered_when`; keeping a prerequisite concept of its own.
- **Option chosen:** Reading prerequisites as `discovered_when`.
- **Why:** LEAD owns Lead discovery and no longer defines prerequisites, so the other mentions only lag behind it.
- **Links:** PROB-038

## DEC-062: How the set of discovered Leads and the Investigations interrupted are held and ordered

- **Category:** Gap resolution
- **Affected specifications:** LEAD, Lead discovery: "Which Leads are discovered is a Campaign-wide Authoritative
  value: the set of discovered Leads, each by its GDR identifier." INVSTG, Turn report: "The Turn report also holds
  the Investigations interrupted in that Advance turn ... each by its Instance ID with its Lead".
- **Description:** World state holds `discoveredLeads`, a list of Lead GDR identifiers in the order the Leads were
  discovered and, among Leads discovered in one World state, in Game build order, as DEC-035 orders them in the Turn
  report. It is evaluated after campaign creation, after each accepted Player action, and once at the end of each
  Advance turn. The Turn report and the History entry list the Investigations interrupted in the order of their
  Instance IDs, as `investigationsInterrupted` with each Investigation's Lead. The Save format number moved from 10
  to 11, because a Save of the earlier format has no set of discovered Leads.
- **Options considered:** A list in discovery order; a list in Game build order; a map from Lead to its Turn of
  discovery. For the interrupted Investigations: Instance ID order; Campaign state order.
- **Option chosen:** A list in discovery order; Instance ID order.
- **Why:** The set needs an order to be stored deterministically, and the discovery order adds nothing that History
  does not already show; Instance ID order is the order every other Investigation list of the Turn report uses.
- **Links:** PROB-039, DEC-035, Specification revision ef44fdc642094f1b969d5e7ea048ccf6019bee60.
