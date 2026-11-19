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
  readonly exhaustionIncapacitation: number;
  readonly exhaustionFreePoints: number;
  readonly skillPenaltyPctPerExhaustion: number;
  readonly exhaustionPerAttack: number;
  readonly exhaustionPerDefense: number;
  readonly exhaustionPerMission: number;
  readonly exhaustionPerPctKilled: number;
  readonly exhaustionPerContractingTurn: number;
  readonly exhaustionPerTrainingTurn: number;
  readonly exhaustionPerInvestigationTurn: number;
  readonly exhaustionWorkStartMax: number;
  readonly exhaustionWorkLimit: number;
  /** A Decimal quantity, in hundredths; see NUMBERS, Decimal quantities. */
  readonly trainingSkillGainPerTurnHundredths: number;
  /** COMBAT, Combat skill gain: the amounts per attack, by the Agent's part in it and its hit outcome. */
  readonly skillGainPerAttackHit: number;
  readonly skillGainPerAttackMiss: number;
  readonly skillGainPerDefenseHit: number;
  readonly skillGainPerDefenseMiss: number;
  /** AGENT, Mission growth: the survival skill gain of the first, second, and each later Mission survived. */
  readonly skillGainPerMissionSurvived: readonly number[];
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
  /** A Decimal quantity of percent, in hundredths; see NUMBERS, Decimal quantities. */
  readonly healthRecoveryPctPerTurnHundredths: number;
  /** A Decimal quantity, in hundredths. */
  readonly exhaustionRecoveryPerTurnHundredths: number;
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

export type UpgradeEffect =
  | 'agent_cap'
  | 'transport_cap'
  | 'training_cap'
  | 'agent_weapon_damage'
  | 'agent_max_health'
  | 'training_skill_gain'
  | 'exhaustion_recovery'
  | 'health_recovery';

export interface UpgradeGdr {
  readonly type: 'Upgrade';
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly effect: UpgradeEffect;
  /**
   * The Increment in hundredths: a Decimal quantity for a Rate Upgrade, and a whole number, i.e. a multiple of 100,
   * for every other Upgrade; see ECON, Economy GDR validation, rule 5.
   */
  readonly incrementHundredths: number;
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
  /** The Required progress, in progress points (INVSTG, LEAD). */
  readonly requiredProgress: number;
  readonly requires: readonly { readonly missionWon: string }[];
  readonly onCompletion: { readonly createMissionSite: string };
}

export interface InvestigationArchetypeGdr {
  readonly type: 'InvestigationArchetype';
  readonly id: string;
  readonly name: string;
}

/** INVSTG, InvestigationParameters. */
export interface InvestigationParametersGdr {
  readonly type: 'InvestigationParameters';
  readonly id: string;
  /** The exponent e of the team efficiency n^e / n, read exactly as written. */
  readonly teamEfficiencyExponent: Rational;
  readonly requiredProgressMaxPct: number;
  readonly assessmentThresholdPct: number;
}

export interface MissionSiteArchetypeGdr {
  readonly type: 'MissionSiteArchetype';
  readonly id: string;
  readonly name: string;
  readonly kind: 'initiative' | 'response';
  readonly expiresInTurns: number;
  /** The identifier of an EnemyArchetype and its count, in the authored order. */
  readonly enemies: readonly (readonly [string, number])[];
  /** What a Won Initiative Mission gives, from its `on_win` Effect list; an absent Effect kind means 0, or false. */
  readonly onWin: {
    readonly money: number;
    readonly funding: number;
    readonly panicReductionPct: number;
    readonly eliminateTargetFaction: boolean;
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

/** COMP, EncyclopediaArticle: Display content only; no game behavior reads it. */
export interface EncyclopediaArticleGdr {
  readonly type: 'EncyclopediaArticle';
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** The identifier of the GDR the article is about; absent for a Guide article. */
  readonly subject: string | null;
}

/** MUSIC, Soundtrack: Display content only; no game behavior reads it. */
export interface MusicParametersGdr {
  readonly type: 'MusicParameters';
  readonly id: string;
  /** The files of `assets/music/tracks/` that are not Tracks, each by its file name with its extension. */
  readonly excludedTracks: readonly string[];
}

/** VIS, Background artwork: Display content only; no game behavior reads it. */
export interface BackgroundArtworkGdr {
  readonly type: 'BackgroundArtwork';
  readonly id: string;
  /** The Detail view that shows the image, by its name in lowercase words joined by underscores, e.g. `missions`. */
  readonly detailView: string;
  /** The image path relative to the Spec repo root, e.g. `assets/images/chatgpt-agents-i2.png`. */
  readonly image: string;
  /** A whole number from 0 to 100. */
  readonly opacityPct: number;
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
  | InvestigationParametersGdr
  | MissionSiteArchetypeGdr
  | MissionArchetypeGdr
  | EndingParametersGdr
  | EncyclopediaArticleGdr
  | BackgroundArtworkGdr
  | MusicParametersGdr;

/** An Encyclopedia article with its subject resolved to the Type of the subject GDR. */
export interface CatalogEncyclopediaArticle extends EncyclopediaArticleGdr {
  /** The Type of the subject GDR, e.g. `EnemyArchetype`; absent for a Guide article. */
  readonly subjectType: Exclude<AnyGdr['type'], 'EncyclopediaArticle'> | null;
}

/** The GDRs of one Game build, validated and resolved. */
export interface GdrCatalog {
  readonly agentArchetype: AgentArchetypeGdr;
  readonly agentParameters: AgentParametersGdr;
  readonly combatParameters: CombatParametersGdr;
  readonly recoveryParameters: RecoveryParametersGdr;
  readonly economy: EconomyParametersGdr;
  readonly agencyArchetype: AgencyArchetypeGdr;
  readonly investigationArchetype: InvestigationArchetypeGdr;
  readonly investigationParameters: InvestigationParametersGdr;
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
  /** COMP: every Encyclopedia article, in Game build order. */
  readonly encyclopediaArticles: readonly CatalogEncyclopediaArticle[];
  /** VIS, Background artwork: every BackgroundArtwork, in Game build order. */
  readonly backgroundArtworks: readonly BackgroundArtworkGdr[];
  /** MUSIC, Soundtrack: the GDR `music`. */
  readonly music: MusicParametersGdr;
}
