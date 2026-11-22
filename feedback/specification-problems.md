# Specification problems

## PROB-001: No upper bound on stored quantities

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** NUMBERS, Exact evaluation: "The size of a result has no limit. An implementation must
  compute exactly for every value that can arise in a Campaign." NUMBERS, Whole-number quantities: "its size is
  limited only by a range stated for its quantity."
- **Description:** No Mechanics specification states an upper bound for stored quantities such as money, funding, or
  skill, and the Player cheat action `addMoney(amount)` accepts any amount. Which values "can arise in a Campaign" is
  therefore unbounded, and no specification says whether an implementation may reject a Player action that would take
  a stored quantity beyond a large bound.
- **Links:** DEC-004
- **Resolution:** Open

## PROB-002: No inventory of Global configuration settings

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** CONFIG, Global configuration: "Interface preferences belong to Global configuration,
  e.g. volume, language, and tutorial popups."
- **Description:** `session.globalConfiguration.get()` must report every Global configuration setting, but no
  specification lists the settings a Game build has, their permitted values, or their Game build defaults, other than
  the Autosave limit.
- **Links:** DEC-011
- **Resolution:** Resolved in 890f1d38103fc5c1936772264d6dfc49d4948d88, which the Implementation follows since this update: CONFIG, Global configuration, lists every setting, as DEC-011 chose.

## PROB-003: Execution budget of an Autopilot AI is a TODO

- **Category:** Needed TODO
- **Severity:** Medium
- **Affected specifications:** AUTO, TODOs: "TODO: Choose the exact limits of the finite execution budget of an
  Autopilot AI."
- **Description:** Disengaging as AI failed needs the limits of the budget, which the specification leaves open.
- **Links:** DEC-012
- **Resolution:** Open

## PROB-004: Changing Campaign configuration during play has no operation

- **Category:** Needed TODO
- **Severity:** Medium
- **Affected specifications:** CONFIG, TODOs: "TODO: Define the inventory of Campaign configuration values that are
  adjustable during play ... and the Engine API operations that change them." and "TODO: Define the public Player action
  and report signatures for Changing Campaign configuration during play."
- **Description:** The rules for changing Campaign configuration during play are stated, but no value is adjustable
  and no operation is named, so an implementer cannot tell whether to expose an operation.
- **Links:** DEC-013
- **Resolution:** Resolved in 44c112e3731ec5d173c4eddb7956c4a46dbf46c5, which the Implementation follows since this
  update: CONFIG, Changing Campaign configuration during play, now names `session.campaignConfiguration.set(values)` as
  the one operation, a Session API operation rather than a Player action, so the implementer knows to expose it.
  Which values are adjustable during play and what the operation reports remain TODOs, which DEC-013 settles.

## PROB-005: GDR identifier format and YAML property naming are TODOs

- **Category:** Needed TODO
- **Severity:** Medium
- **Affected specifications:** GDR, TODOs: "TODO: Decide the GDR identifier format: the permitted characters and
  casing of a GDR identifier, and the scope within which it is unique." and "TODO: Decide the YAML property naming:
  how a GDR states its identifier and its Type, and the casing of property names."
- **Description:** Validating and resolving GDR references needs the identifier format and its uniqueness scope, and
  reading the YAML files needs the property naming; both are left open.
- **Links:** DEC-014
- **Resolution:** Open

## PROB-006: No query returns retained Campaign instances, Turn series, or GDR properties

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** WHIST, Current state, Turn report, and history: "`getCurrentState()` returns nothing
  that is retained only in World history" and `getHistory()` returns "The Player-visible information of every History
  entry". AGENT, Player-visible information: "for every Agent whatever its Agent status". MISSION, Player-visible
  information: "for every Mission site and every Mission whatever its lifecycle state". WHIST, Turn series: "Player
  API returns a Player-visible Turn series in full". COMBAT, Player-visible information: "Every property of each
  EnemyArchetype, Weapon, and CombatParameters GDR".
- **Description:** The three queries are stated to be complete, but none of them is stated to return the
  Player-visible information of Campaign instances retained in World history, e.g. a Killed Agent or a Won Mission, of a Turn series, or of the GDR properties that several specifications declare
  Player-visible. No specification says which query returns them.
- **Links:** DEC-015
- **Resolution:** Open. Resolved in part in 163e921efbabf3bdaca1724eb1fa2a180644b6bd: WHIST, Current state, Turn report, and history now says
  that `getHistory()` returns every Retired Campaign instance. Which query returns a Turn series and the GDR
  properties is still not stated.

## PROB-007: Contents of the Turn report and of a History entry are a TODO

- **Category:** Needed TODO
- **Severity:** High
- **Affected specifications:** DOM, TODOs: "TODO: State what the Turn report and each History entry hold of each
  value the Mechanics specifications own, including the reduced form of a Combat report that a History entry keeps".
- **Description:** Only the Combat report is specified as part of the Turn report. What else the Turn report holds,
  and what the reduced form in a History entry holds, is left open.
- **Links:** DEC-016
- **Resolution:** Resolved in cc4d6a246a64d200440eec6f09cf4d953e0724c9, which the Implementation follows since this
  update: a Turn report section in each of ECON, AGENT, RECOVER, INVSTG, MISSION, COMBAT, FACTION, and PANIC now
  states what the Turn report and the History entry hold of its values, taken from DEC-016, and the DOM TODO is gone.
  The only change it needed was listing Forced returns in Agent order. Earlier,
  59ccadfc6728d372f5eadb01026ff2d22256c11e had added the Action record under WHIST and ECON.

## PROB-008: An Attempted Mission site is final yet still takes part in a Combat

- **Category:** Conflict
- **Severity:** High
- **Affected specifications:** MISSION, Mission site properties: "A Mission site in a final state no longer
  participates in current gameplay and is retained in World history". MISSION, Mission site lifecycle: "Attempted,
  Expired, and Cancelled are final." MISSION, Resolving one Mission: "its Enemies' side is S's Enemies list".
- **Description:** A Mission site is Attempted, a final state, from the moment Agents are deployed to it, yet its
  Enemies fight the Combat of its Deployed Mission in the next Advance turn and its Mission is in Current world
  state. Under the first statement `getCurrentState()` would not return the Mission site of a Deployed Mission.
- **Links:** DEC-017
- **Resolution:** Resolved in 6fa83779f89dbd769da1a3193a3c8248d9483156, which the Implementation follows since this update.

## PROB-009: Developer Access is a Stub

- **Category:** Needed TODO
- **Severity:** Medium
- **Affected specifications:** DEV, TODOs: "TODO: Specify ... the complete detached, read-only Campaign state query
  schema", "TODO: Specify the override operations under Random outcome overrides: how a random outcome is identified,
  validation that the supplied value is one of its possible values, whether an override applies once or until
  cleared, what happens to an override whose random outcome is never decided, and whether a pending override is
  visible through inspection", and "TODO: Specify inspection and cheat errors with Dev mode disabled, during an
  Autopilot engagement, or with stale access".
- **Description:** Full Campaign state inspection and random outcome overrides are required, but their result shape,
  operations, validation, and errors are left open.
- **Links:** DEC-019, DEC-020
- **Resolution:** Open

## PROB-010: The Type CampaignConfiguration has no property table

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** CONFIG, Campaign configuration presets: "Each preset is one GDR ... and supplies a
  value for every Campaign configuration value." ECON, Campaign configuration values: "Each Campaign configuration
  preset supplies both, as the properties named below." CONFIG, Preset selection and edits:
  "`session.newCampaignSetup.listPresets()` Reports every preset the Game build supplies".
- **Description:** No specification states the exhaustive properties of the Type CampaignConfiguration, as the other
  GDR Types have, or a display name for a preset, so it is open whether a property other than `starting_money` and
  `starting_funding` is valid and what an interface shows as the name of a preset.
- **Links:** DEC-022
- **Resolution:** Resolved in 890f1d38103fc5c1936772264d6dfc49d4948d88, which the Implementation follows since this update: CONFIG, CampaignConfiguration, states exact properties and a `name`, which presets now show.

## PROB-011: Whether the Agent reserve may be deployed

- **Category:** Conflict
- **Severity:** High
- **Affected specifications:** BASICAI, Glossary: "The share of the roster that the Basic Autopilot AI keeps as Rested
  Agents rather than assigning, so that it can still react to an urgent Mission site." BASICAI, Goals, Keep Agents
  fit: "Only Rested Agents receive new work, and the Agent reserve stays untouched, except for urgent income."
- **Description:** The Glossary says the Agent reserve exists to react to an urgent Mission site, and the goal says
  that only urgent income may touch it. Both cannot hold when a team for an urgent Mission site needs Agents of the
  Agent reserve.
- **Links:** DEC-024
- **Resolution:** Resolved in e62a195798946a3cc8e054784a7c4255da548aa7, which the Implementation follows since this update: BASICAI lets a deployment to any Mission site draw on the Agent reserve.

## PROB-012: A new or closed Campaign has no Campaign save, yet always has a Current Autosave

- **Category:** Conflict
- **Severity:** High
- **Affected specifications:** LIFE, Campaign selection: "no Campaign save, so the Session has no Current save".
  LIFE, Acceptance examples, Closing does not save: "No Campaign save exists afterwards". SAVES, Autosaves: "When a
  Campaign is created or loaded, and whenever what a Campaign save holds changes for the Current campaign". SAVES,
  Glossary: "kept up to date at all times so that play can resume after the Session ends for whatever reason".
- **Description:** An Autosave is a Campaign save, and SAVES requires the Current Autosave to be written when a
  Campaign is created and after every change. LIFE states that a new Campaign has no Campaign save and that none
  exists after creating a Campaign, committing an action, and closing it.
- **Links:** DEC-025
- **Resolution:** Resolved in 6fa83779f89dbd769da1a3193a3c8248d9483156, which the Implementation follows since this update.

## PROB-013: No way for an interface to learn that the World state changed

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** ENG, API hierarchy: "The complete namespace inventory is `session`, `player`, and
  `developer`." AUTO, Autopilot lifecycle and concurrency: "Autopilot disengages as AI failed
  when the Autopilot AI reports an error, produces no valid action, or exhausts its configured finite execution
  budget."
- **Description:** During an Autopilot engagement the Autopilot AI commits Player actions and the engagement can end
  without any call from the Session controller. No operation of the namespaces tells an interface that
  something a query reports has changed, so an interface cannot show the progress of an engagement except by asking
  again and again.
- **Links:** DEC-026
- **Resolution:** Open

## PROB-014: The physical layout of Game storage is a TODO

- **Category:** Needed TODO
- **Severity:** Medium
- **Affected specifications:** SCHEMA, TODOs: "Describe one physical layout covering every part of Game storage".
- **Description:** Storing the Global configuration and the Campaign saves needs a physical layout, in files for the
  terminal CLI and in the browser for the web UI, and the document leaves it open.
- **Links:** DEC-023
- **Resolution:** Open

## PROB-015: Turn Advancement and Agents disagree on where an Agent on Recovery arrives

- **Category:** Conflict
- **Severity:** Critical
- **Affected specifications:** TURN, The steps, step 1 Transit: "The Agent becomes At assignment and keeps its
  Assignment." AGENT, Transit rule: "becomes At assignment in the Transit step of that Advance turn, or Recovering
  when its Assignment is Recovery."
- **Description:** An Agent whose Assignment is Recovery and that is In transit arrives in the Transit step. Turn
  Advancement says it becomes At assignment, while Agents says it becomes Recovering, and the invariant of Agent status
  requires an Agent whose Assignment is Recovery and that is not In transit to be Recovering.
- **Links:** DEC-033
- **Resolution:** Resolved in 6fa83779f89dbd769da1a3193a3c8248d9483156, which the Implementation follows since this update.

## PROB-016: How the Command-Line Interface names operations and chooses its Output form is a TODO

- **Category:** Needed TODO
- **Severity:** Medium
- **Affected specifications:** CLI, TODOs: "TODO: State how the CLI names operations and their arguments, and how a
  caller discovers the available ones" and "TODO: State how a caller chooses between readable and structured output,
  and what the structured output looks like".
- **Description:** A CLI needs command names, argument syntax, a way to list the commands, a way to choose the Output
  form, and a format for structured output, and the specification leaves all of them open.
- **Links:** DEC-027
- **Resolution:** Open

## PROB-017: What the Main menu and the Campaign screens of the Graphical User Interface show is a TODO

- **Category:** Needed TODO
- **Severity:** High
- **Affected specifications:** MENU, TODOs: "TODO: State what the Main menu offers by default". CSCR, TODOs: "TODO:
  State how the Campaign screen reaches Advance turn, Timeline navigation, saving, and Autopilot, each through the
  operations that API hierarchy names". Specification commit e19a220aa261bbcbaecbe0725bedda08f655a2ee lists the Detail views of
  the Campaign screen, which settles the earlier CSCR TODO on the other screens, but these two TODOs remain.
- **Description:** A GUI needs screens for the Main menu and for playing a Campaign, and a way to reach Advance turn,
  Timeline navigation, saving, and Autopilot. The specification states only that the GUI opens at the Main menu and
  leaves the rest open.
- **Links:** DEC-007
- **Resolution:** Resolved in 91fc82bff04323b75d171653db7f0f63f7449f73, which the Implementation follows since this
  update: CSCR, Status bar controls and Autopilot controls now state the status bar's controls and the Autopilot
  footer, and MENU, New Campaign states the New Campaign panel and that everything the Main menu offers is on it at
  once. The Implementation already matched them, except that the Autopilot AI selector is now disabled, with the
  reason as its tooltip, whenever the engaging buttons are, and a Preset edit the engine rejects shows the reason in
  its field instead of only in a notice. Earlier, ddfc832151b01718f269431459ea7597f379a2d7 had settled Timeline
  navigation, Resume, and the close button.

## PROB-018: The light theme's Design tokens are a TODO

- **Category:** Needed TODO
- **Severity:** High
- **Affected specifications:** VIS, TODOs: "TODO: Define the light theme's Design tokens under Colours, since the
  Settings panel lets the Player choose a light theme". VIS, Design tokens: "a screen uses these values and no other
  colours, fonts, or radii".
- **Description:** The Settings panel offers a light theme, but VIS defines only dark colour values, so a light theme
  must use colours that no specification states.
- **Links:** DEC-034
- **Resolution:** Resolved in 741432de4c8152c73ac65baeda155412f847b01c, which the Implementation follows since this
  update: VIS, Design tokens now makes a light theme, and any setting that switches themes, out of scope, so the
  Implementation removed its light theme and its Theme setting.

## PROB-019: Determinism and Randomness leaves the Instance ID format free, Campaign Instances fixes it

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** DETERM, Unique identifiers: "The format of every identifier is the Implementer's
  choice." CINST, Campaign instance identity: "It is the Type's name in lowercase with each space replaced by a hyphen,
  then a hyphen, then a number."
- **Description:** An Instance ID is a Campaign-scoped identifier, so DETERM leaves its format to the Implementer
  while CINST states it exactly.
- **Links:** DEC-006
- **Resolution:** Resolved in 1d687e0d80958e13831a8689e2db9c14ceb66143, which the Implementation follows since this
  update: DETERM, Unique identifiers now leaves only the format of an Independent identifier to the Implementer and
  has the specification that introduces a Campaign-scoped identifier state its format and sequence, as CINST does
  for an Instance ID. The Implementation already followed CINST under DEC-006, so nothing changed.

## PROB-020: The order of the Leads discovered in an Advance turn is unstated

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** LEAD, Turn report: "holds the Leads discovered in it: every Lead that is discovered in
  the World state that Advance turn commits and is not discovered in the World state before it, each by its
  GDR identifier."
- **Description:** The list is Player-visible information and one Advance turn can discover several Leads, but no
  order is stated, so two Implementations can report the same Turn differently.
- **Links:** DEC-035
- **Resolution:** Resolved in 890f1d38103fc5c1936772264d6dfc49d4948d88, which the Implementation follows since this update: LEAD, Turn report, lists the Leads discovered in the authored order of the Lead GDRs.

## PROB-021: How far along its Faction's chain a Lead is, is not exactly defined

- **Category:** Implicit gap
- **Severity:** High
- **Affected specifications:** BASICAI, Keep Mission sites coming: "then the one furthest along its Faction's chain,
  i.e. the one with the longest chain of discovered Leads behind it, each creating the MissionSiteArchetype a
  prerequisite of the next names."
- **Description:** It is open whether the chain counts the Lead itself, whether Leads of other Factions count, how a
  Lead with several prerequisites is measured, and how equal Leads are ordered.
- **Links:** DEC-036
- **Resolution:** Resolved in e62a195798946a3cc8e054784a7c4255da548aa7, which the Implementation follows since this update: BASICAI, Information, measures the chain by the Leads discovered in an earlier Turn.

## PROB-022: Two Acceptance examples still put an Agent assigned from Standby to Training In transit

- **Category:** Conflict
- **Severity:** Medium
- **Affected specifications:** AGENT, Transit rule: "Every new Assignment starts In transit, with four exceptions:
  ... an Agent moved from one Base Assignment to the other is At assignment at once". ECON, Acceptance examples, The
  first three Advance turns: "The player calls `assignAgents([a1, a2], Contracting)` and
  `assignAgents([a3], Training)`; a4 stays on Standby. a1, a2, and a3 are In transit". TURN, Acceptance examples, The
  first two Advance turns of a Campaign: "`assignAgents([a3], Training)` ... a1 to a4 are In transit", step 1 Transit "a1, a2, a3, and
  a4 arrive", and step 4 Training "a3 arrived in step 1 and has no Training gain outcome; base skill 100."
- **Description:** a3 starts the Campaign on Standby, At assignment, so under the Transit rule its move to Training
  is At assignment at once and it gains base skill in the first Advance turn. The two examples were written when every
  assignment other than deployment started In transit, and still have a3 arrive in the first Advance turn and gain
  nothing in it. Specification commit e10913ff6cb326b4834eaa45c02d71ce5cbebf92 rewrote the TURN example for work
  exhaustion and the Training gain outcome but kept a3's arrival in the first Advance turn, so the conflict remains;
  under the Transit rule a3 also gains 1 exhaustion in each of the two Advance turns, not only in the second.
- **Links:** DEC-037
- **Resolution:** Resolved in 4401e7860e3e0ecdb7bd3d6eae87e7bb8e0fa8ac, which the Implementation follows since this
  update: both Acceptance examples were deleted, so only the Transit rule remains.

## PROB-023: The Bootstrap AgentParameters YAML file does not match the AgentParameters the specifications require

- **Category:** Conflict
- **Severity:** Critical
- **Affected specifications:** AGENT, AgentParameters: "The table below is exhaustive apart from `id` and `type`",
  listing `exhaustion_incapacitation`, `exhaustion_per_mission`, `exhaustion_per_pct_killed`,
  `exhaustion_per_contracting_turn`, `exhaustion_per_training_turn`, `exhaustion_per_investigation_turn`,
  `exhaustion_work_start_max`, and `exhaustion_work_limit`, and no `exhaustion_cap`. AGENT, Agent GDR validation:
  "no listed property is missing and no other property is present." AGENT, Acceptance examples: "All examples use the
  Bootstrap GDR values from ... `content/agents/agent_parameters.yaml`", whose values they read as
  "`exhaustion_incapacitation` 100; `exhaustion_free_points` 30; ... `exhaustion_work_start_max` 30;
  `exhaustion_work_limit` 70". BOOT, Values that differ from game-ts: "`exhaustion_free_points` | 5 | 30". BOOT, Agents
  GDRs: `agent_parameters` supplies "the exhaustion at which a Combatant is Incapacitated, ... the most exhaustion at
  which an Agent can start work and the exhaustion that ends its work".
- **Description:** At specification commit e10913ff6cb326b4834eaa45c02d71ce5cbebf92, the Bootstrap GDR file
  `content/agents/agent_parameters.yaml` of the specifications still has `exhaustion_cap` 100 and
  `exhaustion_free_points` 5 and lacks the seven new properties, so a Game build that copies it fails Agent GDR
  validation, and its values contradict every Acceptance example that reads `agent_parameters`. The values the
  specifications intend are stated only in the Acceptance examples' tables of values read.
- **Links:** DEC-038
- **Resolution:** Resolved in 91fc82bff04323b75d171653db7f0f63f7449f73, which the Implementation follows since this
  update: the Bootstrap `content/agents/agent_parameters.yaml` now has exactly the AgentParameters properties, with the
  values DEC-038 chose, so the Implementation copies the specifications' file again.

## PROB-024: Where the Campaign screen details each item a Situation panel row shows is not yet specified

- **Category:** Needed TODO
- **Severity:** High
- **Affected specifications:** GUI, Situation panel: "Selecting a row shows that item where the Campaign screen
  details it, e.g. a Mission site row shows that Mission site." GUI, TODOs: "Complete the section Campaign screen: list
  the other screens and tabs the Player needs while a Campaign is current" and "Write the part of the section Campaign
  screen on operations: state how the GUI reaches Advance turn".
- **Description:** The Campaign screen's other screens and tabs are a TODO, so no specification says where the
  Campaign screen details an Active Investigation, a Lead, the free Training places, or the Agents on Standby, nor
  whether an Advance turn moves the Player to another part of the screen.
- **Links:** DEC-041
- **Resolution:** Resolved in e19a220aa261bbcbaecbe0725bedda08f655a2ee, which the Implementation follows since this update: SITP, Groups now says
  that selecting an item opens the Detail view that details it with that item selected, and CSCR, Detail views lists
  every Detail view of the Campaign screen.

## PROB-025: How a Progress bar draws Investigation progress beyond the greatest value of the range is not stated

- **Category:** Implicit gap
- **Severity:** High
- **Affected specifications:** GUI, Progress bar: "the bar spans 0 to the greatest value of the Lead's Required
  progress range ... The fill runs from 0 to the Investigation progress." VIS, Progress bars: "its colour runs linearly
  from Accent dim at 0 to Accent at the Required progress ... and stays Accent beyond it."
- **Description:** A Progress gain can carry Investigation progress past the greatest value of the Required progress
  range, e.g. a final Investigation progress of 4.60 on a bar that spans 0 to 4, and the progress before the last
  Advance turn can lie anywhere below it. No specification says how the fill, the preview segment, and the completion
  mark are drawn past the bar's end, nor what happens when the labels under the bar fall on one another, e.g. a final
  Investigation progress equal to the Required progress.
- **Links:** DEC-042
- **Resolution:** Resolved in 91fc82bff04323b75d171653db7f0f63f7449f73, which the Implementation follows since this
  update: GUI, Progress bar now clamps a preview segment, gain segment, or completion mark to the bar's end, as DEC-042
  chose, and VIS, Progress bars leaves out the value of the range, the Required progress or the greatest value, that
  the final Investigation progress would overlap. The Implementation now also leaves out the greatest value.

## PROB-026: Which Autosave navigation loads when two targets hold the same World state

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** TIMELINE, Autosave navigation: "Loads the target holding the earliest World state
  that is later than the Current world state." SAVES, Autosaves: Disengagement Autosave, "The World state in
  which the Autopilot engagement ended".
- **Description:** The new Disengagement Autosave can hold the same World state as the Return Autosave, or as the
  Engagement Autosave when the Autopilot AI committed nothing, and nothing says which of two such targets
  `redoToAutosave()` and `undoToAutosave()` load. They differ in their Timeline and Autopilot memory.
- **Links:** DEC-044
- **Resolution:** Resolved in ef784eef02d431975327f0a09fd25cebb3e52659, which the Implementation follows since this update: TIMELINE,
  Autosave navigation, Equal targets, now loads the Return Autosave when it is one of two targets holding equal
  World states, as DEC-044 chose, and leaves the choice between two other such targets to the Implementer.

## PROB-027: The Main menu cannot tell which Campaign save is the most recent

- **Category:** Implicit gap
- **Severity:** High
- **Affected specifications:** MENU, Layout: "The card of the Campaign of the most recent Campaign save has the Accent
  top edge." SAVES, Listing Campaign saves: "For each Campaign save it reports at least".
- **Description:** `session.saves.list()` reports no time at which a Campaign save was written, and no order, so a
  user interface cannot find the most recent Campaign save.
- **Links:** DEC-007
- **Resolution:** Resolved in ef784eef02d431975327f0a09fd25cebb3e52659, which the Implementation follows since this update: SAVES, Campaign
  save contents and Listing Campaign saves, now say that a Campaign save holds, and the list reports, the time it was
  last written, so the Main menu gives the Accent top edge to the Campaign of the most recent Campaign save.

## PROB-028: A Compendium article's `subject` and its Placeholders do not say which Type their GDR is of

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** COMP, CompendiumArticle: "`subject` | Only for a Subject article, and required: the
  identifier of the GDR the article is about". COMP, Compendium article GDR validation: "Subject exists: A `subject`
  identifies a GDR of the Game build whose Type is not CompendiumArticle and that has a `name` that is non-empty
  text." COMP, Placeholders: "`{gdr_id.property}` | The value of the property `property` of the GDR whose identifier
  is `gdr_id`." GDR identifiers are unique only within a Type (DEC-014).
- **Description:** Two GDRs of different Types may share an identifier, so a `subject` or the `gdr_id` of a
  Placeholder may identify more than one GDR, and then neither the article's subject, its visibility under COMP,
  Article visibility, nor the value the Placeholder shows is defined. Specification revision
  3fd37d181b3675d4ca0bef981cb8c3ab43b35ff4 renamed the Type to CompendiumArticle and added Placeholders, which meet
  the same gap; BOOT, Compendium GDRs, now says of the Bootstrap article identifiers only that "no article's identifier
  equals that of another GDR".
- **Links:** DEC-045
- **Resolution:** Open

## PROB-029: No query tells the Agents View whether `assignAgents` would succeed

- **Category:** Implicit gap
- **Severity:** High
- **Affected specifications:** AVIEW, Header: "A button is enabled only when pressing it would succeed with the
  current selection" and "It would succeed when the engine would accept the Player action it makes". AVIEW, Agent
  filters: each Assign to toggle shows "the Serving Agents that the button would succeed with if that Agent alone
  were selected". WHIST, Current state, Turn report, and history: the three queries are stated to be complete.
- **Description:** The Agents View must know, before the Player presses a button, whether the engine would accept
  `assignAgents` with the selected Agents, and with each Agent alone, but no query is specified that reports it. An
  interface can only repeat the preconditions of Assigning Agents itself.
- **Links:** DEC-046
- **Resolution:** Resolved in e62a195798946a3cc8e054784a7c4255da548aa7, which the Implementation follows since this update: PAPI, Action preview, adds `player.queries.previewAction(action)`.

## PROB-030: Whether re-routing an Agent In transit needs the confirmation of interrupted Assignments

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** GUI, Confirming interrupted Assignments: "Before it makes any Player action that changes
  the Assignment of an Agent on Contracting or an Investigation, whatever the new Assignment, the GUI asks the Player to
  confirm". AGENT, Transit rule, Re-routing: an Agent given a new Assignment while In transit "arrives under statement 2
  exactly when it would have arrived at the old one".
- **Description:** An Agent In transit to Contracting or an Investigation now can be assigned elsewhere, e.g. from the
  Leads View, and its Assignment is Contracting or an Investigation, so the wording asks for a confirmation. The
  confirmation exists because the order interrupts work and costs an Advance turn In transit, and re-routing does
  neither.
- **Links:** DEC-047
- **Resolution:** Resolved in 0558ca9bc3c3126195925e66217f6d6174f6b368: AGENT, Transit rule, No orders in transit
  replaced Re-routing, so an Agent In transit cannot be assigned at all, and the GUI lost Confirming interrupted
  Assignments, since Undo Action takes an order back.

## PROB-031: The Agents View Header example enables Standby for a selection with an Agent already on Standby

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** AVIEW, Header: "A button is enabled only when pressing it would succeed with the
  current selection" and "E.g., with agent-1 on Contracting and agent-5 on Standby selected, only Standby is enabled".
  AGENT, Assigning Agents, precondition 6: the action is rejected, as a whole, when "An Agent in `agents` already has
  `assignment` as its Assignment."
- **Description:** With agent-5 on Standby among the selected Agents, `assignAgents` to Standby is rejected as a whole
  under precondition 6, so the rule of the Header disables Standby too, and every button of Assign to is disabled. The
  example says Standby is enabled.
- **Links:** DEC-050
- **Resolution:** Open

## PROB-032: Developer inspection and the Action record of the current Turn

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** WHIST, Action record, Kept during the Turn: "No query returns the Action record of the
  current Turn." DEV: Developer API offers full Campaign state inspection.
- **Description:** The Action record of the current Turn is Campaign state in World history, which full inspection
  would return, while WHIST says no query returns it.
- **Links:** DEC-051
- **Resolution:** Resolved in e8c0df392d633573975c72dd71f2dc4be1447718, which the Implementation follows since this
  update: WHIST, Action record, Kept during the Turn now says the Action record of the current Turn is that of the Open
  History entry, which `getHistory()` returns in full, and the exception is gone.

## PROB-033: An Assigning Agents example gives a reason that another failed precondition shadows

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** AGENT, Acceptance examples, Assigning Agents: "`assignAgents([a1, a5], Training)` |
  Rejected: a1 is on Contracting, an Away Assignment, which it can leave only for Standby. a5 is not changed either."
  AGENT, Assigning Agents, precondition 6: rejected when "An Agent in `agents` already has `assignment` as its
  Assignment."
- **Description:** In that example a5 is on Training, so precondition 6 fails too, and the example names only a1's
  failed precondition 8 as the reason. Which failed precondition the error names is not stated, so the example reads as
  if a5 were acceptable on its own; an Agent on Standby in its place would show precondition 8 alone.
- **Links:** DEC-052
- **Resolution:** Resolved in ebf476870dd65ea148ccf55ebef33d6cf57fc7ac, which the Implementation follows since this
  update: every Acceptance examples section was deleted, so only the preconditions of Assigning Agents remain. The
  Implementation still reports the first failed precondition, under DEC-052.

## PROB-034: Abandonment still gives an example of assigning Investigation members to Contracting

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** INVSTG, Abandonment: "e.g. an `assignAgents` action that assigns the last member of
  each of two Investigations to Contracting." AGENT, Agents that can be assigned, From away: an Agent on an Away
  Assignment "can only be recalled, i.e. assigned to Standby."
- **Description:** An Agent on an Investigation can no longer be assigned to Contracting, so the example describes an
  action the engine rejects; with Standby in its place it holds.
- **Links:** DEC-052
- **Resolution:** Open

## PROB-035: The Action undo and redo example still compares complete Campaign state

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** TIMELINE, Acceptance examples, Action undo and redo: "Undo each action and redo it with
  Dev mode disabled. Complete Campaign state equals the original results after each step". CSTATE, Campaign state
  composition: Campaign state holds the "Timeline (of the current Turn)" and the "Timeline pointer". TIMELINE,
  Action navigation: each navigation operation "changes nothing but the Timeline pointer".
- **Description:** Since Campaign state holds the Timeline and its Timeline pointer, an undo changes complete Campaign
  state: the Timeline pointer moves and the undone action becomes an Undone action. Complete Campaign state after an
  undo therefore never equals the original result at that World state, which had no Undone action; the example
  holds for the Current world state, the History, the Turn report, and the Campaign configuration.
- **Links:** DEC-057
- **Resolution:** Resolved in ebf476870dd65ea148ccf55ebef33d6cf57fc7ac, which the Implementation follows since this
  update: every Acceptance examples section was deleted, so only TIMELINE, Returning to a World state, states what an
  undo and a redo restore, which the tests check under DEC-057.

## PROB-036: What changing Campaign configuration during play reports is a TODO

- **Category:** Needed TODO
- **Severity:** Low
- **Affected specifications:** CONFIG, TODOs: "TODO: Define what `session.campaignConfiguration.set(values)` reports,
  under Changing Campaign configuration during play." CONFIG, TODOs: "TODO: Define the inventory of Campaign
  configuration values that are adjustable during play".
- **Description:** The operation is named, but neither its result nor any value it can change is stated, so the
  implementer chooses the result and has no value of this Game build to exercise it with.
- **Links:** DEC-013
- **Resolution:** Open

## PROB-037: The Basic Autopilot AI measures its chain by prerequisites, which are gone and whose replacement is hidden

- **Category:** Conflict
- **Severity:** High
- **Affected specifications:** BASICAI, Keep Mission sites coming: "the one with the longest chain of discovered Leads
  behind it, each creating the MissionSiteArchetype a prerequisite of the next names." LEAD, Player-visible
  information: "The `discovered_when` of any Lead, and whether it or any part of it holds | No".
- **Description:** Leads and Progression no longer has prerequisites, and the Condition `discovered_when` that
  replaces them is not Player-visible, while an Autopilot AI sees only Player API. The chain the Basic Autopilot AI
  sorts by can therefore not be read as stated.
- **Links:** DEC-060, PROB-021
- **Resolution:** Resolved in e62a195798946a3cc8e054784a7c4255da548aa7, which the Implementation follows since this update: BASICAI, Information, measures the chain from the Turns of discovery.

## PROB-038: Bootstrap GDRs, About Mechanics, and Domain Model still speak of Lead prerequisites

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** BOOT, Leads: "it has no prerequisites and creates `apprehend_member`" and "names its
  prerequisite Leads"; MECH, Leads and Progression: "It owns what a Lead describes, Lead prerequisites, Lead
  availability"; DOM, Glossary, Lead availability: "as far as its prerequisites, its own earlier results, and its
  Faction allow".
- **Description:** Leads and Progression replaced Lead prerequisites with the Condition `discovered_when`, which
  discovers a Lead rather than gating its availability, but these passages still name prerequisites.
- **Links:** DEC-061
- **Resolution:** Resolved in e62a195798946a3cc8e054784a7c4255da548aa7, which the Implementation follows since this update: BOOT, MECH, and DOM speak of Lead discovery instead of prerequisites.

## PROB-039: The order of the Investigations interrupted in an Advance turn is unstated

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** INVSTG, Turn report: "The Turn report also holds the Investigations interrupted in that
  Advance turn, under Lead no longer available, each by its Instance ID with its Lead, and the History entry holds
  the same list, unreduced."
- **Description:** The list is Player-visible information and one Advance turn can interrupt several Investigations,
  but no order is stated, so two Implementations can report the same Turn differently. The set of discovered Leads
  that LEAD, Lead discovery, stores likewise has no stated order for an Implementation that stores it as a list.
- **Links:** DEC-062
- **Resolution:** Resolved in 890f1d38103fc5c1936772264d6dfc49d4948d88, which the Implementation follows since this update: INVSTG, Turn report, lists the Investigations interrupted by Instance ID, and LEAD, Lead discovery, says the set of discovered Leads has no order.

## PROB-040: Whether a Placeholder may name the `id` or the `type` of a GDR is unstated

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** COMP, Placeholder sources: "AgentArchetype | Every property | Any". COMP, Compendium
  article GDR validation: "names a property that GDR has and that Placeholder sources allows in that form". COMP,
  CompendiumArticle: "This table is exhaustive apart from the `id` and `type` that every GDR has."
- **Description:** "Every property" of a Type may or may not include the `id` and `type` that every GDR states beside
  the properties of its Type's table, so whether `{soldier.id}` is valid, and shows `soldier`, is not defined. BOOT,
  Compendium coverage, speaks of "Every property, other than `id` and `type`", which suggests they are properties.
- **Links:** DEC-063
- **Resolution:** Open

## PROB-041: A Data sheet shows the Effects of an Effect list "in order", but an Effect list has no order

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** COMPV, Subject data sheets: "an Effect list is shown as its Effects in order, separated
  by "·", each as the table under Effects shown words it, or as "None" when it holds no Effect." EFFECT, Effect list
  format: "Order has no meaning: Two Effect lists that hold the same Effects in a different order are the same
  Effect list."
- **Description:** The Compendium View must show the Effects in an order that Effect Lists says an Effect list does
  not have, so two Game builds with the same Effect list could show it differently. No specification states that
  Player API reports the authored order of the Effects, or an Effect whose value is 0 apart from an absent Effect,
  which decides between "+0 money" and leaving the Effect out. Since Specification revision
  acf5e1365fc4039ddd861339ac47f4abbfcc4526 the Leads View shows "one line for each Effect" of a Lead's
  `on_completion`, which meets the same missing order.
- **Links:** DEC-064, DEC-071
- **Resolution:** Open

## PROB-042: The Combat report no longer shows the starting Incapacitated value it must show

- **Category:** Conflict
- **Severity:** Low
- **Affected specifications:** TRVIEW, Combat report: "It shows every fact the Combat report holds" and "No other
  column says whether a participant is Incapacitated." COMBAT, Combat report: "Starting values: for each participant,
  its base skill, current health, effective max health, exhaustion, effective weapon damage, effective skill, and
  Incapacitated value when the Combat began".
- **Description:** The Incapacitated value of a participant when the Combat began is a fact the Combat report holds,
  so the Turn Report View must show it, but the only column that may say whether a participant is Incapacitated is
  the last one, which holds the final condition. The Combat report Artboard has no column for the starting value.
- **Links:** DEC-065
- **Resolution:** Open

## PROB-043: Removing an article from the Article history can leave one article twice in a row

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** COMPV, Following links: "No longer Player-visible: an article that is no longer
  Player-visible, e.g. after an undo, is removed from the Article history." and "Previous article: the article
  before the current one becomes current and is shown."
- **Description:** When the Article history holds A, X, A and X is no longer Player-visible, it holds A, A, so the
  Previous article button is enabled and shows the article already shown. No rule says whether equal neighbours are
  merged; the list of changes to the Article history is stated to be exhaustive.
- **Links:** DEC-066
- **Resolution:** Open

## PROB-044: No Turn report holds the Faction a Lead's completion made Eliminated, or the Campaign it won

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** LEAD, Turn report: "The Turn report of an Advance turn holds the Leads discovered in
  it"; INVSTG, Turn report: "... whether it completed ... and the Mission site its completion created, if any";
  MISSION, Turn report: "the Consequences that applied: ... the Faction made Eliminated, and the Defeat, if any".
- **Description:** A Won Mission that makes a Faction Eliminated is reported with its Consequences, but the
  `eliminate_faction` and `win_campaign` Effects of a Lead's completion, which LEAD, Completion effect, now allows,
  appear in no Turn report or History entry. The Player learns of them only from the Faction's Eliminated and
  Eliminated turn and from the Campaign ending.
- **Links:** DEC-068
- **Resolution:** Open

## PROB-045: The Turn advancement step table still says a completed Investigation creates one Mission site

- **Category:** Duplicate
- **Severity:** Low
- **Affected specifications:** TURN, Turn advancement steps, step 4: "A completed Investigation becomes Completed,
  applies its Lead's completion effect, which creates one Initiative Mission site"; LEAD, Completion effect: "a Lead
  may also do none of these"; INVSTG, Completion: "a Lead may instead, or also, make its Faction Eliminated or win the
  Campaign, or change nothing".
- **Description:** The summary of step 4 restates the completion effect as it was before Leads could create no Mission
  site, eliminate their Faction, or win the Campaign, and so disagrees with the rule it summarizes.
- **Links:** DEC-069
- **Resolution:** Open

## PROB-046: How far along its Faction's chain a Lead without a Faction is, is not defined

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** BASICAI, Keep Mission sites coming: "then the one furthest along its Faction's chain,
  i.e. the one with the longest chain of discovered Leads behind it"; LEAD, Lead: "A Lead without it concerns no
  Faction."
- **Description:** `criminal_organizations` and `peace_on_earth` have no Faction, so they have no Faction's chain to
  be measured along.
- **Links:** DEC-070
- **Resolution:** Resolved in ca416c4676ae9cdb1ca7cb3f4a3ef32d99656a20, which the Implementation follows since this update: BASICAI ranks Leads by the Initiative operation level, which every Lead has, with or without a Faction.

## PROB-047: The least width of a pane without a table is unstated

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** VIS, Detail views and navigation, Panes: "a table scrolls sideways only when the window
  is too narrow for every pane to take its least width"; LVIEW, Selected Lead.
- **Description:** VIS speaks of every pane's least width but states it only for a pane that holds a table. Without
  one, a wide table, e.g. Agents to add in the Leads View, can squeeze the selected Lead's pane to a few words a line
  at a common window width, e.g. 1500 px.
- **Links:** DEC-072
- **Resolution:** Open

## PROB-048: How a Detached Combat identifies its participants and which explicit values it accepts

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** COMBAT, Detached Combat: "Each participant is identified by its side and position in
  it"; "when an explicit value lies outside Attribute ranges in Agents for its side".
- **Description:** The spec states neither the form of a participant's identification nor a range for effective
  weapon damage, which Attribute ranges does not cover, nor whether one EnemyArchetype may be named twice, nor how
  GDR values are named in the setup.
- **Links:** DEC-073
- **Resolution:** Open

## PROB-049: The form of the result of `getInitiativeOperationLevels()` is unstated

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** LEAD, Reading Initiative operation levels: "and names each one that has none".
- **Description:** The spec says what the query reports but not how it names the Leads and MissionSiteArchetypes
  without a level.
- **Links:** DEC-074
- **Resolution:** Open

## PROB-050: The Bootstrap GDRs are no longer winnable under the new target selection

- **Category:** Conflict
- **Severity:** High
- **Affected specifications:** COMBAT, Target selection: "Enemy attacker: every candidate has Selection weight 1";
  "Agent attacker: the Selection weight of a candidate Enemy is target_base_weight − round down(...)"; BOOT, Victory
  path: "The Campaign is won by working through the Leads of all three Factions and then completing
  `peace_on_earth`."
- **Description:** Under the target selection of specification commit `d1eb150c8977830c5e4db88871701f2a847b22fc`,
  the Basic Autopilot AI no longer wins a Campaign of the Bootstrap GDRs. Of 10 Campaigns of seeds `simulation-0` to
  `simulation-9` (`node scripts/simulate.ts 10 400`), 9 have no ending after 400 Turns and 1 ends in Defeat by
  Existential operation not stopped; under the earlier rule, which targeted the opponent with the highest effective
  skill, all 10 reached Victory, at a median Turn of 326 (318 to 347). The Victory path the Bootstrap GDRs describe
  is therefore out of reach in practice. No specification requires a Campaign to be winnable, so the Implementation
  follows the rule, and its tests no longer require the Basic Autopilot AI to reach an ending: the Campaign test
  checks that it plays 400 Turns without an engine defect, and Victory is checked on a scripted Campaign.
- **Links:** DEC-076
- **Resolution:** Open

## PROB-051: The order of the rows of a Campaign card is not always a total order

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** MENU, Layout: "Rows equal in both are ordered by the time each was last written,
  earliest first, except that the Current Autosave comes after every other Autosave equal to it in both".
- **Description:** Among rows equal in Turn and actions, the rule can form a cycle: with the Current Autosave written
  first, then a Campaign save on request, then another Autosave, e.g. a Disengagement Autosave, time puts the Current
  Autosave before the Campaign save and that before the Disengagement Autosave, while the exception puts the Current
  Autosave after the Disengagement Autosave. The spec does not say which comparison yields.
- **Links:** DEC-077
- **Resolution:** Open

## PROB-052: No query reports the revealed Leads that Revealed presentation shows

- **Category:** Implicit gap
- **Severity:** Medium
- **Affected specifications:** DEV, Revealed presentation: "e.g. an undiscovered Lead in the list of Leads" and "The
  Mechanics specification owning a revealed value states the query that reports it when `getCampaignState()` alone
  does not"; LEAD, Player-visible information: "Every discovered Lead" and "The `required_progress` of every
  discovered Lead | Yes once an Investigation of the Lead has reached the threshold"; GUI, Reveal hidden content:
  "every screen of the GUI presents the Current campaign under Revealed presentation".
- **Description:** Revealed presentation names an undiscovered Lead as a revealed value, and the `required_progress`
  of a Lead not yet Assessed is one too, but Leads and Progression states no `developer.queries` operation that reports
  them, and `getCampaignState()` reports only the raw Campaign state, without the Lead GDRs or the values the Leads view
  shows of a Lead, e.g. its Lead status. A user interface therefore cannot present them from Developer API as
  specified. It is also unstated what an undiscovered Lead's Lead status and availability are when shown as revealed.
  The only other reveal condition that hides values in the GUI is that of Compendium articles, which the Revealed
  Compendium covers; the remaining values hidden from the Player, e.g. a Faction activity level or an Actual required
  progress, are never Player-visible and stay hidden.
- **Links:** DEC-080
- **Resolution:** Open

## PROB-053: A Lead discovered by a Player action has no Turn of discovery for the Situation panel to order it by

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** SITP, Leads shown: "ordered from the newest to the oldest by the Turn in which each was
  discovered, as the History entries record it"; LEAD, Turn report: "every Lead that is in the set of discovered Leads
  of the World state that Advance turn produces and not in that of the World state before it"; LEAD, Lead discovery,
  which evaluates `discovered_when` in the World state every Player action produces.
- **Description:** A Lead discovered in the World state of a Player action, e.g. after a Developer cheat completes
  the Lead its `discovered_when` names, is already discovered when the next Advance turn starts, so no Turn report and
  no History entry lists it, and it was not discovered at campaign creation either. The Leads shown rule then gives it
  no place in the order.
- **Links:** DEC-083
- **Resolution:** Resolved in f8b5718c92547f6e7226911c6db24a49b0391877, which the Implementation follows since this
  update: SITP no longer has a Leads group, so no Lead needs a place in its order.

## PROB-054: Details of the Combat strength chart, the Changed settings row, the Autopilot Turns field, and the title row are left open

- **Category:** Implicit gap
- **Severity:** Low
- **Affected specifications:** CVIEW, Agency charts, Combat strength; VIS, Charts, the readout line; GUI, Changed
  settings; CSCR, Autopilot settings; VIS, Detail views and navigation; MVIEW, Mission site list: the number of Active
  Mission sites "centred on the title's line"; MISSION, Glossary, Deployable Agent; MISSION, Mission site properties,
  Creation Combat rating; MVIEW, Selected Mission site.
- **Description:** The specifications settle what each of these shows but leave open details an Implementation must
  choose: where the Combat strength chart reads the Mission sites of a Turn-end state from, and how the readout lists a
  bar below the baseline or a Turn whose every value is 0; how the Changed settings row words an on/off setting and
  whether it lists a stored value equal to the default; when the Turns field stores Autopilot Turns while the Player
  types; how a text figure after the title sits on the title's line, where a box centred on the 36 px line reads above
  the title's capitals; and through which Player API values the GUI and the Basic Autopilot AI read the Deployable
  Agent, the Creation Combat rating, and the Combat rating of one Enemy, which no Player API specification names.
- **Links:** DEC-084, DEC-085, DEC-086, DEC-087
- **Resolution:** Open
