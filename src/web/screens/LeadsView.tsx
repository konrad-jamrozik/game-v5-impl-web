/**
 * LVIEW: the Leads View. Three panes side by side: the Discovered Leads in groups, the selected Lead, and the team
 * of its Investigation.
 */
import { AGENT_COLUMN_WIDTH } from '../table-widths.ts';
import { useMemo, useState } from 'react';
import type {
  AgentView,
  CurrentLiveWorldStateView,
  InvestigationView,
  LeadView,
} from '../../engine/index.ts';
import { agentsToAddOrder, isInBase } from '../agents-to-add.ts';
import { Exhaustion, exhaustionLevels } from '../condition.tsx';
import { groupDigits, progressGain, progressPoints } from '../format.ts';
import { leadFactionName, onCompletionLines } from '../lead-completion.ts';
import { progressBar } from '../progress-bar.ts';
import { activeInvestigationRows, leadsToInvestigate, rangeText } from '../situation.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { useRowSelection } from '../row-selection.ts';
import { pressHeader, sortRows, type SortTier } from '../table-sort.ts';
import { Button, Grid, SortMark, ariaSort } from '../ui.tsx';
import type { ReportTarget } from './TurnReportView.tsx';
import { InTransitIcon } from '../assignment-cell.tsx';
import { DetailView } from './DetailView.tsx';
import { ProgressBar } from './ProgressBar.tsx';

const TONES = { next: 'tone-accent', plain: 'secondary', muted: 'muted' } as const;

/** LVIEW, Team: the sortable columns of the Agents to add table. */
/** LVIEW, Team, Agents to add: the sortable columns; the table shows no Assignment. */
type CandidateKey = 'id' | 'effectiveSkill' | 'skillHundredths' | 'exhaustion';

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
  state: CurrentLiveWorldStateView;
  locked: string | null;
  initial: string | null;
  /** CSCR, View trail, Follow: opens another Detail view, e.g. the Agents View from the team pane. */
  onShow: (target: ReportTarget) => void;
  onClose: () => void;
}) {
  const { snapshot, state } = props;
  const [picked, setPicked] = useState<string | null>(props.initial);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const leads = snapshot.retired?.leads ?? [];
  const active = activeInvestigationRows(state, leads);
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
      items: leadsToInvestigate(state, leads).map((lead) => ({
        lead,
        // LVIEW, Lead list: the Required progress range only once it is known, and nothing in its place before.
        detail: rangeText(lead) === null ? '' : `required progress ${rangeText(lead) ?? ''}`,
        tone: 'secondary',
      })),
    },
    {
      id: 'inactive',
      title: 'Inactive',
      items: leads
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
      items: leads
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
    <DetailView
      id="leads"
      title="Leads"
      aside={`${groupDigits(leads.length)} discovered`}
      onClose={props.onClose}
    >
      <div className="panes">
        <div className="pane pane-list">
          {groups.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.id} className="list-group" data-testid={`leads-${group.id}`}>
                {group.collapsed === undefined ? (
                  <div className="sit-group-head">
                    <span className="label">{group.title}</span>
                    <span className="figure tone-accent">{groupDigits(group.items.length)}</span>
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
                    <span className="figure muted">{groupDigits(group.items.length)}</span>
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
          <LeadDetails lead={selected} investigation={investigation} snapshot={snapshot} state={state} />
        )}
        {selected === null || (selected.status !== 'Available' && investigation === undefined) ? null : (
          <Team
            key={selected.id}
            lead={selected}
            investigation={investigation}
            snapshot={snapshot}
            state={state}
            locked={props.locked}
            onShow={props.onShow}
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
  state: CurrentLiveWorldStateView;
}) {
  const { lead, investigation, snapshot, state } = props;
  const completions = lead.completionCount;
  const range = rangeText(lead);
  const faction = leadFactionName(lead, state);
  const onCompletion = onCompletionLines(lead, snapshot.gameData, state);
  return (
    <div className="pane" data-testid={`lead-details-${lead.id}`}>
      <h4 className="pane-title" title={lead.name}>
        {lead.name}
      </h4>
      <p className="secondary small">{lead.description}</p>
      <dl className="pairs">
        {/* LVIEW, Selected Lead: its Faction only when it has one. */}
        {faction === null ? null : (
          <>
            <dt>Faction</dt>
            <dd data-testid="lead-faction">{faction}</dd>
          </>
        )}
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
        {completions === 0 ? null : (
          <>
            <dt>Completed</dt>
            <dd className="figure">{groupDigits(completions)}×</dd>
          </>
        )}
      </dl>
      {onCompletion.length === 0 ? null : (
        <div data-testid="lead-on-completion">
          <div className="label pane-sub">On completion</div>
          {onCompletion.map((line) => (
            <div
              key={line.key}
              className={`small${line.good ? ' tone-good' : ''}`}
              data-testid={`lead-on-completion-${line.key}`}
            >
              {line.before}
              {line.strong === '' ? null : <strong>{line.strong}</strong>}
              {line.after}
            </div>
          ))}
        </div>
      )}
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
            <dd className="figure">{groupDigits(state.turn - investigation.turnStarted)}</dd>
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
  state: CurrentLiveWorldStateView;
  locked: string | null;
  onShow: (target: ReportTarget) => void;
}) {
  const { player } = theEngine();
  const { lead, investigation, snapshot, state, locked } = props;
  const [checked, setChecked] = useState<readonly string[]>([]);
  const actions = snapshot.actions;
  // LVIEW, Team: the Agents that can take orders, whose Assignment is a Base Assignment, and that are Fit to start work.
  const candidates = state.agents.filter(
    (agent) => agent.canTakeOrders && isInBase(agent) && agent.fitForWork,
  );
  const team = checked.filter((id) => candidates.some((agent) => agent.id === id));
  // VIS, Tables: up to four sort tiers over the default order of LVIEW, Team.
  const [tiers, setTiers] = useState<SortTier<CandidateKey>[]>([]);
  const value = (agent: AgentView, key: CandidateKey): number | string => agent[key];
  const rows = sortRows(agentsToAddOrder(candidates), tiers, value);
  const selection = useRowSelection({
    order: rows.map((agent) => agent.id),
    selected: team,
    selectable: () => true,
    onChange: setChecked,
  });
  const none = team.length === 0 ? 'Check the Agents to add first.' : null;
  const agentById = (id: string) => state.agents.find((agent) => agent.id === id);
  const skillOf = (id: string) => {
    const agent = agentById(id);
    return agent === undefined ? '-' : groupDigits(agent.effectiveSkill);
  };
  // LVIEW, Team, Current team: members are checked to be recalled; a member In transit, or one that cannot take
  // orders, cannot be checked.
  const members = investigation?.currentTeam ?? [];
  const recallable = (id: string) => actions?.agentsThatCanTakeOrders.includes(id) === true;
  const [recallChecked, setRecallChecked] = useState<readonly string[]>([]);
  const toRecall = recallChecked.filter(
    (id) => members.some((member) => member.agent === id) && recallable(id),
  );
  const recallSelection = useRowSelection({
    order: members.map((member) => member.agent),
    selected: toRecall,
    selectable: recallable,
    onChange: setRecallChecked,
  });
  const levels = exhaustionLevels(snapshot.gameData);
  // LVIEW, Team, Team progress estimate: the engine's estimate of the team the primary button would make; for Assign,
  // the Current team together with the checked Agents.
  const estimateTeam = [...(investigation?.currentTeam.map((member) => member.agent) ?? []), ...team];
  const estimate = useMemo(() => {
    if (team.length === 0) {
      return null;
    }
    const result = player.queries.estimateTeamProgressGain(estimateTeam);
    return result.ok ? result.value : null;
    // The estimate depends on the World state, which the snapshot key names, and on the team.
  }, [player, snapshot.key, estimateTeam.join(',')]);
  const header = (key: CandidateKey, label: string, numeric: boolean, title?: string) => (
    <th
      className={numeric ? 'sortable num' : 'sortable'}
      title={title}
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
            <span className="figure tone-accent">{groupDigits(investigation.currentTeam.length)}</span>
          </div>
          {/* LVIEW, Team, Current team: a selection checkbox, the Instance ID with the In transit icon for a member In
              transit, and the effective skill; the Recall button under the table recalls the checked members. */}
          <Grid
            widths={['36px', AGENT_COLUMN_WIDTH, '64px']}
            className="compact pick-grid"
            testId="current-team"
          >
            <thead>
              <tr>
                <th className="check" />
                <th>Agent</th>
                <th className="num" title="Effective skill">
                  Skill
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const on = toRecall.includes(member.agent);
                const inTransit = member.agentStatus === 'InTransit';
                return (
                  <tr
                    key={member.agent}
                    className={on ? 'row-selected' : ''}
                    {...recallSelection.row(member.agent)}
                  >
                    <td className="check" title={inTransit ? 'In transit' : undefined}>
                      <input
                        type="checkbox"
                        aria-label={`Recall ${member.agent}`}
                        data-testid={`recall-pick-${member.agent}`}
                        {...recallSelection.checkbox(member.agent)}
                      />
                    </td>
                    <td>
                      {/* LVIEW, Team: an Instance ID opens the Agent's details in the Agents View as a Follow, without
                          checking or unchecking its row, since the row ignores clicks on a button. */}
                      <button
                        type="button"
                        className="history-link figure"
                        data-testid={`team-agent-${member.agent}`}
                        data-sound="main"
                        onClick={() => {
                          props.onShow({ kind: 'agent', agent: member.agent });
                        }}
                      >
                        {member.agent}
                      </button>
                      {inTransit ? <InTransitIcon /> : null}
                    </td>
                    <td className="num">{skillOf(member.agent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Grid>
          <div className="pane-actions">
            {/* LVIEW, Team, Current team: one Player action for every checked member, at once and without a
                confirmation, because Undo Action takes it back. */}
            <Button
              kind="danger"
              testId="recall"
              disabledReason={locked ?? (toRecall.length === 0 ? 'Check the members to recall first.' : null)}
              onClick={() => {
                const agents = [...toRecall];
                act(() => player.actions.assignAgents(agents, 'Standby'));
                setRecallChecked([]);
              }}
            >
              Recall · {groupDigits(toRecall.length)}
            </Button>
          </div>
        </>
      )}
      <div className="sit-group-head pane-sub">
        <span className="label">Agents to add</span>
        <span className="figure secondary">{groupDigits(team.length)} checked</span>
      </div>
      {candidates.length === 0 ? (
        <p className="muted small">No Agent that is Fit to start work can take orders now.</p>
      ) : (
        <>
          {/* LVIEW, Team, Agents to add: the note above the table says which Agents it lists. */}
          <p className="muted small table-note" data-testid="agents-to-add-note">
            Showing agents fit to start work
          </p>
          <Grid
            widths={['36px', AGENT_COLUMN_WIDTH, '84px', '76px']}
            className="compact pick-grid"
            testId="agents-to-add"
          >
            <thead>
              <tr>
                <th className="check" />
                {header('id', 'Agent', false)}
                {/* VIS, Tables: effective skill is headed Skill, and exhaustion Exh. */}
                {header('effectiveSkill', 'Skill', true, 'Effective skill')}
                {header('exhaustion', 'Exh.', true, 'Exhaustion')}
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
                    <td>
                      {/* LVIEW, Team: an Instance ID opens the Agent's details in the Agents View as a Follow, without
                        checking or unchecking its row, since the row ignores clicks on a button. */}
                      <button
                        type="button"
                        className="history-link figure"
                        data-testid={`team-candidate-${agent.id}`}
                        data-sound="main"
                        onClick={() => {
                          props.onShow({ kind: 'agent', agent: agent.id });
                        }}
                      >
                        {agent.id}
                      </button>
                    </td>
                    <td className="num">{groupDigits(agent.effectiveSkill)}</td>
                    <td className="num">
                      <Exhaustion value={agent.exhaustion} levels={levels} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Grid>
        </>
      )}
      <div className="pane-actions">
        {/* LVIEW, Team: the primary button stands at the left of its line, followed by the Team progress estimate. */}
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
            Start · {groupDigits(team.length)}
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
            Assign · {groupDigits(team.length)}
          </Button>
        )}
        {estimate === null ? null : (
          <span
            className="figure secondary"
            data-testid="team-estimate"
            title="An estimate: it takes every Agent's effective skill as it is now and counts no Advance turn In transit."
          >
            Est. +{progressGain(estimate)} / turn
          </span>
        )}
        {/* LVIEW, Team: at the right, an Agents button opens the Agents View as a Follow. */}
        <Button
          className="pane-action-end"
          testId="team-open-agents"
          onClick={() => {
            props.onShow({ kind: 'agents' });
          }}
        >
          Agents
        </Button>
      </div>
    </div>
  );
}
