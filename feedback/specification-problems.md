# Specification problems

## PROB-001: No upper bound on stored quantities

- **Category:** Implicit gap
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
- **Affected specifications:** CONFIG, Global configuration: "Interface preferences belong to Global configuration,
  e.g. volume, language, and tutorial popups."
- **Description:** `session.globalConfiguration.get()` must report every Global configuration setting, but no
  specification lists the settings a Game build has, their permitted values, or their Game build defaults, other than
  the Autosave limit.
- **Links:** DEC-011
- **Resolution:** Open

## PROB-003: Execution budget of an Autopilot AI is a TODO

- **Category:** Needed TODO
- **Affected specifications:** AUTO, TODOs: "TODO: Choose the exact limits of the finite execution budget of an
  Autopilot AI."
- **Description:** Disengaging as AI failed needs the limits of the budget, which the specification leaves open.
- **Links:** DEC-012
- **Resolution:** Open

## PROB-004: Changing Campaign configuration during play has no operation

- **Category:** Needed TODO
- **Affected specifications:** CONFIG, TODOs: "TODO: Define the inventory of Campaign configuration values that are
  adjustable during play ... and the Engine API operations that change them." and "TODO: Define the public Player action
  and report signatures for Changing Campaign configuration during play."
- **Description:** The rules for changing Campaign configuration during play are stated, but no value is adjustable
  and no operation is named, so an implementer cannot tell whether to expose an operation.
- **Links:** DEC-013
- **Resolution:** Open

## PROB-005: GDR identifier format and YAML property naming are TODOs

- **Category:** Needed TODO
- **Affected specifications:** GDR, TODOs: "TODO: Decide the GDR identifier format: the permitted characters and
  casing of a GDR identifier, and the scope within which it is unique." and "TODO: Decide the YAML property naming:
  how a GDR states its identifier and its Type, and the casing of property names."
- **Description:** Validating and resolving GDR references needs the identifier format and its uniqueness scope, and
  reading the YAML files needs the property naming; both are left open.
- **Links:** DEC-014
- **Resolution:** Open

## PROB-006: No query returns retained Campaign instances, Turn series, or GDR properties

- **Category:** Implicit gap
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
- **Resolution:** Open

## PROB-007: Contents of the Turn report and of a History entry are a TODO

- **Category:** Needed TODO
- **Affected specifications:** DOM, TODOs: "TODO: State what the Turn report and each History entry hold of each
  value the Mechanics specifications own, including the reduced form of a Combat report that a History entry keeps".
- **Description:** Only the Combat report is specified as part of the Turn report. What else the Turn report holds,
  and what the reduced form in a History entry holds, is left open.
- **Links:** DEC-016
- **Resolution:** Open

## PROB-008: An Attempted Mission site is final yet still takes part in a Combat

- **Category:** Conflict
- **Affected specifications:** MISSION, Mission site properties: "A Mission site in a final state no longer
  participates in current gameplay and is retained in World history". MISSION, Mission site lifecycle: "Attempted,
  Expired, and Cancelled are final." MISSION, Resolving one Mission: "its Enemies' side is S's Enemies list".
- **Description:** A Mission site is Attempted, a final state, from the moment Agents are deployed to it, yet its
  Enemies fight the Combat of its Deployed Mission in the next Advance turn and its Mission is in Current world
  state. Under the first statement `getCurrentState()` would not return the Mission site of a Deployed Mission.
- **Links:** DEC-017
- **Resolution:** Open

## PROB-009: Developer Access is a Stub

- **Category:** Needed TODO
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
- **Affected specifications:** CONFIG, Campaign configuration presets: "Each preset is one GDR ... and supplies a
  value for every Campaign configuration value." ECON, Campaign configuration values: "Each Campaign configuration
  preset supplies both, as the properties named below." CONFIG, Preset selection and edits:
  "`session.newCampaignSetup.listPresets()` Reports every preset the Game build supplies".
- **Description:** No specification states the exhaustive properties of the Type CampaignConfiguration, as the other
  GDR Types have, or a display name for a preset, so it is open whether a property other than `starting_money` and
  `starting_funding` is valid and what an interface shows as the name of a preset.
- **Links:** DEC-022
- **Resolution:** Open

## PROB-011: Whether the Agent reserve may be deployed

- **Category:** Conflict
- **Affected specifications:** BASICAI, Glossary: "The share of the roster that the Basic Autopilot AI keeps as Rested
  Agents rather than assigning, so that it can still react to an urgent Mission site." BASICAI, Goals, Keep Agents
  fit: "Only Rested Agents receive new work, and the Agent reserve stays untouched, except for urgent income."
- **Description:** The Glossary says the Agent reserve exists to react to an urgent Mission site, and the goal says
  that only urgent income may touch it. Both cannot hold when a team for an urgent Mission site needs Agents of the
  Agent reserve.
- **Links:** DEC-024
- **Resolution:** Open

## PROB-012: A new or closed Campaign has no Campaign save, yet always has a Current Autosave

- **Category:** Conflict
- **Affected specifications:** LIFE, Campaign selection: "no Campaign save, so the Session has no Current save".
  LIFE, Acceptance examples, Closing does not save: "No Campaign save exists afterwards". SAVES, Autosaves: "When a
  Campaign is created or loaded, and whenever what a Campaign save holds changes for the Current campaign". SAVES,
  Glossary: "kept up to date at all times so that play can resume after the Session ends for whatever reason".
- **Description:** An Autosave is a Campaign save, and SAVES requires the Current Autosave to be written when a
  Campaign is created and after every change. LIFE states that a new Campaign has no Campaign save and that none
  exists after creating a Campaign, committing an action, and closing it.
- **Links:** DEC-025
- **Resolution:** Open

## PROB-013: No way for an interface to learn that the Committed state changed

- **Category:** Implicit gap
- **Affected specifications:** ENG, API hierarchy: "The complete namespace inventory is `session`, `player`,
  `developer`, and `autopilotMemory`." AUTO, Autopilot lifecycle and concurrency: "Autopilot disengages as AI failed
  when the Autopilot AI reports an error, produces no valid action, or exhausts its configured finite execution
  budget."
- **Description:** During an Autopilot engagement the Autopilot AI commits Player actions and the engagement can end
  without any call from the Session controller. No operation of the four namespaces tells an interface that
  something a query reports has changed, so an interface cannot show the progress of an engagement except by asking
  again and again.
- **Links:** DEC-026
- **Resolution:** Open

## PROB-014: The physical layout of Game storage is a TODO

- **Category:** Needed TODO
- **Affected specifications:** SCHEMA, TODOs: "Describe one physical layout covering every part of Game storage".
- **Description:** Storing the Global configuration and the Campaign saves needs a physical layout, in files for the
  terminal CLI and in the browser for the web UI, and the document leaves it open.
- **Links:** DEC-023
- **Resolution:** Open

## PROB-015: Turn Advancement and Agents disagree on where an Agent on Recovery arrives

- **Category:** Conflict
- **Affected specifications:** TURN, The steps, step 1 Transit: "The Agent becomes At assignment and keeps its
  Assignment." AGENT, Transit rule: "becomes At assignment in the Transit step of that Advance turn, or Recovering
  when its Assignment is Recovery."
- **Description:** An Agent whose Assignment is Recovery and that is In transit arrives in the Transit step. Turn
  Advancement says it becomes At assignment, while Agents says it becomes Recovering, and the invariant of Agent status
  requires an Agent whose Assignment is Recovery and that is not In transit to be Recovering.
- **Links:** DEC-033
- **Resolution:** Open

## PROB-016: How the Command-Line Interface names operations and chooses its Output form is a TODO

- **Category:** Needed TODO
- **Affected specifications:** CLI, TODOs: "TODO: State how the CLI names operations and their arguments, and how a
  caller discovers the available ones" and "TODO: State how a caller chooses between readable and structured output,
  and what the structured output looks like".
- **Description:** A CLI needs command names, argument syntax, a way to list the commands, a way to choose the Output
  form, and a format for structured output, and the specification leaves all of them open.
- **Links:** DEC-027
- **Resolution:** Open

## PROB-017: What the Main menu and the Campaign screens of the Graphical User Interface show is a TODO

- **Category:** Needed TODO
- **Affected specifications:** GUI, TODOs: "TODO: State what the Main menu offers by default", "list the screens the Player needs while a
  Campaign is current", and "state how the GUI reaches Advance turn, Timeline navigation, saving, and Autopilot".
- **Description:** A GUI needs screens for the Main menu and for playing a Campaign, and a way to reach Advance turn,
  Timeline navigation, saving, and Autopilot. The specification states only that the GUI opens at the Main menu and
  leaves the rest open.
- **Links:** DEC-007
- **Resolution:** Open
