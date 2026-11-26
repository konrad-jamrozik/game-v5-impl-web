/**
 * TURN, Prologue: a Campaign created with the Prologue value 1 begins already under way. Whatever the Campaign seed, it
 * has no Campaign ending and holds a Killed Agent, a Recovering Agent, an Agent in Training, an Agent on an Active
 * Investigation, at least 12 Serving Agents of at least three Ranks, Serving Agents that wear at least three Weapons and
 * two Armors, two Serving Agents below their effective max health, tired Agents above each exhaustion threshold, a
 * Storage with Weapons of two kinds, an Armor, and Ammo, a Completed Investigation, an Active Mission site, at least 15
 * Mission sites in a final state, of which 8 Won, 3 Lost, one of them Wiped, and 3 Expired, and a
 * bought Upgrade. The History holds the Prologue's Turns like any others, and the Campaign plays on, saves, and loads
 * like any other.
 *
 * The Prologue is scripted play by the engine, not play by an Autopilot AI; each test creates at most two Campaigns.
 */
import { describe, expect, it } from 'vite-plus/test';
import { PLAYER_ACTIONS } from '../../src/engine/actions/actions.ts';
import { createGameRules } from '../../src/engine/game-rules.ts';
import { exhaustionOf } from '../../src/engine/mechanics/agents/agents.ts';
import { isServing, type CampaignState } from '../../src/engine/state/types.ts';
import { bootstrapGdrCatalog } from '../../src/gdr/index.ts';
import { inspect, ok, startEngine } from '../helpers/engine.ts';

const gdrs = bootstrapGdrCatalog();
const rules = createGameRules(gdrs);
const SEEDS = ['prologue one', 'prologue two'] as const;

/** The preset of the Game build whose Prologue value is 1, e.g. Showcase. */
function prologuePreset() {
  const preset = rules.presets.find((item) => item.values['prologue'] === 1);
  if (preset === undefined) {
    throw new Error('The Game build supplies no preset with a Prologue');
  }
  return preset;
}

function create(seed: string): CampaignState {
  return rules.createCampaign({ configuration: prologuePreset().values, seed });
}

/** GUI, Ranks: the Rank whose `min_base_skill` the base skill, rounded down, reaches; the GDRs list the highest first. */
function rankOf(skillHundredths: number): string | undefined {
  return gdrs.ranks.find((rank) => Math.floor(skillHundredths / 100) >= rank.minBaseSkill)?.id;
}

/** The guarantees of TURN, Prologue that the World state does not hold, by name. */
function unmet(state: CampaignState): string[] {
  const world = state.world.current;
  const agents = Object.values(world.agents);
  const serving = agents.filter((agent) => isServing(agent.state));
  const sites = Object.values(world.missionSites);
  const won = Object.values(world.missions).filter((mission) => mission.state.lifecycle === 'Won');
  const lost = state.world.history.historyEntries
    .flatMap((entry) => entry.report.missions)
    .filter((mission) => mission.result === 'Lost');
  const storage = Object.entries(world.agency.state.storage).filter(([, count]) => count > 0);
  const { exhaustionWorkStartMax, exhaustionWorkLimit, exhaustionIncapacitation } = gdrs.agentParameters;
  const tired = (low: number, high: number) =>
    serving.some((agent) => exhaustionOf(agent.state) > low && exhaustionOf(agent.state) <= high);
  const checks: [string, boolean][] = [
    ['no Campaign ending', world.ending === null],
    ['a Killed Agent', agents.some((agent) => agent.state.status === 'Killed')],
    ['a Recovering Agent', agents.some((agent) => agent.state.status === 'Recovering')],
    ['an Agent in Training', agents.some((agent) => agent.state.assignment?.kind === 'Training')],
    [
      'an Agent on an Active Investigation',
      agents.some((agent) => {
        const assignment = agent.state.assignment;
        return (
          assignment?.kind === 'Investigation' &&
          world.investigations[assignment.investigation]?.state.lifecycle === 'Active'
        );
      }),
    ],
    ['12 Serving Agents', serving.length >= 12],
    ['three Ranks', new Set(serving.map((agent) => rankOf(agent.state.skillHundredths))).size >= 3],
    ['three Weapons worn', new Set(serving.map((agent) => agent.state.weapon)).size >= 3],
    ['two Armors worn', new Set(serving.map((agent) => agent.state.armor)).size >= 2],
    // Current health below effective max health is health lost above 0.
    ['two wounded Agents', serving.filter((agent) => agent.state.healthLostHundredths > 0).length >= 2],
    // Each threshold has an Agent of its own, whose exhaustion is above it and not above the next.
    ['an Agent above exhaustion_work_start_max', tired(exhaustionWorkStartMax, exhaustionWorkLimit)],
    ['an Agent above exhaustion_work_limit', tired(exhaustionWorkLimit, exhaustionIncapacitation)],
    ['an Agent above exhaustion_incapacitation', tired(exhaustionIncapacitation, Infinity)],
    ['Weapons of two kinds in Storage', storage.filter(([id]) => gdrs.weapons.has(id)).length >= 2],
    ['an Armor in Storage', storage.some(([id]) => gdrs.armors.has(id))],
    ['Ammo in Storage', storage.some(([id]) => gdrs.ammoTypes.has(id))],
    [
      'a Completed Investigation',
      Object.values(world.investigations).some((item) => item.state.lifecycle === 'Completed'),
    ],
    ['an Active Mission site', sites.some((site) => site.state.lifecycle === 'Active')],
    [
      '15 Mission sites in a final state',
      sites.filter((site) => !['Active', 'Deployed'].includes(site.state.lifecycle)).length >= 15,
    ],
    ['8 Won Missions', won.length >= 8],
    ['3 Lost Missions', lost.length >= 3],
    ['a Wiped Mission', lost.some((mission) => mission.combatOutcome === 'Wiped')],
    ['3 Expired Mission sites', sites.filter((site) => site.state.lifecycle === 'Expired').length >= 3],
    ['a bought Upgrade', Object.values(world.agency.state.acquisitions).some((count) => count > 0)],
  ];
  return checks.filter(([, holds]) => !holds).map(([name]) => name);
}

describe('TURN: Prologue', () => {
  it('lets a preset of the Game build start with a Prologue, a value fixed after creation', () => {
    const descriptor = rules.configurationValues.find((item) => item.key === 'prologue');
    expect(descriptor?.adjustable).toBe(false);
    expect([0, 1, 2, -1, 0.5].map((value) => descriptor?.isPermitted(value))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(rules.presets.every((preset) => [0, 1].includes(preset.values['prologue'] ?? -1))).toBe(true);
  });

  for (const seed of SEEDS) {
    it(`hands over a Campaign that holds every guarantee, for the seed "${seed}"`, () => {
      const state = create(seed);
      const world = state.world.current;
      expect(state.configuration.prologue).toBe(1);
      expect(unmet(state)).toEqual([]);
      expect(rules.checkInvariants(state)).toEqual([]);
      // The start of a Turn: an empty Action record, and no random outcome override left pending.
      expect(state.world.history.currentActions).toEqual([]);
      expect(world.randomOverrides).toEqual([]);
      // The History holds every Turn of the Prologue, whose actions are all Player API gameplay actions.
      expect(world.turn).toBeGreaterThan(1);
      expect(state.world.history.historyEntries.map((entry) => entry.turn)).toEqual(
        Array.from({ length: world.turn - 1 }, (_, index) => index + 1),
      );
      const operations = state.world.history.historyEntries.flatMap((entry) =>
        entry.actions.map((action) => action.operation),
      );
      expect(operations.length).toBeGreaterThan(0);
      expect(operations.every((operation) => (PLAYER_ACTIONS as readonly string[]).includes(operation))).toBe(
        true,
      );
      expect(state.world.history.turnReport?.turn).toBe(world.turn - 1);
    });
  }

  it('gives equal Campaigns for equal Campaign seeds', () => {
    expect(create(SEEDS[0])).toEqual(create(SEEDS[0]));
  });

  it('creates through the Session and plays on, undoes, saves, and loads like any Campaign', async () => {
    const { engine } = await startEngine();
    const setup = engine.session.newCampaignSetup;
    const preset = prologuePreset();
    ok(setup.selectPreset(preset.id));
    ok(await engine.session.campaign.create({ seed: SEEDS[1] }));
    const live = () => ok(engine.player.queries.getCurrentLiveWorldState());
    const turn = live().turn;
    expect(turn).toBeGreaterThan(1);
    expect(ok(engine.player.queries.getCampaignConfiguration()).prologue).toBe(1);
    expect(ok(engine.player.queries.getHistory()).entries).toHaveLength(turn - 1);
    const created = inspect(engine);

    // Undo within the Turn the Prologue reached returns to its start.
    const standby = live().agents.find(
      (agent) =>
        agent.assignment?.kind === 'Standby' &&
        agent.agentStatus === 'AtAssignment' &&
        agent.healthLostHundredths === 0 &&
        agent.exhaustion <= gdrs.agentParameters.exhaustionWorkStartMax,
    );
    if (standby === undefined) {
      ok(await engine.player.actions.hireAgents(1));
    } else {
      ok(await engine.player.actions.assignAgents([standby.id], 'Training'));
    }
    ok(await engine.session.timeline.undoAction());
    expect(inspect(engine).timeline.turnStartState).toEqual(created.timeline.turnStartState);

    const { saveId } = ok(await engine.session.saves.save());
    ok(await engine.player.actions.advanceTurn());
    expect(live().turn).toBe(turn + 1);
    ok(await engine.session.saves.load(saveId));
    expect(live().turn).toBe(turn);
    expect(inspect(engine).timeline.turnStartState).toEqual(created.timeline.turnStartState);
  });
});
