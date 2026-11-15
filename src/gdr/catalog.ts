/**
 * Builds the GDR catalog of a Game build from the raw GDR files and applies every GDR validation rule of the
 * specifications. A Game build whose GDRs violate a rule is defective: the violation is reported as a data defect
 * and no Campaign is created from it; see ENG, Committed state integrity.
 */
import { z } from 'zod';
import { EngineDefect, Rational, q } from '../kernel/index.ts';
import type {
  AnyGdr,
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
/** A nested mapping, with its authored key order. */
const entries = <T extends z.ZodType>(value: T) =>
  z.strictObject({ $entries: z.array(z.tuple([z.string(), value])) }).transform((map) => map.$entries);
const range = z.tuple([z.int(), z.int()]);

const schemas = {
  AgentArchetype: z
    .strictObject({
      id,
      type: z.literal('AgentArchetype'),
      name,
      skill: whole(0),
      base_health: whole(1),
      weapon: id,
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      name: g.name,
      skill: g.skill,
      baseHealth: g.base_health,
      weapon: g.weapon,
    })),
  AgentParameters: z
    .strictObject({
      id,
      type: z.literal('AgentParameters'),
      initial_roster_size: whole(0),
      exhaustion_cap: whole(0),
      exhaustion_free_points: whole(0),
      skill_penalty_pct_per_exhaustion: whole(0),
      exhaustion_per_attack: whole(0),
      exhaustion_per_defense: whole(0),
      training_skill_gain_per_turn: whole(0),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      initialRosterSize: g.initial_roster_size,
      exhaustionCap: g.exhaustion_cap,
      exhaustionFreePoints: g.exhaustion_free_points,
      skillPenaltyPctPerExhaustion: g.skill_penalty_pct_per_exhaustion,
      exhaustionPerAttack: g.exhaustion_per_attack,
      exhaustionPerDefense: g.exhaustion_per_defense,
      trainingSkillGainPerTurn: g.training_skill_gain_per_turn,
    })),
  Weapon: z.strictObject({ id, type: z.literal('Weapon'), name, damage: whole(1) }),
  EnemyArchetype: z
    .strictObject({
      id,
      type: z.literal('EnemyArchetype'),
      name,
      skill: whole(0),
      base_health: whole(1),
      weapon: id,
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      name: g.name,
      skill: g.skill,
      baseHealth: g.base_health,
      weapon: g.weapon,
    })),
  CombatParameters: z
    .strictObject({
      id,
      type: z.literal('CombatParameters'),
      weapon_damage_range: decimal,
      retreat_below_agent_rating_fraction: decimal,
      retreat_at_enemy_to_agent_rating: decimal,
      incapacitation_skill_fraction: decimal,
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      weaponDamageRange: g.weapon_damage_range,
      retreatBelowAgentRatingFraction: g.retreat_below_agent_rating_fraction,
      retreatAtEnemyToAgentRating: g.retreat_at_enemy_to_agent_rating,
      incapacitationSkillFraction: g.incapacitation_skill_fraction,
    })),
  RecoveryParameters: z
    .strictObject({
      id,
      type: z.literal('RecoveryParameters'),
      health_recovery_pct_per_turn: whole(1),
      exhaustion_recovery_per_turn: whole(0),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
      healthRecoveryPctPerTurn: g.health_recovery_pct_per_turn,
      exhaustionRecoveryPerTurn: g.exhaustion_recovery_per_turn,
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
  Upgrade: z.strictObject({
    id,
    type: z.literal('Upgrade'),
    name,
    price: whole(0),
    effect: z.enum(['agent_cap', 'transport_cap', 'training_cap', 'agent_weapon_damage']),
    increment: whole(0),
  }),
  AgencyArchetype: z.strictObject({ id, type: z.literal('AgencyArchetype'), name }),
  CampaignConfiguration: z
    .strictObject({
      id,
      type: z.literal('CampaignConfiguration'),
      starting_money: whole(0),
      starting_funding: whole(0),
    })
    .transform((g) => ({
      type: g.type,
      id: g.id,
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
      operation_every_turns: range,
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
      on_win: entries(z.unknown()),
      on_ignored_or_lost: entries(z.unknown()),
    })
    .transform((g, context) => {
      const onWin = z
        .strictObject({ money: whole(0), funding: whole(0) })
        .safeParse(Object.fromEntries(g.on_win));
      const onLost = z
        .strictObject({ panic_increase_pct: whole(0), funding: z.int() })
        .safeParse(Object.fromEntries(g.on_ignored_or_lost));
      if (!onWin.success || !onLost.success || g.on_win.length !== 2 || g.on_ignored_or_lost.length !== 2) {
        context.addIssue({ code: 'custom', message: 'Operation level consequences are not valid' });
        return z.NEVER;
      }
      return {
        type: g.type,
        id: g.id,
        level: g.level,
        name: g.name,
        onWin: onWin.data,
        onIgnoredOrLost: { panicIncreasePct: onLost.data.panic_increase_pct, funding: onLost.data.funding },
      };
    }),
  Lead: z
    .strictObject({
      id,
      type: z.literal('Lead'),
      name,
      description: z.string().min(1),
      faction: id,
      difficulty: whole(1),
      requires: z.array(entries(z.unknown())),
      on_completion: entries(z.unknown()),
    })
    .transform((g, context) => {
      const requires: { missionWonFromLead: string }[] = [];
      for (const entry of g.requires) {
        const [only] = entry;
        if (entry.length !== 1 || only?.[0] !== 'mission_won_from_lead' || typeof only[1] !== 'string') {
          context.addIssue({ code: 'custom', message: 'Prerequisite kinds are known' });
          return z.NEVER;
        }
        requires.push({ missionWonFromLead: only[1] });
      }
      const [effect] = g.on_completion;
      if (
        g.on_completion.length !== 1 ||
        effect?.[0] !== 'create_mission_site' ||
        typeof effect[1] !== 'string'
      ) {
        context.addIssue({ code: 'custom', message: 'Completion effect is valid' });
        return z.NEVER;
      }
      return {
        type: g.type,
        id: g.id,
        name: g.name,
        description: g.description,
        faction: g.faction,
        difficulty: g.difficulty,
        requires,
        onCompletion: { createMissionSite: effect[1] },
      };
    }),
  InvestigationArchetype: z.strictObject({ id, type: z.literal('InvestigationArchetype'), name }),
  MissionSiteArchetype: z
    .strictObject({
      id,
      type: z.literal('MissionSiteArchetype'),
      name,
      kind: z.enum(['initiative', 'response']),
      expires_in_turns: whole(1),
      enemies: entries(whole(1)),
      on_win: entries(z.unknown()).optional(),
      operation_level: z.int().optional(),
    })
    .transform((g, context) => {
      const onWin = z
        .strictObject({
          money: whole(0).optional(),
          funding: whole(0).optional(),
          panic_reduction_pct: whole(0).optional(),
          defeat_target_faction: z.boolean().optional(),
        })
        .safeParse(Object.fromEntries(g.on_win ?? []));
      if (!onWin.success || (g.kind === 'response' && g.on_win !== undefined)) {
        context.addIssue({ code: 'custom', message: 'Rewards only for Initiative' });
        return z.NEVER;
      }
      if ((g.kind === 'response') !== (g.operation_level !== undefined)) {
        context.addIssue({ code: 'custom', message: 'Operation level only for Response' });
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
          panicReductionPct: onWin.data.panic_reduction_pct ?? 0,
          defeatTargetFaction: onWin.data.defeat_target_faction ?? false,
        },
        operationLevel: g.operation_level ?? null,
      };
    }),
  MissionArchetype: z.strictObject({ id, type: z.literal('MissionArchetype'), name }),
  EndingParameters: z
    .strictObject({ id, type: z.literal('EndingParameters'), defeat_at_panic_pct: z.int().min(1).max(100) })
    .transform((g) => ({ type: g.type, id: g.id, defeatAtPanicPct: g.defeat_at_panic_pct })),
} as const;

type TypeName = keyof typeof schemas;

function isTypeName(value: unknown): value is TypeName {
  return typeof value === 'string' && Object.hasOwn(schemas, value);
}

/** Validates the GDRs of a Game build and returns its catalog, or reports every violation as a data defect. */
export function buildGdrCatalog(files: readonly RawGdrFile[]): GdrCatalog {
  const problems: string[] = [];
  const byType = new Map<string, AnyGdr[]>();

  for (const file of files) {
    const typesInFile = new Set<string>();
    file.gdrs.forEach((raw, index) => {
      const where = `${file.path}#${index + 1}`;
      const type = (raw as { type?: unknown } | null)?.type;
      if (!isTypeName(type)) {
        problems.push(`${where}: unknown GDR Type ${JSON.stringify(type)}`);
        return;
      }
      typesInFile.add(type);
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
  const missionArchetype = single<GdrCatalog['missionArchetype']>('MissionArchetype');
  const endingParameters = single<GdrCatalog['endingParameters']>('EndingParameters');
  const configurationParameters = single<GdrCatalog['configurationParameters']>('ConfigurationParameters');

  const weapons = mapOf<ReturnType<GdrCatalog['weapons']['get']> & AnyGdr>('Weapon');
  const enemyArchetypes = mapOf<ReturnType<GdrCatalog['enemyArchetypes']['get']> & AnyGdr>('EnemyArchetype');
  const upgrades = all<GdrCatalog['upgrades'][number]>('Upgrade');
  const campaignConfigurations = all<GdrCatalog['campaignConfigurations'][number]>('CampaignConfiguration');
  const factionArchetypes = all<GdrCatalog['factionArchetypes'][number]>('FactionArchetype');
  const factionActivityLevels = mapOf<FactionActivityLevelGdr>('FactionActivityLevel');
  const factionOperationLevels = all<GdrCatalog['factionOperationLevels'][number]>('FactionOperationLevel');
  const leads = all<LeadGdr>('Lead');
  const missionSiteArchetypes = all<MissionSiteArchetypeGdr>('MissionSiteArchetype');

  // AGENT, Agent GDR validation; COMBAT, Combat GDR validation.
  if (agentArchetype && !weapons.has(agentArchetype.weapon)) {
    problems.push(`AgentArchetype ${agentArchetype.id}: weapon ${agentArchetype.weapon} is not a Weapon GDR`);
  }
  for (const enemy of enemyArchetypes.values()) {
    if (!weapons.has(enemy.weapon)) {
      problems.push(`EnemyArchetype ${enemy.id}: weapon ${enemy.weapon} is not a Weapon GDR`);
    }
  }
  if (combatParameters) {
    if (combatParameters.weaponDamageRange.lt(0) || combatParameters.weaponDamageRange.gt(1)) {
      problems.push('CombatParameters: weapon_damage_range must be from 0 to 1');
    }
    if (
      combatParameters.retreatBelowAgentRatingFraction.lt(0) ||
      combatParameters.retreatAtEnemyToAgentRating.lt(0)
    ) {
      problems.push('CombatParameters: the retreat thresholds must be at least 0');
    }
    if (
      combatParameters.incapacitationSkillFraction.lt(0) ||
      combatParameters.incapacitationSkillFraction.gte(1)
    ) {
      problems.push('CombatParameters: incapacitation_skill_fraction must be at least 0 and less than 1');
    }
  }
  if (agentParameters) {
    if (agentParameters.exhaustionPerAttack + agentParameters.exhaustionPerDefense < 1) {
      problems.push('AgentParameters: every attack must tire someone');
    }
    if (combatParameters) {
      const over = Math.max(0, agentParameters.exhaustionCap - agentParameters.exhaustionFreePoints);
      const penaltyAtCap = Math.max(0, 100 - agentParameters.skillPenaltyPctPerExhaustion * over);
      if (q(penaltyAtCap).gt(combatParameters.incapacitationSkillFraction.mul(100))) {
        problems.push('Exhaustion at the cap must incapacitate: the penalty factor at the cap is too high');
      }
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
    if (level.operationLevelWeights.length === 0) {
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

  // MISSION, MissionSiteArchetype validation.
  for (const site of missionSiteArchetypes) {
    const keys = site.enemies.map(([key]) => key);
    if (keys.some((key) => !enemyArchetypes.has(key)) || new Set(keys).size !== keys.length) {
      problems.push(`MissionSiteArchetype ${site.id}: Enemies are valid`);
    }
    if (site.operationLevel !== null && !operationLevelNumbers.includes(site.operationLevel)) {
      problems.push(`MissionSiteArchetype ${site.id}: Operation level only for Response`);
    }
  }

  // LEAD, Lead GDR validation.
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  for (const lead of leads) {
    if (!factionArchetypes.some((archetype) => archetype.id === lead.faction)) {
      problems.push(`Lead ${lead.id}: Faction resolves`);
    }
    const required = lead.requires.map((entry) => entry.missionWonFromLead);
    if (required.some((other) => !leadById.has(other)) || new Set(required).size !== required.length) {
      problems.push(`Lead ${lead.id}: Prerequisite references resolve`);
    }
    const created = missionSiteArchetypes.find((site) => site.id === lead.onCompletion.createMissionSite);
    if (created?.kind !== 'initiative') {
      problems.push(`Lead ${lead.id}: Completion effect is valid`);
    }
    const visiting = new Set<string>();
    const hasCycle = (current: LeadGdr): boolean => {
      if (visiting.has(current.id)) {
        return true;
      }
      visiting.add(current.id);
      const found = current.requires.some((entry) => {
        const next = leadById.get(entry.missionWonFromLead);
        return next !== undefined && hasCycle(next);
      });
      visiting.delete(current.id);
      return found;
    };
    if (hasCycle(lead)) {
      problems.push(`Lead ${lead.id}: Prerequisites form no cycle`);
    }
  }

  if (
    problems.length > 0 ||
    !agentArchetype ||
    !agentParameters ||
    !combatParameters ||
    !recoveryParameters ||
    !economy ||
    !agencyArchetype ||
    !investigationArchetype ||
    !missionArchetype ||
    !endingParameters ||
    !configurationParameters
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
    missionArchetype,
    endingParameters,
    configurationParameters,
    weapons,
    enemyArchetypes,
    upgrades,
    campaignConfigurations,
    factionArchetypes,
    factionActivityLevels,
    factionOperationLevels,
    leads,
    missionSiteArchetypes,
  };
}
