/**
 * AVIEW, Agent table: an Assignment reads "Investigating" without its Lead's name, leads to that Lead, and marks an
 * Agent In transit with the In transit icon. TSUM, Summary events: a completed Investigation whose Lead unlocks Contracting
 * says so.
 */
import { describe, expect, it } from 'vite-plus/test';
import type { CampaignState } from '../../src/engine/state/types.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  turnReportView,
} from '../../src/engine/views/views.ts';
import { assignmentParts, assignmentText, IN_TRANSIT_ICON } from '../../src/web/assignment.ts';
import { turnSummary } from '../../src/web/turn-summary.ts';
import { act, advance, agentIds, gdrs, newCampaign, tweak, withAgents } from '../helpers/game.ts';

const CONTRACTING = 'contracting_opportunities';
const MEMBER = 'locate_red_dawn_member';

function start(state: CampaignState, lead: string, agent: string): CampaignState {
  const required = gdrs.leads.find((item) => item.id === lead)!.requiredProgress;
  const fixed = tweak(state, (world) => {
    world.randomOverrides.push({ outcome: `investigation.requiredProgress.${lead}`, value: required });
  });
  return act(fixed, 'startInvestigation', { lead, agents: [agent] });
}

const siteName = (archetype: string) =>
  gdrs.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;

describe('AVIEW: Agent table Assignment', () => {
  it('reads "Investigating" without the Lead name, leads to that Lead, and marks In transit with the icon', () => {
    let state = withAgents(newCampaign(), 2);
    const [a1] = agentIds(state) as [string];
    state = start(state, MEMBER, a1);
    const view = currentLiveWorldStateView(state, gdrs);
    const agent = view.agents.find((item) => item.id === a1)!;
    const leadName = gdrs.leads.find((item) => item.id === MEMBER)!.name;
    const parts = assignmentParts(agent, view);
    expect(parts.text).toBe('Investigating');
    expect(parts.targetName).toBe(leadName);
    expect(parts.target).toEqual({ kind: 'lead', lead: MEMBER });
    expect(parts.inTransit).toBe(true);
    expect(assignmentText(agent, view)).toBe(`Investigating ${IN_TRANSIT_ICON}`);
    expect(assignmentText(agent, view)).not.toContain('In transit');
  });

  it('leads nowhere from an Assignment that names no Lead or Mission site', () => {
    const state = withAgents(newCampaign(), 1);
    const view = currentLiveWorldStateView(state, gdrs);
    const parts = assignmentParts(view.agents[0]!, view);
    expect(parts.targetName).toBeNull();
    expect(parts.target).toBeNull();
  });
});

describe('TSUM: Investigations completed', () => {
  function completed(lead: string): ReturnType<typeof turnSummary>['investigations'] {
    let state = withAgents(newCampaign(), 2);
    const [a1] = agentIds(state) as [string];
    state = start(state, lead, a1);
    for (let turn = 0; turn < 30; turn += 1) {
      state = advance(state);
      const report = turnReportView(state)!;
      if (report.investigationsCompleted.length > 0) {
        return turnSummary(
          report,
          currentLiveWorldStateView(state, gdrs),
          currentRetiredWorldStateView(state, gdrs),
          siteName,
        ).investigations;
      }
    }
    throw new Error(`The Investigation of ${lead} did not complete within 30 Advance turns.`);
  }

  it('says Contracting is unlocked for a Lead whose Completion effect unlocks it', () => {
    expect(completed(CONTRACTING)).toMatchObject([{ unlocksContracting: true }]);
  });

  it('says nothing of Contracting for any other Lead', () => {
    expect(completed(MEMBER)).toMatchObject([{ unlocksContracting: false }]);
  });
});
