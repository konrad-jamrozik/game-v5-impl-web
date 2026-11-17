/** The Leads tree: each Lead under the Leads it requires, with its Investigation and what blocks it. */
import type { CurrentStateView, LeadView } from '../../engine/index.ts';
import { confirmInterruption } from '../interruption.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { progressPoints } from '../format.ts';
import { progressBar } from '../progress-bar.ts';
import { Badge, Button } from '../ui.tsx';
import { ProgressBar } from './ProgressBar.tsx';

function blockers(lead: LeadView, siteName: (archetype: string) => string): string[] {
  const texts: string[] = [];
  if (!lead.conditions.prerequisitesHold) {
    const missing = lead.requires.filter((item) => !item.holds).map((item) => siteName(item.missionWon));
    texts.push(`needs a won Mission at: ${missing.join(', ')}`);
  }
  if (!lead.conditions.noMissionWon) {
    texts.push('its Mission is already won');
  }
  if (!lead.conditions.noUnfinishedMissionSite) {
    texts.push('it has an unfinished Mission site');
  }
  if (!lead.conditions.factionNotEliminated) {
    texts.push('its Faction is eliminated');
  }
  return texts;
}

/** INVSTG, Player-visible information: the Required progress range only for an Assessed Lead. */
function requiredText(lead: LeadView): string {
  const range = lead.requiredProgressRange;
  return range === 'unknown' ? 'unknown' : `at least ${range.min}, up to ${range.max}`;
}

/** LEAD, Lead status, as a Badge tone. */
const STATUS_TONES = { Available: 'good', Inactive: 'warn', Archived: 'muted' } as const;

export function LeadsPanel(props: {
  snapshot: Snapshot;
  state: CurrentStateView;
  selected: readonly string[];
  locked: string | null;
}) {
  const { player } = theEngine();
  const { state, selected, locked } = props;
  const actions = props.snapshot.actions;
  const siteName = (archetype: string) =>
    props.snapshot.gameData?.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;
  const none = selected.length === 0 ? 'Select Agents first.' : null;

  const node = (lead: LeadView, depth: number, trail: readonly string[]) => {
    const investigation = state.investigations.find((item) => item.id === lead.activeInvestigation);
    const children = trail.includes(lead.id)
      ? []
      : state.leads.filter((item) =>
          item.requires.some((required) => required.missionWon === lead.createsMissionSite),
        );
    const canStart = actions?.startInvestigation.includes(lead.id) === true;
    return (
      <li key={`${trail.join('/')}/${lead.id}`}>
        <article
          className="card lead"
          data-testid={`lead-${lead.id}`}
          style={{ marginLeft: `${depth * 20}px` }}
        >
          <header className="card-head">
            <h4>{lead.name}</h4>
            <Badge>
              {lead.requiredProgressRange === 'unknown'
                ? 'required progress unknown'
                : `required progress ${lead.requiredProgressRange.min} to ${lead.requiredProgressRange.max}`}
            </Badge>
            {!lead.conditions.noMissionWon ? <Badge tone="good">Mission won</Badge> : null}
            <Badge tone={STATUS_TONES[lead.status]}>{lead.status}</Badge>
            {investigation !== undefined ? <Badge tone="accent">Investigating</Badge> : null}
          </header>
          <p className="muted small">{lead.description}</p>
          <p className="small">
            Completing it creates the Mission site: {siteName(lead.createsMissionSite)}.
          </p>
          {!lead.available && investigation === undefined ? (
            <p className="small muted">Not available because {blockers(lead, siteName).join('; ')}.</p>
          ) : null}
          {investigation === undefined ? (
            lead.available ? (
              <div className="card-actions">
                <Button
                  kind="primary"
                  testId={`investigate-${lead.id}`}
                  disabledReason={
                    locked ??
                    none ??
                    (canStart ? null : 'An Investigation cannot be started for this Lead now.')
                  }
                  onClick={() => {
                    if (confirmInterruption(state, selected)) {
                      act(() => player.actions.startInvestigation(lead.id, selected));
                    }
                  }}
                >
                  Investigate with {selected.length} selected
                </Button>
              </div>
            ) : null
          ) : (
            <>
              <ProgressBar
                size="row"
                model={progressBar(
                  lead,
                  investigation.progress,
                  investigation.projectedProgressGain,
                  props.snapshot.gameData?.investigationParameters.assessmentThresholdPct ?? 0,
                )}
              />
              <div className="small" data-testid={`progress-${lead.id}`}>
                progress {progressPoints(investigation.progress)} of {requiredText(lead)}
                {investigation.projectedProgressGain === null
                  ? ''
                  : `; +${progressPoints(investigation.projectedProgressGain)} next Advance turn`}
                {investigation.assessed ? ' (assessed)' : ''}
              </div>
              <p className="small">
                Team:{' '}
                {investigation.currentTeam
                  .map(
                    (member) => `${member.agent}${member.agentStatus === 'InTransit' ? ' (in transit)' : ''}`,
                  )
                  .join(', ') || 'nobody'}
              </p>
              <div className="card-actions">
                <Button
                  testId={`join-${lead.id}`}
                  disabledReason={
                    locked ??
                    none ??
                    (actions?.assignAgentsToInvestigation.includes(investigation.id) === true
                      ? null
                      : 'This Investigation accepts no Agents now.')
                  }
                  onClick={() => {
                    if (confirmInterruption(state, selected)) {
                      act(() => player.actions.assignAgentsToInvestigation(investigation.id, selected));
                    }
                  }}
                >
                  Add {selected.length} selected
                </Button>
              </div>
            </>
          )}
        </article>
        {children.length === 0 ? null : (
          <ul className="tree">{children.map((child) => node(child, depth + 1, [...trail, lead.id]))}</ul>
        )}
      </li>
    );
  };

  // Only discovered Leads are listed. A Lead is a root when no listed Lead creates a MissionSiteArchetype it requires,
  // e.g. a Lead discovered by a Won Response Mission.
  const roots = state.leads.filter(
    (lead) =>
      !lead.requires.some((required) =>
        state.leads.some((other) => other.createsMissionSite === required.missionWon),
      ),
  );
  return (
    <ul className="tree" data-testid="leads-tree">
      {roots.map((lead) => node(lead, 0, []))}
    </ul>
  );
}
