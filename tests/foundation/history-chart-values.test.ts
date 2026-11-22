/** AGENT, Turn report and ECON, Turn report: the values a History entry keeps for the Agency charts of CVIEW. */
import { describe, expect, it } from 'vite-plus/test';
import { historyView } from '../../src/engine/views/views.ts';
import { act, addMissionSite, advance, agentIds, gdrs, newCampaign } from '../helpers/game.ts';

describe('WHIST: History entry values for the Agency charts', () => {
  it('example: holds the Turn-end activity and effective skills, the Turn-start caps, and the funding used', () => {
    const start = newCampaign({ money: 500 });
    const { state: withSite, site } = addMissionSite(start, 'apprehend_member');
    const [a1, a2, a3] = agentIds(withSite) as [string, string, string];
    let state = act(withSite, 'hireAgents', { count: 1 });
    state = act(state, 'deployAgents', { missionSite: site, agents: [a1, a2, a3] });

    // The Open History entry's Turn-end part follows the Current world state.
    const open = historyView(state, gdrs).openEntry.turnEnd;
    expect(open.agentActivity.deployed).toBe(3);
    expect(
      Object.values(open.agentActivity as unknown as Record<string, number>).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBe(open.servingAgents);
    expect(open.effectiveSkills).toHaveLength(open.servingAgents);

    const fundingBefore = state.world.current.agency.state.funding;
    const ended = advance(state);
    const entry = historyView(ended, gdrs).entries.at(-1)!;
    const activity = entry.turnEnd.agentActivity;
    expect(activity.deployed).toBe(3);
    expect(
      Object.values(activity as unknown as Record<string, number>).reduce((sum, count) => sum + count, 0),
    ).toBe(entry.turnEnd.servingAgents);
    expect(entry.turnEnd.effectiveSkills).toHaveLength(entry.turnEnd.servingAgents);
    expect(entry.turnEnd.effectiveSkills.every((skill) => Number.isInteger(skill) && skill >= 0)).toBe(true);
    expect(entry.turnStart.caps).toEqual({
      agentCap: gdrs.economy.baseAgentCap,
      transportCap: gdrs.economy.baseTransportCap,
      trainingCap: gdrs.economy.baseTrainingCap,
    });
    expect(entry.report.fundingUsed).toBe(fundingBefore);
    expect(entry.report.income).toBeGreaterThanOrEqual(entry.report.fundingUsed);
  });
});
