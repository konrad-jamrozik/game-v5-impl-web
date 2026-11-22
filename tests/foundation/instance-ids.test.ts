/** CINST, Campaign instance identity, and DOMAIN, Campaign instance identity scope: Instance IDs counted per Type. */
import { describe, expect, it } from 'vite-plus/test';
import { bootstrapGdrCatalog } from '../../src/gdr/index.ts';
import { liveWorld, ok, startEngine } from '../helpers/engine.ts';

describe('CINST: Instance IDs', () => {
  it('each Campaign instance Type numbers its Campaign instances from 1, and an undone creation frees its number', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'instance-ids' }));
    const ids = () => ok(engine.player.queries.getCurrentLiveWorldState()).agents.map((agent) => agent.id);
    // The initial roster numbers its Agents from 1, in the order they are created.
    const roster = bootstrapGdrCatalog().agentParameters.initialRosterSize;
    expect(roster).toBeGreaterThanOrEqual(2);
    expect(ids()).toEqual(Array.from({ length: roster }, (_, index) => `agent-${index + 1}`));

    // A dismissed Agent keeps its number: the next hire takes the number after the last one created.
    const next = `agent-${roster + 1}`;
    ok(await engine.player.actions.dismissAgents(['agent-2']));
    ok(await engine.player.actions.hireAgents(1));
    expect(ids()).toContain(next);
    expect(ids()).not.toContain('agent-2');

    ok(await engine.session.timeline.undoAction());
    expect(ids()).not.toContain(next);
    ok(await engine.player.actions.hireAgents(1));
    expect(ids()).toContain(next);
  });

  it('the first Mission site of a Campaign is mission-site-1', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'instance-ids' }));
    // Contracting keeps the Agency solvent while it waits for the first Mission site.
    const roster = ok(engine.player.queries.getCurrentLiveWorldState()).agents.map((agent) => agent.id);
    ok(await engine.player.actions.assignAgents(roster, 'Contracting'));
    let sites: string[] = [];
    for (let turn = 0; turn < 60 && sites.length === 0; turn += 1) {
      ok(await engine.player.actions.advanceTurn());
      sites = (liveWorld(engine).missionSites as { id: string }[]).map((site) => site.id);
    }
    expect(sites[0]).toBe('mission-site-1');
  });
});
