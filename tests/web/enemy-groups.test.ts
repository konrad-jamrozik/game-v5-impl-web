/** MVIEW, Selected Mission site: the Enemies counted by EnemyArchetype. */
import { describe, expect, it } from 'vite-plus/test';
import { enemyGroups } from '../../src/web/enemy-groups.ts';

const ORDER = ['initiate', 'operative', 'handler', 'soldier', 'commander'];
const enemy = (archetype: string, archetypeName: string, combatRating: number) => ({
  archetype,
  archetypeName,
  combatRating,
});

describe('MVIEW: Enemy lines of a Mission site', () => {
  it('counts the Enemies of each EnemyArchetype, in ascending order of one Enemy’s Combat rating', () => {
    const enemies = [
      enemy('soldier', 'Soldier', 200),
      ...Array.from({ length: 17 }, () => enemy('initiate', 'Initiate', 80)),
      enemy('commander', 'Commander', 300),
      enemy('soldier', 'Soldier', 200),
    ];
    expect(enemyGroups(enemies, ORDER).map((group) => group.text)).toEqual([
      '17 Initiates · 80 CR each',
      '2 Soldiers · 200 CR each',
      '1 Commander · 300 CR',
    ]);
  });

  it('breaks ties of Combat rating by the EnemyArchetype order, not by the Enemies’ order', () => {
    const enemies = [enemy('handler', 'Handler', 100), enemy('operative', 'Operative', 100)];
    expect(enemyGroups(enemies, ORDER).map((group) => group.archetype)).toEqual(['operative', 'handler']);
  });
});
