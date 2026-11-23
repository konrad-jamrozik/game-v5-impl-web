/**
 * Player API, as types. This is everything an Autopilot AI may see of the engine: every
 * value here is Player-visible information, and no Type has a property for a hidden value, e.g. the Campaign seed
 * or a Faction's countdowns; see ENG, Information boundary.
 */
import type { ProbabilityPair } from '../kernel/index.ts';
import type { Result } from './result.ts';
import type { CommitOutcome } from './session/core.ts';
import type {
  AgentStatus,
  Assignment,
  CampaignEnding,
  EndingReason,
  HistoryEntry,
  InvestigationLifecycle,
  MissionLifecycle,
  MissionSiteKind,
  MissionSiteLifecycle,
  MissionSiteOrigin,
  OpenHistoryEntry,
  Participation,
  SimpleAssignment,
  TurnReport,
  TurnSeriesValue,
} from './state/types.ts';

export type {
  ProbabilityPair,
  Result,
  CommitOutcome,
  TurnReport,
  HistoryEntry,
  OpenHistoryEntry,
  Assignment,
  SimpleAssignment,
};

export interface AgentView {
  readonly id: string;
  readonly archetype: string;
  readonly archetypeName: string;
  readonly agency: string;
  readonly turnHired: number;
  readonly agentStatus: AgentStatus;
  /** Base skill, a Decimal quantity held in hundredths; see NUMBERS, Decimal quantities. */
  readonly skillHundredths: number;
  /** AGENT, Mission growth: the base skill gained from Missions, a whole number. */
  readonly experience: number;
  readonly effectiveSkill: number;
  /** Current health, a Decimal quantity held in hundredths: effective max health less health lost. A Derived value. */
  readonly currentHealthHundredths: number;
  /** AGENT, Effective max health and current health: health lost, a Decimal quantity held in hundredths. */
  readonly healthLostHundredths: number;
  readonly baseHealth: number;
  /** AGENT, Effective max health and current health: a Derived value; the Final max health for a Terminated Agent. */
  readonly effectiveMaxHealth: number;
  /** AGENT, Exhaustion and Exact exhaustion: the whole exhaustion every rule reads. */
  readonly exhaustion: number;
  /** The Exact exhaustion behind it, in hundredths. */
  readonly exactExhaustionHundredths: number;
  readonly weapon: string;
  readonly weaponName: string;
  readonly baseWeaponDamage: number;
  /** AGENT, Effective weapon damage: a Derived value; the Final weapon damage for a Terminated Agent. */
  readonly effectiveWeaponDamage: number;
  /** A reference to the Armor GDR, and its name. */
  readonly armor: string;
  readonly armorName: string;
  readonly baseArmor: number;
  /** AGENT, Effective armor: a Derived value; the Final armor for a Terminated Agent. */
  readonly effectiveArmor: number;
  /** Absent for a Killed or Dismissed Agent. */
  readonly assignment: Assignment | null;
  readonly canBeAssigned: boolean;
  /**
   * AGENT, Start-work gate: whether the Agent is Fit to start work, i.e. its exhaustion is at most
   * exhaustion_work_start_max and its health lost is 0.
   */
  readonly fitForWork: boolean;
  /** AGENT, Agent statuses: whether the Agent is In base; false for a Terminated Agent. A Derived value. */
  readonly inBase: boolean;
  /** AGENT, Agent statuses: whether the Agent is Away; false for a Terminated Agent. A Derived value. */
  readonly away: boolean;
  /**
   * AGENT, Player-visible information: whether the Agent is alive and does not meet the incapacitation condition of
   * Combat with its current values, i.e. would be able to fight if a Combat began now; `deployAgents` rejects an Agent
   * for which it is false (MISSION, Deploying Agents, precondition 9).
   */
  readonly ableToFight: boolean;
  /**
   * MISSION, Glossary, Deployable Agent: whether the Agent is Serving, In base, can take orders, and is Capable for
   * deployment, i.e. At assignment on Standby or Training and able to fight. A Derived value.
   */
  readonly deployable: boolean;
  /** COMBAT, Combat rating: the base Combat rating of the Agent alone, its effective skill; absent when Terminated. */
  readonly baseCombatRating: number | null;
  /**
   * COMBAT, Combat rating: that of a side holding the Agent alone, its effective skill times its rating factor, rounded
   * down, or 0 when it is not able to fight; absent when Terminated.
   */
  readonly combatRating: number | null;
  readonly participationHistory: readonly Participation[];
  /** AGENT, Service record: the number of Enemies the Agent's attacks have made dead. */
  readonly enemiesKilled: number;
  /** AGENT, Service record: absent for a Serving Agent. */
  readonly turnTerminated: number | null;
  /** AGENT, Service record: the Enemy and Mission site, by Instance ID; absent unless the Agent is Killed. */
  readonly killedBy: { readonly enemy: string; readonly missionSite: string } | null;
  /** AGENT, Service record: absent for a Serving Agent. */
  readonly finalMaxHealth: number | null;
  /** AGENT, Service record: absent for a Serving Agent. */
  readonly finalWeaponDamage: number | null;
  /** AGENT, Service record: absent for a Serving Agent. */
  readonly finalArmor: number | null;
  /** Reported for every Serving Agent, a Decimal quantity in hundredths. */
  readonly healthRecoveryRateHundredths: number | null;
  /** Absent unless the Current assignment is Recovery. */
  readonly recoveryTurnsRemaining: number | null;
}

export interface EnemyView {
  readonly id: string;
  readonly archetype: string;
  readonly archetypeName: string;
  readonly missionSite: string;
  readonly skill: number;
  readonly effectiveSkill: number;
  /** A Derived value: base health less health lost. */
  readonly currentHealth: number;
  readonly healthLost: number;
  readonly baseHealth: number;
  readonly exhaustion: number;
  readonly weapon: string;
  readonly weaponName: string;
  /** The base weapon damage, which is also the effective weapon damage of an Enemy. */
  readonly weaponDamage: number;
  readonly armor: string;
  readonly armorName: string;
  /** The base armor, which is also the effective armor of an Enemy. */
  readonly baseArmor: number;
  /** COMBAT, Combat rating: the Combat rating of this Enemy alone, from its current values. */
  readonly combatRating: number;
}

export interface ConsequenceView {
  readonly money: number;
  readonly fundingChange: number;
  /** The Panic increase and Panic reduction, Decimal quantities in hundredths of a percentage point. */
  readonly panicIncreaseHundredths: number;
  readonly panicReductionHundredths: number;
  readonly eliminatesTargetFaction: boolean;
  /** Whether it loses the Campaign, through a `defeat` Effect (ENDING, Defeat Effect kind). */
  readonly defeat: boolean;
}

export interface MissionSiteView {
  readonly id: string;
  readonly archetype: string;
  readonly name: string;
  readonly kind: MissionSiteKind;
  readonly origin: MissionSiteOrigin;
  /** The Lead that created an Initiative Mission site. */
  readonly lead: string | null;
  /**
   * LEAD, Initiative operation level of an Initiative Mission site: that of the Lead that created it; none for a
   * Response Mission site, and for one whose Lead has none.
   */
  readonly initiativeOperationLevel: number | null;
  /** The Faction operation level of a Response Mission site. */
  readonly operationLevel: { readonly id: string; readonly level: number; readonly name: string } | null;
  readonly targetFaction: string;
  readonly turnCreated: number;
  /** MISSION, Mission site properties: the Combat rating of its Enemies taken as one side, as created; never changes. */
  readonly creationCombatRating: number;
  readonly lifecycle: MissionSiteLifecycle;
  readonly turnsUntilExpiration: number;
  readonly enemies: readonly EnemyView[];
  /** The Combat rating of its Enemies. */
  readonly enemiesCombatRating: number;
  /** What applies when its Mission is Won. */
  readonly rewards: ConsequenceView;
  /** What applies when its Mission is Lost or it is Expired. */
  readonly penalties: ConsequenceView;
  /** Absent while no team has been deployed to it. */
  readonly mission: string | null;
}

export interface MissionView {
  readonly id: string;
  readonly archetype: string;
  readonly missionSite: string;
  readonly kind: MissionSiteKind;
  readonly turnDeployed: number;
  readonly teamSent: readonly string[];
  readonly lifecycle: MissionLifecycle;
  readonly currentTeam: readonly string[];
}

/** A value that exists but is hidden from the player, as opposed to an absent value (null); see DEC-039. */
export type Unknown = 'unknown';

export interface InvestigationView {
  readonly id: string;
  readonly archetype: string;
  readonly lead: string;
  readonly leadName: string;
  readonly turnStarted: number;
  readonly lifecycle: InvestigationLifecycle;
  /** Investigation progress, in hundredths of a progress point, e.g. 449 for 4.49 progress points. */
  readonly progress: number;
  /** INVSTG, Assessment: whether its progress has ever reached the assessment threshold of its Lead. */
  readonly assessed: boolean;
  /** The Actual required progress exists but is hidden, so it is always reported as unknown; see DEC-039. */
  readonly actualRequiredProgress: Unknown;
  readonly currentTeam: readonly { readonly agent: string; readonly agentStatus: AgentStatus }[];
  /**
   * INVSTG, Projected progress gain, in hundredths of a progress point. Absent for a Completed or Abandoned
   * Investigation.
   */
  readonly projectedProgressGain: number | null;
}

/** Only a discovered Lead has a LeadView; an undiscovered Lead is absent from every result (LEAD). */
export interface LeadView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * The FactionArchetype the Lead names, and the Faction of the Campaign that has it; both absent for a Lead that
   * concerns no Faction.
   */
  readonly factionArchetype: string | null;
  readonly faction: string | null;
  /** INVSTG, Assessment: whether at least one Investigation of the Lead is Assessed. */
  readonly assessed: boolean;
  /** The Required progress, in progress points; unknown until the Lead is an Assessed Lead. */
  readonly requiredProgress: number | Unknown;
  /** The Required progress range, in progress points; unknown until the Lead is an Assessed Lead. */
  readonly requiredProgressRange: { readonly min: number; readonly max: number } | Unknown;
  /** LEAD, Lead: whether the Lead can be investigated again after an Investigation of it is Completed. */
  readonly investigateAgain: 'never' | 'until_mission_won' | 'always';
  /**
   * LEAD, Completion effect: the Effects of its `on_completion`. The MissionSiteArchetype a `create_mission_site`
   * Effect creates, or none; whether an `eliminate_faction` Effect makes its Faction Eliminated; and whether a
   * `win_campaign` Effect wins the Campaign.
   */
  readonly createsMissionSite: string | null;
  readonly eliminatesFaction: boolean;
  /** ECON, Contracting Effect kind: whether an `unlock_contracting` Effect unlocks Contracting. */
  readonly unlocksContracting: boolean;
  readonly winsCampaign: boolean;
  /** LEAD, Missions from a Lead: the number of Completed Investigations of the Lead. */
  readonly completionCount: number;
  /** LEAD, Initiative operation level of the Lead; null for a Lead that has none. */
  readonly initiativeOperationLevel: number | null;
  /**
   * Whether the Lead is available. Which conditions of Lead availability hold, and so why a Lead is not available, is
   * not Player-visible (LEAD, Player-visible information).
   */
  readonly available: boolean;
  /** LEAD, Lead status: the summary of the Lead's availability. */
  readonly status: 'Available' | 'Inactive' | 'Archived';
  readonly canBeInvestigatedNow: boolean;
  /** The Lead's Active Investigation, when it has one. */
  readonly activeInvestigation: string | null;
}

/**
 * FACTION, Player-visible information: a Faction's Faction activity level, the FactionActivityLevels, and both
 * countdowns are not Player-visible, so a FactionView has no property for any of them.
 */
export interface FactionView {
  readonly id: string;
  readonly archetype: string;
  readonly name: string;
  readonly eliminated: boolean;
  readonly eliminatedTurn: number | null;
}

export interface UpgradeView {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly effect: string;
  /** The Increment in hundredths; a whole number times 100 for every Upgrade but a Rate Upgrade. */
  readonly incrementHundredths: number;
  readonly acquisitions: number;
}

export interface AgencyView {
  readonly id: string;
  readonly archetype: string;
  readonly name: string;
  readonly money: number;
  readonly funding: number;
  readonly upgrades: readonly UpgradeView[];
  readonly agentCap: number;
  readonly transportCap: number;
  readonly trainingCap: number;
  /** ECON, Contracting cap: 0 until Contracting is unlocked. */
  readonly contractingCap: number;
  /** ECON, Agency properties: whether Contracting is unlocked. */
  readonly contractingUnlocked: boolean;
  /** LEAD, Contracting cap growth: the Initiative levels won. */
  readonly initiativeLevelsWon: number;
  /** ECON, Contracting cap: the Serving Agents whose Assignment is Contracting, In transit included. */
  readonly contractingAgents: number;
  /**
   * ECON, Rate Upgrades: the training skill gain, exhaustion recovery, and health recovery percentage, each a Decimal
   * quantity held in hundredths.
   */
  readonly trainingSkillGainHundredths: number;
  readonly exhaustionRecoveryHundredths: number;
  readonly healthRecoveryPctHundredths: number;
  /**
   * ECON, Armor Upgrade: the effective armor every Serving Agent has, i.e. the `base_armor` of the Armor that the
   * AgentArchetype's `armor` references plus the Upgrade bonus of agent_armor; reported even with no Serving Agent.
   */
  readonly agentArmor: number;
  readonly servingAgents: number;
  readonly deployedAgents: number;
  readonly trainingAgents: number;
  readonly projectedIncome: number;
  readonly projectedUpkeep: number;
  readonly hireCost: number;
}

/**
 * `player.queries.getCurrentLiveWorldState()`: the Player-visible Live world state of the Current world state, i.e.
 * every Campaign instance still in play and every other value of the world; see WHIST, Current world state, Turn
 * report, and history.
 */
export interface CurrentLiveWorldStateView {
  readonly turn: number;
  /** ENDING, Panic: a Decimal quantity from 0 to 100, in hundredths, e.g. 2435 for 24.35%. */
  readonly panicHundredths: number;
  /** The Panic limit, a whole number of percent. */
  readonly panicLimit: number;
  /** Absent while the Campaign is being played. */
  readonly ending: {
    readonly ending: CampaignEnding;
    readonly reasons: readonly EndingReason[];
    readonly turn: number;
  } | null;
  readonly agency: AgencyView;
  /** Serving Agents. */
  readonly agents: readonly AgentView[];
  /** Active Investigations. */
  readonly investigations: readonly InvestigationView[];
  /** Active and Deployed Mission sites. */
  readonly missionSites: readonly MissionSiteView[];
  /** Deployed Missions. */
  readonly missions: readonly MissionView[];
  readonly factions: readonly FactionView[];
}

/**
 * `player.queries.getCurrentRetiredWorldState()`: the Player-visible Retired world state of the Current world state,
 * i.e. every Retired Campaign instance with its Player-visible properties at their final values, and every fact
 * recorded once for the rest of the Campaign, e.g. the discovered Leads; see WHIST, Current world state, Turn report,
 * and history.
 */
export interface CurrentRetiredWorldStateView {
  /** Every discovered Lead. */
  readonly leads: readonly LeadView[];
  /** Killed and Dismissed Agents. */
  readonly agents: readonly AgentView[];
  /** Completed and Abandoned Investigations. */
  readonly investigations: readonly InvestigationView[];
  /** Concluded, Expired, and Cancelled Mission sites. */
  readonly missionSites: readonly MissionSiteView[];
  /** Won and Lost Missions. */
  readonly missions: readonly MissionView[];
}

/**
 * `player.queries.getCampaignConfiguration()`: the Player-visible Campaign configuration; see WHIST, Current world
 * state, Turn report, and history.
 */
export interface CampaignConfigurationView {
  readonly startingMoney: number;
  readonly startingFunding: number;
}

/**
 * `player.queries.getHistory()`: the History, i.e. the History entries, the Open History entry, and the Turn series;
 * see WHIST, Current world state, Turn report, and history.
 */
export interface HistoryView {
  readonly entries: readonly HistoryEntry[];
  /**
   * WHIST, Open History entry: the current Turn as its History entry would be if Advance turn ended it now, without
   * the Turn report part. It follows `entries` in Turn order; every Player action, undo, and redo changes it.
   */
  readonly openEntry: OpenHistoryEntry;
  readonly turnSeries: {
    readonly moneyAtStartOfTurn: readonly TurnSeriesValue[];
    readonly moneyAtEndOfTurn: readonly TurnSeriesValue[];
  };
}

export interface ActionAvailability {
  readonly available: boolean;
  /** Why the action is unavailable, as a stable identifier and a message. */
  readonly reason: string | null;
  readonly message: string | null;
}

/** `player.queries.getAvailableActions()`: ordinary action discovery. */
export interface AvailableActionsView {
  readonly campaignEnded: boolean;
  readonly advanceTurn: ActionAvailability;
  /** Whether `hireAgents` of one Agent would succeed. */
  readonly hireAgents: ActionAvailability;
  readonly purchaseUpgrade: readonly ({ readonly upgrade: string } & ActionAvailability)[];
  /** The Agents that can be ordered. */
  readonly assignableAgents: readonly string[];
  readonly assignAgents: {
    readonly assignments: readonly SimpleAssignment[];
    /** How many more Agents can be ordered to Training under the Training cap. */
    readonly trainingPlacesLeft: number;
    /** ECON, Caps on assigning Agents: the places left under the Contracting cap. */
    readonly contractingPlacesLeft: number;
  };
  /** The Agents that can be dismissed. */
  readonly dismissableAgents: readonly string[];
  /** The Leads an Investigation can be started for now. */
  readonly startInvestigation: readonly string[];
  /** The Active Investigations that accept Agents. */
  readonly assignAgentsToInvestigation: readonly string[];
  readonly deployAgents: {
    /** The Active Mission sites. */
    readonly missionSites: readonly string[];
    /** How many more Agents can be deployed under the Transport cap. */
    readonly transportPlacesLeft: number;
  };
}

/** The properties of the GDRs that are Player-visible; decimal numbers are given as written. */
export interface GameDataView {
  readonly gameBuild: string;
  readonly agentArchetype: {
    readonly id: string;
    readonly name: string;
    readonly skill: number;
    readonly baseHealth: number;
    readonly weapon: string;
    readonly armor: string;
  };
  readonly agentParameters: Readonly<Record<string, number>>;
  readonly combatParameters: Readonly<Record<string, string>>;
  readonly recoveryParameters: Readonly<Record<string, number>>;
  readonly investigationParameters: {
    /** A decimal number, as written. */
    readonly teamEfficiencyExponent: string;
    readonly requiredProgressMaxPct: number;
    readonly assessmentThresholdPct: number;
  };
  readonly economy: Readonly<Record<string, number>>;
  readonly weapons: readonly {
    readonly id: string;
    readonly name: string;
    readonly damage: number;
    /** COMBAT, Damage outcome: the inclusive bounds of the damage of a hit for a weapon damage equal to `damage`. */
    readonly damageOfAHit: { readonly min: number; readonly max: number };
  }[];
  /** COMBAT, Armor: every Armor GDR, with its `base_armor` as `armor`. */
  readonly armors: readonly { readonly id: string; readonly name: string; readonly armor: number }[];
  readonly enemyArchetypes: readonly {
    readonly id: string;
    readonly name: string;
    readonly skill: number;
    readonly baseHealth: number;
    readonly weapon: string;
    readonly armor: string;
  }[];
  readonly missionSiteArchetypes: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly expiresInTurns: number;
    readonly enemies: readonly { readonly enemyArchetype: string; readonly count: number }[];
    readonly enemiesCombatRating: number;
    readonly onWin: ConsequenceView | null;
    readonly operationLevel: number | null;
  }[];
  readonly factionOperationLevels: readonly {
    readonly id: string;
    readonly level: number;
    readonly name: string;
    readonly onWin: { readonly money: number; readonly funding: number };
    readonly onIgnoredOrLost: {
      readonly panicIncreaseHundredths: number;
      readonly funding: number;
      readonly defeat: boolean;
    };
  }[];
  readonly names: {
    readonly agency: string;
    readonly investigation: string;
    readonly mission: string;
  };
  /** VIS, Background artwork: every BackgroundArtwork GDR; display content that no game behavior reads. */
  readonly backgroundArtworks: readonly {
    readonly id: string;
    /** The Detail view, by its name in lowercase words joined by underscores, e.g. `missions`. */
    readonly detailView: string;
    /** The image path relative to the Spec repo root, e.g. `assets/images/chatgpt-agents-i2.png`. */
    readonly image: string;
    readonly opacityPct: number;
  }[];
}

/**
 * COMP, Article resolution: one segment of a resolved templated text. Joined in order, the texts of the segments are
 * the templated text with every Placeholder replaced.
 *
 * - `text`: plain text.
 * - `value`: an Inserted value, the text that replaced one Placeholder, already formatted.
 * - `link`: an Article link, with the identifier of the Player-visible article it links to.
 */
export type ArticleSegmentView =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'value'; readonly text: string }
  | ArticleLinkView;

/** COMP, Article links: an Article link, with its text and the identifier of the Player-visible article it links to. */
export interface ArticleLinkView {
  readonly kind: 'link';
  readonly text: string;
  readonly article: string;
}

/**
 * COMP, Player-visible information: one Player-visible Compendium article in its resolved form, never as authored. An
 * article that is not Player-visible is absent from every result.
 */
export interface CompendiumArticleView {
  readonly id: string;
  readonly category: 'guide' | 'mechanics' | 'subject';
  /** COMP, Displayed title. */
  readonly title: string;
  /** The identifier of the GDR a Subject article is about; absent for a Guide article or a Mechanics article. */
  readonly subject: string | null;
  /** The Type of the subject GDR, e.g. `EnemyArchetype`; absent for a Guide article or a Mechanics article. */
  readonly subjectType: string | null;
  readonly body: readonly ArticleSegmentView[];
  /** The resolved formula rows in authored order; empty unless the article is a Mechanics article. */
  readonly formulas: readonly {
    readonly label: readonly ArticleSegmentView[];
    readonly text: readonly ArticleSegmentView[];
  }[];
  /** COMP, See also: the See also entries in authored order, each under the displayed title of its article. */
  readonly seeAlso: readonly ArticleLinkView[];
}

/** The Combat ratings of a team of Agents and of a Mission site's Enemies, and whether deploying is accepted. */
export interface DeploymentPreview {
  readonly teamCombatRating: number;
  readonly enemiesCombatRating: number | null;
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly message: string | null;
}

/**
 * One `player.actions` operation with its arguments, for PAPI, Action preview; e.g.
 * `{ name: 'assignAgents', args: { agents: ['agent-1'], assignment: 'Contracting' } }`. `args` names each argument as
 * the operation's parameter is named.
 */
export interface PlayerActionRequest {
  readonly name: keyof PlayerApi['actions'];
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * The changes one collection of a World state query result went through: every element that entered it or whose
 * Player-visible information changed, as the query now returns it, and, only when elements entered or left it, the
 * Instance IDs of all its elements in the order the query now returns them.
 */
export interface CollectionChanges<T extends { readonly id: string }> {
  readonly changed: readonly T[];
  readonly order?: readonly string[];
}

/**
 * PAPI, Action results: every change a successful gameplay action made to what `getCurrentLiveWorldState()` and
 * `getCurrentRetiredWorldState()` return. A property that is absent is unchanged; the Agency is always present.
 * Applying the changes to both results from before the action gives exactly both results after it.
 */
export interface WorldStateChanges {
  readonly live: {
    readonly turn?: number;
    readonly panicHundredths?: number;
    readonly panicLimit?: number;
    readonly ending?: CurrentLiveWorldStateView['ending'];
    readonly agency: AgencyView;
    readonly agents?: CollectionChanges<AgentView>;
    readonly investigations?: CollectionChanges<InvestigationView>;
    readonly missionSites?: CollectionChanges<MissionSiteView>;
    readonly missions?: CollectionChanges<MissionView>;
    readonly factions?: CollectionChanges<FactionView>;
  };
  readonly retired: {
    readonly leads?: CollectionChanges<LeadView>;
    readonly agents?: CollectionChanges<AgentView>;
    readonly investigations?: CollectionChanges<InvestigationView>;
    readonly missionSites?: CollectionChanges<MissionSiteView>;
    readonly missions?: CollectionChanges<MissionView>;
  };
}

/** What a gameplay action other than Advance turn returns: whether it committed, and what it changed. */
export interface ActionOutcome extends CommitOutcome {
  readonly changes: WorldStateChanges;
}

/** Player API: ordinary gameplay queries and actions. */
export interface PlayerApi {
  readonly queries: {
    getCurrentLiveWorldState(): Result<CurrentLiveWorldStateView>;
    getCurrentRetiredWorldState(): Result<CurrentRetiredWorldStateView>;
    getCampaignConfiguration(): Result<CampaignConfigurationView>;
    /** None before the first committed Advance turn. */
    getTurnReport(): Result<TurnReport | null>;
    getHistory(): Result<HistoryView>;
    getAvailableActions(): Result<AvailableActionsView>;
    getGameData(): Result<GameDataView>;
    /** COMP: the Player-visible Compendium articles in their resolved form, in Game build order. */
    getCompendiumArticles(): Result<readonly CompendiumArticleView[]>;
    /**
     * COMP, Article term lookup: the identifier of the Player-visible article that has an Article term equal to the
     * text ignoring case, or null when there is none.
     */
    getArticleForTerm(text: string): Result<string | null>;
    previewDeployment(missionSite: string | null, agents: readonly string[]): Result<DeploymentPreview>;
    /**
     * INVSTG, Team progress estimate: the gain per Advance turn, in hundredths of a progress point, of a team of
     * exactly these Serving Agents once they all work; 0 for an empty list.
     */
    estimateTeamProgressGain(agents: readonly string[]): Result<number>;
    /**
     * PAPI, Action preview: whether the engine would accept `action` from this Principal in the Current world state,
     * and the rejection it would give otherwise. It changes nothing and is not a Player action.
     */
    previewAction(action: PlayerActionRequest): Result<ActionAvailability>;
  };
  readonly actions: {
    assignAgents(agents: readonly string[], assignment: SimpleAssignment): Promise<Result<ActionOutcome>>;
    /** ECON, Hiring Agents: hires `count` Agents in one Player action, or none when they do not all fit. */
    hireAgents(count: number): Promise<Result<ActionOutcome>>;
    dismissAgents(agents: readonly string[]): Promise<Result<ActionOutcome>>;
    purchaseUpgrade(upgrade: string): Promise<Result<ActionOutcome>>;
    startInvestigation(lead: string, agents: readonly string[]): Promise<Result<ActionOutcome>>;
    assignAgentsToInvestigation(
      investigation: string,
      agents: readonly string[],
    ): Promise<Result<ActionOutcome>>;
    deployAgents(missionSite: string, agents: readonly string[]): Promise<Result<ActionOutcome>>;
    /** Returns no changes; see PAPI, Action results. */
    advanceTurn(): Promise<Result<CommitOutcome>>;
  };
}

/** An Autopilot AI that a Game build offers. */
export interface AutopilotAi {
  readonly id: string;
  readonly name: string;
  /**
   * Plays on through Player API: makes queries and commits at least one Player action, or requests Advance turn. The
   * engine calls it again until the Autopilot engagement ends; see AUTO, What an Autopilot AI receives.
   */
  step(api: { readonly player: PlayerApi }): Promise<void> | void;
}
