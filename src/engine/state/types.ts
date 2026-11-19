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

/** AGENT, Agent status. An Agent is Serving exactly when it is At assignment, In transit, or Recovering. */
export type AgentStatus = 'AtAssignment' | 'InTransit' | 'Recovering' | 'Killed' | 'Dismissed';

/** AGENT, Agent statuses: Serving. */
export function isServing(agent: { readonly status: AgentStatus }): boolean {
  return agent.status === 'AtAssignment' || agent.status === 'InTransit' || agent.status === 'Recovering';
}
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
  status: AgentStatus;
  /** AGENT, Agent properties: base skill, a Decimal quantity held in hundredths; see NUMBERS, Decimal quantities. */
  skillHundredths: number;
  /** AGENT, Agent properties: Experience, the base skill gained from Missions; only Mission growth changes it. */
  experience: number;
  /** Current health, a Decimal quantity held in hundredths. */
  currentHealthHundredths: number;
  baseHealth: number;
  /** AGENT, Exhaustion and Exact exhaustion: the stored Exact exhaustion, held in hundredths. */
  exactExhaustionHundredths: number;
  /** A reference to the Weapon GDR. */
  weapon: string;
  weaponDamage: number;
  /** Present exactly when the Agent is Serving. */
  assignment: Assignment | null;
  participationHistory: Participation[];
  /** AGENT, Service record: the number of Enemies the Agent's attacks have made dead. */
  enemiesKilled: number;
  /** AGENT, Service record: present exactly when the Agent is Terminated. */
  turnTerminated: number | null;
  /** AGENT, Service record: present exactly when the Agent is Killed. */
  killedBy: KilledBy | null;
}
/** AGENT, Agent properties: the Enemy whose attack made a Killed Agent dead, and that Enemy's Mission site. */
export interface KilledBy {
  readonly enemy: string;
  readonly missionSite: string;
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
  eliminated: boolean;
  eliminatedTurn: number | null;
}
export type Faction = Instance<Record<string, never>, FactionState>;

// ---- Investigation (INVSTG) ----------------------------------------------------------------------

export type InvestigationLifecycle = 'Active' | 'Completed' | 'Abandoned';

export interface InvestigationConstants {
  /** A reference to the Lead GDR. */
  readonly lead: string;
  readonly turnStarted: number;
  /** The Actual required progress, in progress points; hidden from the player. */
  readonly actualRequiredProgress: number;
}

export interface InvestigationState {
  lifecycle: InvestigationLifecycle;
  /** Investigation progress, in hundredths of a progress point. */
  progress: number;
  /** INVSTG, Assessment: changes only from false to true. */
  assessed: boolean;
  currentTeam: string[];
}
export type Investigation = Instance<InvestigationConstants, InvestigationState>;

// ---- Mission site, Mission, Enemy (MISSION, COMBAT) ----------------------------------------------

export type MissionSiteKind = 'Initiative' | 'Response';
export type MissionSiteLifecycle = 'Active' | 'Deployed' | 'Concluded' | 'Expired' | 'Cancelled';

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
  turnsUntilExpiration: number;
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
  /**
   * Base skill, current health, and the damage values are in hundredths for every Combatant, an Agent's being Decimal
   * quantities and an Enemy's whole numbers times 100; exhaustion is the whole exhaustion; see DEC-056.
   */
  readonly start: {
    readonly skillHundredths: number;
    readonly currentHealthHundredths: number;
    readonly baseHealth: number;
    readonly exhaustion: number;
    readonly weaponDamage: number;
    readonly effectiveSkill: number;
    readonly incapacitated: boolean;
  };
  readonly final: {
    readonly currentHealthHundredths: number;
    readonly exhaustion: number;
    readonly effectiveSkill: number;
    readonly condition: CombatantCondition;
  };
  readonly damageDealtHundredths: number;
  readonly damageTakenHundredths: number;
  /** COMBAT, Combat skill gain: an Agent's, a whole number of at least 0; absent for an Enemy, which has none. */
  readonly combatSkillGain: number | null;
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
  /** In hundredths, as is each current health below; exhaustion is whole. */
  readonly healthRemovedHundredths: number;
  readonly attackerAfter: { readonly currentHealthHundredths: number; readonly exhaustion: number };
  readonly defenderAfter: { readonly currentHealthHundredths: number; readonly exhaustion: number };
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
export type EndingReason = 'EveryFactionEliminated' | 'PanicAtTheLimit' | 'MoneyBelowZero';

export interface CurrentWorldState {
  /** The Campaign seed; never Player-visible. */
  readonly seed: string;
  rng: RngState;
  /**
   * For each Campaign instance Type, by its Instance ID prefix, e.g. `mission-site`, the number its next Campaign
   * instance takes; a Type with no Campaign instance yet is absent and starts at 1. See CINST, Campaign instance
   * identity.
   */
  nextInstanceNumbers: Record<string, number>;
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
}

// ---- World history: Turn report, History entries, Turn series ------------------------------------

/** What one consequence of a Mission or a Mission site changed; see MISSION, Consequences. */
export interface ConsequenceRecord {
  readonly money: number;
  readonly fundingChange: number;
  readonly panicIncrease: number;
  readonly panicReduction: number;
  readonly eliminatedFaction: string | null;
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
  /** MISSION, Turn report, and AGENT, Mission growth: what each survivor gained, in the order of the Current team. */
  readonly growth: readonly MissionGrowthRecord[];
  readonly consequence: ConsequenceRecord;
}

/** AGENT, Mission growth: one survivor's gains from one Mission and its values after them. */
export interface MissionGrowthRecord {
  readonly agent: string;
  readonly survivalSkillGain: number;
  readonly missionSkillGain: number;
  /** Base skill after the gain, in hundredths. */
  readonly skillAfterHundredths: number;
  readonly experienceAfter: number;
}

/** INVSTG, Turn report: one Investigation completed in an Advance turn. */
export interface InvestigationCompletedRecord {
  readonly investigation: string;
  /** The gain its Progress gain added in that Advance turn, in hundredths of a progress point. */
  readonly gain: number;
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
  readonly training: readonly {
    readonly agent: string;
    /** The Training gain outcome: whether the Agent gained base skill. */
    readonly gained: boolean;
    /** Base skill after the step, in hundredths. */
    readonly skillAfterHundredths: number;
    readonly exhaustionAfter: number;
  }[];
  /** AGENT, Forced return: the Agents that work sent back to Standby in this Advance turn. */
  readonly forcedReturns: readonly {
    readonly agent: string;
    readonly from: 'Contracting' | 'Training' | 'Investigation';
  }[];
  readonly investigations: readonly {
    readonly investigation: string;
    readonly lead: string;
    /** Hundredths of a progress point, as are the other progress values. */
    readonly progressGain: number;
    /** Whether it became Assessed in this step. */
    readonly becameAssessed: boolean;
    readonly completed: boolean;
    /** The progress lost to the Forced returns of this step, under INVSTG, Progress loss. */
    readonly progressLost: number;
    readonly progressAfter: number;
    /** Whether the Forced returns of this step left it with an empty Current team. */
    readonly abandoned: boolean;
    readonly createdMissionSite: string | null;
  }[];
  /**
   * INVSTG, Turn report: the Investigations completed in this Advance turn, in Campaign state order, each with the
   * gain of its last Progress gain, in hundredths of a progress point.
   */
  readonly investigationsCompleted: readonly InvestigationCompletedRecord[];
  readonly missions: readonly MissionResultRecord[];
  readonly combatReports: readonly CombatReport[];
  /** LEAD, Turn report: the Leads discovered in this Advance turn, by GDR identifier, in Game build order. */
  readonly discoveredLeads: readonly string[];
  /** MISSION, Turn report: the Mission sites created in this Advance turn, in creation order. */
  readonly createdMissionSites: readonly string[];
  /** MISSION, Turn report: the Mission sites that became Cancelled in this Advance turn. */
  readonly cancelledMissionSites: readonly string[];
  /** MISSION, Turn report: the Mission sites that became Expired in this Advance turn, with their Consequences. */
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
    /** Current health after the step, in hundredths. */
    readonly healthAfterHundredths: number;
    /** RECOVER, Turn report: the Exact exhaustion after the step, in hundredths, and the exhaustion it rounds up to. */
    readonly exactExhaustionAfterHundredths: number;
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

/** A reduced form of one World state, kept in a History entry. */
export interface StateSummary {
  readonly money: number;
  readonly funding: number;
  readonly panic: number;
  readonly servingAgents: number;
  readonly activeInvestigations: number;
  readonly activeMissionSites: number;
}

/**
 * WHIST, Action record: one Player action other than Advance turn, with the operation's name, the arguments it was
 * called with, and, under ECON, Money in the Action record, the Agency's money after it minus the money before it.
 */
export interface ActionRecordItem {
  readonly operation: string;
  /** Plain data, exactly as the action was called with it; every Instance ID in it stays resolvable. */
  readonly args: unknown;
  readonly moneyChange: number;
}

/** One ended Turn in reduced form; see DEC-016. */
export interface HistoryEntry {
  readonly turn: number;
  readonly turnStart: StateSummary;
  readonly turnEnd: StateSummary;
  /** WHIST, Action record: the Player actions of the Turn, in full, in the order they were committed. */
  readonly actions: readonly ActionRecordItem[];
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
    /** INVSTG, Turn report: the same list as the Turn report, unreduced. */
    readonly investigationsCompleted: readonly InvestigationCompletedRecord[];
    /** LEAD, Turn report: the same list as the Turn report, unreduced. */
    readonly discoveredLeads: readonly string[];
    /** MISSION, Turn report: the same three lists as the Turn report, unreduced, by Instance ID. */
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

/**
 * WHIST, Open History entry: the History entry the current Turn would get if Advance turn ended it at the current
 * World state, without the Turn report part. It is a Derived value, never stored: `turnStart` and `actions` are
 * `currentTurnStart` and `currentActions` of World history, and `turnEnd` is the reduced form of the current state.
 */
export interface OpenHistoryEntry {
  readonly turn: number;
  readonly turnStart: StateSummary;
  readonly turnEnd: StateSummary;
  readonly actions: readonly ActionRecordItem[];
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
  /** WHIST, Action record, Kept during the Turn: the Action record of the current Turn, i.e. of the Open History entry. */
  currentActions: ActionRecordItem[];
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
