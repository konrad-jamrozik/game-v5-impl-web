/**
 * Campaign state: World state, i.e. Current world state and World history, and Campaign configuration; see CSTATE,
 * Campaign state composition. It consists of Authoritative values only, and every stored quantity is a whole
 * number. Every Campaign instance has exactly the four properties Instance ID, Archetype reference, Constants, and
 * State; see CSTATE, Campaign instance structure.
 */
import type { RngState } from '../../kernel/index.ts';
import type { RandomOverride } from '../random.ts';

export interface Instance<C, S> {
  /** Instance ID. */
  readonly id: string;
  /** Archetype reference: the identifier of the Archetype GDR. */
  readonly archetype: string;
  readonly constants: C;
  state: S;
}

// ---- Agency (ECON) -------------------------------------------------------------------------------

export interface AgencyState {
  /** May be negative. */
  money: number;
  funding: number;
  /** For each Upgrade GDR, the number of times the Agency has purchased it. */
  acquisitions: Record<string, number>;
}
export type Agency = Instance<Record<string, never>, AgencyState>;

// ---- Agent (AGENT) -------------------------------------------------------------------------------

export type AgentLifecycle = 'Serving' | 'Killed' | 'Dismissed';
export type TaskPhase = 'AtAssignment' | 'InTransit';
export type SimpleAssignment = 'Standby' | 'Contracting' | 'Training';

export type Assignment =
  | { readonly kind: 'Standby' }
  | { readonly kind: 'Contracting' }
  | { readonly kind: 'Training' }
  | { readonly kind: 'Recovery' }
  | { readonly kind: 'Investigation'; readonly investigation: string }
  | { readonly kind: 'Deployed'; readonly mission: string };

export interface Participation {
  readonly kind: 'Investigation' | 'Mission';
  readonly id: string;
}

export interface AgentConstants {
  readonly agency: string;
  readonly turnHired: number;
}

export interface AgentState {
  lifecycle: AgentLifecycle;
  skill: number;
  currentHealth: number;
  baseHealth: number;
  exhaustion: number;
  /** A reference to the Weapon GDR. */
  weapon: string;
  weaponDamage: number;
  /** Present exactly when the Agent is Serving. */
  assignment: Assignment | null;
  /** Present exactly when the Agent is Serving. */
  taskPhase: TaskPhase | null;
  participationHistory: Participation[];
}
export type Agent = Instance<AgentConstants, AgentState>;

// ---- Faction (FACTION) ---------------------------------------------------------------------------

export interface FactionState {
  /** A reference to the FactionActivityLevel GDR. */
  activityLevel: string;
  /** Absent exactly when the Faction activity level is a final level. Never Player-visible. */
  turnsUntilNextLevel: number | null;
  /** Never Player-visible. */
  turnsUntilNextOperation: number;
  defeated: boolean;
  defeatedTurn: number | null;
}
export type Faction = Instance<Record<string, never>, FactionState>;

// ---- Investigation (INVSTG) ----------------------------------------------------------------------

export type InvestigationLifecycle = 'Active' | 'Completed' | 'Abandoned';

export interface InvestigationConstants {
  /** A reference to the Lead GDR. */
  readonly lead: string;
  readonly turnStarted: number;
}

export interface InvestigationState {
  lifecycle: InvestigationLifecycle;
  progress: number;
  currentTeam: string[];
}
export type Investigation = Instance<InvestigationConstants, InvestigationState>;

// ---- Mission site, Mission, Enemy (MISSION, COMBAT) ----------------------------------------------

export type MissionSiteKind = 'Initiative' | 'Response';
export type MissionSiteLifecycle = 'Active' | 'Attempted' | 'Expired' | 'Cancelled';

export type MissionSiteOrigin =
  | { readonly kind: 'Investigation'; readonly investigation: string }
  | {
      /** A Faction operation occurrence. */
      readonly kind: 'FactionOperation';
      readonly initiatingFaction: string;
      /** A reference to the FactionOperationLevel GDR. */
      readonly operationLevel: string;
    };

export interface MissionSiteConstants {
  readonly kind: MissionSiteKind;
  readonly origin: MissionSiteOrigin;
  readonly targetFaction: string;
  readonly turnCreated: number;
}

export interface MissionSiteState {
  lifecycle: MissionSiteLifecycle;
  turnsUntilExpiry: number;
  /** The Enemies present, in their creation order. */
  enemies: string[];
}
export type MissionSite = Instance<MissionSiteConstants, MissionSiteState>;

export type MissionLifecycle = 'Deployed' | 'Won' | 'Lost';

export interface MissionConstants {
  readonly missionSite: string;
  readonly turnDeployed: number;
  readonly teamSent: readonly string[];
}

export interface MissionState {
  lifecycle: MissionLifecycle;
  currentTeam: string[];
}
export type Mission = Instance<MissionConstants, MissionState>;

export interface EnemyConstants {
  readonly missionSite: string;
}

export interface EnemyState {
  skill: number;
  currentHealth: number;
  baseHealth: number;
  exhaustion: number;
  weapon: string;
  weaponDamage: number;
}
export type Enemy = Instance<EnemyConstants, EnemyState>;

// ---- Combat report (COMBAT) ----------------------------------------------------------------------

export type CombatOutcome = 'Prevailed' | 'Wiped' | 'Retreated';
export type CombatantCondition = 'ableToFight' | 'incapacitated' | 'dead';

export interface CombatParticipantReport {
  readonly id: string;
  readonly side: 'agent' | 'enemy';
  readonly start: {
    readonly skill: number;
    readonly currentHealth: number;
    readonly baseHealth: number;
    readonly exhaustion: number;
    readonly weaponDamage: number;
    readonly effectiveSkill: number;
    readonly incapacitated: boolean;
  };
  readonly final: {
    readonly currentHealth: number;
    readonly exhaustion: number;
    readonly effectiveSkill: number;
    readonly condition: CombatantCondition;
  };
  readonly damageDealt: number;
  readonly damageTaken: number;
}

export interface AttackRecord {
  readonly round: number;
  readonly attacker: string;
  readonly defender: string;
  /** The attacker's effective skill. */
  readonly a: number;
  /** The defender's effective skill. */
  readonly d: number;
  /** The hit Probability as the pair of whole numbers A² and A² + D². */
  readonly hitProbability: { readonly n: number; readonly d: number };
  readonly hit: boolean;
  /** Absent, not zero, for a miss. */
  readonly damage: number | null;
  readonly healthRemoved: number;
  readonly attackerAfter: { readonly currentHealth: number; readonly exhaustion: number };
  readonly defenderAfter: { readonly currentHealth: number; readonly exhaustion: number };
  readonly defenderDead: boolean;
  readonly defenderIncapacitated: boolean;
  readonly attackerIncapacitated: boolean;
}

export interface CombatReport {
  readonly mission: string;
  readonly outcome: CombatOutcome;
  readonly rounds: number;
  /** The Agents' side in its fixed order. */
  readonly agents: readonly string[];
  /** The Enemies' side in its fixed order. */
  readonly enemies: readonly string[];
  readonly participants: readonly CombatParticipantReport[];
  /** The Combat rating of each side at Combat start, as round 0, and at the end of every Combat round. */
  readonly ratings: readonly { readonly round: number; readonly agents: number; readonly enemies: number }[];
  readonly log: readonly AttackRecord[];
}

// ---- Campaign-wide values (ENDING, LEAD, TURN) ---------------------------------------------------

export type CampaignEnding = 'Victory' | 'Defeat';
export type EndingReason = 'EveryFactionDefeated' | 'PanicAtTheLimit' | 'MoneyBelowZero';

export interface CurrentWorldState {
  /** The Campaign seed; never Player-visible. */
  readonly seed: string;
  rng: RngState;
  /** The next number of the counter that all Instance IDs share. */
  nextInstanceNumber: number;
  /** Pending random outcome overrides; see DEV, Random outcome overrides. */
  randomOverrides: RandomOverride[];
  turn: number;
  panic: number;
  ending: CampaignEnding | null;
  endingReasons: EndingReason[];
  endingTurn: number | null;
  agency: Agency;
  agents: Record<string, Agent>;
  factions: Record<string, Faction>;
  investigations: Record<string, Investigation>;
  missionSites: Record<string, MissionSite>;
  missions: Record<string, Mission>;
  enemies: Record<string, Enemy>;
  /** Lead progression: for each Lead GDR, the Won Missions at the Mission sites it created. */
  leadProgression: Record<string, string[]>;
}

// ---- World history: Turn report, History entries, Turn series ------------------------------------

/** What one consequence of a Mission or a Mission site changed; see MISSION, Consequences. */
export interface ConsequenceRecord {
  readonly money: number;
  readonly fundingChange: number;
  readonly panicIncrease: number;
  readonly panicReduction: number;
  readonly defeatedFaction: string | null;
}

export interface MissionResultRecord {
  readonly mission: string;
  readonly missionSite: string;
  readonly missionSiteArchetype: string;
  readonly kind: MissionSiteKind;
  readonly result: 'Won' | 'Lost';
  readonly killed: readonly string[];
  /** Survivors sent to Recovery. */
  readonly toRecovery: readonly string[];
  /** Survivors sent to Standby. */
  readonly toStandby: readonly string[];
  readonly consequence: ConsequenceRecord;
  /** The Lead whose Lead progression recorded the win, if any. */
  readonly recordedWinForLead: string | null;
}

export interface TurnReport {
  /** The turn number of the Turn that this Advance turn ended. */
  readonly turn: number;
  readonly transit: { readonly arrived: readonly string[] };
  readonly income: {
    readonly funding: number;
    readonly contractingAgents: number;
    readonly income: number;
    readonly moneyAfter: number;
  };
  readonly upkeep: { readonly servingAgents: number; readonly upkeep: number; readonly moneyAfter: number };
  readonly training: readonly { readonly agent: string; readonly skillAfter: number }[];
  readonly investigations: readonly {
    readonly investigation: string;
    readonly lead: string;
    readonly progressGain: number;
    readonly progressAfter: number;
    readonly completed: boolean;
    readonly createdMissionSite: string | null;
  }[];
  readonly missions: readonly MissionResultRecord[];
  readonly combatReports: readonly CombatReport[];
  readonly cancelledMissionSites: readonly string[];
  readonly expiredMissionSites: readonly {
    readonly missionSite: string;
    readonly missionSiteArchetype: string;
    readonly kind: MissionSiteKind;
    readonly consequence: ConsequenceRecord;
  }[];
  readonly factionActivity: readonly {
    readonly faction: string;
    /** The Faction activity level the Faction moved to, if it escalated. */
    readonly escalatedTo: string | null;
    /** The Response Mission site its Faction operation occurrence created, if one happened. */
    readonly createdMissionSite: string | null;
    readonly operationLevel: string | null;
  }[];
  readonly recovery: readonly {
    readonly agent: string;
    readonly healthAfter: number;
    readonly exhaustionAfter: number;
    readonly recovered: boolean;
  }[];
  readonly panic: { readonly before: number; readonly after: number };
  readonly funding: { readonly before: number; readonly after: number };
  readonly money: { readonly turnEnd: number; readonly after: number };
  readonly ending: {
    readonly ending: CampaignEnding;
    readonly reasons: readonly EndingReason[];
  } | null;
}

/** A reduced form of one Committed state, kept in a History entry. */
export interface StateSummary {
  readonly money: number;
  readonly funding: number;
  readonly panic: number;
  readonly servingAgents: number;
  readonly activeInvestigations: number;
  readonly activeMissionSites: number;
}

/** One ended Turn in reduced form; see DEC-016. */
export interface HistoryEntry {
  readonly turn: number;
  readonly turnStart: StateSummary;
  readonly turnEnd: StateSummary;
  /** The reduced form of the Turn report of the Advance turn that ended the Turn. */
  readonly report: {
    readonly income: number;
    readonly upkeep: number;
    readonly missions: readonly {
      readonly mission: string;
      readonly missionSite: string;
      readonly missionSiteArchetype: string;
      readonly kind: MissionSiteKind;
      readonly result: 'Won' | 'Lost';
      readonly combatOutcome: CombatOutcome;
      readonly combatRounds: number;
      readonly killed: readonly string[];
      /** Agents that survived with current health below base health. */
      readonly wounded: readonly string[];
      /** Agents that survived with current health equal to base health. */
      readonly unharmed: readonly string[];
    }[];
    readonly completedInvestigations: readonly string[];
    readonly createdMissionSites: readonly string[];
    readonly expiredMissionSites: readonly string[];
    readonly cancelledMissionSites: readonly string[];
    readonly escalatedFactions: readonly string[];
    readonly panicAfter: number;
    readonly moneyAfter: number;
    readonly fundingAfter: number;
    readonly ending: CampaignEnding | null;
  };
}

export interface TurnSeriesValue {
  readonly turn: number;
  readonly value: number;
}

export interface WorldHistory {
  /** The Turn report of the most recent committed Advance turn, or none before the first. */
  turnReport: TurnReport | null;
  historyEntries: HistoryEntry[];
  /** The reduced form of the Turn-start state of the current Turn, for its History entry. */
  currentTurnStart: StateSummary;
  /** ECON, Turn series of money. */
  moneyAtStartOfTurn: TurnSeriesValue[];
  moneyAtEndOfTurn: TurnSeriesValue[];
}

/** ECON, Campaign configuration values. Both are fixed after creation. */
export interface CampaignConfiguration {
  readonly startingMoney: number;
  readonly startingFunding: number;
  readonly [key: string]: number;
}

export interface CampaignState {
  readonly configuration: CampaignConfiguration;
  readonly world: {
    readonly current: CurrentWorldState;
    readonly history: WorldHistory;
  };
}
