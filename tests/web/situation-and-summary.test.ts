/**
 * SITP, Groups; GUI, Completion estimate and Progress circle; and TSUM, Groups: which groups show, in which order,
 * and when the Turn summary shows.
 */
import { describe, expect, it } from 'vite-plus/test';
import type { CampaignState } from '../../src/engine/state/types.ts';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  turnReportView,
} from '../../src/engine/views/views.ts';
import { completionEstimate, progressCircle } from '../../src/web/completion.ts';
import { situationGroups } from '../../src/web/situation.ts';
import {
  leadsDiscoveredText,
  showsTurnSummary,
  turnSummary,
  turnSummaryHasContent,
} from '../../src/web/turn-summary.ts';
import {
  act,
  advance,
  agentIds,
  gdrs,
  newCampaign,
  setAssignment,
  tweak,
  withAgents,
} from '../helpers/game.ts';

const MEMBER = 'locate_red_dawn_member';
/** The Lead's Required progress R, the least value of its Required progress range, which the tests fix it to. */
const REQUIRED = gdrs.leads.find((lead) => lead.id === MEMBER)!.requiredProgress;
/**
 * INVSTG, Progress gain, for one working member: its effective skill, which for a new Agent at full health and with
 * no exhaustion is the skill of the AgentArchetype; progress is in hundredths of a point.
 */
const ONE_AGENT_GAIN = gdrs.agentArchetype.skill;
/** The Advance turns of work in which one new Agent reaches the Required progress. */
const WORK_TURNS = Math.ceil((REQUIRED * 100) / ONE_AGENT_GAIN);

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
    // SITP, Groups: no Leads group, even while a Lead waits to be investigated.
    expect(groups.map((group) => group.id)).toEqual(['agents']);
    // SITP, Groups: the Agents line counts the Agents fit to start work and the free Training places; the group
    // counts the Serving Agents.
    expect(groups.find((group) => group.id === 'agents')).toMatchObject({
      count: view.agency.servingAgents,
      fitToStartWork: 4,
      trainingFree: view.agency.trainingCap,
    });
  });

  it('counts as fit to start work only the Agents At assignment on Standby that are Fit to start work', () => {
    let state = withAgents(newCampaign(), 4);
    const [, a2, a3] = agentIds(state) as [string, string, string, string];
    state = setAssignment(state, [a2], 'Standby', 'InTransit');
    state = tweak(state, (world) => {
      world.agents[a3]!.state.exactExhaustionHundredths =
        (gdrs.agentParameters.exhaustionWorkStartMax + 1) * 100;
    });
    const view = currentLiveWorldStateView(state, gdrs);
    const groups = situationGroups(view, currentRetiredWorldStateView(state, gdrs).leads);
    // SITP, Groups: an Agent In transit to Standby, and one too tired to start work, are not counted.
    expect(groups.find((group) => group.id === 'agents')).toMatchObject({ fitToStartWork: 2 });
  });

  it('moves a Lead with an Active Investigation to the Active Investigations, with its Completion estimate', () => {
    let state = withAgents(newCampaign(), 4);
    const [a1] = agentIds(state) as [string];
    state = startMember(state, a1, REQUIRED);
    state = advance(state);
    state = advance(state);
    expect(WORK_TURNS).toBeGreaterThan(1);
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
    expect(active.rows[0]!.investigation.projectedProgressGain).toBe(ONE_AGENT_GAIN);
    expect(active.rows[0]!.estimate.text).toMatch(/^ETA /);
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
  it('counts the Leads credited to a Mission, in the singular for one', () => {
    expect(leadsDiscoveredText(1)).toBe('1 new Lead discovered');
    expect(leadsDiscoveredText(2)).toBe('2 new Leads discovered');
  });

  let state = withAgents(newCampaign(), 4);
  const [a1] = agentIds(state) as [string];
  state = startMember(state, a1, REQUIRED);
  const quiet = advance(state);
  // The Agent is In transit in the first Advance turn, and works in each one after it until the Investigation
  // completes, in the Advance turn of Turn 1 + WORK_TURNS.
  const completionTurn = 1 + WORK_TURNS;
  for (let turn = 1; turn <= completionTurn; turn += 1) {
    state = advance(state);
  }

  it('shows nothing after an Advance turn that did nothing it lists', () => {
    const report = turnReportView(quiet)!;
    expect(turnSummaryHasContent(report)).toBe(false);
    expect(showsTurnSummary(1, report)).toBe(false);
  });

  it('shows only for the Advance turn the Player requested through the GUI', () => {
    const report = turnReportView(state)!;
    expect(report.turn).toBe(completionTurn);
    expect(showsTurnSummary(completionTurn, report)).toBe(true);
    // Loading, Timeline navigation, and Autopilot leave no requested Turn.
    expect(showsTurnSummary(null, report)).toBe(false);
    // A Turn report of another Advance turn, e.g. after undoing to an earlier Autosave.
    expect(showsTurnSummary(completionTurn - 1, report)).toBe(false);
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
    // INVSTG, Required progress range: from R to round up(R × required_progress_max_pct / 100).
    const max = Math.ceil((REQUIRED * gdrs.investigationParameters.requiredProgressMaxPct) / 100);
    expect(model.investigations[0]).toMatchObject({
      finalProgress: WORK_TURNS * ONE_AGENT_GAIN,
      gain: ONE_AGENT_GAIN,
      requiredProgress: REQUIRED,
      range: { min: REQUIRED, max },
      turns: completionTurn - 1,
      createdMissionSiteName: siteName('apprehend_member'),
    });
    expect(model.newSites).toHaveLength(1);
    expect(model.newSites[0]).toMatchObject({ name: siteName('apprehend_member'), kind: 'Initiative' });
    expect(model.newSites[0]!.origin).toContain('from');
    expect(model.expiredSites).toEqual([]);
  });

  const NO_CONSEQUENCE = {
    money: 0,
    fundingChange: -1,
    panicIncreaseHundredths: 100,
    panicReductionHundredths: 0,
    eliminatedFaction: null,
    defeat: false,
  };

  it('is not shown after an Advance turn whose only news is an Expired Mission site, yet can be reopened', () => {
    const quietReport = turnReportView(quiet)!;
    const expiredOnly = {
      ...quietReport,
      expiredMissionSites: [
        {
          missionSite: 'mission-site-9',
          missionSiteArchetype: 'apprehend_member',
          kind: 'Response' as const,
          consequence: NO_CONSEQUENCE,
        },
      ],
    };
    // TSUM, Groups: an Expired Mission site alone never shows the Turn summary; the Situation panel shows it.
    expect(showsTurnSummary(quietReport.turn, expiredOnly)).toBe(false);
    // TRVIEW, Turn summary button: enabled when the only group is Expired Mission sites.
    expect(turnSummaryHasContent(expiredOnly)).toBe(true);
    // TSUM, Groups: a Cancelled Mission site alone gives the Turn summary no group.
    expect(turnSummaryHasContent({ ...quietReport, cancelledMissionSites: ['mission-site-9'] })).toBe(false);
  });

  it('lists the Expired Mission sites, and leaves the Cancelled ones out', () => {
    const quietReport = turnReportView(quiet)!;
    const model = turnSummary(
      {
        ...quietReport,
        cancelledMissionSites: ['mission-site-8'],
        expiredMissionSites: [
          {
            missionSite: 'mission-site-9',
            missionSiteArchetype: 'apprehend_member',
            kind: 'Response' as const,
            consequence: NO_CONSEQUENCE,
          },
        ],
      },
      currentLiveWorldStateView(quiet, gdrs),
      currentRetiredWorldStateView(quiet, gdrs),
      siteName,
    );
    expect(model.expiredSites).toEqual([
      {
        missionSite: 'mission-site-9',
        name: siteName('apprehend_member'),
        kind: 'Response',
        consequence: NO_CONSEQUENCE,
      },
    ]);
  });
});

describe('GUI: Situation panel Mission sites', () => {
  const state = withAgents(newCampaign(), 2);
  const view = currentLiveWorldStateView(state, gdrs);
  const site = (id: string, turnsUntilExpiration: number, lifecycle = 'Active') =>
    ({
      ...view.missionSites[0]!,
      id,
      name: id,
      turnsUntilExpiration,
      lifecycle,
    }) as (typeof view.missionSites)[number];

  it('lists the Active ones soonest first, marks the one that Expires next, then the ones just lost', () => {
    const groups = situationGroups(
      { ...view, missionSites: [site('later', 3), site('next', 1)] },
      [],
      [site('gone', 0, 'Expired')],
    );
    const sites = groups.find((group) => group.id === 'missionSites');
    expect(sites).toBeDefined();
    if (sites?.id !== 'missionSites') {
      return;
    }
    // SITP, Groups: the count is the number of Active Mission sites; a lost one waits for no decision.
    expect(sites.count).toBe(2);
    expect(sites.rows.map((row) => [row.site.id, row.urgency])).toEqual([
      ['next', 'next'],
      ['later', 'other'],
      ['gone', 'lost'],
    ]);
  });

  it('shows the group for a Mission site just lost even when none is Active', () => {
    const groups = situationGroups({ ...view, missionSites: [] }, [], [site('gone', 0, 'Cancelled')]);
    expect(groups.find((group) => group.id === 'missionSites')).toMatchObject({ count: 0 });
  });
});
