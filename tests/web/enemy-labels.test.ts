/** GUI, Enemy labels: each EnemyArchetype numbers its own Enemies at each Mission site, from 1. */
import { describe, expect, it } from 'vite-plus/test';
import { enemyLabels } from '../../src/web/enemy-labels.ts';

const initiate = (id: string) => ({ id, archetype: 'initiate', archetypeAbbreviation: 'init' });
const soldier = (id: string) => ({ id, archetype: 'soldier', archetypeAbbreviation: 'sold' });

describe('GUI: Enemy labels', () => {
  it('numbers the Enemies of each EnemyArchetype in the Mission site list order, whatever the Instance IDs', () => {
    const labels = enemyLabels([
      initiate('enemy-19'),
      initiate('enemy-20'),
      initiate('enemy-21'),
      soldier('enemy-22'),
      soldier('enemy-23'),
    ]);
    expect([...labels.values()]).toEqual(['init-1', 'init-2', 'init-3', 'sold-1', 'sold-2']);
    expect(labels.get('enemy-20')).toBe('init-2');
  });
});
