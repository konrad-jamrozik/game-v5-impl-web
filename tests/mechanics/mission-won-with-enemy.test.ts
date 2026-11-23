/**
 * Tests of MISSION, Mission won with Enemy Condition kind: when it holds, how LEAD, Initiative operation level reads
 * it, and how the rules of LEAD, Lead and of MISSION, MissionSiteArchetype check it.
 */
import { describe, expect, it } from 'vite-plus/test';
import {
  conditionHolds,
  missionWonWithEnemyHolds,
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
  const direct = missionWonWithEnemyHolds(enemy, faction, world);
  const indexed = conditionHolds({ kind: 'mission_won_with_enemy', enemyArchetype: enemy }, world, {
    faction,
    won: wonMissionIndex(world),
  });
  expect(indexed).toBe(direct);
  return direct;
}

describe('MISSION, Mission won with Enemy Condition kind', () => {
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

  it('holds after a Won Response Mission too, e.g. a High commander killed at Foil warhead launch', () => {
    const response = worldWith({
      kind: 'Response',
      faction: 'faction-1',
      enemies: [{ archetype: 'high_commander', dead: true }],
      outcome: 'Won',
    });
    expect(holds(response, 'high_commander', 'faction-1')).toBe(true);
  });

  it('does not hold for a Lost Mission or a Mission site of another Faction', () => {
    const lieutenant = [{ archetype: 'lieutenant', dead: false }];
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

describe('LEAD, Initiative operation level of a mission_won_with_enemy Condition', () => {
  it('is that of the first Initiative Mission site holding the Enemy: a Response shortcut changes no level', () => {
    const catalog = bootstrapGdrCatalog();
    const levels = initiativeOperationLevels(catalog);
    // Each officer, the Initiative Mission site of the chain that first holds it, and the Lead its interrogation leads to.
    const officers = [
      ['handler', 'raid_safehouse', 'outpost'],
      ['lieutenant', 'raid_outpost', 'logistics_hub'],
      ['commander', 'raid_logistics_hub', 'regional_stronghold'],
      ['high_commander', 'raid_regional_stronghold', 'hq'],
    ] as const;
    for (const faction of ['red_dawn', 'exalt', 'black_lotus']) {
      for (const [enemy, site, next] of officers) {
        const lead = catalog.leads.find((item) => item.id === `interrogate_${faction}_${enemy}`)!;
        expect(lead.discoveredWhen).toEqual({ kind: 'mission_won_with_enemy', enemyArchetype: enemy });
        // Response Mission sites hold these officers too, and add nothing to the level, so the chain keeps its tiers.
        expect(levels.leads.get(lead.id)).toBe(levels.missionSiteArchetypes.get(site));
        expect(levels.leads.get(`locate_${faction}_${next}`)).toBe(
          levels.missionSiteArchetypes.get(site)! + 1,
        );
      }
    }
  });

  it('is 0 when only Response MissionSiteArchetypes hold the Enemy, and none when none does', () => {
    const catalog = bootstrapGdrCatalog();
    const lead = catalog.leads.find((item) => item.id === 'interrogate_red_dawn_lieutenant')!;
    const only = (kind: 'initiative' | 'response') =>
      initiativeOperationLevels({
        leads: [
          { ...lead, discoveredWhen: { kind: 'mission_won_with_enemy', enemyArchetype: 'lieutenant' } },
        ],
        missionSiteArchetypes: catalog.missionSiteArchetypes.filter((item) => item.kind === kind),
      }).leads.get(lead.id);
    expect(only('response')).toBe(0);
    const none = initiativeOperationLevels({
      leads: [
        { ...lead, discoveredWhen: { kind: 'mission_won_with_enemy', enemyArchetype: 'no_such_enemy' } },
      ],
      missionSiteArchetypes: catalog.missionSiteArchetypes,
    }).leads.get(lead.id);
    expect(none).toBeNull();
  });
});

describe('Validation of mission_won_with_enemy Conditions', () => {
  it('LEAD, Lead GDR validation, rule 4: needs a Faction and an EnemyArchetype of the Game build', () => {
    expectDefective((raw) => {
      const lead = raw.get('interrogate_red_dawn_lieutenant');
      delete lead['faction'];
    });
    expectDefective((raw) => {
      raw.get('interrogate_red_dawn_lieutenant')['discovered_when'] = cond(
        'mission_won_with_enemy',
        'no_such_enemy',
      );
    });
  });

  it('MISSION, MissionSiteArchetype validation, rule 9: is not an Existence Condition kind', () => {
    expectDefective((raw) => {
      raw.get('raid_logistics_hub')['can_exist_when'] = cond('mission_won_with_enemy', 'lieutenant');
    });
  });
});
