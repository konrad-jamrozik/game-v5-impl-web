/**
 * COMBAT, Combat setup seed: the Combat report of a Mission's Combat holds a Combat setup seed, and a Detached Combat on
 * it fights the same Combat again: the same Combatants in the same order and the same attacks with the same random
 * outcomes. The seed survives its text form, and a Mission's Combat draws from a Detached seed of its own.
 */
import { describe, expect, it } from 'vite-plus/test';
import { advanceTurnOf } from '../../src/engine/game-rules.ts';
import {
  decodeCombatSetupSeed,
  encodeCombatSetupSeed,
  missionCombatSeed,
  setupOfCombatSetup,
  type CombatSetup,
} from '../../src/engine/mechanics/combat/combat-setup-seed.ts';
import {
  buildDetachedCombat,
  detachedRandom,
  fightDetachedCombat,
} from '../../src/engine/mechanics/combat/detached-combat.ts';
import { isRejection } from '../../src/engine/result.ts';
import type { AttackRecord, CampaignState } from '../../src/engine/state/types.ts';
import { act, addMissionSite, agentIds, gdrs, missionAt, newCampaign, withAgents } from '../helpers/game.ts';

/** What an attack decided, without the Instance IDs, which a Detached Combat replaces by side and position. */
const decided = (attack: AttackRecord) => [
  attack.round,
  attack.a,
  attack.d,
  attack.hitChance,
  attack.hitRoll ?? null,
  attack.hit,
  attack.damage,
  attack.armorRemoved,
  attack.healthRemovedHundredths,
  attack.defenderDead,
  attack.defenderIncapacitated,
];

/** Advance turn drawing from the Campaign's own seeded random outcomes, as play does. */
function advanceSeeded(state: CampaignState): CampaignState {
  const next = advanceTurnOf(state, gdrs, null);
  if (isRejection(next)) {
    throw new Error(next.message);
  }
  return next;
}

describe('COMBAT: Combat setup seed', () => {
  it('fights a Mission’s Combat again, attack for attack, as a Detached Combat', () => {
    const { state: withSite, site } = addMissionSite(withAgents(newCampaign(), 8), 'raid_safehouse');
    const team = agentIds(withSite).slice(0, 6);
    const deployed = act(withSite, 'deployAgents', { missionSite: site, agents: team });
    const mission = missionAt(deployed, site);
    const next = advanceSeeded(deployed);
    const report = next.world.history.turnReport?.combatReports.find((item) => item.mission === mission);
    expect(report?.setupSeed).toBeDefined();
    expect(report?.setupSeedExact).toBe(true);
    const setup = decodeCombatSetupSeed(report?.setupSeed ?? '');
    expect(setup?.seed).toBe(missionCombatSeed(deployed.world.current.seed, mission));
    const combat = buildDetachedCombat(null, gdrs, setupOfCombatSetup(setup as CombatSetup));
    if ('rejected' in combat) {
      throw new Error(combat.message);
    }
    const again = fightDetachedCombat(combat, detachedRandom(combat.seed));
    expect(again.combatReport.outcome).toBe(report?.outcome);
    expect(again.combatReport.rounds).toBe(report?.rounds);
    expect(again.combatReport.log.map(decided)).toEqual(report?.log.map(decided));
    expect(again.combatReport.ammo).toEqual(report?.ammo);
  });

  it('keeps every value through its text form, writing equal neighbours once', () => {
    const enemy = {
      baseSkill: 40,
      currentHealth: 20,
      effectiveMaxHealth: 20,
      exhaustion: 0,
      effectiveWeaponDamage: 8,
      effectiveArmor: 0,
      weapon: 'basic_pistol',
      kind: 'initiate',
    };
    const setup: CombatSetup = {
      gameBuild: 'build',
      seed: 'm0123456789abcdef',
      ammo: { pistol_ammo: 17 },
      agents: [
        {
          baseSkill: 123.45,
          currentHealth: 29.5,
          effectiveMaxHealth: 30,
          exhaustion: 12.4,
          effectiveWeaponDamage: 14,
          effectiveArmor: 20,
          weapon: 'rifle',
          kind: 'ballistic_vest',
        },
      ],
      enemies: Array.from({ length: 40 }, () => enemy),
    };
    const text = encodeCombatSetupSeed(setup);
    expect(text).toMatch(/^cs1-[A-Za-z0-9_-]+$/);
    expect(text.length).toBeLessThan(300);
    expect(decodeCombatSetupSeed(text)).toEqual(setup);
    expect(decodeCombatSetupSeed('combat-simulator')).toBeNull();
    expect(decodeCombatSetupSeed('cs1-not json')).toBeNull();
  });

  it('derives a Mission’s Detached seed from the Campaign seed and the Mission alone', () => {
    const seed = missionCombatSeed('abc', 'mission-1');
    expect(seed).toMatch(/^m[0-9a-f]{16}$/);
    expect(missionCombatSeed('abc', 'mission-1')).toBe(seed);
    expect(missionCombatSeed('abc', 'mission-2')).not.toBe(seed);
    expect(missionCombatSeed('abd', 'mission-1')).not.toBe(seed);
  });
});
