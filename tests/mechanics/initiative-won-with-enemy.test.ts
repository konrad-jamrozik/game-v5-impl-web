/**
 * Tests of MISSION, Initiative won with Enemy Condition kind: when it holds, how LEAD, Initiative operation level reads
 * it, and how LEAD, Lead GDR validation and MISSION, MissionSiteArchetype validation check it.
 */
import { describe, expect, it } from 'vite-plus/test';
import {
  conditionHolds,
  initiativeWonWithEnemyHolds,
  wonMissionIndex,
  type ConditionWorld,
} from '../../src/engine/mechanics/conditions/conditions.ts';
import { initiativeOperationLevels } from '../../src/engine/mechanics/leads/leads.ts';
import { bootstrapGdrCatalog } from '../../src/gdr/index.ts';
import { expectDefective } from '../helpers/game.ts';

const cond = (key: string, value: unknown) => ({ $entries: [[key, value]] });

/** A World state of one Concluded Mission site with the given kind, target Faction, Enemies, and Mission outcome. */
function worldWith(options: {
  kind: 'Initiative' | 'Response';
  faction: string;
  enemies: { archetype: string; dead: boolean }[];
  outcome: 'Won' | 'Lost';
}): ConditionWorld {
  const enemies = Object.fromEntries(
    options.enemies.map((enemy, index) => [
      `enemy-${index + 1}`,
      {
        id: `enemy-${index + 1}`,
        archetype: enemy.archetype,
        constants: { missionSite: 'mission-site-1' },
        // An Enemy killed in the Combat stays in its Mission site's Enemies list.
        state: { healthLost: enemy.dead ? 30 : 0 },
      },
    ]),
  );
  return {
    missionSites: {
      'mission-site-1': {
        id: 'mission-site-1',
        archetype: 'raid_outpost',
        constants: { kind: options.kind, targetFaction: options.faction },
        state: { lifecycle: 'Concluded', enemies: Object.keys(enemies) },
      },
    },
    missions: {
      'mission-1': {
        id: 'mission-1',
        archetype: 'standard_mission',
        constants: { missionSite: 'mission-site-1' },
        state: { lifecycle: options.outcome },
      },
    },
    investigations: {},
    enemies,
  } as unknown as ConditionWorld;
}

/** Both ways the engine evaluates the Condition: by reading every Mission, and through the Won Mission index. */
function holds(world: ConditionWorld, enemy: string, faction: string): boolean {
  const direct = initiativeWonWithEnemyHolds(enemy, faction, world);
  const indexed = conditionHolds({ kind: 'initiative_won_with_enemy', enemyArchetype: enemy }, world, {
    faction,
    won: wonMissionIndex(world),
  });
  expect(indexed).toBe(direct);
  return direct;
}

describe('MISSION, Initiative won with Enemy Condition kind', () => {
  it('holds after a Won Initiative Mission whose Mission site held the Enemy, even one killed in the Combat', () => {
    const world = worldWith({
      kind: 'Initiative',
      faction: 'faction-1',
      enemies: [
        { archetype: 'soldier', dead: false },
        { archetype: 'lieutenant', dead: true },
      ],
      outcome: 'Won',
    });
    expect(holds(world, 'lieutenant', 'faction-1')).toBe(true);
    expect(holds(world, 'commander', 'faction-1')).toBe(false);
  });

  it('does not hold for a Won Response Mission, a Lost Mission, or a Mission site of another Faction', () => {
    const lieutenant = [{ archetype: 'lieutenant', dead: false }];
    const response = worldWith({
      kind: 'Response',
      faction: 'faction-1',
      enemies: lieutenant,
      outcome: 'Won',
    });
    expect(holds(response, 'lieutenant', 'faction-1')).toBe(false);
    const lost = worldWith({
      kind: 'Initiative',
      faction: 'faction-1',
      enemies: lieutenant,
      outcome: 'Lost',
    });
    expect(holds(lost, 'lieutenant', 'faction-1')).toBe(false);
    const won = worldWith({ kind: 'Initiative', faction: 'faction-1', enemies: lieutenant, outcome: 'Won' });
    expect(holds(won, 'lieutenant', 'faction-2')).toBe(false);
  });
});

describe('LEAD, Initiative operation level of an initiative_won_with_enemy Condition', () => {
  it('is that of the first Initiative Mission site of the chain holding the Enemy, never of a Response one', () => {
    const catalog = bootstrapGdrCatalog();
    const levels = initiativeOperationLevels(catalog);
    for (const faction of ['red_dawn', 'exalt', 'black_lotus']) {
      const lead = catalog.leads.find((item) => item.id === `interrogate_${faction}_lieutenant`)!;
      expect(lead.discoveredWhen).toEqual({
        kind: 'initiative_won_with_enemy',
        enemyArchetype: 'lieutenant',
      });
      // Response Mission sites hold Lieutenants too, but only Initiative ones count, so the chain keeps its tiers.
      expect(levels.leads.get(lead.id)).toBe(levels.missionSiteArchetypes.get('raid_outpost'));
      expect(levels.leads.get(`locate_${faction}_logistics_hub`)).toBe(
        levels.missionSiteArchetypes.get('raid_outpost')! + 1,
      );
    }
  });
});

describe('Validation of initiative_won_with_enemy Conditions', () => {
  it('LEAD, Lead GDR validation, rule 4: needs a Faction and an EnemyArchetype of the Game build', () => {
    expectDefective((raw) => {
      const lead = raw.get('interrogate_red_dawn_lieutenant');
      delete lead['faction'];
    });
    expectDefective((raw) => {
      raw.get('interrogate_red_dawn_lieutenant')['discovered_when'] = cond(
        'initiative_won_with_enemy',
        'no_such_enemy',
      );
    });
  });

  it('MISSION, MissionSiteArchetype validation, rule 9: is not an Existence Condition kind', () => {
    expectDefective((raw) => {
      raw.get('raid_logistics_hub')['can_exist_when'] = cond('initiative_won_with_enemy', 'lieutenant');
    });
  });
});
