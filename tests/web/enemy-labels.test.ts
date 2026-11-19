/** GUI, Enemy labels: each EnemyArchetype numbers its own Enemies at each Mission site, from 1. */
import { describe, expect, it } from 'vite-plus/test';
import { enemyLabels } from '../../src/web/enemy-labels.ts';

const initiate = (id: string) => ({ id, archetype: 'initiate', archetypeName: 'Initiate' });
const soldier = (id: string) => ({ id, archetype: 'soldier', archetypeName: 'Soldier' });

describe('GUI: Enemy labels', () => {
  it('numbers the Enemies of each EnemyArchetype in the Mission site list order, whatever the Instance IDs', () => {
    const labels = enemyLabels([
      initiate('enemy-19'),
      initiate('enemy-20'),
      initiate('enemy-21'),
      soldier('enemy-22'),
      soldier('enemy-23'),
    ]);
    expect([...labels.values()]).toEqual([
      'initiate-1',
      'initiate-2',
      'initiate-3',
      'soldier-1',
      'soldier-2',
    ]);
    expect(labels.get('enemy-20')).toBe('initiate-2');
  });

  it('writes the EnemyArchetype name in lower case with each space replaced by a hyphen', () => {
    const labels = enemyLabels([{ id: 'enemy-7', archetype: 'cult_leader', archetypeName: 'Cult leader' }]);
    expect(labels.get('enemy-7')).toBe('cult-leader-1');
  });
});
