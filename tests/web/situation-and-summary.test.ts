/** GUI, Situation panel and Turn summary: which groups show, in which order, and when the Turn summary shows. */
import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../../src/engine/state/types.ts';
import { currentStateView, historyView, turnReportView } from '../../src/engine/views/views.ts';
import { situationGroups } from '../../src/web/situation.ts';
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
    const view = currentStateView(state, gdrs);
    const groups = situationGroups(view);
    expect(groups.map((group) => group.id)).toEqual(
      ['investigations', 'leads', 'missionSites', 'training', 'standby'].filter((id) =>
        groups.some((group) => group.id === id),
      ),
    );
    const leads = groups.find((group) => group.id === 'leads');
    expect(leads?.id === 'leads' && leads.rows.map((lead) => lead.id)).toContain(MEMBER);
    expect(groups.find((group) => group.id === 'standby')).toMatchObject({ count: 4 });
    expect(groups.find((group) => group.id === 'training')).toMatchObject({
      count: view.agency.trainingCap,
      cap: view.agency.trainingCap,
    });
    expect(groups.find((group) => group.id === 'investigations')).toBeUndefined();
  });

  it('moves a Lead with an Active Investigation to the Active Investigations, with team and Turns', () => {
    let state = withAgents(newCampaign(), 4);
    const [a1] = agentIds(state) as [string];
    state = startMember(state, a1, 4);
    state = advance(state);
    state = advance(state);
    const groups = situationGroups(currentStateView(state, gdrs));
    const active = groups[0]!;
    expect(active.id).toBe('investigations');
    if (active.id !== 'investigations') {
      return;
    }
    expect(active.count).toBe(1);
    expect(active.rows[0]).toMatchObject({ teamSize: 1, inTransit: 0, turns: 2 });
    expect(active.rows[0]!.investigation.projectedProgressGain).toBe(100);
    const leads = groups.find((group) => group.id === 'leads');
    expect(leads?.id === 'leads' && leads.rows.some((lead) => lead.id === MEMBER)).toBe(false);
  });

  it('is empty, i.e. says that nothing needs attention, when every group is left out', () => {
    const view = currentStateView(withAgents(newCampaign(), 2), gdrs);
    expect(
      situationGroups({
        ...view,
        investigations: [],
        leads: [],
        missionSites: [],
        agents: [],
        agency: { ...view.agency, trainingAgents: view.agency.trainingCap },
      }),
    ).toEqual([]);
  });
});

describe('GUI: Turn summary', () => {
  let state = withAgents(newCampaign(), 4);
  const [a1] = agentIds(state) as [string];
  state = startMember(state, a1, 4);
  const quiet = advance(state);
  for (let turn = 1; turn <= 5; turn += 1) {
    state = advance(state);
  }

  it('shows nothing after an Advance turn that did nothing it lists', () => {
    const report = turnReportView(quiet)!;
    expect(turnSummaryHasContent(report)).toBe(false);
    expect(showsTurnSummary(1, report)).toBe(false);
  });

  it('shows only for the Advance turn the Player requested through the GUI', () => {
    const report = turnReportView(state)!;
    expect(report.turn).toBe(5);
    expect(showsTurnSummary(5, report)).toBe(true);
    // Loading, Timeline navigation, and Autopilot leave no requested Turn.
    expect(showsTurnSummary(null, report)).toBe(false);
    // A Turn report of another Advance turn, e.g. after undoing to an earlier Autosave.
    expect(showsTurnSummary(4, report)).toBe(false);
  });

  it('lists the completed Investigation with the gain of its last Advance turn, and the Mission site it created', () => {
    const model = turnSummary(
      turnReportView(state)!,
      currentStateView(state, gdrs),
      historyView(state, gdrs),
      siteName,
    );
    expect(model.missions).toEqual([]);
    expect(model.investigations).toHaveLength(1);
    expect(model.investigations[0]).toMatchObject({
      finalProgress: 400,
      gain: 100,
      requiredProgress: 3,
      range: { min: 3, max: 4 },
      turns: 4,
      createdMissionSiteName: siteName('apprehend_member'),
    });
    expect(model.newSites).toHaveLength(1);
    expect(model.newSites[0]).toMatchObject({ name: siteName('apprehend_member'), kind: 'Initiative' });
    expect(model.newSites[0]!.origin).toContain('from');
    expect(model.endedSites).toEqual([]);
  });
});
