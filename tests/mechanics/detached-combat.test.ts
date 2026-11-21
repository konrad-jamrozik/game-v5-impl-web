/**
 * Tests of COMBAT, Detached Combat and Batch of Detached Combats, and of REUSE, Agreement test, for
 * `developer.tools.fightCombat(setup)` and `developer.tools.fightCombatBatch(setup, count)`.
 */
import { describe, expect, it } from 'vite-plus/test';
import { advanceTurnOf } from '../../src/engine/game-rules.ts';
import type { FoughtCombatReport } from '../../src/engine/mechanics/combat/combat.ts';
import {
  BATCH_MAX_COUNT,
  detachedCombat,
  detachedCombatBatch,
  type DetachedCombatBatchResult,
  type DetachedCombatResult,
  type DetachedCombatSetup,
  type DetachedEnemyEntry,
} from '../../src/engine/mechanics/combat/detached-combat.ts';
import { seededRandom, type Random } from '../../src/engine/random.ts';
import { isRejection } from '../../src/engine/result.ts';
import type { CampaignState, CombatReport } from '../../src/engine/state/types.ts';
import type { Engine } from '../../src/engine/index.ts';
import { seedRng } from '../../src/kernel/index.ts';
import { errorCode, ok, startEngine } from '../helpers/engine.ts';
import {
  act,
  addMissionSite,
  agentIds,
  gdrs,
  newCampaign,
  randomFor,
  setAssignment,
  tweak,
  withAgents,
} from '../helpers/game.ts';

/**
 * A Campaign with four Agents deployed to a new `raid_outpost`, before the Advance turn that fights its Combat, and
 * three Armor Upgrades bought, so that their current armor absorbs hits.
 */
function deployedCampaign(): { state: CampaignState; team: string[]; site: string } {
  let state = withAgents(newCampaign({ money: 1500 }), 4);
  for (let i = 0; i < 3; i += 1) {
    state = act(state, 'purchaseUpgrade', { upgrade: 'armor' });
  }
  const team = agentIds(state).slice(0, 4);
  state = setAssignment(state, team, 'Standby');
  const added = addMissionSite(state, 'raid_outpost');
  state = act(added.state, 'deployAgents', { missionSite: added.site, agents: team });
  return { state, team, site: added.site };
}

/**
 * The random source of play in the Agreement test: every Combat random outcome comes from the given seed, exactly as
 * a Detached Combat derives its own, and every other random outcome from the usual test source.
 */
function combatFromSeed(state: CampaignState, seed: string): Random {
  const combat = seededRandom(seedRng(seed), []);
  const other = randomFor(state);
  const pick = (outcome: string): Random => (outcome.startsWith('combat.') ? combat : other);
  return {
    uniform: (outcome, lo, hi) => pick(outcome).uniform(outcome, lo, hi),
    chance: (outcome, p) => pick(outcome).chance(outcome, p),
    weighted: (outcome, entries) => pick(outcome).weighted(outcome, entries),
  };
}

/** A Combat report without its Mission, with each participant identified by side and position, as a Detached one. */
function byPosition(report: CombatReport): FoughtCombatReport {
  const ids = new Map<string, string>([
    ...report.agents.map((id, index): [string, string] => [id, `agent#${index + 1}`]),
    ...report.enemies.map((id, index): [string, string] => [id, `enemy#${index + 1}`]),
  ]);
  const of = (id: string): string => ids.get(id) ?? id;
  const { mission: _mission, ...rest } = report;
  return {
    ...rest,
    agents: rest.agents.map(of),
    enemies: rest.enemies.map(of),
    participants: rest.participants.map((participant) => ({ ...participant, id: of(participant.id) })),
    log: rest.log.map((attack) => ({
      ...attack,
      attacker: of(attack.attacker),
      defender: of(attack.defender),
    })),
  };
}

function fought(state: CampaignState, setup: unknown): DetachedCombatResult {
  const result = detachedCombat(state.world.current, gdrs, setup);
  if (isRejection(result)) {
    throw new Error(`Expected the setup to be accepted: ${result.message}`);
  }
  return result;
}

function batch(
  state: CampaignState,
  setup: unknown,
  count: unknown,
  stop?: unknown,
): DetachedCombatBatchResult {
  const result = detachedCombatBatch(state.world.current, gdrs, setup, count, stop);
  if (isRejection(result)) {
    throw new Error(`Expected the batch to be accepted: ${result.message}`);
  }
  return result;
}

function rejection(state: CampaignState, setup: unknown): string {
  const result = detachedCombat(state.world.current, gdrs, setup);
  return isRejection(result) ? result.reason : 'accepted';
}

const explicitAgent = {
  kind: 'explicit',
  baseSkill: 100,
  currentHealth: 30,
  effectiveMaxHealth: 30,
  exhaustion: 0,
  effectiveWeaponDamage: 10,
} as const;

describe('REUSE: Agreement test of developer.tools.fightCombat', () => {
  it('fights a Combat as the Mission resolution step fights it, given equal inputs and random outcomes', () => {
    const { state, team, site } = deployedCampaign();
    const seed = 'agreement';
    const next = advanceTurnOf(state, gdrs, combatFromSeed(state, seed));
    if (isRejection(next)) {
      throw new Error(next.message);
    }
    const played = next.world.history.turnReport?.combatReports[0];
    if (played === undefined) {
      throw new Error('No Combat was fought');
    }
    expect(played.log.length).toBeGreaterThan(0);
    expect(played.log.some((attack) => attack.armorRemoved > 0)).toBe(true);

    // The Combat's starting values and the Game build's GDR values, given as explicit values.
    const explicit = (id: string) => {
      const start = played.participants.find((participant) => participant.id === id)!.start;
      return {
        kind: 'explicit',
        baseSkill: start.skillHundredths / 100,
        currentHealth: start.currentHealthHundredths / 100,
        effectiveMaxHealth: start.maxHealth,
        exhaustion: start.exhaustion,
        effectiveWeaponDamage: start.weaponDamage,
        // An entry without effective armor has armor 0, as each Enemy's is here.
        ...(start.armor > 0 ? { effectiveArmor: start.armor } : {}),
      };
    };
    const fromValues = fought(state, {
      agents: played.agents.map(explicit),
      enemies: played.enemies.map(explicit),
      seed,
    });
    expect(fromValues.combatReport).toEqual(byPosition(played));

    // The same Combatants named by Instance ID in the Current world state before the Advance turn.
    const sites = state.world.current.missionSites[site]!;
    const fromIds = fought(state, {
      agents: team.map((id) => ({ kind: 'agent', id })),
      enemies: sites.state.enemies.map((id) => ({ kind: 'enemy', id })),
      seed,
    });
    expect(fromIds.combatReport).toEqual(byPosition(played));
    expect(fromIds.participants.map((participant) => participant.named?.id)).toEqual([
      ...team,
      ...sites.state.enemies,
    ]);
    // COMBAT, Detached Combat, Outputs: each Combatant's final current health, exhaustion, and whether it is dead.
    fromIds.participants.forEach((participant, index) => {
      const final = played.participants[index]!.final;
      expect(participant).toMatchObject({
        side: index < team.length ? 'agent' : 'enemy',
        position: index < team.length ? index + 1 : index - team.length + 1,
        finalCurrentHealthHundredths: final.currentHealthHundredths,
        finalExhaustion: final.exhaustion,
        dead: final.condition === 'dead',
      });
    });
  });
});

describe('COMBAT: Detached Combat', () => {
  it('gives the same outputs for the same setup and can differ for another Detached seed', () => {
    const state = withAgents(newCampaign(), 4);
    const setup = (seed: string) => ({
      agents: agentIds(state).map((id) => ({ kind: 'agent', id })),
      enemies: { missionSiteArchetype: 'raid_outpost' },
      seed,
    });
    expect(fought(state, setup('1'))).toEqual(fought(state, setup('1')));
    const reports = new Set(
      ['1', '2', '3', '4', '5', '6', '7', '8'].map((seed) =>
        JSON.stringify(fought(state, setup(seed)).combatReport),
      ),
    );
    expect(reports.size).toBeGreaterThan(1);
  });

  it('expands a MissionSiteArchetype into the Enemies a new Mission site of it would have, in creation order', () => {
    const state = withAgents(newCampaign(), 4);
    const archetype = gdrs.missionSiteArchetypes.find((item) => item.id === 'raid_outpost')!;
    const entries: DetachedEnemyEntry[] = archetype.enemies.flatMap(([id, count]) =>
      new Array<DetachedEnemyEntry>(count).fill({ kind: 'enemyArchetype', id }),
    );
    const agents = [explicitAgent, explicitAgent, explicitAgent, explicitAgent];
    const expanded = fought(state, { agents, enemies: { missionSiteArchetype: 'raid_outpost' }, seed: 's' });
    expect(expanded).toEqual(fought(state, { agents, enemies: entries, seed: 's' }));
    expect(expanded.combatReport.enemies).toHaveLength(entries.length);
    expect(
      expanded.participants.filter((participant) => participant.side === 'enemy').map((p) => p.named),
    ).toEqual(entries.map((entry) => ({ kind: 'enemyArchetype', id: (entry as { id: string }).id })));
    // An EnemyArchetype contributes the values Enemy creation gives a new Enemy of it.
    const soldier = gdrs.enemyArchetypes.get('soldier')!;
    const one = fought(state, { agents, enemies: [{ kind: 'enemyArchetype', id: 'soldier' }], seed: 's' });
    expect(one.combatReport.participants[4]!.start).toMatchObject({
      skillHundredths: soldier.skill * 100,
      currentHealthHundredths: soldier.baseHealth * 100,
      maxHealth: soldier.baseHealth,
      exhaustion: 0,
      weaponDamage: gdrs.weapons.get(soldier.weapon)!.damage,
      armor: gdrs.armors.get(soldier.armor)!.armor,
    });
    // COMBAT, Detached Combat: an explicit entry that leaves out effective armor has armor 0.
    expect(one.combatReport.participants[0]!.start.armor).toBe(0);
    const armored = fought(state, {
      agents: [{ ...explicitAgent, effectiveArmor: 6 }],
      enemies: [{ kind: 'enemyArchetype', id: 'soldier' }],
      seed: 's',
    });
    expect(armored.combatReport.participants[0]!.start.armor).toBe(6);
  });

  it('applies GDR values the setup supplies and keeps the Game build values otherwise', () => {
    const state = newCampaign();
    const tired = { ...explicitAgent, exhaustion: 80 };
    const enemies = [{ kind: 'enemyArchetype', id: 'initiate' }];
    const usual = fought(state, { agents: [tired], enemies, seed: 'g' });
    expect(usual.combatReport.participants[0]!.start.incapacitated).toBe(false);
    // An exhaustion_incapacitation of 80 makes the Agent Incapacitated from Combat start.
    const lowered = fought(state, {
      agents: [tired],
      enemies,
      gdrValues: { exhaustion_incapacitation: 80 },
      seed: 'g',
    });
    expect(lowered.combatReport).toMatchObject({ outcome: 'Wiped', rounds: 0 });
    // A decimal value may be given as its text: with a fraction of 0.9 a tired Agent meets the skill clause.
    const fraction = fought(state, {
      agents: [{ ...explicitAgent, exhaustion: 50 }],
      enemies,
      gdrValues: { incapacitation_skill_fraction: '0.9' },
      seed: 'g',
    });
    expect(fraction.combatReport).toMatchObject({ outcome: 'Wiped', rounds: 0 });
    expect(
      fought(state, { agents: [tired], enemies, gdrValues: { weapon_damage_range: 0.25 }, seed: 'g' }),
    ).toBeDefined();
  });

  it('rejects an invalid setup by its first fault and fights nothing', () => {
    const state = withAgents(newCampaign(), 4);
    const [a1 = '', a2 = ''] = agentIds(state);
    const dismissed = tweak(state, (world) => (world.agents[a2]!.state.status = 'Dismissed'));
    const enemies: DetachedEnemyEntry[] = [{ kind: 'enemyArchetype', id: 'initiate' }];
    const base = { agents: [{ kind: 'agent', id: a1 }], enemies, seed: 'x' };
    expect(rejection(state, base)).toBe('accepted');
    expect(rejection(state, { ...base, agents: [] })).toBe('empty_agents_side');
    expect(rejection(state, { ...base, ratingUpgrades: { weaponDamage: -1, armor: 0 } })).toBe(
      'invalid_rating_upgrades',
    );
    expect(rejection(state, { ...base, ratingUpgrades: { weaponDamage: 0, armor: 1.5 } })).toBe(
      'invalid_rating_upgrades',
    );
    expect(rejection(state, { ...base, ratingUpgrades: { weaponDamage: 1 } })).toBe(
      'invalid_rating_upgrades',
    );
    expect(
      rejection(state, {
        ...base,
        agents: [
          { kind: 'agent', id: a1 },
          { kind: 'agent', id: a1 },
        ],
      }),
    ).toBe('duplicate_combatant');
    expect(rejection(dismissed, { ...base, agents: [{ kind: 'agent', id: a2 }] })).toBe('agent_not_serving');
    expect(rejection(state, { ...base, agents: [{ kind: 'agent', id: 'agent-999' }] })).toBe('unknown_agent');
    expect(rejection(state, { ...base, enemies: [{ kind: 'enemy', id: 'enemy-999' }] })).toBe(
      'unknown_enemy',
    );
    expect(rejection(state, { ...base, enemies: [{ kind: 'enemyArchetype', id: 'dragon' }] })).toBe(
      'unknown_enemy_archetype',
    );
    expect(rejection(state, { ...base, enemies: { missionSiteArchetype: 'nowhere' } })).toBe(
      'unknown_mission_site_archetype',
    );
    for (const bad of [
      { currentHealth: 31 },
      { currentHealth: -1 },
      { baseSkill: 10.555 },
      { effectiveMaxHealth: 0 },
      { exhaustion: 1.5 },
      { effectiveWeaponDamage: 0 },
      { effectiveArmor: -1 },
      { effectiveArmor: 1.5 },
    ]) {
      expect(rejection(state, { ...base, agents: [{ ...explicitAgent, ...bad }] })).toBe(
        'value_out_of_range',
      );
    }
    // An Enemy's base skill and current health are whole numbers.
    expect(rejection(state, { ...base, enemies: [{ ...explicitAgent, baseSkill: 10.5 }] })).toBe(
      'value_out_of_range',
    );
    expect(rejection(state, { ...base, agents: [{ ...explicitAgent, baseSkill: 10.55 }] })).toBe('accepted');
    expect(rejection(state, { ...base, agents: [{ ...explicitAgent, effectiveArmor: 4 }] })).toBe('accepted');
    for (const gdrValues of [
      { incapacitation_skill_fraction: 1 },
      { weapon_damage_range: '1.5' },
      { exhaustion_per_attack: 0, exhaustion_per_defense: 0 },
      { exhaustion_incapacitation: 10 },
      { exhaustion_per_attack: -1 },
      { initial_roster_size: 3 },
    ]) {
      expect(rejection(state, { ...base, gdrValues })).toBe('invalid_gdr_value');
    }
    expect(rejection(state, { ...base, seed: '' })).toBe('invalid_seed');
    expect(rejection(state, { ...base, seed: 'é' })).toBe('invalid_seed');
    expect(rejection(state, { ...base, seed: 7 })).toBe('invalid_seed');
    // The first fault is named: an empty Agents' side before an invalid seed.
    expect(rejection(state, { ...base, agents: [], seed: '' })).toBe('empty_agents_side');
    expect(rejection(state, null)).toBe('malformed_setup');
  });
});

describe('COMBAT: Combat summary and Batch of Detached Combats', () => {
  const state = withAgents(newCampaign(), 4);
  const setup = {
    agents: [explicitAgent, explicitAgent, explicitAgent, explicitAgent],
    enemies: { missionSiteArchetype: 'raid_outpost' },
    seed: 'raid_outpost|4',
  };

  it('returns the Combat summary with the Combat report, and the two agree', () => {
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
      const full = fought(state, { ...setup, seed });
      expect(full.summary).toEqual({
        outcome: full.combatReport.outcome,
        agentsDead: full.participants.filter((p) => p.side === 'agent' && p.dead).length,
      });
    }
  });

  it('fights Combat i with the Detached seed <seed>#<i> and totals the batch', () => {
    const result = batch(state, setup, 12);
    expect(result.combats).toHaveLength(12);
    result.combats.forEach((summary, index) => {
      const full = fought(state, { ...setup, seed: `raid_outpost|4#${index + 1}` });
      expect(summary).toEqual(full.summary);
      expect(summary.outcome).toBe(full.combatReport.outcome);
    });
    const count = (outcome: string) => result.combats.filter((summary) => summary.outcome === outcome).length;
    expect(result.totals).toEqual({
      fought: 12,
      prevailed: count('Prevailed'),
      retreated: count('Retreated'),
      wiped: count('Wiped'),
      agentsDead: result.combats.reduce((sum, summary) => sum + summary.agentsDead, 0),
    });
    // Every Combat starts from the setup's values, so a batch's first Combats do not depend on its count.
    expect(batch(state, setup, 3).combats).toEqual(result.combats.slice(0, 3));
  });

  it('stops after the Combat at which enough Combats were, or were not, Prevailed', () => {
    const all = batch(state, setup, 40).combats;
    const ended = (prevailed: number, notPrevailed: number): number => {
      let won = 0;
      let lost = 0;
      for (const [index, summary] of all.entries()) {
        if (summary.outcome === 'Prevailed') {
          won += 1;
        } else {
          lost += 1;
        }
        if (won >= prevailed || lost >= notPrevailed) {
          return index + 1;
        }
      }
      return all.length;
    };
    for (const stop of [
      { prevailed: 1 },
      { notPrevailed: 1 },
      { prevailed: 5, notPrevailed: 3 },
      { prevailed: 36, notPrevailed: 5 },
    ]) {
      const limits = { prevailed: Infinity, notPrevailed: Infinity, ...stop };
      const stopped = batch(state, setup, 40, stop);
      const fought = ended(limits.prevailed, limits.notPrevailed);
      expect(stopped.combats).toEqual(all.slice(0, fought));
      expect(stopped.totals.fought).toBe(fought);
    }
    // A stop the count cannot reach fights every Combat.
    expect(batch(state, setup, 40, { prevailed: 41, notPrevailed: 41 }).combats).toEqual(all);
    const reason = (stop: unknown): string => {
      const result = detachedCombatBatch(state.world.current, gdrs, setup, 3, stop);
      return isRejection(result) ? result.reason : 'accepted';
    };
    expect(reason({ prevailed: 0 })).toBe('invalid_stop');
    expect(reason({ prevailed: 1.5 })).toBe('invalid_stop');
    expect(reason({ wins: 2 })).toBe('invalid_stop');
    expect(reason([1])).toBe('invalid_stop');
    expect(reason({})).toBe('accepted');
  });

  it('rejects a bad count, a too long last Detached seed, and a bad setup, and fights nothing', () => {
    const reason = (s: unknown, count: unknown): string => {
      const result = detachedCombatBatch(state.world.current, gdrs, s, count);
      return isRejection(result) ? result.reason : 'accepted';
    };
    expect(reason(setup, 0)).toBe('invalid_count');
    expect(reason(setup, 1.5)).toBe('invalid_count');
    expect(reason(setup, BATCH_MAX_COUNT + 1)).toBe('invalid_count');
    expect(reason(setup, '3')).toBe('invalid_count');
    expect(reason(setup, BATCH_MAX_COUNT)).toBe('accepted');
    // 61 characters leave room for "#9" but not for "#10".
    const long = { ...setup, seed: 'x'.repeat(62) };
    expect(reason(long, 9)).toBe('accepted');
    expect(reason(long, 10)).toBe('invalid_seed');
    expect(reason({ ...setup, agents: [] }, 3)).toBe('empty_agents_side');
  });
});

describe('DEV: developer.tools.fightCombat through the engine API', () => {
  async function campaign(): Promise<Engine> {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'detached' }));
    return engine;
  }
  const setupOf = (engine: Engine, seed = '1'): DetachedCombatSetup => ({
    agents: ok(engine.player.queries.getCurrentLiveWorldState()).agents.map((agent) => ({
      kind: 'agent',
      id: agent.id,
    })),
    enemies: { missionSiteArchetype: 'raid_outpost' },
    seed,
  });

  it('is available only with Dev mode enabled', async () => {
    const engine = await campaign();
    expect(errorCode(engine.developer.tools.fightCombat(setupOf(engine)))).toBe('dev_mode_disabled');
    ok(engine.session.developer.enable());
    expect(ok(engine.developer.tools.fightCombat(setupOf(engine))).combatReport.log.length).toBeGreaterThan(
      0,
    );
    expect(errorCode(engine.developer.tools.fightCombatBatch(setupOf(engine), 0))).toBe('invalid_input');
    const fromBatch = ok(engine.developer.tools.fightCombatBatch(setupOf(engine), 5));
    expect(fromBatch.combats).toHaveLength(5);
    expect(ok(engine.developer.tools.fightCombat({ ...setupOf(engine), seed: '1#5' })).summary).toEqual(
      fromBatch.combats[4],
    );
    const rejected = engine.developer.tools.fightCombat({ ...setupOf(engine), seed: '' });
    expect(rejected.ok ? null : rejected.error.reason).toBe('invalid_seed');
  });

  it('changes no Campaign state, Timeline, Turn report, or later random outcome of the Campaign', async () => {
    const used = await campaign();
    const untouched = await campaign();
    for (const engine of [used, untouched]) {
      ok(engine.session.developer.enable());
    }
    const before = ok(used.developer.queries.getCampaignState());
    const timeline = ok(used.session.timeline.getStatus());
    for (const seed of ['1', '2', '3']) {
      ok(used.developer.tools.fightCombat(setupOf(used, seed)));
    }
    ok(used.developer.tools.fightCombatBatch(setupOf(used, '4'), 3));
    expect(ok(used.developer.queries.getCampaignState())).toEqual(before);
    expect(ok(used.session.timeline.getStatus())).toEqual(timeline);
    expect(ok(used.player.queries.getTurnReport())).toBeNull();
    for (const engine of [used, untouched]) {
      ok(await engine.player.actions.advanceTurn());
    }
    expect(ok(used.player.queries.getTurnReport())).toEqual(ok(untouched.player.queries.getTurnReport()));
    expect(ok(used.player.queries.getCurrentLiveWorldState())).toEqual(
      ok(untouched.player.queries.getCurrentLiveWorldState()),
    );
  });
});
