/**
 * Whole Campaigns through the public engine API: both Campaign endings through Player API alone, Determinism,
 * restoration, atomic rejection, and the Information boundary, with the real game rules.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createBasicAutopilotAi } from '../../src/ai/index.ts';
import type { Engine } from '../../src/engine/index.ts';
import {
  autopilot,
  currentWorld,
  errorCode,
  inspect,
  liveWorld,
  ok,
  startEngine,
} from '../helpers/engine.ts';

/** Plays one Turn with the policy of the Basic Autopilot AI, as the Session controller, through Player API alone. */
async function playTurn(engine: Engine): Promise<void> {
  await createBasicAutopilotAi().step({ player: engine.player });
}

describe('A Campaign is playable through Player API without Dev mode', () => {
  it('reaches Victory', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'c' }));
    let turns = 0;
    while (ok(engine.player.queries.getCurrentState()).ending === null && turns < 400) {
      await playTurn(engine);
      turns += 1;
    }
    const state = ok(engine.player.queries.getCurrentState());
    expect(state.ending).toMatchObject({ ending: 'Victory', reasons: ['EveryFactionEliminated'] });
    expect(state.factions.every((faction) => faction.eliminated)).toBe(true);
    expect(state.leads.every((lead) => !lead.conditions.noMissionWon)).toBe(true);
    expect(ok(engine.session.getStatus())).toMatchObject({ devMode: false, campaignEnded: true });
    // After a Campaign ending every Player action is rejected and every query keeps answering.
    expect(errorCode(await engine.player.actions.advanceTurn())).toBe('campaign_ended');
    expect(errorCode(await engine.player.actions.hireAgent())).toBe('campaign_ended');
    expect(ok(engine.player.queries.getHistory()).entries).toHaveLength(state.turn - 1);
    expect(ok(engine.player.queries.getTurnReport())?.ending?.ending).toBe('Victory');
    expect((await engine.session.saves.save()).ok).toBe(true);
  });

  it('reaches Defeat by Money below zero when the player does nothing', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'idle' }));
    let turns = 0;
    while (ok(engine.player.queries.getCurrentState()).ending === null && turns < 100) {
      ok(await engine.player.actions.advanceTurn());
      turns += 1;
    }
    // 500 money, income 20, upkeep 40: money is below zero after the 26th Advance turn.
    expect(turns).toBe(26);
    expect(ok(engine.player.queries.getCurrentState()).ending).toEqual({
      ending: 'Defeat',
      reasons: ['MoneyBelowZero'],
      turn: 26,
    });
  });

  it('reaches Defeat by Panic at the limit when Mission sites are ignored', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'panic' }));
    const agents = ok(engine.player.queries.getCurrentState()).agents.map((agent) => agent.id);
    ok(await engine.player.actions.assignAgents(agents, 'Contracting'));
    let turns = 0;
    while (ok(engine.player.queries.getCurrentState()).ending === null && turns < 2000) {
      ok(await engine.player.actions.advanceTurn());
      turns += 1;
    }
    const state = ok(engine.player.queries.getCurrentState());
    expect(state.ending).toMatchObject({ ending: 'Defeat', reasons: ['PanicAtTheLimit'] });
    expect(state.panic).toBe(100);
    // Returning to a World state before the ending: the Turn-end Autosave of the last Turn.
    const target = ok(await engine.session.timeline.undoToAutosave());
    expect(target.turn).toBe(state.ending!.turn);
    expect(ok(engine.player.queries.getCurrentState()).ending).toBeNull();
    expect((await engine.player.actions.advanceTurn()).ok).toBe(true);
  });
});

describe('Campaign runs', () => {
  it('the Basic Autopilot AI plays 10 Campaign seeds to an ending with no engine defect', async () => {
    const endings: Record<string, number> = {};
    for (let seed = 0; seed < 10; seed += 1) {
      const { engine } = await startEngine();
      ok(await engine.session.globalConfiguration.set('autosaveLimit', 0));
      ok(await engine.session.campaign.create({ seed: `run-${seed}` }));
      const result = await autopilot(engine, { kind: 'turnAdvancements', count: 1000 });
      expect(result.reason, `seed ${seed}: ${result.detail ?? ''}`).toBe('campaignEnded');
      const ending = ok(engine.player.queries.getCurrentState()).ending?.ending ?? 'none';
      endings[ending] = (endings[ending] ?? 0) + 1;
    }
    expect(Object.keys(endings).every((ending) => ending === 'Victory' || ending === 'Defeat')).toBe(true);
    expect(endings['Victory'] ?? 0).toBeGreaterThanOrEqual(8);
  });

  it('the Basic Autopilot AI ends in Defeat when the Campaign starts with no money', async () => {
    const { engine } = await startEngine();
    ok(engine.session.newCampaignSetup.setPresetEdit('standard', { key: 'startingMoney', value: 0 }));
    ok(await engine.session.campaign.create({ seed: 'poor' }));
    const result = await autopilot(engine, { kind: 'turnAdvancements', count: 50 });
    expect(result.reason).toBe('campaignEnded');
    expect(ok(engine.player.queries.getCurrentState()).ending).toMatchObject({
      ending: 'Defeat',
      reasons: ['MoneyBelowZero'],
    });
  });

  it('the Basic Autopilot AI writes no Autopilot memory and plays the same under every Autopilot limit', async () => {
    const whole = await startEngine();
    ok(await whole.engine.session.campaign.create({ seed: 'limits' }));
    await autopilot(whole.engine, { kind: 'turnAdvancements', count: 12 });

    const stepwise = await startEngine();
    ok(await stepwise.engine.session.campaign.create({ seed: 'limits' }));
    while (ok(stepwise.engine.player.queries.getCurrentState()).turn < 13) {
      // AUTO, Autopilot limits: one action never advances the Turn, which is left to the player.
      const result = await autopilot(stepwise.engine, { kind: 'singleAction' });
      if (result.reason === 'advanceTurnWithheld') {
        expect(result.progress).toEqual({ playerActions: 0, turnAdvancements: 0 });
        ok(await stepwise.engine.player.actions.advanceTurn());
      } else {
        expect(result).toMatchObject({ reason: 'limitReached', progress: { playerActions: 1 } });
      }
    }
    expect(inspect(stepwise.engine)).toEqual(inspect(whole.engine));
    expect(ok(whole.engine.session.autopilot.listAutopilotAis())).toEqual([
      { autopilotAiId: 'basic', name: 'Basic Autopilot AI' },
    ]);
  });
});

/**
 * TIMELINE, Returning to a World state: the Current world state with the History, the Turn report, and the
 * Campaign configuration, i.e. Campaign state without the rest of the Timeline, which undo and redo leave in place.
 */
function placeOf(engine: Engine): unknown {
  const state = inspect(engine);
  return {
    world: currentWorld(state),
    history: state.history,
    turnReport: state.turnReport,
    campaignConfiguration: state.campaignConfiguration,
  };
}

describe('DETERM and TIMELINE with the real game', () => {
  it('the same Campaign seed and Player actions give equal Campaign state, also after save and load', async () => {
    const first = await startEngine();
    ok(await first.engine.session.campaign.create({ seed: 'replay' }));
    await autopilot(first.engine, { kind: 'turnAdvancements', count: 20 });
    const { saveId } = ok(await first.engine.session.saves.save());
    const middle = inspect(first.engine);
    await autopilot(first.engine, { kind: 'turnAdvancements', count: 25 });
    const end = inspect(first.engine);

    const second = await startEngine();
    ok(await second.engine.session.campaign.create({ seed: 'replay' }));
    await autopilot(second.engine, { kind: 'turnAdvancements', count: 20 });
    expect(inspect(second.engine)).toEqual(middle);
    await autopilot(second.engine, { kind: 'turnAdvancements', count: 25 });
    expect(inspect(second.engine)).toEqual(end);

    // Another Session over the same Game storage continues from the Campaign save exactly.
    const loaded = await startEngine({ storage: first.storage });
    ok(await loaded.engine.session.saves.load(saveId));
    expect(inspect(loaded.engine)).toEqual(middle);
    await autopilot(loaded.engine, { kind: 'turnAdvancements', count: 25 });
    expect(inspect(loaded.engine)).toEqual(end);

    const other = await startEngine();
    ok(await other.engine.session.campaign.create({ seed: 'another seed' }));
    await autopilot(other.engine, { kind: 'turnAdvancements', count: 45 });
    expect(inspect(other.engine)).not.toEqual(end);
  });

  it('any sequence of actions, undos, redos, and rejected actions restores equal Campaign state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            'hire',
            'contract',
            'train',
            'investigate',
            'upgrade',
            'undo',
            'redo',
            'bad',
            'advance',
          ),
          { maxLength: 30 },
        ),
        async (steps) => {
          const { engine } = await startEngine();
          ok(await engine.session.campaign.create({ seed: 'undo property' }));
          let states = [placeOf(engine)];
          let position = 0;
          for (const step of steps) {
            const view = ok(engine.player.queries.getCurrentState());
            const available = ok(engine.player.queries.getAvailableActions());
            const [agent] = available.assignableAgents;
            let committed = false;
            if (step === 'undo') {
              const result = await engine.session.timeline.undoAction();
              expect(result.ok).toBe(position > 0);
              position = Math.max(0, position - 1);
            } else if (step === 'redo') {
              const result = await engine.session.timeline.redoAction();
              expect(result.ok).toBe(position < states.length - 1);
              position = Math.min(states.length - 1, position + 1);
            } else if (step === 'advance') {
              if ((await engine.player.actions.advanceTurn()).ok) {
                states = [placeOf(engine)];
                position = 0;
              }
            } else if (step === 'bad') {
              expect((await engine.player.actions.purchaseUpgrade('no_such_upgrade')).ok).toBe(false);
              expect((await engine.player.actions.deployAgents('nowhere', ['nobody'])).ok).toBe(false);
            } else if (step === 'hire') {
              committed = (await engine.player.actions.hireAgent()).ok;
            } else if (step === 'upgrade') {
              committed = (await engine.player.actions.purchaseUpgrade('training_cap')).ok;
            } else if (agent !== undefined && step === 'contract') {
              committed = (await engine.player.actions.assignAgents([agent], 'Contracting')).ok;
            } else if (agent !== undefined && step === 'train') {
              committed = (await engine.player.actions.assignAgents([agent], 'Training')).ok;
            } else if (agent !== undefined && step === 'investigate') {
              const [lead] = available.startInvestigation;
              const [active] = view.investigations;
              committed =
                lead !== undefined
                  ? (await engine.player.actions.startInvestigation(lead, [agent])).ok
                  : active !== undefined
                    ? (await engine.player.actions.assignAgentsToInvestigation(active.id, [agent])).ok
                    : false;
            }
            if (committed) {
              states = [...states.slice(0, position + 1), placeOf(engine)];
              position += 1;
            }
            expect(placeOf(engine)).toEqual(states[position]);
            const timeline = ok(engine.session.timeline.getStatus());
            expect(timeline.timelineEntries - timeline.undoneActions).toBe(position);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it('Identifiers under replay: a hired Agent keeps its Instance ID through undo and redo', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'ids' }));
    ok(await engine.player.actions.hireAgent());
    const hired = ok(engine.player.queries.getCurrentState()).agents.at(-1)!;
    ok(await engine.session.timeline.undoAction());
    expect(ok(engine.player.queries.getCurrentState()).agents).toHaveLength(4);
    ok(await engine.session.timeline.redoAction());
    expect(ok(engine.player.queries.getCurrentState()).agents.at(-1)).toEqual(hired);
  });
});

describe('ENG: Information boundary with the real game', () => {
  it('no Player API result contains a hidden value', async () => {
    const { engine } = await startEngine();
    const seed = 'Zq7-hidden-seed-Zq7';
    ok(await engine.session.campaign.create({ seed }));
    await autopilot(engine, { kind: 'turnAdvancements', count: 30 });
    expect(ok(engine.session.getStatus()).campaignSeed).toBe(seed);
    const full = JSON.stringify(inspect(engine));
    expect(full).toContain(seed);
    expect(full).toContain('turnsUntilNextOperation');
    for (const devMode of [false, true]) {
      if (devMode) {
        ok(engine.session.developer.enable());
      }
      const results = [
        engine.player.queries.getCurrentState(),
        engine.player.queries.getTurnReport(),
        engine.player.queries.getHistory(),
        engine.player.queries.getAvailableActions(),
        engine.player.queries.getGameData(),
        engine.player.queries.previewDeployment(null, []),
        await engine.player.actions.deployAgents('nowhere', []),
        await engine.player.actions.startInvestigation('locate_red_dawn_hq', []),
        engine.session.timeline.getStatus(),
      ];
      for (const result of results) {
        const text = JSON.stringify(result);
        expect(text).not.toContain(seed);
        expect(text).not.toMatch(/turnsUntilNext|rng|randomOverrides|nextInstanceNumbers|pendingPanic/);
      }
    }
  });

  it('the same query returns the same Player-visible information to an Autopilot AI and to the Session controller', async () => {
    let seen = '';
    const spy = {
      id: 'spy',
      name: 'Spy',
      async step(api: Parameters<ReturnType<typeof createBasicAutopilotAi>['step']>[0]) {
        seen = JSON.stringify([
          api.player.queries.getCurrentState(),
          api.player.queries.getAvailableActions(),
          api.player.queries.getHistory(),
        ]);
        await api.player.actions.advanceTurn();
      },
    };
    const { engine } = await startEngine({ autopilotAis: [spy] });
    ok(await engine.session.campaign.create({ seed: 'same view' }));
    ok(engine.session.developer.enable());
    const before = JSON.stringify([
      engine.player.queries.getCurrentState(),
      engine.player.queries.getAvailableActions(),
      engine.player.queries.getHistory(),
    ]);
    await autopilot(engine, { kind: 'singleAction' }, 'spy');
    expect(seen).toBe(before);
  });

  it('a returned view cannot change Campaign state', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'detached' }));
    const view = ok(engine.player.queries.getCurrentState()) as any;
    view.agency.money = 1_000_000;
    view.agents.length = 0;
    const inspected = inspect(engine);
    expect(() => {
      currentWorld(inspected).liveWorldState.agency.state.money = 7;
    }).toThrow();
    expect(ok(engine.player.queries.getCurrentState())).toMatchObject({ agency: { money: 500 } });
    expect(ok(engine.player.queries.getCurrentState()).agents).toHaveLength(4);
    expect(() => {
      (ok(engine.player.queries.getGameData()) as any).economy.hireCost = 1;
    }).toThrow();
  });
});

describe('DEV with the real game', () => {
  it('cheat operations need Dev mode, are Timeline entries, and inspection shows four properties', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'dev' }));
    expect(errorCode(await engine.developer.actions.addMoney(100))).toBe('dev_mode_disabled');
    expect(errorCode(engine.developer.queries.getCampaignState())).toBe('dev_mode_disabled');
    ok(engine.session.developer.enable());
    ok(await engine.developer.actions.addMoney(100));
    ok(await engine.developer.actions.addAgents(2));
    expect(errorCode(await engine.developer.actions.addMoney(0))).toBe('invalid_input');
    expect(ok(engine.session.timeline.getStatus()).timelineEntries).toBe(2);
    const state = inspect(engine);
    const agent = currentWorld(state).liveWorldState.agents[0];
    expect(Object.keys(agent)).toEqual(['id', 'archetype', 'constants', 'state']);
    expect(Object.keys(currentWorld(state).liveWorldState.agency)).toEqual([
      'id',
      'archetype',
      'constants',
      'state',
    ]);
    // CSTATE, Campaign state composition: the Timeline with its pointer, the History, the Campaign configuration,
    // and the Turn report; each World state the Timeline holds has its Live and its Retired world state.
    expect(Object.keys(state)).toEqual([
      'timeline',
      'timelinePointer',
      'history',
      'campaignConfiguration',
      'turnReport',
    ]);
    expect(state.timelinePointer).toBe(2);
    expect(state.timeline.timelineEntries.map((entry: any) => entry.playerAction.name)).toEqual([
      'addMoney',
      'addAgents',
    ]);
    expect(Object.keys(currentWorld(state))).toEqual(['liveWorldState', 'retiredWorldState']);
    ok(engine.session.developer.disable());
    ok(await engine.session.timeline.undoAction());
    ok(await engine.session.timeline.undoAction());
    expect(ok(engine.player.queries.getCurrentState())).toMatchObject({
      agency: { money: 500, servingAgents: 4 },
    });
  });

  it('Random outcome overrides fix the named random outcome when it is next decided', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'override' }));
    ok(engine.session.developer.enable());
    const [agent] = ok(engine.player.queries.getCurrentState()).agents;
    const outcome = 'investigation.requiredProgress.locate_red_dawn_member';
    expect(errorCode(await engine.developer.actions.overrideRandomOutcome('no.such.outcome', true))).toBe(
      'invalid_input',
    );
    expect(errorCode(await engine.developer.actions.overrideRandomOutcome(outcome, true))).toBe(
      'invalid_input',
    );
    expect(
      errorCode(
        await engine.developer.actions.overrideRandomOutcome('investigation.requiredProgress.nothing', 3),
      ),
    ).toBe('rejected');
    // COMBAT, Damage outcome: a supplied damage outcome outside lo to hi, 5 to 15 here, is rejected.
    const damage = `combat.damage.${agent!.id}`;
    expect(errorCode(await engine.developer.actions.overrideRandomOutcome(damage, 16))).toBe('rejected');
    expect(errorCode(await engine.developer.actions.overrideRandomOutcome(damage, 4))).toBe('rejected');
    expect(liveWorld(engine).pendingRandomOutcomeOverrides).toEqual([]);
    // The Required progress outcome of the next Investigation of the Lead is fixed to 4, of the range 3 to 4.
    ok(await engine.developer.actions.overrideRandomOutcome(outcome, 4));
    expect(liveWorld(engine).pendingRandomOutcomeOverrides).toEqual([{ outcome, value: 4 }]);
    ok(await engine.player.actions.startInvestigation('locate_red_dawn_member', [agent!.id]));
    const actual = () =>
      (
        liveWorld(engine).investigations as {
          constants: { actualRequiredProgress: number };
        }[]
      )[0]!.constants.actualRequiredProgress;
    expect(actual()).toBe(4);
    expect(liveWorld(engine).pendingRandomOutcomeOverrides).toEqual([]);
    // Player API reports the Actual required progress only as unknown.
    expect(ok(engine.player.queries.getCurrentState()).investigations[0]!.actualRequiredProgress).toBe(
      'unknown',
    );
    // The override is a Timeline entry, so replay reproduces it: undo the start and redo it.
    ok(await engine.session.timeline.undoAction());
    ok(await engine.session.timeline.redoAction());
    expect(actual()).toBe(4);
  });
});
