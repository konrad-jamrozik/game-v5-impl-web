/**
 * Builds the GDR catalog of a Game build from the raw GDR files and applies every GDR validation rule of the
 * specifications. A Game build whose GDRs violate a rule is defective: the violation is reported as a data defect
 * and no Campaign is created from it; see ENG, World state integrity.
 */
import { z } from 'zod';
import { EngineDefect, Rational, q } from '../kernel/index.ts';
import { parseCompendiumArticle, validateCompendiumArticles, type RawGdr } from './compendium-articles.ts';
import type {
  AgentParametersGdr,
  AnyGdr,
  BackgroundArtworkGdr,
  CombatParametersGdr,
  CompendiumArticleGdr,
  Condition,
  FactionActivityLevelGdr,
  GdrCatalog,
  LeadGdr,
  MissionSiteArchetypeGdr,
} from './types.ts';

export interface RawGdrFile {
  readonly path: string;
  readonly gdrs: readonly unknown[];
}

/** GDR identifiers: a lowercase letter, then lowercase letters, digits, and underscores; see DEC-014. */
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

const id = z.string().regex(ID_PATTERN);
const name = z.string().min(1);
const whole = (min: number) => z.int().min(min);
/** A decimal number, read as the exact number it is written as. */
const decimal = z
  .union([z.int(), z.strictObject({ $decimal: z.string() })])
  .transform((value) => (typeof value === 'number' ? q(value) : Rational.parseDecimal(value.$decimal)));
/**
 * NUMBERS, Decimal quantities: a GDR value that is a Decimal quantity, written with at most two digits after the
 * decimal point, read exactly into its whole number of hundredths; e.g. `0.1` is 10 and `3` is 300. A value with more
 * digits is a data defect and is never rounded. `min` is in hundredths.
 */
const hundredths = (min: number) =>
  z
    .union([z.int(), z.strictObject({ $decimal: z.string() })])
    .transform((value, context) => {
      if (typeof value === 'number') {
        return value * 100;
      }
      const match = /^(\d+)\.(\d{1,2})$/.exec(value.$decimal);
      if (match === null) {
        context.addIssue({ code: 'custom', message: 'At most two digits after the decimal point' });
        return z.NEVER;
      }
      return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
    })
    .refine((value) => Number.isSafeInteger(value) && value >= min);
/**
 * NUMBERS, Decimal quantities: a GDR value that is a Decimal quantity and may be negative, e.g. the value of a `panic`
 * Effect (ENDING, Panic Effect kind), read exactly into its whole number of hundredths; e.g. `-0.05` is -5.
 */
const signedHundredths = z
  .union([z.int(), z.strictObject({ $decimal: z.string() })])
  .transform((value, context) => {
    if (typeof value === 'number') {
      return value * 100;
    }
    const match = /^([+-]?)(\d+)\.(\d{1,2})$/.exec(value.$decimal);
    if (match === null) {
      context.addIssue({ code: 'custom', message: 'At most two digits after the decimal point' });
      return z.NEVER;
    }
    const magnitude = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
    return match[1] === '-' ? 0 - magnitude : magnitude;
  })
  .refine((value) => Number.isSafeInteger(value));
/** A nested mapping, with its authored key order. */
const entries = <T extends z.ZodType>(value: T) =>
  z.strictObject({ $entries: z.array(z.tuple([z.string(), value])) }).transform((map) => map.$entries);
/**
 * EFFECT, Effect list format: a list, possibly empty, of Effects, each a map with exactly one key, its Effect kind,
 * and no two of one Effect kind. The value of each Effect by its Effect kind; the order of the Effects has no
 * meaning. Which Effect kinds a property permits, and their ranges, each property checks with `effectsOf`.
 */
const effectList = z.array(entries(z.unknown())).transform((list, context) => {
  const effects = new Map<string, unknown>();
  for (const effect of list) {
    const [only] = effect;
    if (effect.length !== 1 || only === undefined) {
      context.addIssue({ code: 'custom', message: 'Each Effect has exactly one Effect kind' });
      return z.NEVER;
    }
    if (effects.has(only[0])) {
      context.addIssue({ code: 'custom', message: 'At most one Effect of each Effect kind' });
      return z.NEVER;
    }
    effects.set(only[0], only[1]);
  }
  return effects;
});
/**
 * EFFECT, Applying an Effect list, Permitted Effect kinds: the Effects of an Effect list, each of a permitted Effect
 * kind and with a value in its permitted range; an Effect kind the list does not hold is absent.
 */
function effectsOf<S extends Record<string, z.ZodType>>(effects: ReadonlyMap<string, unknown>, permitted: S) {
  const shape = Object.fromEntries(
    Object.entries(permitted).map(([kind, value]) => [kind, value.optional()]),
  );
  return z.strictObject(shape).safeParse(Object.fromEntries(effects)) as z.ZodSafeParseResult<
    Partial<{ [K in keyof S]: z.output<S[K]> }>
  >;
}
/**
 * COND, Condition format: a map with exactly one key, `all`, `any`, `not`, or the name of a Condition kind, whose
 * value is a list of Conditions, one Condition, or the value of the Condition kind. Every Condition property permits
 * exactly the Condition kinds `mission_won` and `lead_completed`, each with a GDR identifier, whose references are
 * resolved under `conditionReferences`. Returns null for a Condition that violates the format.
 */
function parseCondition(raw: unknown): Condition | null {
  const map = z.strictObject({ $entries: z.array(z.tuple([z.string(), z.unknown()])) }).safeParse(raw);
  if (!map.success || map.data.$entries.length !== 1) {
    return null;
  }
  const [key, value] = map.data.$entries[0] ?? ['', null];
  const list = (): Condition[] | null => {
    if (!Array.isArray(value)) {
      return null;
    }
    const parsed = value.map(parseCondition);
    return parsed.every((item) => item !== null) ? parsed : null;
  };
  switch (key) {
    case 'all':
    case 'any': {
      const conditions = list();
      return conditions === null ? null : { kind: key, conditions };
    }
    case 'not': {
      const inner = parseCondition(value);
      return inner === null ? null : { kind: 'not', condition: inner };
    }
    case 'mission_won':
      return id.safeParse(value).success
        ? { kind: 'mission_won', missionSiteArchetype: value as string }
        : null;
    case 'lead_completed':
      return id.safeParse(value).success ? { kind: 'lead_completed', lead: value as string } : null;
    default:
      return null;
  }
}
/** A Condition property: a valid Condition, under COND, Condition format. */
const condition = z.unknown().transform((raw, context) => {
  const parsed = parseCondition(raw);
  if (parsed === null) {
    context.addIssue({ code: 'custom', message: 'Condition is valid' });
    return z.NEVER;
  }
  return parsed;
});
/** The GDR identifiers the simple Conditions of a Condition name, by Condition kind, at any depth. */
function conditionReferences(item: Condition): { missionSiteArchetypes: string[]; leads: string[] } {
  switch (item.kind) {
    case 'all':
    case 'any': {
      const parts = item.conditions.map(conditionReferences);
      return {
        missionSiteArchetypes: parts.flatMap((part) => part.missionSiteArchetypes),
        leads: parts.flatMap((part) => part.leads),
      };
    }
    case 'not':
      return conditionReferences(item.condition);
    case 'mission_won':
      return { missionSiteArchetypes: [item.missionSiteArchetype], leads: [] };
    case 'lead_completed':
      return { missionSiteArchetypes: [], leads: [item.lead] };
  }
}
const range = z.tuple([z.int(), z.int()]);

/** COMBAT, Combat inputs and outputs, item 4: the values of CombatParameters, by authored name. */
const combatParameterFields = {
  weapon_damage_range: decimal,
  retreat_below_agent_rating_fraction: decimal,
  retreat_at_enemy_to_agent_rating: decimal,
  incapacitation_skill_fraction: decimal,
  target_base_weight: whole(1),
  target_preferred_hit_chance: decimal,
  // COMBAT, Combat GDR validation, rule 5: each rating base, a divisor of the rating factor, is at least 1.
  rating_base_health: whole(1),
  rating_base_armor: whole(1),
  rating_base_weapon_damage: whole(1),
  rating_team_size_exponent: decimal,
};

/** COMBAT, Combat inputs and outputs, item 4: the values of AgentParameters that a Combat reads, by authored name. */
const combatAgentParameterFields = {
  exhaustion_incapacitation: whole(0),
  exhaustion_free_points: whole(0),
  skill_penalty_pct_per_exhaustion: whole(0),
  exhaustion_per_attack: whole(0),
  exhaustion_per_defense: whole(0),
  experience_per_attack_hit: whole(0),
  experience_per_attack_miss: whole(0),
  experience_per_defense_hit: whole(0),
  experience_per_defense_miss: whole(0),
};

const schemas = {
  AgentArchetype: z
    .strictObject({
      id,
      type: z.literal('AgentArchetype'),
      name,
      base_skill: whole(0),
      base_health: whole(1),
      weapon: id,
      armor: id,
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      name: g.name,
      skill: g.base_skill,
      baseHealth: g.base_health,
      weapon: g.weapon,
      armor: g.armor,
    })),
  AgentParameters: z
    .strictObject({
      id,
      type: z.literal('AgentParameters'),
      initial_roster_size: whole(0),
      ...combatAgentParameterFields,
      exhaustion_per_mission: whole(0),
      exhaustion_per_pct_killed: whole(0),
      exhaustion_per_contracting_turn: whole(0),
      exhaustion_per_training_turn: whole(0),
      exhaustion_per_investigation_turn: whole(0),
      exhaustion_work_start_max: whole(0),
      exhaustion_work_limit: whole(0),
      training_skill_gain_per_turn: hundredths(0),
      // AGENT, Agent GDR validation, rule 5: a list of one or more whole numbers of at least 0.
      experience_per_mission_survived: z.array(whole(0)).min(1),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      initialRosterSize: g.initial_roster_size,
      exhaustionIncapacitation: g.exhaustion_incapacitation,
      exhaustionFreePoints: g.exhaustion_free_points,
      skillPenaltyPctPerExhaustion: g.skill_penalty_pct_per_exhaustion,
      exhaustionPerAttack: g.exhaustion_per_attack,
      exhaustionPerDefense: g.exhaustion_per_defense,
      exhaustionPerMission: g.exhaustion_per_mission,
      exhaustionPerPctKilled: g.exhaustion_per_pct_killed,
      exhaustionPerContractingTurn: g.exhaustion_per_contracting_turn,
      exhaustionPerTrainingTurn: g.exhaustion_per_training_turn,
      exhaustionPerInvestigationTurn: g.exhaustion_per_investigation_turn,
      exhaustionWorkStartMax: g.exhaustion_work_start_max,
      exhaustionWorkLimit: g.exhaustion_work_limit,
      trainingSkillGainPerTurnHundredths: g.training_skill_gain_per_turn,
      experiencePerAttackHit: g.experience_per_attack_hit,
      experiencePerAttackMiss: g.experience_per_attack_miss,
      experiencePerDefenseHit: g.experience_per_defense_hit,
      experiencePerDefenseMiss: g.experience_per_defense_miss,
      experiencePerMissionSurvived: g.experience_per_mission_survived,
    })),
  Weapon: z
    .strictObject({ id, type: z.literal('Weapon'), name, base_weapon_damage: whole(1) })
    .transform((g) => ({ type: g.type, id: g.id, name: g.name, damage: g.base_weapon_damage })),
  // COMBAT, Combat GDR validation, rules 3 and 8: base_armor is a whole number of at least 0.
  Armor: z
    .strictObject({ id, type: z.literal('Armor'), name, base_armor: whole(0) })
    .transform((g) => ({ type: g.type, id: g.id, name: g.name, armor: g.base_armor })),
  EnemyArchetype: z
    .strictObject({
      id,
      type: z.literal('EnemyArchetype'),
      name,
      base_skill: whole(0),
      base_health: whole(1),
      weapon: id,
      armor: id,
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      name: g.name,
      skill: g.base_skill,
      baseHealth: g.base_health,
      weapon: g.weapon,
      armor: g.armor,
    })),
  CombatParameters: z
    .strictObject({
      id,
      type: z.literal('CombatParameters'),
      ...combatParameterFields,
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      weaponDamageRange: g.weapon_damage_range,
      retreatBelowAgentRatingFraction: g.retreat_below_agent_rating_fraction,
      retreatAtEnemyToAgentRating: g.retreat_at_enemy_to_agent_rating,
      incapacitationSkillFraction: g.incapacitation_skill_fraction,
      targetBaseWeight: g.target_base_weight,
      targetPreferredHitChance: g.target_preferred_hit_chance,
      ratingBaseHealth: g.rating_base_health,
      ratingBaseArmor: g.rating_base_armor,
      ratingBaseWeaponDamage: g.rating_base_weapon_damage,
      ratingTeamSizeExponent: g.rating_team_size_exponent,
    })),
  RecoveryParameters: z
    .strictObject({
      id,
      type: z.literal('RecoveryParameters'),
      // RECOVER, Recovery GDR validation, rules 3 and 4: greater than 0, i.e. at least 0.01, and at least 0.
      health_recovery_pct_per_turn: hundredths(1),
      exhaustion_recovery_per_turn: hundredths(0),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      healthRecoveryPctPerTurnHundredths: g.health_recovery_pct_per_turn,
      exhaustionRecoveryPerTurnHundredths: g.exhaustion_recovery_per_turn,
    })),
  EconomyParameters: z
    .strictObject({
      id,
      type: z.literal('EconomyParameters'),
      hire_cost: whole(0),
      upkeep_per_agent: whole(0),
      contracting_income_per_agent: whole(0),
      base_agent_cap: whole(0),
      base_transport_cap: whole(0),
      base_training_cap: whole(0),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      hireCost: g.hire_cost,
      upkeepPerAgent: g.upkeep_per_agent,
      contractingIncomePerAgent: g.contracting_income_per_agent,
      baseAgentCap: g.base_agent_cap,
      baseTransportCap: g.base_transport_cap,
      baseTrainingCap: g.base_training_cap,
    })),
  Upgrade: z
    .strictObject({
      id,
      type: z.literal('Upgrade'),
      name,
      price: whole(0),
      effect: z.enum([
        'agent_cap',
        'transport_cap',
        'training_cap',
        'agent_weapon_damage',
        'agent_max_health',
        'agent_armor',
        'training_skill_gain',
        'exhaustion_recovery',
        'health_recovery',
      ]),
      increment: hundredths(0),
    })
    // ECON, Economy GDR validation, rule 5: only a Rate Upgrade's increment may have decimal places.
    .refine(
      (g) =>
        g.effect === 'training_skill_gain' ||
        g.effect === 'exhaustion_recovery' ||
        g.effect === 'health_recovery' ||
        g.increment % 100 === 0,
    )
    .transform(({ increment, ...g }) => ({ ...g, incrementHundredths: increment })),
  AgencyArchetype: z.strictObject({ id, type: z.literal('AgencyArchetype'), name }),
  CampaignConfiguration: z
    .strictObject({
      id,
      type: z.literal('CampaignConfiguration'),
      name,
      starting_money: whole(0),
      starting_funding: whole(0),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      name: g.name,
      startingMoney: g.starting_money,
      startingFunding: g.starting_funding,
    })),
  ConfigurationParameters: z
    .strictObject({ id, type: z.literal('ConfigurationParameters'), default_preset: id })
    .transform((g) => ({ type: g.type, id: g.id, defaultPreset: g.default_preset })),
  FactionArchetype: z
    .strictObject({ id, type: z.literal('FactionArchetype'), name, initial_activity_level: id })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      name: g.name,
      initialActivityLevel: g.initial_activity_level,
    })),
  FactionActivityLevel: z
    .strictObject({
      id,
      type: z.literal('FactionActivityLevel'),
      name,
      lasts_turns: range.nullable(),
      operation_every_turns: range.nullable(),
      operation_level_weights: entries(z.int()),
      next: id.nullable(),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      name: g.name,
      lastsTurns: g.lasts_turns,
      operationEveryTurns: g.operation_every_turns,
      operationLevelWeights: g.operation_level_weights.map(
        ([key, weight]) => [/^\d+$/.test(key) ? Number(key) : Number.NaN, weight] as const,
      ),
      next: g.next,
    })),
  FactionOperationLevel: z
    .strictObject({
      id,
      type: z.literal('FactionOperationLevel'),
      level: whole(1),
      name,
      on_win: effectList,
      on_ignored_or_lost: effectList,
    })
    .transform((g, context) => {
      // MISSION, MissionSiteArchetype validation, rule 7: Operation level Consequences are valid. A `panic` Effect is a
      // Decimal quantity of at least 0 (ENDING, Panic Effect kind), and a `defeat` Effect is always `true` (ENDING,
      // Defeat Effect kind).
      const onWin = effectsOf(g.on_win, { money: whole(0), funding: whole(0) });
      const onLost = effectsOf(g.on_ignored_or_lost, {
        panic: signedHundredths.refine((value) => value >= 0),
        funding: z.int(),
        defeat: z.literal(true),
      });
      if (!onWin.success || !onLost.success) {
        context.addIssue({ code: 'custom', message: 'Operation level consequences are not valid' });
        return z.NEVER;
      }
      return {
        type: g.type,
        id: g.id,
        level: g.level,
        name: g.name,
        onWin: { money: onWin.data.money ?? 0, funding: onWin.data.funding ?? 0 },
        onIgnoredOrLost: {
          panicIncreaseHundredths: onLost.data.panic ?? 0,
          funding: onLost.data.funding ?? 0,
          defeat: onLost.data.defeat === true,
        },
      };
    }),
  Lead: z
    .strictObject({
      id,
      type: z.literal('Lead'),
      name,
      description: z.string().min(1),
      // LEAD, Lead GDR validation, rule 1: `faction`, `discovered_when`, `investigate_again`, and `on_completion` are
      // optional.
      faction: id.optional(),
      required_progress: whole(1),
      discovered_when: condition.optional(),
      investigate_again: z.enum(['never', 'until_mission_won', 'always']).optional(),
      on_completion: effectList.optional(),
    })
    .transform((g, context) => {
      // LEAD, Lead GDR validation, rule 5: at most one Effect of each of the Effect kinds `create_mission_site`,
      // `eliminate_faction`, and `win_campaign`, and no other; a Lead that creates a Mission site or eliminates a
      // Faction has `faction`.
      const effects = effectsOf(g.on_completion ?? new Map(), {
        create_mission_site: id,
        eliminate_faction: z.literal(true),
        win_campaign: z.literal(true),
      });
      if (!effects.success) {
        context.addIssue({ code: 'custom', message: 'Completion effect is valid' });
        return z.NEVER;
      }
      const created = effects.data.create_mission_site ?? null;
      const eliminateFaction = effects.data.eliminate_faction === true;
      if ((created !== null || eliminateFaction) && g.faction === undefined) {
        context.addIssue({ code: 'custom', message: 'Completion effect is valid (it needs a faction)' });
        return z.NEVER;
      }
      // LEAD, Lead GDR validation, rule 4: a Lead without `faction` has no `mission_won` Condition.
      if (
        g.faction === undefined &&
        g.discovered_when !== undefined &&
        conditionReferences(g.discovered_when).missionSiteArchetypes.length > 0
      ) {
        context.addIssue({ code: 'custom', message: 'Discovery Condition is valid' });
        return z.NEVER;
      }
      // LEAD, Lead GDR validation, rule 6: `until_mission_won` only for a Lead that creates a Mission site. A Lead
      // without `investigate_again` has `until_mission_won` when it creates one, and `never` when it does not.
      if (g.investigate_again === 'until_mission_won' && created === null) {
        context.addIssue({ code: 'custom', message: 'Investigate again is valid' });
        return z.NEVER;
      }
      return {
        type: g.type,
        id: g.id,
        name: g.name,
        description: g.description,
        faction: g.faction ?? null,
        requiredProgress: g.required_progress,
        discoveredWhen: g.discovered_when ?? null,
        investigateAgain: g.investigate_again ?? (created === null ? 'never' : 'until_mission_won'),
        onCompletion: {
          createMissionSite: created,
          eliminateFaction,
          winCampaign: effects.data.win_campaign === true,
        },
      };
    }),
  InvestigationArchetype: z.strictObject({ id, type: z.literal('InvestigationArchetype'), name }),
  InvestigationParameters: z
    .strictObject({
      id,
      type: z.literal('InvestigationParameters'),
      team_efficiency_exponent: decimal,
      required_progress_max_pct: whole(100),
      assessment_threshold_pct: z.int().min(1).max(100),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      teamEfficiencyExponent: g.team_efficiency_exponent,
      requiredProgressMaxPct: g.required_progress_max_pct,
      assessmentThresholdPct: g.assessment_threshold_pct,
    })),
  MissionSiteArchetype: z
    .strictObject({
      id,
      type: z.literal('MissionSiteArchetype'),
      name,
      kind: z.enum(['initiative', 'response']),
      expires_in_turns: whole(1),
      enemies: entries(whole(1)),
      on_win: effectList.optional(),
      can_exist_when: condition.optional(),
      operation_level: z.int().optional(),
    })
    .transform((g, context) => {
      // MISSION, MissionSiteArchetype validation, rule 5: a Panic reduction is a `panic` Effect of at most 0, and an
      // `eliminate_faction` Effect is always `true` (FACTION, Elimination).
      const onWin = effectsOf(g.on_win ?? new Map(), {
        money: whole(0),
        funding: whole(0),
        panic: signedHundredths.refine((value) => value <= 0),
        eliminate_faction: z.literal(true),
      });
      if (!onWin.success || (g.kind === 'response' && g.on_win !== undefined)) {
        context.addIssue({ code: 'custom', message: 'Rewards only for Initiative' });
        return z.NEVER;
      }
      if ((g.kind === 'response') !== (g.operation_level !== undefined)) {
        context.addIssue({ code: 'custom', message: 'Operation level only for Response' });
        return z.NEVER;
      }
      // MISSION, MissionSiteArchetype validation, rule 9: Existence Condition only for Initiative.
      if (g.kind === 'response' && g.can_exist_when !== undefined) {
        context.addIssue({ code: 'custom', message: 'Existence Condition only for Initiative' });
        return z.NEVER;
      }
      if (g.enemies.length === 0) {
        context.addIssue({ code: 'custom', message: 'Enemies are valid' });
        return z.NEVER;
      }
      return {
        type: g.type,
        id: g.id,
        name: g.name,
        kind: g.kind,
        expiresInTurns: g.expires_in_turns,
        enemies: g.enemies,
        onWin: {
          money: onWin.data.money ?? 0,
          funding: onWin.data.funding ?? 0,
          panicReductionHundredths: 0 - (onWin.data.panic ?? 0),
          eliminateTargetFaction: onWin.data.eliminate_faction === true,
        },
        operationLevel: g.operation_level ?? null,
        canExistWhen: g.can_exist_when ?? null,
      };
    }),
  MissionArchetype: z.strictObject({ id, type: z.literal('MissionArchetype'), name }),
  EndingParameters: z
    .strictObject({ id, type: z.literal('EndingParameters'), defeat_at_panic_pct: z.int().min(1).max(100) })
    .transform((g) => ({ type: g.type, id: g.id, defeatAtPanicPct: g.defeat_at_panic_pct })),
  // COMP, Compendium article GDR validation, rules 1 to 3; rules 4 to 9 are checked across the Game build.
  CompendiumArticle: z
    .looseObject({ id, type: z.literal('CompendiumArticle') })
    .transform((raw, context): CompendiumArticleGdr => {
      const parsed = parseCompendiumArticle(raw, parseCondition);
      if ('problems' in parsed) {
        for (const message of parsed.problems) {
          context.addIssue({ code: 'custom', message });
        }
        return z.NEVER;
      }
      return parsed.article;
    }),
  // VIS, Background artwork: the exhaustive properties of a BackgroundArtwork.
  BackgroundArtwork: z
    .strictObject({
      id,
      type: z.literal('BackgroundArtwork'),
      detail_view: z.string().regex(ID_PATTERN),
      image: z.string().min(1),
      opacity_pct: z.int().min(0).max(100),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      detailView: g.detail_view,
      image: g.image,
      opacityPct: g.opacity_pct,
    })),
  // MUSIC, Soundtrack: the exhaustive properties of a MusicParameters. A name that matches no file is allowed.
  MusicParameters: z
    .strictObject({
      id,
      type: z.literal('MusicParameters'),
      excluded_tracks: z.array(z.string().min(1)),
    })
    .transform((g) => ({ type: g.type, id: g.id, excludedTracks: g.excluded_tracks })),
} as const;

/** VIS, Background artwork: the Detail views of CSCR, by their names in lowercase words joined by underscores. */
const DETAIL_VIEW_NAMES = [
  'missions',
  'leads',
  'agents',
  'upgrades',
  'turn_report',
  'history',
  'charts',
  'compendium',
];

type TypeName = keyof typeof schemas;

/** COMBAT, Combat GDR validation: the rules that relate the values of CombatParameters. */
function combatParametersProblems(combatParameters: CombatParametersGdr): string[] {
  const problems: string[] = [];
  if (combatParameters.weaponDamageRange.lt(0) || combatParameters.weaponDamageRange.gt(1)) {
    problems.push('CombatParameters: weapon_damage_range must be from 0 to 1');
  }
  if (
    combatParameters.retreatBelowAgentRatingFraction.lt(0) ||
    combatParameters.retreatAtEnemyToAgentRating.lt(0)
  ) {
    problems.push('CombatParameters: the retreat thresholds must be at least 0');
  }
  // COMBAT, Combat GDR validation, rule 5: each rating base a whole number of at least 1, and the team size exponent
  // from 1 to 2 with at most two digits after the decimal point. The schema checks the whole numbers; these checks also
  // cover values a Detached Combat overrides.
  for (const [name, value] of [
    ['rating_base_health', combatParameters.ratingBaseHealth],
    ['rating_base_armor', combatParameters.ratingBaseArmor],
    ['rating_base_weapon_damage', combatParameters.ratingBaseWeaponDamage],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      problems.push(`CombatParameters: ${name} must be a whole number of at least 1`);
    }
  }
  const exponent = combatParameters.ratingTeamSizeExponent;
  if (exponent.lt(1) || exponent.gt(2) || !exponent.mul(100).isWhole()) {
    problems.push(
      'CombatParameters: rating_team_size_exponent must be from 1 to 2 with at most two digits after the decimal point',
    );
  }
  if (
    combatParameters.incapacitationSkillFraction.lt(0) ||
    combatParameters.incapacitationSkillFraction.gte(1)
  ) {
    problems.push('CombatParameters: incapacitation_skill_fraction must be at least 0 and less than 1');
  }
  // Rule 9: every Selection weight is at least 1.
  const preferred = combatParameters.targetPreferredHitChance;
  if (preferred.lt(0) || preferred.gt(1)) {
    problems.push('CombatParameters: target_preferred_hit_chance must be from 0 to 1');
  } else if (
    q(combatParameters.targetBaseWeight).lt(preferred.mul(100)) ||
    q(combatParameters.targetBaseWeight).lt(q(1).sub(preferred).mul(100))
  ) {
    problems.push(
      'CombatParameters: target_base_weight must be at least 100 × target_preferred_hit_chance and at least 100 × (1 − target_preferred_hit_chance)',
    );
  }
  return problems;
}

/** COMBAT, Combat GDR validation, and AGENT, Agent GDR validation: the rules that relate values of AgentParameters. */
function agentParametersProblems(agentParameters: AgentParametersGdr): string[] {
  const problems: string[] = [];
  if (agentParameters.exhaustionPerAttack + agentParameters.exhaustionPerDefense < 1) {
    problems.push('AgentParameters: every attack must tire someone');
  }
  // AGENT, Agent GDR validation, rule 6: exhaustion thresholds are ordered.
  if (agentParameters.exhaustionWorkStartMax >= agentParameters.exhaustionWorkLimit) {
    problems.push('AgentParameters: exhaustion_work_start_max must be less than exhaustion_work_limit');
  }
  if (agentParameters.exhaustionWorkLimit > agentParameters.exhaustionIncapacitation) {
    problems.push('AgentParameters: exhaustion_work_limit must be at most exhaustion_incapacitation');
  }
  return problems;
}

/** The property of CombatParameters or AgentParameters that holds each GDR value a Combat reads. */
const COMBAT_GDR_VALUE_PROPERTIES: Readonly<Record<string, readonly ['combat' | 'agent', string]>> = {
  weapon_damage_range: ['combat', 'weaponDamageRange'],
  retreat_below_agent_rating_fraction: ['combat', 'retreatBelowAgentRatingFraction'],
  retreat_at_enemy_to_agent_rating: ['combat', 'retreatAtEnemyToAgentRating'],
  incapacitation_skill_fraction: ['combat', 'incapacitationSkillFraction'],
  target_base_weight: ['combat', 'targetBaseWeight'],
  target_preferred_hit_chance: ['combat', 'targetPreferredHitChance'],
  rating_base_health: ['combat', 'ratingBaseHealth'],
  rating_base_armor: ['combat', 'ratingBaseArmor'],
  rating_base_weapon_damage: ['combat', 'ratingBaseWeaponDamage'],
  rating_team_size_exponent: ['combat', 'ratingTeamSizeExponent'],
  exhaustion_incapacitation: ['agent', 'exhaustionIncapacitation'],
  exhaustion_free_points: ['agent', 'exhaustionFreePoints'],
  skill_penalty_pct_per_exhaustion: ['agent', 'skillPenaltyPctPerExhaustion'],
  exhaustion_per_attack: ['agent', 'exhaustionPerAttack'],
  exhaustion_per_defense: ['agent', 'exhaustionPerDefense'],
  experience_per_attack_hit: ['agent', 'experiencePerAttackHit'],
  experience_per_attack_miss: ['agent', 'experiencePerAttackMiss'],
  experience_per_defense_hit: ['agent', 'experiencePerDefenseHit'],
  experience_per_defense_miss: ['agent', 'experiencePerDefenseMiss'],
};

/** COMBAT, Combat inputs and outputs, item 4: the authored names of the GDR values a Combat reads. */
export const COMBAT_GDR_VALUE_NAMES: readonly string[] = Object.keys(COMBAT_GDR_VALUE_PROPERTIES);

/**
 * COMBAT, Detached Combat, GDR values: the given CombatParameters and AgentParameters with some of the GDR values a
 * Combat reads replaced, by authored name, e.g. `{ incapacitation_skill_fraction: 0.2 }`. Each value is read by the
 * schema the Game build's GDRs are read by, and the result must pass the same Combat GDR validation and Agent GDR
 * validation; otherwise the first problem is returned. A decimal value may be given as a number or as its text.
 */
export function withCombatGdrValues(
  base: { readonly combat: CombatParametersGdr; readonly agent: AgentParametersGdr },
  values: Readonly<Record<string, unknown>>,
): { combat: CombatParametersGdr; agent: AgentParametersGdr } | { problem: string } {
  const combat: Record<string, unknown> = { ...base.combat };
  const agent: Record<string, unknown> = { ...base.agent };
  const fields: Record<string, z.ZodType> = { ...combatParameterFields, ...combatAgentParameterFields };
  for (const [name, value] of Object.entries(values)) {
    const property = COMBAT_GDR_VALUE_PROPERTIES[name];
    const schema = fields[name];
    if (property === undefined || schema === undefined) {
      return { problem: `${name} is not a GDR value a Combat reads` };
    }
    // A decimal value is authored as a whole number or as its decimal text; see the schema `decimal`.
    const authored =
      schema === decimal &&
      (typeof value === 'string' || (typeof value === 'number' && !Number.isInteger(value)))
        ? { $decimal: String(value) }
        : value;
    let parsed: { success: true; data: unknown } | { success: false };
    try {
      parsed = schema.safeParse(authored);
    } catch {
      parsed = { success: false };
    }
    if (!parsed.success) {
      return { problem: `${name}: ${JSON.stringify(value)} is not a permitted value` };
    }
    const [owner, key] = property;
    (owner === 'combat' ? combat : agent)[key] = parsed.data;
  }
  const result = {
    combat: combat as unknown as CombatParametersGdr,
    agent: agent as unknown as AgentParametersGdr,
  };
  const problem = [...combatParametersProblems(result.combat), ...agentParametersProblems(result.agent)][0];
  return problem === undefined ? result : { problem };
}

function isTypeName(value: unknown): value is TypeName {
  return typeof value === 'string' && Object.hasOwn(schemas, value);
}

/** Validates the GDRs of a Game build and returns its catalog, or reports every violation as a data defect. */
export function buildGdrCatalog(files: readonly RawGdrFile[]): GdrCatalog {
  const problems: string[] = [];
  const byType = new Map<string, AnyGdr[]>();
  /** Every GDR of a known Type as authored, for the Placeholders of the Compendium articles (COMP). */
  const authored: RawGdr[] = [];
  /** GDR, GDR file layout: where the GDRs of each Type lie, a file or a directory of one file per GDR. */
  const layouts = new Map<string, Set<'file' | 'directory'>>();

  for (const file of files) {
    const typesInFile = new Set<string>();
    // GDR, GDR file layout, Directory of one file per GDR: the directory lies where the file of its Type would lie,
    // so its files lie one level deeper than a file that holds every GDR of a Type.
    const segments = file.path.split('/');
    const onePerFile = segments.length === 3;
    if (onePerFile && file.gdrs.length !== 1) {
      problems.push(`${file.path}: a file in a directory of one file per GDR holds exactly one GDR`);
    }
    file.gdrs.forEach((raw, index) => {
      const where = `${file.path}#${index + 1}`;
      const type = (raw as { type?: unknown } | null)?.type;
      if (!isTypeName(type)) {
        problems.push(`${where}: unknown GDR Type ${JSON.stringify(type)}`);
        return;
      }
      typesInFile.add(type);
      layouts.set(type, (layouts.get(type) ?? new Set()).add(onePerFile ? 'directory' : 'file'));
      authored.push(raw as RawGdr);
      if (onePerFile && segments[2] !== `${String((raw as RawGdr)['id'])}.yaml`) {
        problems.push(`${file.path}: a file in a directory of one file per GDR is named after its GDR`);
      }
      const parsed = schemas[type].safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          problems.push(`${where} (${type}): ${issue.path.join('.')} ${issue.message}`.trim());
        }
        return;
      }
      const list = byType.get(type) ?? [];
      const gdr = parsed.data as AnyGdr;
      if (list.some((other) => other.id === gdr.id)) {
        problems.push(`${where}: a second ${type} has the identifier ${gdr.id}`);
      }
      list.push(gdr);
      byType.set(type, list);
    });
    if (typesInFile.size > 1) {
      problems.push(`${file.path}: holds GDRs of more than one Type`);
    }
  }
  for (const [type, layout] of layouts) {
    if (layout.size > 1) {
      problems.push(`${type}: a Type has either a file or a directory of one file per GDR, never both`);
    }
    // GDR, GDR file layout: the order of the GDRs of a Type with a directory is the ascending order of their
    // identifiers, compared character by character by Unicode code point.
    if (layout.has('directory')) {
      byType.get(type)?.sort((a, b) => compareByCodePoint(a.id, b.id));
    }
  }

  const all = <T extends AnyGdr>(type: T['type']): T[] => (byType.get(type) ?? []) as T[];
  const single = <T extends AnyGdr>(type: T['type']): T | null => {
    const list = all<T>(type);
    if (list.length !== 1) {
      problems.push(`The Game build must supply exactly one ${type}; it supplies ${list.length}`);
    }
    return list[0] ?? null;
  };
  const mapOf = <T extends AnyGdr>(type: T['type']): Map<string, T> =>
    new Map(all<T>(type).map((gdr) => [gdr.id, gdr]));

  const agentArchetype = single<GdrCatalog['agentArchetype']>('AgentArchetype');
  const agentParameters = single<GdrCatalog['agentParameters']>('AgentParameters');
  const combatParameters = single<GdrCatalog['combatParameters']>('CombatParameters');
  const recoveryParameters = single<GdrCatalog['recoveryParameters']>('RecoveryParameters');
  const economy = single<GdrCatalog['economy']>('EconomyParameters');
  const agencyArchetype = single<GdrCatalog['agencyArchetype']>('AgencyArchetype');
  const investigationArchetype = single<GdrCatalog['investigationArchetype']>('InvestigationArchetype');
  const investigationParameters = single<GdrCatalog['investigationParameters']>('InvestigationParameters');
  const missionArchetype = single<GdrCatalog['missionArchetype']>('MissionArchetype');
  const endingParameters = single<GdrCatalog['endingParameters']>('EndingParameters');
  const configurationParameters = single<GdrCatalog['configurationParameters']>('ConfigurationParameters');
  const music = single<GdrCatalog['music']>('MusicParameters');

  const weapons = mapOf<ReturnType<GdrCatalog['weapons']['get']> & AnyGdr>('Weapon');
  const armors = mapOf<ReturnType<GdrCatalog['armors']['get']> & AnyGdr>('Armor');
  const enemyArchetypes = mapOf<ReturnType<GdrCatalog['enemyArchetypes']['get']> & AnyGdr>('EnemyArchetype');
  const upgrades = all<GdrCatalog['upgrades'][number]>('Upgrade');
  const campaignConfigurations = all<GdrCatalog['campaignConfigurations'][number]>('CampaignConfiguration');
  const factionArchetypes = all<GdrCatalog['factionArchetypes'][number]>('FactionArchetype');
  const factionActivityLevels = mapOf<FactionActivityLevelGdr>('FactionActivityLevel');
  const factionOperationLevels = all<GdrCatalog['factionOperationLevels'][number]>('FactionOperationLevel');
  const leads = all<LeadGdr>('Lead');
  const missionSiteArchetypes = all<MissionSiteArchetypeGdr>('MissionSiteArchetype');
  const articles = all<CompendiumArticleGdr>('CompendiumArticle');
  const backgroundArtworks = all<BackgroundArtworkGdr>('BackgroundArtwork');

  // VIS, Background artwork: each names a Detail view, and no two name one Detail view.
  const shownIn = new Set<string>();
  for (const artwork of backgroundArtworks) {
    if (!DETAIL_VIEW_NAMES.includes(artwork.detailView)) {
      problems.push(
        `BackgroundArtwork ${artwork.id}: detail_view ${artwork.detailView} is not a Detail view`,
      );
    }
    if (shownIn.has(artwork.detailView)) {
      problems.push(
        `BackgroundArtwork ${artwork.id}: a second BackgroundArtwork names ${artwork.detailView}`,
      );
    }
    shownIn.add(artwork.detailView);
  }

  // AGENT, Agent GDR validation; COMBAT, Combat GDR validation.
  if (agentArchetype && !weapons.has(agentArchetype.weapon)) {
    problems.push(`AgentArchetype ${agentArchetype.id}: weapon ${agentArchetype.weapon} is not a Weapon GDR`);
  }
  if (agentArchetype && !armors.has(agentArchetype.armor)) {
    problems.push(`AgentArchetype ${agentArchetype.id}: armor ${agentArchetype.armor} is not an Armor GDR`);
  }
  for (const enemy of enemyArchetypes.values()) {
    if (!weapons.has(enemy.weapon)) {
      problems.push(`EnemyArchetype ${enemy.id}: weapon ${enemy.weapon} is not a Weapon GDR`);
    }
    if (!armors.has(enemy.armor)) {
      problems.push(`EnemyArchetype ${enemy.id}: armor ${enemy.armor} is not an Armor GDR`);
    }
  }
  if (combatParameters) {
    problems.push(...combatParametersProblems(combatParameters));
  }
  if (agentParameters) {
    problems.push(...agentParametersProblems(agentParameters));
  }

  // INVSTG, Investigation GDR validation, rule 4: a decimal number with at most two digits after the decimal point,
  // greater than 0 and at most 1. Rules 5 and 6 are checked by the schema.
  if (investigationParameters) {
    const exponent = investigationParameters.teamEfficiencyExponent;
    if (exponent.lte(0) || exponent.gt(1) || !exponent.mul(100).isWhole()) {
      problems.push(
        'InvestigationParameters: team_efficiency_exponent must be greater than 0, at most 1, and have at most two digits after the decimal point',
      );
    }
  }

  // CONFIG, Game build default preset.
  if (campaignConfigurations.length === 0) {
    problems.push('The Game build must supply at least one Campaign configuration preset');
  }
  if (
    configurationParameters &&
    !campaignConfigurations.some((preset) => preset.id === configurationParameters.defaultPreset)
  ) {
    problems.push(
      `ConfigurationParameters: default_preset ${configurationParameters.defaultPreset} is not a preset`,
    );
  }

  // FACTION, Faction GDR validation.
  for (const archetype of factionArchetypes) {
    if (!factionActivityLevels.has(archetype.initialActivityLevel)) {
      problems.push(`FactionArchetype ${archetype.id}: Initial level resolves`);
    }
  }
  const operationLevelNumbers = factionOperationLevels.map((level) => level.level);
  if (new Set(operationLevelNumbers).size !== operationLevelNumbers.length) {
    problems.push('FactionOperationLevel: Operation levels are distinct');
  }
  for (const level of factionActivityLevels.values()) {
    for (const pair of [level.operationEveryTurns, level.lastsTurns]) {
      if (pair !== null && !(pair[0] >= 1 && pair[0] <= pair[1])) {
        problems.push(`FactionActivityLevel ${level.id}: Ranges are valid`);
      }
    }
    if ((level.lastsTurns === null) !== (level.next === null)) {
      problems.push(`FactionActivityLevel ${level.id}: Final levels agree`);
    }
    if (level.next !== null && !factionActivityLevels.has(level.next)) {
      problems.push(`FactionActivityLevel ${level.id}: Next resolves`);
    }
    const seen = new Set<string>();
    let cursor: FactionActivityLevelGdr | undefined = level;
    while (cursor !== undefined && cursor.next !== null) {
      if (seen.has(cursor.id)) {
        problems.push(`FactionActivityLevel ${level.id}: The chain ends`);
        break;
      }
      seen.add(cursor.id);
      cursor = factionActivityLevels.get(cursor.next);
    }
    // FACTION, Faction GDR validation, rule 8: at least one key for a level with operations, and none for a level
    // without them.
    if ((level.operationLevelWeights.length === 0) !== (level.operationEveryTurns === null)) {
      problems.push(`FactionActivityLevel ${level.id}: Weights are valid`);
    }
    for (const [key, weight] of level.operationLevelWeights) {
      if (!operationLevelNumbers.includes(key) || weight < 1) {
        problems.push(`FactionActivityLevel ${level.id}: Weights are valid`);
      }
      // MISSION, MissionSiteArchetype validation, rule 8.
      if (!missionSiteArchetypes.some((site) => site.kind === 'response' && site.operationLevel === key)) {
        problems.push(
          `FactionActivityLevel ${level.id}: Every Faction operation level can be served (${key})`,
        );
      }
    }
  }

  // MISSION, Mission won Condition kind, and LEAD, Lead completed Condition kind: the value of each names a
  // MissionSiteArchetype, of either kind, or a Lead that the Game build supplies.
  const conditionResolves = (item: Condition): boolean => {
    const references = conditionReferences(item);
    return (
      references.missionSiteArchetypes.every((site) =>
        missionSiteArchetypes.some((each) => each.id === site),
      ) && references.leads.every((lead) => leads.some((each) => each.id === lead))
    );
  };

  // MISSION, MissionSiteArchetype validation.
  for (const site of missionSiteArchetypes) {
    const keys = site.enemies.map(([key]) => key);
    if (keys.some((key) => !enemyArchetypes.has(key)) || new Set(keys).size !== keys.length) {
      problems.push(`MissionSiteArchetype ${site.id}: Enemies are valid`);
    }
    if (site.operationLevel !== null && !operationLevelNumbers.includes(site.operationLevel)) {
      problems.push(`MissionSiteArchetype ${site.id}: Operation level only for Response`);
    }
    // MISSION, MissionSiteArchetype validation, rule 9: each Condition kind with a value its Condition kind permits.
    if (site.canExistWhen !== null && !conditionResolves(site.canExistWhen)) {
      problems.push(`MissionSiteArchetype ${site.id}: Existence Condition only for Initiative`);
    }
  }

  // LEAD, Lead GDR validation.
  for (const lead of leads) {
    if (lead.faction !== null && !factionArchetypes.some((archetype) => archetype.id === lead.faction)) {
      problems.push(`Lead ${lead.id}: Faction resolves`);
    }
    if (lead.discoveredWhen !== null && !conditionResolves(lead.discoveredWhen)) {
      problems.push(`Lead ${lead.id}: Discovery Condition is valid`);
    }
    const createMissionSite = lead.onCompletion.createMissionSite;
    if (createMissionSite !== null) {
      const created = missionSiteArchetypes.find((site) => site.id === createMissionSite);
      if (created?.kind !== 'initiative') {
        problems.push(`Lead ${lead.id}: Completion effect is valid`);
      }
    }
  }

  // COMP, Compendium article GDR validation, rules 4 to 9. Rules 1 to 3 are checked by the schema.
  const compendiumArticles = validateCompendiumArticles(articles, authored, problems);

  if (
    problems.length > 0 ||
    !agentArchetype ||
    !agentParameters ||
    !combatParameters ||
    !recoveryParameters ||
    !economy ||
    !agencyArchetype ||
    !investigationArchetype ||
    !investigationParameters ||
    !missionArchetype ||
    !endingParameters ||
    !configurationParameters ||
    !music
  ) {
    throw new EngineDefect(`The GDRs of the Game build are defective: ${[...new Set(problems)].join('; ')}`);
  }

  return {
    agentArchetype,
    agentParameters,
    combatParameters,
    recoveryParameters,
    economy,
    agencyArchetype,
    investigationArchetype,
    investigationParameters,
    missionArchetype,
    endingParameters,
    configurationParameters,
    weapons,
    armors,
    enemyArchetypes,
    upgrades,
    campaignConfigurations,
    factionArchetypes,
    factionActivityLevels,
    factionOperationLevels,
    leads,
    missionSiteArchetypes,
    compendiumArticles,
    backgroundArtworks,
    music,
  };
}

/** Compares two texts character by character by Unicode code point. */
function compareByCodePoint(a: string, b: string): number {
  const left = Array.from(a, (character) => character.codePointAt(0) ?? 0);
  const right = Array.from(b, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}
