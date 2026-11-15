/** The Types of the GDRs a Game build supplies, as their owning specifications state them. */
import type { Rational } from '../kernel/index.ts';

export interface AgentArchetypeGdr {
  readonly type: 'AgentArchetype';
  readonly id: string;
  readonly name: string;
  readonly skill: number;
  readonly baseHealth: number;
  readonly weapon: string;
}

export interface AgentParametersGdr {
  readonly type: 'AgentParameters';
  readonly id: string;
  readonly initialRosterSize: number;
  readonly exhaustionCap: number;
  readonly exhaustionFreePoints: number;
  readonly skillPenaltyPctPerExhaustion: number;
  readonly exhaustionPerAttack: number;
  readonly exhaustionPerDefense: number;
  readonly trainingSkillGainPerTurn: number;
}

export interface WeaponGdr {
  readonly type: 'Weapon';
  readonly id: string;
  readonly name: string;
  readonly damage: number;
}

export interface EnemyArchetypeGdr {
  readonly type: 'EnemyArchetype';
  readonly id: string;
  readonly name: string;
  readonly skill: number;
  readonly baseHealth: number;
  readonly weapon: string;
}

/** Each value is a ratio read as the exact decimal number it is written as. */
export interface CombatParametersGdr {
  readonly type: 'CombatParameters';
  readonly id: string;
  readonly weaponDamageRange: Rational;
  readonly retreatBelowAgentRatingFraction: Rational;
  readonly retreatAtEnemyToAgentRating: Rational;
  readonly incapacitationSkillFraction: Rational;
}

export interface RecoveryParametersGdr {
  readonly type: 'RecoveryParameters';
  readonly id: string;
  readonly healthRecoveryPctPerTurn: number;
  readonly exhaustionRecoveryPerTurn: number;
}

export interface EconomyParametersGdr {
  readonly type: 'EconomyParameters';
  readonly id: string;
  readonly hireCost: number;
  readonly upkeepPerAgent: number;
  readonly contractingIncomePerAgent: number;
  readonly baseAgentCap: number;
  readonly baseTransportCap: number;
  readonly baseTrainingCap: number;
}

export type UpgradeEffect = 'agent_cap' | 'transport_cap' | 'training_cap' | 'agent_weapon_damage';

export interface UpgradeGdr {
  readonly type: 'Upgrade';
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly effect: UpgradeEffect;
  readonly increment: number;
}

export interface AgencyArchetypeGdr {
  readonly type: 'AgencyArchetype';
  readonly id: string;
  readonly name: string;
}

export interface CampaignConfigurationGdr {
  readonly type: 'CampaignConfiguration';
  readonly id: string;
  readonly startingMoney: number;
  readonly startingFunding: number;
}

export interface ConfigurationParametersGdr {
  readonly type: 'ConfigurationParameters';
  readonly id: string;
  readonly defaultPreset: string;
}

export interface FactionArchetypeGdr {
  readonly type: 'FactionArchetype';
  readonly id: string;
  readonly name: string;
  readonly initialActivityLevel: string;
}

export interface FactionActivityLevelGdr {
  readonly type: 'FactionActivityLevel';
  readonly id: string;
  readonly name: string;
  readonly lastsTurns: readonly [number, number] | null;
  readonly operationEveryTurns: readonly [number, number];
  /** The `level` of a FactionOperationLevel and its weight, in the authored order. */
  readonly operationLevelWeights: readonly (readonly [number, number])[];
  readonly next: string | null;
}

export interface FactionOperationLevelGdr {
  readonly type: 'FactionOperationLevel';
  readonly id: string;
  readonly level: number;
  readonly name: string;
  readonly onWin: { readonly money: number; readonly funding: number };
  readonly onIgnoredOrLost: { readonly panicIncreasePct: number; readonly funding: number };
}

export interface LeadGdr {
  readonly type: 'Lead';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The identifier of a FactionArchetype. */
  readonly faction: string;
  readonly difficulty: number;
  readonly requires: readonly { readonly missionWonFromLead: string }[];
  readonly onCompletion: { readonly createMissionSite: string };
}

export interface InvestigationArchetypeGdr {
  readonly type: 'InvestigationArchetype';
  readonly id: string;
  readonly name: string;
}

export interface MissionSiteArchetypeGdr {
  readonly type: 'MissionSiteArchetype';
  readonly id: string;
  readonly name: string;
  readonly kind: 'initiative' | 'response';
  readonly expiresInTurns: number;
  /** The identifier of an EnemyArchetype and its count, in the authored order. */
  readonly enemies: readonly (readonly [string, number])[];
  /** What a Won Initiative Mission gives; a missing property means 0, or false. */
  readonly onWin: {
    readonly money: number;
    readonly funding: number;
    readonly panicReductionPct: number;
    readonly defeatTargetFaction: boolean;
  };
  /** Only for the `response` kind: the `level` of the Faction operation level it serves. */
  readonly operationLevel: number | null;
}

export interface MissionArchetypeGdr {
  readonly type: 'MissionArchetype';
  readonly id: string;
  readonly name: string;
}

export interface EndingParametersGdr {
  readonly type: 'EndingParameters';
  readonly id: string;
  readonly defeatAtPanicPct: number;
}

export type AnyGdr =
  | AgentArchetypeGdr
  | AgentParametersGdr
  | WeaponGdr
  | EnemyArchetypeGdr
  | CombatParametersGdr
  | RecoveryParametersGdr
  | EconomyParametersGdr
  | UpgradeGdr
  | AgencyArchetypeGdr
  | CampaignConfigurationGdr
  | ConfigurationParametersGdr
  | FactionArchetypeGdr
  | FactionActivityLevelGdr
  | FactionOperationLevelGdr
  | LeadGdr
  | InvestigationArchetypeGdr
  | MissionSiteArchetypeGdr
  | MissionArchetypeGdr
  | EndingParametersGdr;

/** The GDRs of one Game build, validated and resolved. */
export interface GdrCatalog {
  readonly agentArchetype: AgentArchetypeGdr;
  readonly agentParameters: AgentParametersGdr;
  readonly combatParameters: CombatParametersGdr;
  readonly recoveryParameters: RecoveryParametersGdr;
  readonly economy: EconomyParametersGdr;
  readonly agencyArchetype: AgencyArchetypeGdr;
  readonly investigationArchetype: InvestigationArchetypeGdr;
  readonly missionArchetype: MissionArchetypeGdr;
  readonly endingParameters: EndingParametersGdr;
  readonly configurationParameters: ConfigurationParametersGdr;
  readonly weapons: ReadonlyMap<string, WeaponGdr>;
  readonly enemyArchetypes: ReadonlyMap<string, EnemyArchetypeGdr>;
  readonly upgrades: readonly UpgradeGdr[];
  readonly campaignConfigurations: readonly CampaignConfigurationGdr[];
  readonly factionArchetypes: readonly FactionArchetypeGdr[];
  readonly factionActivityLevels: ReadonlyMap<string, FactionActivityLevelGdr>;
  readonly factionOperationLevels: readonly FactionOperationLevelGdr[];
  readonly leads: readonly LeadGdr[];
  readonly missionSiteArchetypes: readonly MissionSiteArchetypeGdr[];
}
