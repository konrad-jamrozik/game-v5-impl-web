/**
 * MISSIONS, Resolving one Mission, step 1, and COMBAT, Fixed order of each side: the Agents' side of a Mission's
 * Combat is its Current team in ascending order of the number of each Instance ID, whatever order `deployAgents` gave,
 * and that fixed order breaks ties in the Phase order of COMBAT, Combat rounds.
 */
import { describe, expect, it } from 'vite-plus/test';
import {
  act,
  addMissionSite,
  advance,
  agentIds,
  missionAt,
  newCampaign,
  tweak,
  winning,
  withAgents,
} from '../helpers/game.ts';

describe('MISSIONS: the Agents’ side of a Combat is in ascending order of Instance ID numbers', () => {
  it('a Current team deployed as agent-12, agent-3, agent-7 fights in the fixed order agent-3, agent-7, agent-12', () => {
    const team = ['agent-12', 'agent-3', 'agent-7'];
    const { state: withSite, site } = addMissionSite(withAgents(newCampaign(), 12), 'apprehend_member');
    expect(agentIds(withSite)).toEqual(expect.arrayContaining(team));
    // Fixture: the three Agents are alike, so their effective skills tie and only the fixed order decides who of them
    // attacks first.
    const alike = tweak(withSite, (world) => {
      const model = world.agents['agent-3']!.state;
      for (const id of team) {
        const member = world.agents[id]!.state;
        member.skillHundredths = model.skillHundredths;
        member.healthLostHundredths = model.healthLostHundredths;
        member.exactExhaustionHundredths = model.exactExhaustionHundredths;
      }
    });
    const deployed = act(alike, 'deployAgents', { missionSite: site, agents: team });
    // MISSIONS, Deploying: the order of `agents` becomes the order of the Team sent and the Current team.
    const mission = deployed.world.current.missions[missionAt(deployed, site)]!;
    expect(mission.constants.teamSent).toEqual(team);
    expect(mission.state.currentTeam).toEqual(team);

    const next = advance(deployed, winning(deployed, site));
    const report = next.world.history.turnReport?.combatReports.find((item) => item.mission === mission.id);
    expect(report?.agents).toEqual(['agent-3', 'agent-7', 'agent-12']);
    const firstAgentAttack = report?.log.find((attack) => team.includes(attack.attacker));
    expect(firstAgentAttack?.attacker).toBe('agent-3');
  });
});
