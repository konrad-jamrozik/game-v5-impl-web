/**
 * LVIEW: the Leads View. Three panes side by side: the Discovered Leads in groups, the selected Lead, and the team
 * of its Investigation.
 */
import { useMemo, useState } from 'react';
import type { AgentView, CurrentStateView, InvestigationView, LeadView } from '../../engine/index.ts';
import { agentsToAddOrder, isInBase } from '../agents-to-add.ts';
import { Exhaustion, exhaustionLevels } from '../condition.tsx';
import { progressGain, progressPoints, wholeText } from '../format.ts';
import { progressBar } from '../progress-bar.ts';
import { activeInvestigationRows, leadsToInvestigate, rangeText } from '../situation.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { useRowSelection } from '../row-selection.ts';
import { pressHeader, sortRows, type SortTier } from '../table-sort.ts';
import { Button, Grid, SortMark, ariaSort } from '../ui.tsx';
import { assignmentText } from './AgentsView.tsx';
import { DetailView } from './DetailView.tsx';
import { ProgressBar } from './ProgressBar.tsx';

const TONES = { next: 'tone-accent', plain: 'secondary', muted: 'muted' } as const;

/** LVIEW, Team: the sortable columns of the Agents to add table. */
type CandidateKey = 'id' | 'assignment' | 'effectiveSkill' | 'skillHundredths' | 'exhaustion';

/** LVIEW, Selected Lead: the Lead status with what it means, and no condition or cause. */
const STATUS_TEXT = {
  Available: 'Available',
  Inactive: 'Inactive · cannot be investigated for now',
  Archived: 'Archived · can never be investigated again',
} as const;

/** LVIEW, Selected Lead: the note on `investigate_again`, shown only for `never` and `always`. */
const INVESTIGATE_AGAIN_NOTE = {
  never: 'Can be completed only once',
  until_mission_won: null,
  always: 'Can be investigated again after a win',
} as const;

interface ListItem {
  readonly lead: LeadView;
  readonly detail: string;
  readonly tone: string;
}

export function LeadsView(props: {
  snapshot: Snapshot;
  state: CurrentStateView;
  locked: string | null;
  initial: string | null;
  onClose: () => void;
}) {
  const { snapshot, state } = props;
  const [picked, setPicked] = useState<string | null>(props.initial);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const siteName = (archetype: string) =>
    snapshot.gameData?.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;

  const active = activeInvestigationRows(state);
  const investigated = new Set(active.map((row) => row.investigation.lead));
  const groups: { id: string; title: string; items: ListItem[]; collapsed?: boolean }[] = [
    {
      id: 'active',
      title: 'Active Investigations',
      items: active.flatMap((row) =>
        row.lead === null
          ? []
          : [{ lead: row.lead, detail: row.estimate.text, tone: TONES[row.estimate.tone] }],
      ),
    },
    {
      id: 'available',
      title: 'Leads to investigate',
      items: leadsToInvestigate(state).map((lead) => ({
        lead,
        detail: rangeText(lead) === null ? 'effort needed unknown' : `required ${rangeText(lead) ?? ''}`,
        tone: 'secondary',
      })),
    },
    {
      id: 'inactive',
      title: 'Inactive',
      items: state.leads
        .filter((lead) => lead.status === 'Inactive' && !investigated.has(lead.id))
        .map((lead) => {
          const site = state.missionSites.find(
            (item) => item.lead === lead.id && (item.lifecycle === 'Active' || item.lifecycle === 'Deployed'),
          );
          // LVIEW, Lead list: the unfinished Mission site it created, when it has one, and no other cause.
          return { lead, detail: site === undefined ? '' : site.name, tone: 'muted' };
        }),
    },
    {
      id: 'archived',
      title: 'Archived',
      collapsed: !archivedOpen,
      items: state.leads
        .filter((lead) => lead.status === 'Archived' && !investigated.has(lead.id))
        .map((lead) => ({ lead, detail: '', tone: 'muted' })),
    },
  ];
  const everyItem = groups.flatMap((group) => group.items);
  const selected = everyItem.find((item) => item.lead.id === picked)?.lead ?? everyItem[0]?.lead ?? null;
  const investigation =
    selected === null
      ? undefined
      : state.investigations.find((item) => item.id === selected.activeInvestigation);

  return (
    <DetailView id="leads" title="Leads" aside={`${state.leads.length} discovered`} onClose={props.onClose}>
      <div className="panes">
        <div className="pane pane-list">
          {groups.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.id} className="list-group" data-testid={`leads-${group.id}`}>
                {group.collapsed === undefined ? (
                  <div className="sit-group-head">
                    <span className="label">{group.title}</span>
                    <span className="figure tone-accent">{group.items.length}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="sit-group-head list-toggle"
                    data-testid="leads-archived-toggle"
                    data-sound="none"
                    onClick={() => {
                      setArchivedOpen((open) => !open);
                    }}
                  >
                    <span className="label">
                      {group.collapsed ? '▸' : '▾'} {group.title}
                    </span>
                    <span className="figure muted">{group.items.length}</span>
                  </button>
                )}
                {group.collapsed === true
                  ? null
                  : group.items.map((item) => (
                      <button
                        key={item.lead.id}
                        type="button"
                        className={`list-row${selected?.id === item.lead.id ? ' list-row-on' : ''}`}
                        data-testid={`lead-${item.lead.id}`}
                        data-sound="select"
                        onClick={() => {
                          setPicked(item.lead.id);
                        }}
                      >
                        <span className="list-name">{item.lead.name}</span>
                        <span className={`list-value ${item.tone}`}>{item.detail}</span>
                      </button>
                    ))}
              </div>
            ),
          )}
        </div>
        {selected === null ? null : (
          <LeadDetails
            lead={selected}
            investigation={investigation}
            snapshot={snapshot}
            state={state}
            siteName={siteName}
          />
        )}
        {selected === null || (selected.status !== 'Available' && investigation === undefined) ? null : (
          <Team
            key={selected.id}
            lead={selected}
            investigation={investigation}
            snapshot={snapshot}
            state={state}
            locked={props.locked}
          />
        )}
      </div>
    </DetailView>
  );
}

function LeadDetails(props: {
  lead: LeadView;
  investigation: InvestigationView | undefined;
  snapshot: Snapshot;
  state: CurrentStateView;
  siteName: (archetype: string) => string;
}) {
  const { lead, investigation, snapshot, state, siteName } = props;
  const faction = state.factions.find((item) => item.id === lead.faction)?.name ?? lead.factionArchetype;
  const archetype = snapshot.gameData?.missionSiteArchetypes.find(
    (item) => item.id === lead.createsMissionSite,
  );
  const enemies = archetype?.enemies.reduce((sum, item) => sum + item.count, 0);
  const completions = lead.completionCount;
  const range = rangeText(lead);
  return (
    <div className="pane" data-testid={`lead-details-${lead.id}`}>
      <h4 className="pane-title">{lead.name}</h4>
      <p className="secondary small">{lead.description}</p>
      <dl className="pairs">
        <dt>Faction</dt>
        <dd>{faction}</dd>
        <dt>Status</dt>
        <dd className={lead.status === 'Available' ? 'tone-good' : 'muted'} data-testid="lead-status">
          {STATUS_TEXT[lead.status]}
        </dd>
        {INVESTIGATE_AGAIN_NOTE[lead.investigateAgain] === null ? null : (
          <>
            <dt>Repeats</dt>
            <dd data-testid="lead-investigate-again">{INVESTIGATE_AGAIN_NOTE[lead.investigateAgain]}</dd>
          </>
        )}
        <dt>Completion creates</dt>
        <dd>
          {siteName(lead.createsMissionSite)}
          {enemies === undefined ? '' : ` · ${enemies} Enemies`}
        </dd>
        {completions === 0 ? null : (
          <>
            <dt>Completed</dt>
            <dd className="figure">{completions}×</dd>
          </>
        )}
      </dl>
      {investigation === undefined ? null : (
        <>
          <div className="label pane-sub">Investigation</div>
          <ProgressBar
            size="row"
            model={progressBar(
              lead,
              investigation.progress,
              investigation.projectedProgressGain,
              snapshot.gameData?.investigationParameters.assessmentThresholdPct ?? 0,
            )}
          />
          <dl className="pairs" data-testid={`progress-${lead.id}`}>
            <dt>Progress</dt>
            <dd className="figure">{progressPoints(investigation.progress)}</dd>
            <dt>Required</dt>
            <dd className="figure">{range ?? 'unknown'}</dd>
            <dt>Projected gain</dt>
            <dd className="figure">
              {investigation.projectedProgressGain === null
                ? '-'
                : `+${progressGain(investigation.projectedProgressGain)}`}
            </dd>
            <dt>Turns</dt>
            <dd className="figure">{state.turn - investigation.turnStarted}</dd>
          </dl>
        </>
      )}
    </div>
  );
}

function Team(props: {
  lead: LeadView;
  investigation: InvestigationView | undefined;
  snapshot: Snapshot;
  state: CurrentStateView;
  locked: string | null;
}) {
  const { player } = theEngine();
  const { lead, investigation, snapshot, state, locked } = props;
  const [checked, setChecked] = useState<readonly string[]>([]);
  const actions = snapshot.actions;
  // LVIEW, Team: the Agents that can be assigned, whose Assignment is a Base Assignment, and that are Fit for work.
  const candidates = state.agents.filter(
    (agent) => agent.canBeAssigned && isInBase(agent) && agent.fitForWork,
  );
  const team = checked.filter((id) => candidates.some((agent) => agent.id === id));
  // VIS, Tables: up to four sort tiers over the default order of LVIEW, Team.
  const [tiers, setTiers] = useState<SortTier<CandidateKey>[]>([]);
  const value = (agent: AgentView, key: CandidateKey): number | string =>
    key === 'assignment' ? assignmentText(agent, state) : agent[key];
  const rows = sortRows(agentsToAddOrder(candidates), tiers, value);
  const selection = useRowSelection({
    order: rows.map((agent) => agent.id),
    selected: team,
    selectable: () => true,
    onChange: setChecked,
  });
  const none = team.length === 0 ? 'Check the Agents to add first.' : null;
  const agentById = (id: string) => state.agents.find((agent) => agent.id === id);
  const levels = exhaustionLevels(snapshot.gameData);
  // LVIEW, Team progress estimate: the engine's estimate of the team the primary button would make; for Assign, the
  // Current team together with the checked Agents.
  const estimateTeam = [...(investigation?.currentTeam.map((member) => member.agent) ?? []), ...team];
  const estimate = useMemo(() => {
    if (team.length === 0) {
      return null;
    }
    const result = player.queries.estimateTeamProgressGain(estimateTeam);
    return result.ok ? result.value : null;
    // The estimate depends on the World state, which the snapshot key names, and on the team.
  }, [player, snapshot.key, estimateTeam.join(',')]);
  const header = (key: CandidateKey, label: string, numeric: boolean) => (
    <th
      className={numeric ? 'sortable num' : 'sortable'}
      aria-sort={ariaSort(tiers, key)}
      data-testid={`team-sort-${key}`}
      onClick={() => {
        setTiers(pressHeader(tiers, key, numeric));
      }}
    >
      {label}
      <SortMark tiers={tiers} column={key} />
    </th>
  );

  return (
    <div className="pane" data-testid="team">
      {investigation === undefined ? null : (
        <>
          <div className="sit-group-head">
            <span className="label">Current team</span>
            <span className="figure tone-accent">{investigation.currentTeam.length}</span>
          </div>
          <Grid widths={['110px', '90px', '64px', '110px']} className="compact">
            <tbody>
              {investigation.currentTeam.map((member) => (
                <tr key={member.agent}>
                  <td className="figure">{member.agent}</td>
                  <td className="muted small">{member.agentStatus === 'InTransit' ? 'In transit' : ''}</td>
                  <td className="num">{agentById(member.agent)?.effectiveSkill ?? '-'}</td>
                  <td>
                    <Button
                      testId={`recall-${member.agent}`}
                      disabledReason={
                        locked ??
                        (actions?.assignableAgents.includes(member.agent) === true
                          ? null
                          : member.agentStatus === 'InTransit'
                            ? 'An Agent In transit cannot be assigned until it arrives.'
                            : 'This Agent cannot be assigned now.')
                      }
                      onClick={() => {
                        // LVIEW, Team: at once, without a confirmation, because Undo Action takes it back.
                        act(() => player.actions.assignAgents([member.agent], 'Standby'));
                      }}
                    >
                      Recall
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Grid>
        </>
      )}
      <div className="sit-group-head pane-sub">
        <span className="label">Agents to add</span>
        <span className="figure secondary">{team.length} checked</span>
      </div>
      {candidates.length === 0 ? (
        <p className="muted small">No Agent that is Fit for work can be assigned now.</p>
      ) : (
        <Grid
          widths={['36px', '104px', '200px', '84px', '104px', '96px']}
          className="compact pick-grid"
          testId="agents-to-add"
        >
          <thead>
            <tr>
              <th className="check" />
              {header('id', 'Agent', false)}
              {header('assignment', 'Assignment', false)}
              {header('effectiveSkill', 'Effective', true)}
              {header('skillHundredths', 'Skill', true)}
              {header('exhaustion', 'Exhaustion', true)}
            </tr>
          </thead>
          <tbody>
            {rows.map((agent) => {
              const on = team.includes(agent.id);
              return (
                <tr key={agent.id} className={on ? 'row-selected' : ''} {...selection.row(agent.id)}>
                  <td className="check">
                    <input
                      type="checkbox"
                      aria-label={`Add ${agent.id}`}
                      data-testid={`team-pick-${agent.id}`}
                      {...selection.checkbox(agent.id)}
                    />
                  </td>
                  <td className="figure">{agent.id}</td>
                  <td className="secondary">{assignmentText(agent, state)}</td>
                  <td className="num">{agent.effectiveSkill}</td>
                  <td className="num">{wholeText(agent.skillHundredths)}</td>
                  <td className="num">
                    <Exhaustion value={agent.exhaustion} levels={levels} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Grid>
      )}
      <div className="pane-actions">
        {estimate === null ? null : (
          <span
            className="figure secondary"
            data-testid="team-estimate"
            title="An estimate: it takes every Agent's effective skill as it is now and counts no Advance turn In transit."
          >
            Est. +{progressGain(estimate)} / turn
          </span>
        )}
        {investigation === undefined ? (
          <Button
            kind="primary"
            testId={`investigate-${lead.id}`}
            disabledReason={
              locked ??
              none ??
              (actions?.startInvestigation.includes(lead.id) === true
                ? null
                : 'An Investigation cannot be started for this Lead now.')
            }
            onClick={() => {
              act(() => player.actions.startInvestigation(lead.id, team));
              setChecked([]);
            }}
          >
            Start · {team.length}
          </Button>
        ) : (
          <Button
            kind="primary"
            testId={`join-${lead.id}`}
            disabledReason={
              locked ??
              none ??
              (actions?.assignAgentsToInvestigation.includes(investigation.id) === true
                ? null
                : 'This Investigation accepts no Agents now.')
            }
            onClick={() => {
              act(() => player.actions.assignAgentsToInvestigation(investigation.id, team));
              setChecked([]);
            }}
          >
            Assign · {team.length}
          </Button>
        )}
      </div>
    </div>
  );
}
