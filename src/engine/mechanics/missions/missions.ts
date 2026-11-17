/** MISSION (Missions): Mission site creation, MissionSiteArchetype selection, and Consequences. */
import { must, ratio, roundUp } from '../../../kernel/index.ts';
import type {
  AgentParametersGdr,
  EnemyArchetypeGdr,
  FactionOperationLevelGdr,
  MissionSiteArchetypeGdr,
  WeaponGdr,
} from '../../../gdr/index.ts';
import type { Random } from '../../random.ts';
import type { Enemy, MissionSite, MissionSiteOrigin } from '../../state/types.ts';

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

/** COMBAT, Enemy creation. */
export function createEnemy(
  id: string,
  missionSiteId: string,
  archetype: EnemyArchetypeGdr,
  weapon: WeaponGdr,
): Enemy {
  return {
    id,
    archetype: archetype.id,
    constants: { missionSite: missionSiteId },
    state: {
      skill: archetype.skill,
      currentHealth: archetype.baseHealth,
      baseHealth: archetype.baseHealth,
      exhaustion: 0,
      weapon: weapon.id,
      weaponDamage: weapon.damage,
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
}): { site: MissionSite; enemies: Enemy[] } {
  const siteId = input.newId('mission-site');
  const enemies: Enemy[] = [];
  for (const [archetypeId, count] of input.archetype.enemies) {
    const archetype = must(input.enemyArchetypes.get(archetypeId), `EnemyArchetype ${archetypeId}`);
    const weapon = must(input.weapons.get(archetype.weapon), `Weapon ${archetype.weapon}`);
    for (let i = 0; i < count; i += 1) {
      enemies.push(createEnemy(input.newId('enemy'), siteId, archetype, weapon));
    }
  }
  return {
    site: {
      id: siteId,
      archetype: input.archetype.id,
      constants: {
        kind: input.archetype.kind === 'initiative' ? 'Initiative' : 'Response',
        origin: input.origin,
        targetFaction: input.targetFaction,
        turnCreated: input.turn,
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

/**
 * MISSION, MissionSiteArchetype selection: uniform over the MissionSiteArchetypes of kind response whose
 * `operation_level` equals the level of the occurrence's Faction operation level.
 */
export function selectResponseArchetype(
  random: Random,
  factionId: string,
  operationLevel: number,
  archetypes: readonly MissionSiteArchetypeGdr[],
): MissionSiteArchetypeGdr {
  const candidates = archetypes.filter(
    (archetype) => archetype.kind === 'response' && archetype.operationLevel === operationLevel,
  );
  const chosen = random.weighted(
    `mission.archetypeSelection.${factionId}`,
    candidates.map((archetype) => [archetype.id, 1] as const),
  );
  return must(
    candidates.find((archetype) => archetype.id === chosen),
    `MissionSiteArchetype for Faction operation level ${operationLevel}`,
  );
}

/** The amounts one consequence applies; see MISSION, Consequences. */
export interface ConsequenceAmounts {
  readonly money: number;
  readonly fundingChange: number;
  readonly panicIncrease: number;
  readonly panicReduction: number;
  readonly eliminateTargetFaction: boolean;
}

const NO_CONSEQUENCE: ConsequenceAmounts = {
  money: 0,
  fundingChange: 0,
  panicIncrease: 0,
  panicReduction: 0,
  eliminateTargetFaction: false,
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
      money: archetype.onWin.money,
      fundingChange: archetype.onWin.funding,
      panicIncrease: 0,
      panicReduction: archetype.onWin.panicReductionPct,
      eliminateTargetFaction: archetype.onWin.eliminateTargetFaction,
    };
  }
  const level = must(operationLevel, 'FactionOperationLevel of a Response Mission site');
  if (finalState === 'Won') {
    return { ...NO_CONSEQUENCE, money: level.onWin.money, fundingChange: level.onWin.funding };
  }
  return {
    ...NO_CONSEQUENCE,
    panicIncrease: level.onIgnoredOrLost.panicIncreasePct,
    fundingChange: level.onIgnoredOrLost.funding,
  };
}
