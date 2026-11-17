/**
 * LVIEW: the Leads View. Three panes side by side: the Discovered Leads in groups, the selected Lead, and the team
 * of its Investigation.
 */
import { useState } from 'react';
import type { CurrentStateView, InvestigationView, LeadView } from '../../engine/index.ts';
import { progressPoints } from '../format.ts';
import { confirmInterruption } from '../interruption.ts';
import { progressBar } from '../progress-bar.ts';
import { activeInvestigationRows, leadsToInvestigate, rangeText } from '../situation.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Button } from '../ui.tsx';
import { assignmentText } from './AgentsView.tsx';
import { DetailView } from './DetailView.tsx';
import { ProgressBar } from './ProgressBar.tsx';

const TONES = { next: 'tone-accent', plain: 'secondary', muted: 'muted' } as const;

function blockers(lead: LeadView, siteName: (archetype: string) => string): string[] {
  const texts: string[] = [];
  if (!lead.conditions.prerequisitesHold) {
    const missing = lead.requires.filter((item) => !item.holds).map((item) => siteName(item.missionWon));
    texts.push(`needs a won Mission at ${missing.join(', ')}`);
  }
  if (!lead.conditions.noMissionWon) {
    texts.push('its Mission is already won');
  }
  if (!lead.conditions.noUnfinishedMissionSite) {
    texts.push('the Mission site it created is not yet finished');
  }
  if (!lead.conditions.factionNotEliminated) {
    texts.push('its Faction is eliminated');
  }
  return texts;
}

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
        detail: rangeText(lead) === null ? 'range unknown' : `required ${rangeText(lead) ?? ''}`,
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
            (item) =>
              item.lead === lead.id && (item.lifecycle === 'Active' || item.lifecycle === 'Attempted'),
          );
          return { lead, detail: site === undefined ? 'blocked' : `${site.name} open`, tone: 'muted' };
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
  const completions =
    snapshot.history?.retained.investigations.filter(
      (item) => item.lead === lead.id && item.lifecycle === 'Completed',
    ).length ?? 0;
  const range = rangeText(lead);
  return (
    <div className="pane" data-testid={`lead-details-${lead.id}`}>
      <h4 className="pane-title">{lead.name}</h4>
      <p className="secondary small">{lead.description}</p>
      <dl className="pairs">
        <dt>Faction</dt>
        <dd>{faction}</dd>
        <dt>Status</dt>
        <dd className={lead.status === 'Available' ? 'tone-good' : 'muted'}>
          {lead.status}
          {lead.status === 'Available' ? '' : ` · ${blockers(lead, siteName).join('; ')}`}
        </dd>
        {lead.requires.length === 0 ? null : (
          <>
            <dt>Requires</dt>
            <dd>
              {lead.requires.map((item) => (
                <div key={item.missionWon} className={item.holds ? 'tone-good' : 'muted'}>
                  {item.holds ? '✓' : '✗'} a won Mission at {siteName(item.missionWon)}
                </div>
              ))}
            </dd>
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
                : `+${progressPoints(investigation.projectedProgressGain)}`}
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
  const members = new Set(investigation?.currentTeam.map((member) => member.agent) ?? []);
  // LVIEW, Team: the Agents that can be assigned, are Fit for work, and are not on this Investigation.
  const candidates = state.agents.filter(
    (agent) => agent.canBeAssigned && agent.fitForWork && !members.has(agent.id),
  );
  const team = checked.filter((id) => candidates.some((agent) => agent.id === id));
  const none = team.length === 0 ? 'Check the Agents to add first.' : null;
  const agentById = (id: string) => state.agents.find((agent) => agent.id === id);

  return (
    <div className="pane" data-testid="team">
      {investigation === undefined ? null : (
        <>
          <div className="sit-group-head">
            <span className="label">Current team</span>
            <span className="figure tone-accent">{investigation.currentTeam.length}</span>
          </div>
          <table className="grid compact">
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
                          : 'This Agent cannot be assigned now.')
                      }
                      onClick={() => {
                        if (confirmInterruption(state, [member.agent])) {
                          act(() => player.actions.assignAgents([member.agent], 'Standby'));
                        }
                      }}
                    >
                      Recall
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="sit-group-head pane-sub">
        <span className="label">Agents to add</span>
        <span className="figure secondary">{team.length} checked</span>
      </div>
      {candidates.length === 0 ? (
        <p className="muted small">No Agent that is Fit for work can be assigned now.</p>
      ) : (
        <table className="grid compact">
          <tbody>
            {candidates.map((agent) => {
              const on = team.includes(agent.id);
              return (
                <tr key={agent.id} className={on ? 'row-selected' : ''}>
                  <td className="check">
                    <input
                      type="checkbox"
                      aria-label={`Add ${agent.id}`}
                      data-testid={`team-pick-${agent.id}`}
                      checked={on}
                      onChange={() => {
                        setChecked(on ? team.filter((id) => id !== agent.id) : [...team, agent.id]);
                      }}
                    />
                  </td>
                  <td className="figure">{agent.id}</td>
                  <td className="secondary">{assignmentText(agent, state)}</td>
                  <td className="num">{agent.effectiveSkill}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="pane-actions">
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
              if (confirmInterruption(state, team)) {
                act(() => player.actions.startInvestigation(lead.id, team));
                setChecked([]);
              }
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
              if (confirmInterruption(state, team)) {
                act(() => player.actions.assignAgentsToInvestigation(investigation.id, team));
                setChecked([]);
              }
            }}
          >
            Assign · {team.length}
          </Button>
        )}
      </div>
    </div>
  );
}
