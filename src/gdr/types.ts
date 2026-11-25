/** The Types of the GDRs a Game build supplies, as their owning specifications state them. */
import type { Rational } from '../kernel/index.ts';

export interface AgentArchetypeGdr {
  readonly type: 'AgentArchetype';
  readonly id: string;
  readonly name: string;
  readonly skill: number;
  readonly baseHealth: number;
  readonly weapon: string;
  /** A reference to the Armor GDR a newly created Agent is equipped with. */
  readonly armor: string;
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
  /** COMBAT, Combat experience: the amounts per attack, by the Agent's part in it and its hit outcome. */
  readonly experiencePerAttackHit: number;
  readonly experiencePerAttackMiss: number;
  readonly experiencePerDefenseHit: number;
  readonly experiencePerDefenseMiss: number;
  /** AGENT, Mission growth: the survival experience of the first, second, and each later Mission survived. */
  readonly experiencePerMissionSurvived: readonly number[];
}

export interface WeaponGdr {
  readonly type: 'Weapon';
  readonly id: string;
  readonly name: string;
  readonly damage: number;
  /** EQUIP, Item: the money one costs; null for a Weapon that is no Item, e.g. the Fallback Weapon. */
  readonly price: number | null;
  /** COMBAT, Ammo in a Combat: the AmmoType one Agent attack with it spends; present exactly when `price` is. */
  readonly ammoType: string | null;
  /** EQUIP, Unlocked Items: the Leads of which any one, once completed, unlocks it; null when Unlocked from the start. */
  readonly unlockedBy: readonly string[] | null;
}

/** COMBAT, AmmoType: one kind of round a Weapon spends. */
export interface AmmoTypeGdr {
  readonly type: 'AmmoType';
  readonly id: string;
  readonly name: string;
  /** The money one round costs: a whole number of at least 1. */
  readonly price: number;
  /** Display content: how firing one round looks to the Player. */
  readonly shot: AmmoShot;
}

/** COMBAT, AmmoType: the values of `shot`. */
export type AmmoShot = 'bullet' | 'burst' | 'beam';

/** EQUIP, EquipmentParameters. */
export interface EquipmentParametersGdr {
  readonly type: 'EquipmentParameters';
  readonly id: string;
  /** The Fallback Armor: an Armor with no price. */
  readonly fallbackArmor: string;
  /** The rounds of each AmmoType in the Storage of a new Campaign; an AmmoType absent starts at 0. */
  readonly startingAmmo: Readonly<Record<string, number>>;
  /** The rounds of each AmmoType that each Agent `hireAgents` hires brings into Storage; an AmmoType absent gains none. */
  readonly hireAmmo: Readonly<Record<string, number>>;
  readonly salePriceFraction: Rational;
  readonly spoilsAmmoMax: number;
  readonly ammoShortRoundsPerAgent: number;
}

/** COMBAT, Armor: the base armor of the Combatants equipped with it. */
export interface ArmorGdr {
  readonly type: 'Armor';
  readonly id: string;
  readonly name: string;
  /** `base_armor`: a whole number of at least 0. */
  readonly armor: number;
  /** EQUIP, Item: the money one costs; null for an Armor that is no Item, e.g. the Fallback Armor. */
  readonly price: number | null;
  /** EQUIP, Unlocked Items: as for a Weapon. */
  readonly unlockedBy: readonly string[] | null;
}

export interface EnemyArchetypeGdr {
  readonly type: 'EnemyArchetype';
  readonly id: string;
  readonly name: string;
  readonly skill: number;
  readonly baseHealth: number;
  readonly weapon: string;
  readonly armor: string;
}

/** Each value is a ratio read as the exact decimal number it is written as. */
export interface CombatParametersGdr {
  readonly type: 'CombatParameters';
  readonly id: string;
  readonly weaponDamageRange: Rational;
  readonly retreatBelowAgentRatingFraction: Rational;
  readonly retreatAtEnemyToAgentRating: Rational;
  readonly incapacitationSkillFraction: Rational;
  /** COMBAT, Target selection: the Selection weight at exactly the preferred hit Probability; a whole number. */
  readonly targetBaseWeight: number;
  readonly targetPreferredHitChance: Rational;
  /** COMBAT, Combat rating: the effective max health at which the health term of the rating factor is 1. */
  readonly ratingBaseHealth: number;
  /** COMBAT, Combat rating: the effective armor at which the armor term of the rating factor is 1. */
  readonly ratingBaseArmor: number;
  /** COMBAT, Combat rating: the effective weapon damage at which the attack term of the rating factor is 1. */
  readonly ratingBaseWeaponDamage: number;
  /** COMBAT, Combat rating: the exponent of the number of a side's Combatants able to fight; from 1 to 2. */
  readonly ratingTeamSizeExponent: Rational;
  /** COMBAT, Ammo: the Fallback Weapon, a Weapon with no price and no ammo_type. */
  readonly fallbackWeapon: string;
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
  readonly contractingSkillScale: number;
  readonly baseAgentCap: number;
  readonly baseTransportCap: number;
  readonly baseTrainingCap: number;
  /** ECON, Contracting cap: the Contracting cap once Contracting is unlocked, before any first win raises it. */
  readonly baseContractingCap: number;
  /** ECON, Contracting cap: what each Initiative level won adds to the Contracting cap once Contracting is unlocked. */
  readonly contractingCapPerInitiativeLevel: number;
}

export type UpgradeEffect =
  | 'agent_cap'
  | 'transport_cap'
  | 'training_cap'
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
   * for every other Upgrade; see ECON, Upgrade.
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
  /** CONFIG, CampaignConfiguration: the display name of the preset. */
  readonly name: string;
  readonly startingMoney: number;
  readonly startingFunding: number;
  /** TURN, Prologue: 1 when campaign creation plays a Prologue, else 0. */
  readonly prologue: number;
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
  /** FACTION, FactionArchetype: how long the Faction stays at the first level; a duration of 0 skips it. */
  readonly initialLastsTurns: readonly [number, number];
}

export interface FactionActivityLevelGdr {
  readonly type: 'FactionActivityLevel';
  readonly id: string;
  readonly name: string;
  /** FACTION, FactionActivityLevel: `null` for a final level; `per_faction` for the first level, at which every
   * Faction starts; a duration of 0 skips the level. */
  readonly lastsTurns: readonly [number, number] | 'per_faction' | null;
  /** FACTION, FactionActivityLevel: `null` for a level without operations. */
  readonly operationEveryTurns: readonly [number, number] | null;
  /** The `level` of a FactionOperationLevel and its weight, in the authored order; empty for a level without operations. */
  readonly operationLevelWeights: readonly (readonly [number, number])[];
  readonly next: string | null;
}

export interface FactionOperationLevelGdr {
  readonly type: 'FactionOperationLevel';
  readonly id: string;
  readonly level: number;
  readonly name: string;
  readonly onWin: { readonly money: number; readonly funding: number };
  /**
   * MISSION, Consequences: the Panic increase, a Decimal quantity in hundredths of a percentage point; the funding
   * change; and whether a `defeat` Effect loses the Campaign (ENDING, Defeat Effect kind).
   */
  readonly onIgnoredOrLost: {
    readonly panicIncreaseHundredths: number;
    readonly funding: number;
    readonly defeat: boolean;
  };
}

export interface LeadGdr {
  readonly type: 'Lead';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The identifier of a FactionArchetype; none for a Lead that concerns no Faction. */
  readonly faction: string | null;
  /** The Required progress, in progress points (INVSTG, LEAD). */
  readonly requiredProgress: number;
  /** LEAD, Lead discovery: the Condition that discovers the Lead; none for a Lead discovered from campaign creation. */
  readonly discoveredWhen: Condition | null;
  /**
   * LEAD, Lead availability: whether the Lead can be investigated again; when omitted, `until_mission_won` for a Lead
   * that creates a Mission site and `never` for one that does not.
   */
  readonly investigateAgain: InvestigateAgain;
  /** LEAD, Completion effect: the Effects of `on_completion`; an Effect kind it does not hold is null or false. */
  readonly onCompletion: {
    /** The MissionSiteArchetype of kind initiative a `create_mission_site` Effect names. */
    readonly createMissionSite: string | null;
    /** Whether an `eliminate_faction` Effect makes the Faction of the Lead Eliminated. */
    readonly eliminateFaction: boolean;
    /** Whether an `unlock_contracting` Effect unlocks Contracting (ECON, Contracting Effect kind). */
    readonly unlockContracting: boolean;
    /** Whether a `win_campaign` Effect wins the Campaign (ENDING, Victory Effect kind). */
    readonly winCampaign: boolean;
  };
}

export type InvestigateAgain = 'never' | 'until_mission_won' | 'always';

/**
 * COND, Condition format: a Condition of one Condition kind with its value, or `all`, `any`, or `not` of Conditions.
 * The Condition kinds are `mission_won` and `mission_won_with_enemy` (MISSION) and `lead_completed` (LEAD).
 */
export type Condition =
  | { readonly kind: 'all'; readonly conditions: readonly Condition[] }
  | { readonly kind: 'any'; readonly conditions: readonly Condition[] }
  | { readonly kind: 'not'; readonly condition: Condition }
  | { readonly kind: 'mission_won'; readonly missionSiteArchetype: string }
  | { readonly kind: 'mission_won_with_enemy'; readonly enemyArchetype: string }
  | { readonly kind: 'lead_completed'; readonly lead: string };

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
  /** Only for the `initiative` kind: the words naming its first Won Mission, e.g. "first apprehension". */
  readonly firstWinPhrase: string | null;
  readonly expiresInTurns: number;
  /** The identifier of an EnemyArchetype and its count, in the authored order. */
  readonly enemies: readonly (readonly [string, number])[];
  /** What a Won Initiative Mission gives, from its `on_win` Effect list; an absent Effect kind means 0, or false. */
  readonly onWin: {
    readonly money: number;
    readonly funding: number;
    /** A Decimal quantity in hundredths of a percentage point (ENDING, Panic Effect kind). */
    readonly panicReductionHundredths: number;
    readonly eliminateTargetFaction: boolean;
  };
  /** Only for the `response` kind: the `level` of the Faction operation level it serves. */
  readonly operationLevel: number | null;
  /** MISSION, Whether a Mission site can exist: only for the `initiative` kind; none sets no such Condition. */
  readonly canExistWhen: Condition | null;
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

/** COMP, Article categories: a Guide article, a Mechanics article, or a Subject article. */
export type ArticleCategory = 'guide' | 'mechanics' | 'subject';

/** COMP, CompendiumArticle, as authored: Display content only; no game behavior reads it. */
export interface CompendiumArticleGdr {
  readonly type: 'CompendiumArticle';
  readonly id: string;
  readonly category: ArticleCategory;
  /** Only for a Guide article or a Mechanics article. */
  readonly title: string | null;
  /** Templated text. */
  readonly body: string;
  /** Only for a Subject article: the identifier of the GDR the article is about. */
  readonly subject: string | null;
  /** Only for a Mechanics article: its rows, each a `label` and a `text`, both templated text. */
  readonly formulas: readonly { readonly label: string; readonly text: string }[];
  /** The Article terms of the article. */
  readonly terms: readonly string[];
  /** The identifiers of the Compendium articles the article points the Player to. */
  readonly seeAlso: readonly string[];
  /** COMP, CompendiumArticle: the subject Type a Guide or Mechanics article is listed under, or none. */
  readonly listedUnder: string | null;
  /** COMP, Article visibility: the Condition that must hold for the article to be Player-visible; none sets none. */
  readonly visibleWhen: Condition | null;
}

/**
 * COMP, Placeholders: one part of a templated text after every Placeholder is replaced: a run of authored text, with
 * `{{` and `}}` replaced by the brace each stands for, or the text that replaces one Placeholder.
 */
export type TemplatePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'value'; readonly text: string };

export type ArticleTemplate = readonly TemplatePart[];

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

/** COMBAT, DetachedCombatTeam: a ready-made team of Agents for a Detached Combat; Display content, read by no rule. */
export interface DetachedCombatTeamGdr {
  readonly type: 'DetachedCombatTeam';
  readonly id: string;
  readonly name: string;
  /** One or more groups of equal Agents, in the fixed order of the Agents' side. */
  readonly agents: readonly {
    /** A whole number of at least 1. */
    readonly count: number;
    /** A whole number of at least 0. */
    readonly baseSkill: number;
    /** The effective max health, a whole number of at least 1; each Agent starts at full current health. */
    readonly maxHealth: number;
    /** A whole number of at least 0; 0 when the group leaves it out. */
    readonly exhaustion: number;
    readonly weapon: string;
    readonly armor: string;
  }[];
}

export type AnyGdr =
  | AgentArchetypeGdr
  | AgentParametersGdr
  | WeaponGdr
  | ArmorGdr
  | AmmoTypeGdr
  | EquipmentParametersGdr
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
  | CompendiumArticleGdr
  | BackgroundArtworkGdr
  | DetachedCombatTeamGdr;

/**
 * A Compendium article as the catalog holds it: with its displayed title, the Type of its subject, and every
 * Placeholder of its templated texts replaced. Its Article links depend on the World state and are found when the
 * article is read; see COMP, Article resolution.
 */
export interface CatalogCompendiumArticle {
  readonly type: 'CompendiumArticle';
  readonly id: string;
  readonly category: ArticleCategory;
  /** COMP, Displayed title: the `title`, or the `name` of the subject of a Subject article. */
  readonly title: string;
  /** Only for a Subject article: the identifier of the GDR the article is about. */
  readonly subject: string | null;
  /** The Type of the subject GDR, e.g. `EnemyArchetype`; absent for a Guide article or a Mechanics article. */
  readonly subjectType: Exclude<AnyGdr['type'], 'CompendiumArticle'> | null;
  readonly body: ArticleTemplate;
  readonly formulas: readonly { readonly label: ArticleTemplate; readonly text: ArticleTemplate }[];
  readonly terms: readonly string[];
  readonly seeAlso: readonly string[];
  /** COMP, CompendiumArticle: the `listed_under` subject Type, or none. */
  readonly listedUnder: string | null;
  /** COMP, Article visibility: the `visible_when` Condition, or none. */
  readonly visibleWhen: Condition | null;
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
  readonly armors: ReadonlyMap<string, ArmorGdr>;
  /** COMBAT, AmmoType: every AmmoType, in Game build order. */
  readonly ammoTypes: ReadonlyMap<string, AmmoTypeGdr>;
  /** EQUIP, EquipmentParameters: the GDR `equipment`. */
  readonly equipment: EquipmentParametersGdr;
  readonly enemyArchetypes: ReadonlyMap<string, EnemyArchetypeGdr>;
  readonly upgrades: readonly UpgradeGdr[];
  readonly campaignConfigurations: readonly CampaignConfigurationGdr[];
  readonly factionArchetypes: readonly FactionArchetypeGdr[];
  readonly factionActivityLevels: ReadonlyMap<string, FactionActivityLevelGdr>;
  readonly factionOperationLevels: readonly FactionOperationLevelGdr[];
  readonly leads: readonly LeadGdr[];
  readonly missionSiteArchetypes: readonly MissionSiteArchetypeGdr[];
  /** COMP: every Compendium article, in Game build order, i.e. in the ascending order of their identifiers. */
  readonly compendiumArticles: readonly CatalogCompendiumArticle[];
  /** VIS, Background artwork: every BackgroundArtwork, in Game build order. */
  readonly backgroundArtworks: readonly BackgroundArtworkGdr[];
  /** COMBAT, DetachedCombatTeam: every DetachedCombatTeam, in Game build order. */
  readonly detachedCombatTeams: readonly DetachedCombatTeamGdr[];
}
