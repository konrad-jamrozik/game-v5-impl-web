/** AVIEW, Memorial: the Killed by and Where columns. */
import { describe, expect, it } from 'vite-plus/test';
import { instanceNumber, memorialDeath } from '../../src/web/memorial.ts';

const site = {
  id: 'mission-site-75',
  name: 'Raid outpost',
  enemies: [
    { id: 'enemy-301', archetype: 'soldier', archetypeName: 'Soldier' },
    { id: 'enemy-302', archetype: 'soldier', archetypeName: 'Soldier' },
    { id: 'enemy-303', archetype: 'high_commander', archetypeName: 'High commander' },
  ],
};

describe('AVIEW: Memorial', () => {
  it('names the Enemy by its Enemy label and the Mission site by its name and number', () => {
    expect(memorialDeath({ enemy: 'enemy-302', missionSite: 'mission-site-75' }, [site])).toEqual({
      killedBy: 'soldier-2',
      where: { name: 'Raid outpost', number: '#75' },
    });
    expect(memorialDeath({ enemy: 'enemy-303', missionSite: 'mission-site-75' }, [site])?.killedBy).toBe(
      'high-commander-1',
    );
  });

  it('leaves both cells empty for a Dismissed Agent', () => {
    expect(memorialDeath(null, [site])).toBeNull();
  });

  it('writes "#" and the number that ends the Instance ID', () => {
    expect(instanceNumber('mission-site-5')).toBe('#5');
    expect(instanceNumber('mission-site-123')).toBe('#123');
  });
});
