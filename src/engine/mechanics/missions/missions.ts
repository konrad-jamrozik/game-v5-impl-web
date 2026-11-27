/** MISSION (Missions): Mission site creation, MissionSiteArchetype selection, and Consequences. */
import { must, ratio, Rational, roundDown, roundUp } from '../../../kernel/index.ts';
import type {
  AgentParametersGdr,
  ArmorGdr,
  CombatParametersGdr,
  EnemyArchetypeGdr,
  FactionOperationLevelGdr,
  MissionSiteArchetypeGdr,
  WeaponGdr,
} from '../../../gdr/index.ts';
import type { Random } from '../../random.ts';
import {
  isServing,
  type AgentState,
  type Enemy,
  type Faction,
  type MissionSite,
  type MissionSiteOrigin,
} from '../../state/types.ts';
import { canTakeOrders, isInBase, type AgentUpgradeBonus } from '../agents/agents.ts';
import {
  agentCombatantState,
  combatRating,
  enemyCombatantState,
  meetsIncapacitationCondition,
} from '../combat/combat.ts';
import { conditionHolds, type ConditionWorld } from '../conditions/conditions.ts';

/**
 * MISSION, Glossary, Capable for deployment: the Agent does not meet the incapacitation condition with its current
 * values, so it would not be Incapacitated as soon as it is deployed. REUSE, Rules read by other rules: it calls the
 * one implementation Combat start calls.
 */
export function isCapableForDeployment(
  agent: AgentState,
  bonus: AgentUpgradeBonus,
  combat: CombatParametersGdr,
  agentParameters: AgentParametersGdr,
): boolean {
  return !meetsIncapacitationCondition(agentCombatantState(agent, bonus), combat, agentParameters);
}

/**
 * MISSION, Glossary, Deployable Agent: a Serving Agent that is In base, can take orders, and is Capable for
 * deployment, i.e. one At assignment on a Base Assignment; a Recovering Agent is In base but cannot take orders.
 */
export function isDeployableAgent(
  agent: AgentState,
  bonus: AgentUpgradeBonus,
  combat: CombatParametersGdr,
  agentParameters: AgentParametersGdr,
): boolean {
  return (
    isServing(agent) &&
    isInBase(agent) &&
    canTakeOrders(agent) &&
    isCapableForDeployment(agent, bonus, combat, agentParameters)
  );
}

/**
 * MISSION, Whether a Mission site can exist: a Mission site of the MissionSiteArchetype targeting the Faction can exist
 * exactly when the Faction is not Eliminated and the MissionSiteArchetype's `can_exist_when`, if any, holds, with the
 * Faction supplied to every `mission_won` Condition. A Derived value of the given World state.
 */
export function missionSiteCanExist(
  archetype: MissionSiteArchetypeGdr,
  faction: Faction | undefined,
  world: ConditionWorld,
): boolean {
  if (faction === undefined || faction.state.eliminated) {
    return false;
  }
  return (
    archetype.canExistWhen === null || conditionHolds(archetype.canExistWhen, world, { faction: faction.id })
  );
}

/**
 * MISSION, Mission exhaustion: the exhaustion every survivor of a Mission gains,
 * exhaustion_per_mission + round up( exhaustion_per_pct_killed × 100 × K / D ), whatever the Combat outcome.
 */
export function missionExhaustion(killed: number, teamSent: number, parameters: AgentParametersGdr): number {
  return (
    parameters.exhaustionPerMission +
    roundUp(ratio(parameters.exhaustionPerPctKilled * 100 * killed, teamSent))
  );
}

/** One Enemy's values when a Combat ends, as Loss severity reads them. */
export interface EnemyAtCombatEnd {
  readonly baseSkill: number;
  readonly currentHealthHundredths: number;
  readonly effectiveMaxHealth: number;
  readonly ableToFight: boolean;
}

/**
 * MISSION, Loss severity: the sum of the Health-adjusted base skill (base skill × current health / effective max
 * health) of the Enemies able to fight at Combat end, over the sum of the base skill of all the Enemies. Exhaustion
 * and effective skill do not count. It is 1 when the Enemies have no base skill at all.
 */
export function lossSeverity(enemies: readonly EnemyAtCombatEnd[]): Rational {
  let standing = Rational.ZERO;
  let total = Rational.ZERO;
  for (const enemy of enemies) {
    total = total.add(enemy.baseSkill);
    if (enemy.ableToFight && enemy.effectiveMaxHealth > 0) {
      standing = standing.add(
        ratio(enemy.baseSkill * enemy.currentHealthHundredths, enemy.effectiveMaxHealth * 100),
      );
    }
  }
  return total.gt(0) ? standing.div(total) : Rational.ONE;
}

/**
 * MISSION, Loss scaling: a Lost Response Mission's consequences, each Effect value scaled by its Loss severity L.
 * The funding change is round down( funding × L ), the Panic increase round up( 10 × panic × L ) / 10, i.e. to tenths
 * of a percentage point, and a `defeat` Effect applies unscaled.
 */
export function scaleLossConsequences(amounts: ConsequenceAmounts, severity: Rational): ConsequenceAmounts {
  return {
    ...amounts,
    fundingChange: roundDown(severity.mul(amounts.fundingChange)),
    panicIncreaseHundredths: roundUp(severity.mul(amounts.panicIncreaseHundredths).div(10)) * 10,
  };
}

/** COMBAT, Enemy creation. */
export function createEnemy(
  id: string,
  missionSiteId: string,
  archetype: EnemyArchetypeGdr,
  weapon: WeaponGdr,
  armor: ArmorGdr,
): Enemy {
  return {
    id,
    archetype: archetype.id,
    constants: { missionSite: missionSiteId },
    state: {
      skill: archetype.skill,
      healthLost: 0,
      baseHealth: archetype.baseHealth,
      exhaustion: 0,
      weapon: weapon.id,
      baseWeaponDamage: weapon.damage,
      armor: armor.id,
      baseArmor: armor.armor,
    },
  };
}

/**
 * MISSION, Mission site creation and Enemy creation: one Active Mission site with its Enemies, created in the
 * authored order of the MissionSiteArchetype's `enemies`.
 */
export function createMissionSite(input: {
  newId: (type: 'mission-site' | 'enemy') => string;
  archetype: MissionSiteArchetypeGdr;
  origin: MissionSiteOrigin;
  targetFaction: string;
  turn: number;
  enemyArchetypes: ReadonlyMap<string, EnemyArchetypeGdr>;
  weapons: ReadonlyMap<string, WeaponGdr>;
  armors: ReadonlyMap<string, ArmorGdr>;
  combat: CombatParametersGdr;
  agentParameters: AgentParametersGdr;
}): { site: MissionSite; enemies: Enemy[] } {
  const siteId = input.newId('mission-site');
  const enemies = createArchetypeEnemies(input.archetype, siteId, () => input.newId('enemy'), input);
  return {
    site: {
      id: siteId,
      archetype: input.archetype.id,
      constants: {
        kind: input.archetype.kind === 'initiative' ? 'Initiative' : 'Response',
        origin: input.origin,
        targetFaction: input.targetFaction,
        turnCreated: input.turn,
        // MISSION, Mission site creation: the Combat rating of its Enemies taken as one side, as created.
        creationCombatRating: enemiesCombatRating(
          enemies.map((enemy) => enemy.state),
          input.combat,
          input.agentParameters,
        ),
      },
      state: {
        lifecycle: 'Active',
        turnsUntilExpiration: input.archetype.expiresInTurns,
        enemies: enemies.map((enemy) => enemy.id),
      },
    },
    enemies,
  };
}

/** The GDRs that creating the Enemies of a MissionSiteArchetype reads. */
export interface EnemyCreationGdrs {
  readonly enemyArchetypes: ReadonlyMap<string, EnemyArchetypeGdr>;
  readonly weapons: ReadonlyMap<string, WeaponGdr>;
  readonly armors: ReadonlyMap<string, ArmorGdr>;
}

/**
 * MISSION, Mission site creation and Enemy creation: the Enemies of a Mission site of the MissionSiteArchetype, in the
 * authored order of its `enemies`. REUSE, Combat ratings of Enemies: the one implementation that both Mission site
 * creation and the Combat rating of a MissionSiteArchetype's Enemies call.
 */
export function createArchetypeEnemies(
  archetype: MissionSiteArchetypeGdr,
  siteId: string,
  newEnemyId: () => string,
  gdrs: EnemyCreationGdrs,
): Enemy[] {
  const enemies: Enemy[] = [];
  for (const [archetypeId, count] of archetype.enemies) {
    const enemyArchetype = must(gdrs.enemyArchetypes.get(archetypeId), `EnemyArchetype ${archetypeId}`);
    const weapon = must(gdrs.weapons.get(enemyArchetype.weapon), `Weapon ${enemyArchetype.weapon}`);
    const armor = must(gdrs.armors.get(enemyArchetype.armor), `Armor ${enemyArchetype.armor}`);
    for (let i = 0; i < count; i += 1) {
      enemies.push(createEnemy(newEnemyId(), siteId, enemyArchetype, weapon, armor));
    }
  }
  return enemies;
}

/** REUSE, Combat ratings of Enemies: the Combat rating of some Enemies taken as one side, by the one rating of a side. */
export function enemiesCombatRating(
  enemies: readonly Enemy['state'][],
  combat: CombatParametersGdr,
  agentParameters: AgentParametersGdr,
): number {
  return combatRating(enemies.map(enemyCombatantState), combat, agentParameters);
}

/**
 * MISSION, Player-visible information: the Combat rating of a MissionSiteArchetype's Enemies, i.e. the Creation Combat
 * rating of every Mission site of it, rated from the Enemies Mission site creation creates for it.
 */
export function archetypeEnemiesCombatRating(
  archetype: MissionSiteArchetypeGdr,
  gdrs: EnemyCreationGdrs & {
    readonly combatParameters: CombatParametersGdr;
    readonly agentParameters: AgentParametersGdr;
  },
): number {
  const enemies = createArchetypeEnemies(archetype, 'rated', () => 'rated', gdrs);
  return enemiesCombatRating(
    enemies.map((enemy) => enemy.state),
    gdrs.combatParameters,
    gdrs.agentParameters,
  );
}

/**
 * MISSION, MissionSiteArchetype selection: the initiating Faction's previous operation, i.e. the MissionSiteArchetype of
 * the Response Mission site its latest earlier Faction operation occurrence created, read from that retained Mission
 * site; none for a Faction with no earlier occurrence. Mission sites are kept in creation order, so the latest is the
 * last.
 */
export function previousOperation(
  factionId: string,
  missionSites: Readonly<Record<string, MissionSite>>,
): string | null {
  let previous: string | null = null;
  for (const site of Object.values(missionSites)) {
    const origin = site.constants.origin;
    if (origin.kind === 'FactionOperation' && origin.initiatingFaction === factionId) {
      previous = site.archetype;
    }
  }
  return previous;
}

/**
 * MISSION, MissionSiteArchetype selection: uniform over the MissionSiteArchetypes of kind response whose
 * `operation_level` equals the level of the occurrence's Faction operation level, except that when there are two or
 * more such candidates, the initiating Faction's previous operation is not a possible value.
 */
export function selectResponseArchetype(
  random: Random,
  factionId: string,
  operationLevel: number,
  archetypes: readonly MissionSiteArchetypeGdr[],
  previous: string | null,
): MissionSiteArchetypeGdr {
  const candidates = archetypes.filter(
    (archetype) => archetype.kind === 'response' && archetype.operationLevel === operationLevel,
  );
  const possible =
    candidates.length >= 2 ? candidates.filter((archetype) => archetype.id !== previous) : candidates;
  const chosen = random.weighted(
    `mission.archetypeSelection.${factionId}`,
    possible.map((archetype) => [archetype.id, 1] as const),
  );
  return must(
    possible.find((archetype) => archetype.id === chosen),
    `MissionSiteArchetype for Faction operation level ${operationLevel}`,
  );
}

/** The amounts one consequence applies; see MISSION, Consequences. */
export interface ConsequenceAmounts {
  readonly money: number;
  readonly fundingChange: number;
  /** The Panic increase and Panic reduction, Decimal quantities in hundredths of a percentage point. */
  readonly panicIncreaseHundredths: number;
  readonly panicReductionHundredths: number;
  readonly eliminateTargetFaction: boolean;
  /** Whether a `defeat` Effect applies, which loses the Campaign (ENDING, Defeat Effect kind). */
  readonly defeat: boolean;
}

const NO_CONSEQUENCE: ConsequenceAmounts = {
  money: 0,
  fundingChange: 0,
  panicIncreaseHundredths: 0,
  panicReductionHundredths: 0,
  eliminateTargetFaction: false,
  defeat: false,
};

/**
 * MISSION, Consequences: the consequences of a final state, by the kind of the Mission site. `operationLevel` is
 * the FactionOperationLevel of a Response Mission site's origin.
 */
export function consequencesOf(
  finalState: 'Won' | 'Lost' | 'Expired' | 'Cancelled',
  archetype: MissionSiteArchetypeGdr,
  operationLevel: FactionOperationLevelGdr | null,
): ConsequenceAmounts {
  if (finalState === 'Cancelled') {
    return NO_CONSEQUENCE;
  }
  if (archetype.kind === 'initiative') {
    if (finalState !== 'Won') {
      return NO_CONSEQUENCE;
    }
    return {
      ...NO_CONSEQUENCE,
      money: archetype.onWin.money,
      fundingChange: archetype.onWin.funding,
      panicReductionHundredths: archetype.onWin.panicReductionHundredths,
      eliminateTargetFaction: archetype.onWin.eliminateTargetFaction,
    };
  }
  const level = must(operationLevel, 'FactionOperationLevel of a Response Mission site');
  if (finalState === 'Won') {
    return { ...NO_CONSEQUENCE, money: level.onWin.money, fundingChange: level.onWin.funding };
  }
  return {
    ...NO_CONSEQUENCE,
    panicIncreaseHundredths: level.onIgnoredOrLost.panicIncreaseHundredths,
    fundingChange: level.onIgnoredOrLost.funding,
    defeat: level.onIgnoredOrLost.defeat,
  };
}
