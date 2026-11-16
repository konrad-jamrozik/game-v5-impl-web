/**
 * Player API and Autopilot memory API, as types. This is everything an Autopilot AI may see of the engine: every
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
  readonly skill: number;
  readonly effectiveSkill: number;
  readonly currentHealth: number;
  readonly baseHealth: number;
  readonly exhaustion: number;
  readonly weapon: string;
  readonly weaponName: string;
  readonly weaponDamage: number;
  /** Absent for a Killed or Dismissed Agent. */
  readonly assignment: Assignment | null;
  readonly canBeAssigned: boolean;
  /** Whether the Agent would be able to fight if a Combat began now. */
  readonly ableToFight: boolean;
  readonly participationHistory: readonly Participation[];
  /** Reported for every Serving Agent. */
  readonly healthRecoveryRate: number | null;
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
  readonly currentHealth: number;
  readonly baseHealth: number;
  readonly exhaustion: number;
  readonly weapon: string;
  readonly weaponName: string;
  readonly weaponDamage: number;
}

export interface ConsequenceView {
  readonly money: number;
  readonly fundingChange: number;
  readonly panicIncrease: number;
  readonly panicReduction: number;
  readonly eliminatesTargetFaction: boolean;
}

export interface MissionSiteView {
  readonly id: string;
  readonly archetype: string;
  readonly name: string;
  readonly kind: MissionSiteKind;
  readonly origin: MissionSiteOrigin;
  /** The Lead that created an Initiative Mission site. */
  readonly lead: string | null;
  /** The Faction operation level of a Response Mission site. */
  readonly operationLevel: { readonly id: string; readonly level: number; readonly name: string } | null;
  readonly targetFaction: string;
  readonly turnCreated: number;
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

export interface InvestigationView {
  readonly id: string;
  readonly archetype: string;
  readonly lead: string;
  readonly leadName: string;
  readonly difficulty: number;
  readonly turnStarted: number;
  readonly lifecycle: InvestigationLifecycle;
  readonly progress: number;
  /** The Investigation progress at which it always completes: difficulty × 100. */
  readonly progressForCertainCompletion: number;
  readonly currentTeam: readonly { readonly agent: string; readonly agentStatus: AgentStatus }[];
  /** Absent for a Completed or Abandoned Investigation. */
  readonly projectedCompletionProbability: ProbabilityPair | null;
}

export interface LeadView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The FactionArchetype the Lead names, and the Faction of the Campaign that has it. */
  readonly factionArchetype: string;
  readonly faction: string | null;
  readonly difficulty: number;
  /** Each prerequisite: the MissionSiteArchetype its `mission_won` names, and whether it holds. */
  readonly requires: readonly { readonly missionWon: string; readonly holds: boolean }[];
  /** The MissionSiteArchetype its completion effect creates. */
  readonly createsMissionSite: string;
  readonly available: boolean;
  readonly conditions: {
    readonly prerequisitesHold: boolean;
    readonly noMissionWon: boolean;
    readonly noMissionSiteInProgress: boolean;
    readonly factionNotEliminated: boolean;
  };
  /** The numbers, 1 to 4, of the conditions of Lead availability that do not hold. */
  readonly blockingConditions: readonly number[];
  readonly canBeInvestigatedNow: boolean;
  /** The Lead's Active Investigation, when it has one. */
  readonly activeInvestigation: string | null;
}

export interface ActivityLevelView {
  readonly id: string;
  readonly name: string;
  readonly lastsTurns: readonly [number, number] | null;
  readonly operationEveryTurns: readonly [number, number];
  readonly operationLevelWeights: readonly { readonly level: number; readonly weight: number }[];
  readonly next: string | null;
}

export interface FactionView {
  readonly id: string;
  readonly archetype: string;
  readonly name: string;
  readonly activityLevel: ActivityLevelView;
  readonly eliminated: boolean;
  readonly eliminatedTurn: number | null;
}

export interface UpgradeView {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly effect: string;
  readonly increment: number;
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
  readonly servingAgents: number;
  readonly deployedAgents: number;
  readonly trainingAgents: number;
  readonly projectedIncome: number;
  readonly projectedUpkeep: number;
  readonly hireCost: number;
}

/** `player.queries.getCurrentState()`: Current world state and Campaign configuration. */
export interface CurrentStateView {
  readonly turn: number;
  readonly panic: number;
  readonly panicLimit: number;
  /** Absent while the Campaign is being played. */
  readonly ending: {
    readonly ending: CampaignEnding;
    readonly reasons: readonly EndingReason[];
    readonly turn: number;
  } | null;
  readonly configuration: { readonly startingMoney: number; readonly startingFunding: number };
  readonly agency: AgencyView;
  /** Serving Agents. */
  readonly agents: readonly AgentView[];
  /** Active Investigations. */
  readonly investigations: readonly InvestigationView[];
  readonly leads: readonly LeadView[];
  /** Active Mission sites, and Attempted ones whose Mission is Deployed. */
  readonly missionSites: readonly MissionSiteView[];
  /** Deployed Missions. */
  readonly missions: readonly MissionView[];
  readonly factions: readonly FactionView[];
}

/**
 * `player.queries.getHistory()`: the History entries, the Turn series, and the Campaign instances retained in World
 * history; see DEC-015.
 */
export interface HistoryView {
  readonly entries: readonly HistoryEntry[];
  readonly turnSeries: {
    readonly moneyAtStartOfTurn: readonly TurnSeriesValue[];
    readonly moneyAtEndOfTurn: readonly TurnSeriesValue[];
  };
  readonly retained: {
    /** Killed and Dismissed Agents. */
    readonly agents: readonly AgentView[];
    /** Completed and Abandoned Investigations. */
    readonly investigations: readonly InvestigationView[];
    /** Expired and Cancelled Mission sites, and Attempted ones whose Mission is Won or Lost. */
    readonly missionSites: readonly MissionSiteView[];
    /** Won and Lost Missions. */
    readonly missions: readonly MissionView[];
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
  readonly hireAgent: ActionAvailability;
  readonly purchaseUpgrade: readonly ({ readonly upgrade: string } & ActionAvailability)[];
  /** The Agents that can be ordered. */
  readonly assignableAgents: readonly string[];
  readonly assignAgents: {
    readonly assignments: readonly SimpleAssignment[];
    /** How many more Agents can be ordered to Training under the Training cap. */
    readonly trainingPlacesLeft: number;
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
  };
  readonly agentParameters: Readonly<Record<string, number>>;
  readonly combatParameters: Readonly<Record<string, string>>;
  readonly recoveryParameters: Readonly<Record<string, number>>;
  readonly economy: Readonly<Record<string, number>>;
  readonly weapons: readonly { readonly id: string; readonly name: string; readonly damage: number }[];
  readonly enemyArchetypes: readonly {
    readonly id: string;
    readonly name: string;
    readonly skill: number;
    readonly baseHealth: number;
    readonly weapon: string;
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
    readonly onIgnoredOrLost: { readonly panicIncreasePct: number; readonly funding: number };
  }[];
  readonly factionActivityLevels: readonly ActivityLevelView[];
  readonly names: {
    readonly agency: string;
    readonly investigation: string;
    readonly mission: string;
  };
}

/** The Combat ratings of a team of Agents and of a Mission site's Enemies, and whether deploying is accepted. */
export interface DeploymentPreview {
  readonly teamCombatRating: number;
  readonly enemiesCombatRating: number | null;
  readonly accepted: boolean;
  readonly reason: string | null;
  readonly message: string | null;
}

/** Player API: ordinary gameplay queries and actions. */
export interface PlayerApi {
  readonly queries: {
    getCurrentState(): Result<CurrentStateView>;
    /** None before the first committed Advance turn. */
    getTurnReport(): Result<TurnReport | null>;
    getHistory(): Result<HistoryView>;
    getAvailableActions(): Result<AvailableActionsView>;
    getGameData(): Result<GameDataView>;
    previewDeployment(missionSite: string | null, agents: readonly string[]): Result<DeploymentPreview>;
  };
  readonly actions: {
    assignAgents(agents: readonly string[], assignment: SimpleAssignment): Promise<Result<CommitOutcome>>;
    hireAgent(): Promise<Result<CommitOutcome>>;
    dismissAgents(agents: readonly string[]): Promise<Result<CommitOutcome>>;
    purchaseUpgrade(upgrade: string): Promise<Result<CommitOutcome>>;
    startInvestigation(lead: string, agents: readonly string[]): Promise<Result<CommitOutcome>>;
    assignAgentsToInvestigation(
      investigation: string,
      agents: readonly string[],
    ): Promise<Result<CommitOutcome>>;
    deployAgents(missionSite: string, agents: readonly string[]): Promise<Result<CommitOutcome>>;
    advanceTurn(): Promise<Result<CommitOutcome>>;
  };
}

/** Autopilot memory API: available only to the active Autopilot AI. */
export interface AutopilotMemoryApi {
  /** The Autopilot memory most recently written at or before the current Committed state, or its absence. */
  read(): Result<{ readonly present: boolean; readonly memory: unknown }>;
  write(memory: unknown): Promise<Result<null>>;
}

/** An Autopilot AI that a Game build offers. */
export interface AutopilotAi {
  readonly id: string;
  readonly name: string;
  /**
   * Plays on through Player API: makes queries and commits at least one Player action. The engine calls it again
   * until the Autopilot engagement ends.
   */
  step(api: {
    readonly player: PlayerApi;
    readonly autopilotMemory: AutopilotMemoryApi;
  }): Promise<void> | void;
}
