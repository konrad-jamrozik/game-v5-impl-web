/** MISSION, Glossary, Mission site properties, and Turn report: Deployable Agents, Creation Combat ratings, and the
 * Combat ratings a History entry keeps for the Combat strength chart of CVIEW. */
import { describe, expect, it } from 'vite-plus/test';
import { agentCombatantState, combatRating } from '../../src/engine/mechanics/combat/combat.ts';
import { agentUpgradeBonus } from '../../src/engine/mechanics/economy/economy.ts';
import { isDeployableAgent } from '../../src/engine/mechanics/missions/missions.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  historyView,
} from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  advance,
  agent,
  agentIds,
  gdrs,
  newCampaign,
  setAssignment,
  tweak,
  winning,
  withAgents,
} from '../helpers/game.ts';

describe('MISSION: Deployable Agents and Combat ratings', () => {
  it('a Deployable Agent is Serving, At assignment on Standby or Training, and Capable for deployment', () => {
    const start = withAgents(newCampaign(), 5);
    const [standby, training, recovering, contracting, tired] = agentIds(start) as [
      string,
      string,
      string,
      string,
      string,
    ];
    let assigned = setAssignment(start, [training], 'Training');
    assigned = setAssignment(assigned, [recovering], 'Recovery');
    assigned = setAssignment(assigned, [contracting], 'Contracting');
    const state = tweak(assigned, (world) => {
      world.agents[recovering]!.state.healthLostHundredths = 100;
      // Exhaustion at exhaustion_incapacitation meets the incapacitation condition.
      world.agents[tired]!.state.exactExhaustionHundredths =
        gdrs.agentParameters.exhaustionIncapacitation * 100;
    });
    const world = state.world.current;
    const bonus = agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
    const deployable = (id: string) =>
      isDeployableAgent(agent(state, id).state, bonus, gdrs.combatParameters, gdrs.agentParameters);
    expect([standby, training, recovering, contracting, tired].map(deployable)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    // Player API shows the same Derived value.
    const views = new Map(currentLiveWorldStateView(state, gdrs).agents.map((view) => [view.id, view]));
    expect(views.get(standby)?.deployable).toBe(true);
    expect(views.get(recovering)?.deployable).toBe(false);
    expect(views.get(tired)?.deployable).toBe(false);
  });

  it('the History entry counts the Agents recovering and above each exhaustion threshold (AGENT, Turn report)', () => {
    const start = withAgents(newCampaign(), 4);
    const [recovering, worn, tired] = agentIds(start) as [string, string, string];
    const assigned = setAssignment(start, [recovering], 'Recovery');
    const { exhaustionFreePoints, exhaustionWorkLimit } = gdrs.agentParameters;
    const state = tweak(assigned, (world) => {
      world.agents[recovering]!.state.healthLostHundredths = 100;
      // Exactly at a threshold is not above it.
      world.agents[worn]!.state.exactExhaustionHundredths = (exhaustionFreePoints + 1) * 100;
      world.agents[tired]!.state.exactExhaustionHundredths = (exhaustionWorkLimit + 1) * 100;
      for (const id of agentIds(start).slice(3)) {
        world.agents[id]!.state.exactExhaustionHundredths = exhaustionFreePoints * 100;
      }
    });
    expect(historyView(state, gdrs).openEntry.turnEnd.wornAgents).toEqual({
      recovering: 1,
      aboveWorkLimit: 1,
      aboveFreePoints: 2,
    });
  });

  it('the History entry and the Open History entry hold the Combat ratings of the Serving and Deployable Agents', () => {
    const start = newCampaign({ money: 500 });
    const { state: withSite, site } = addMissionSite(start, 'apprehend_member');
    const team = agentIds(withSite).slice(0, 3);
    const rateOf = (state: typeof withSite, ids: readonly string[]) => {
      const world = state.world.current;
      const bonus = agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
      return combatRating(
        ids.map((id) => agentCombatantState(agent(state, id).state, bonus)),
        gdrs.combatParameters,
        gdrs.agentParameters,
      );
    };

    // Every Agent of a new Campaign is on Standby and Deployable.
    const before = historyView(withSite, gdrs).openEntry.turnEnd;
    expect(before.servingCombatRating).toBe(rateOf(withSite, agentIds(withSite)));
    expect(before.deployableCombatRating).toBe(before.servingCombatRating);
    expect(before.servingCombatRating).toBeGreaterThan(0);

    const deployed = act(withSite, 'deployAgents', { missionSite: site, agents: team });
    const rest = agentIds(deployed).filter((id) => !team.includes(id));
    const open = historyView(deployed, gdrs).openEntry.turnEnd;
    expect(open.servingCombatRating).toBe(before.servingCombatRating);
    expect(open.deployableCombatRating).toBe(rateOf(deployed, rest));

    const ended = historyView(advance(deployed, winning(deployed, site)), gdrs).entries.at(-1)!;
    expect(ended.turnEnd.servingCombatRating).toBe(open.servingCombatRating);
    expect(ended.turnEnd.deployableCombatRating).toBe(open.deployableCombatRating);
  });

  it('a Mission site keeps its Creation Combat rating after a Combat changes its Enemies', () => {
    const start = newCampaign();
    const { state, site } = addMissionSite(start, 'apprehend_member');
    const created = currentLiveWorldStateView(state, gdrs).missionSites.find((item) => item.id === site)!;
    expect(created.creationCombatRating).toBe(created.enemiesCombatRating);
    expect(created.creationCombatRating).toBeGreaterThan(0);

    const deployed = act(state, 'deployAgents', { missionSite: site, agents: agentIds(state).slice(0, 4) });
    const after = advance(deployed, winning(deployed, site));
    const retired = currentRetiredWorldStateView(after, gdrs).missionSites.find((item) => item.id === site)!;
    expect(retired.creationCombatRating).toBe(created.creationCombatRating);
    expect(retired.enemiesCombatRating).toBeLessThan(created.creationCombatRating);
  });
});
