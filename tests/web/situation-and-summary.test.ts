/** SITP, GUI Completion estimate and Progress circle, and Turn summary: which groups show, in which order, and when the Turn summary shows. */
import { describe, expect, it } from 'vite-plus/test';
import type { CampaignState } from '../../src/engine/state/types.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  turnReportView,
} from '../../src/engine/views/views.ts';
import { completionEstimate, progressCircle } from '../../src/web/completion.ts';
import { leadDiscoveryTurns, situationGroups } from '../../src/web/situation.ts';
import { showsTurnSummary, turnSummary, turnSummaryHasContent } from '../../src/web/turn-summary.ts';
import { act, advance, agentIds, gdrs, newCampaign, tweak, withAgents } from '../helpers/game.ts';

const MEMBER = 'locate_red_dawn_member';

function startMember(state: CampaignState, agent: string, required: number): CampaignState {
  const fixed = tweak(state, (world) => {
    world.randomOverrides.push({ outcome: `investigation.requiredProgress.${MEMBER}`, value: required });
  });
  return act(fixed, 'startInvestigation', { lead: MEMBER, agents: [agent] });
}

const siteName = (archetype: string) =>
  gdrs.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;

describe('GUI: Situation panel', () => {
  it('lists its groups in order, each with its count, leaving out the empty ones', () => {
    const state = withAgents(newCampaign(), 4);
    const view = currentLiveWorldStateView(state, gdrs);
    const groups = situationGroups(view, currentRetiredWorldStateView(state, gdrs).leads);
    expect(groups.map((group) => group.id)).toEqual(['agents', 'leads']);
    const leads = groups.find((group) => group.id === 'leads');
    expect(leads?.id === 'leads' && leads.rows.map((lead) => lead.id)).toContain(MEMBER);
    // SITP, Groups: the Agents line counts the Agents on Standby and the free Training places; the group counts
    // the Serving Agents.
    expect(groups.find((group) => group.id === 'agents')).toMatchObject({
      count: view.agency.servingAgents,
      standby: 4,
      trainingFree: view.agency.trainingCap,
    });
  });

  it('moves a Lead with an Active Investigation to the Active Investigations, with its Completion estimate', () => {
    let state = withAgents(newCampaign(), 4);
    const [a1] = agentIds(state) as [string];
    state = startMember(state, a1, 5);
    state = advance(state);
    state = advance(state);
    const groups = situationGroups(
      currentLiveWorldStateView(state, gdrs),
      currentRetiredWorldStateView(state, gdrs).leads,
    );
    expect(groups.map((group) => group.id).slice(0, 2)).toEqual(['agents', 'investigations']);
    const active = groups[1]!;
    expect(active.id).toBe('investigations');
    if (active.id !== 'investigations') {
      return;
    }
    expect(active.count).toBe(1);
    expect(active.rows[0]!.investigation.projectedProgressGain).toBe(100);
    expect(active.rows[0]!.estimate.text).toMatch(/^ETA /);
    const leads = groups.find((group) => group.id === 'leads');
    expect(leads?.id === 'leads' && leads.rows.some((lead) => lead.id === MEMBER)).toBe(false);
  });

  it('shows at most four Leads, newest first, and a line for the Leads it does not show', () => {
    const view = currentLiveWorldStateView(withAgents(newCampaign(), 4), gdrs);
    const lead = (id: string) => ({
      ...currentRetiredWorldStateView(newCampaign(), gdrs).leads[0]!,
      id,
      name: id,
      status: 'Available' as const,
    });
    // l1 and l2 at campaign creation, l3 and l4 in Turn 2, l5 in Turn 5, in the authored order l1 to l5.
    const all = ['l1', 'l2', 'l3', 'l4', 'l5'].map(lead);
    const turns = leadDiscoveryTurns({
      entries: [
        { turn: 2, report: { discoveredLeads: ['l3', 'l4'] } },
        { turn: 5, report: { discoveredLeads: ['l5'] } },
      ],
    } as unknown as Parameters<typeof leadDiscoveryTurns>[0]);
    const leadsOf = (leads: typeof all) =>
      situationGroups(view, leads, turns).find((group) => group.id === 'leads');
    // SITP, Leads shown: more than four Leads show the three newest and a line for the other two.
    expect(leadsOf(all)).toMatchObject({ count: 5, more: 2 });
    expect(leadsOf(all)?.rows.map((item) => item.id)).toEqual(['l5', 'l3', 'l4']);
    // Four or fewer Leads show each of them, in that order.
    const four = leadsOf(all.slice(0, 4));
    expect(four).toMatchObject({ count: 4, more: 0 });
    expect(four?.rows.map((item) => item.id)).toEqual(['l3', 'l4', 'l1', 'l2']);
  });

  it('is empty, i.e. says that nothing needs attention, when every group is left out', () => {
    const view = currentLiveWorldStateView(withAgents(newCampaign(), 2), gdrs);
    expect(
      situationGroups(
        {
          ...view,
          investigations: [],
          missionSites: [],
          agents: [],
          agency: { ...view.agency, trainingAgents: view.agency.trainingCap },
        },
        [],
      ),
    ).toEqual([]);
  });
});

describe('GUI: Completion estimate and Progress circle', () => {
  const assessed = { requiredProgress: 10, requiredProgressRange: { min: 10, max: 14 } } as const;
  const hidden = { requiredProgress: 'unknown', requiredProgressRange: 'unknown' } as const;

  it('gives the range of Advance turns from the Required progress to the greatest value of the range', () => {
    // a = max(1, ⌈(1000 − 400) / 200⌉) = 3, b = ⌈(1400 − 400) / 200⌉ = 5.
    expect(completionEstimate(assessed, { progress: 400, projectedProgressGain: 200 })).toEqual({
      text: 'ETA 3–5 T',
      tone: 'plain',
    });
    expect(completionEstimate(assessed, { progress: 900, projectedProgressGain: 500 })).toEqual({
      text: 'ETA 1 T',
      tone: 'next',
    });
  });

  it('writes "ETA ≤ b T" once the Required progress is reached, "stalled" without gain, and "ETA ?" while hidden', () => {
    expect(completionEstimate(assessed, { progress: 1100, projectedProgressGain: 100 }).text).toBe(
      'ETA ≤ 3 T',
    );
    expect(completionEstimate(assessed, { progress: 400, projectedProgressGain: 0 }).text).toBe('stalled');
    expect(
      completionEstimate(assessed, {
        progress: 400,
        projectedProgressGain: 0,
        currentTeam: [{ agent: 'agent-1', agentStatus: 'AtAssignment' }],
      }).text,
    ).toBe('stalled');
    expect(completionEstimate(hidden, { progress: 400, projectedProgressGain: 200 }).text).toBe('ETA ?');
  });

  it('writes "in transit" while g is 0 and a member of the Current team is In transit, before "ETA ?"', () => {
    const team = [
      { agent: 'agent-1', agentStatus: 'AtAssignment' },
      { agent: 'agent-2', agentStatus: 'InTransit' },
    ] as const;
    for (const lead of [assessed, hidden]) {
      expect(
        completionEstimate(lead, { progress: 0, projectedProgressGain: 0, currentTeam: [...team] }),
      ).toEqual({ text: 'in transit', tone: 'muted' });
    }
  });

  it('fills the circle by the share of the Required progress, full once reached, and unknown while hidden', () => {
    expect(progressCircle(assessed, 750)).toEqual({ kind: 'share', share: 0.75 });
    expect(progressCircle(assessed, 1000)).toEqual({ kind: 'full' });
    expect(progressCircle(hidden, 750)).toEqual({ kind: 'unknown' });
  });
});

describe('GUI: Turn summary', () => {
  let state = withAgents(newCampaign(), 4);
  const [a1] = agentIds(state) as [string];
  state = startMember(state, a1, 5);
  const quiet = advance(state);
  for (let turn = 1; turn <= 6; turn += 1) {
    state = advance(state);
  }

  it('shows nothing after an Advance turn that did nothing it lists', () => {
    const report = turnReportView(quiet)!;
    expect(turnSummaryHasContent(report)).toBe(false);
    expect(showsTurnSummary(1, report)).toBe(false);
  });

  it('shows only for the Advance turn the Player requested through the GUI', () => {
    const report = turnReportView(state)!;
    expect(report.turn).toBe(6);
    expect(showsTurnSummary(6, report)).toBe(true);
    // Loading, Timeline navigation, and Autopilot leave no requested Turn.
    expect(showsTurnSummary(null, report)).toBe(false);
    // A Turn report of another Advance turn, e.g. after undoing to an earlier Autosave.
    expect(showsTurnSummary(5, report)).toBe(false);
  });

  it('lists the completed Investigation with the gain of its last Advance turn, and the Mission site it created', () => {
    const model = turnSummary(
      turnReportView(state)!,
      currentLiveWorldStateView(state, gdrs),
      currentRetiredWorldStateView(state, gdrs),
      siteName,
    );
    expect(model.missions).toEqual([]);
    expect(model.investigations).toHaveLength(1);
    expect(model.investigations[0]).toMatchObject({
      finalProgress: 500,
      gain: 100,
      requiredProgress: 5,
      range: { min: 5, max: 7 },
      turns: 5,
      createdMissionSiteName: siteName('apprehend_member'),
    });
    expect(model.newSites).toHaveLength(1);
    expect(model.newSites[0]).toMatchObject({ name: siteName('apprehend_member'), kind: 'Initiative' });
    expect(model.newSites[0]!.origin).toContain('from');
    expect(model.endedSites).toEqual([]);
  });
});
