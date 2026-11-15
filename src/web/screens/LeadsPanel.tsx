/** The Leads tree: each Lead under the Leads it requires, with its Investigation and what blocks it. */
import type { CurrentStateView, LeadView } from '../../engine/index.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Badge, Button, Meter, percent } from '../ui.tsx';

function blockers(lead: LeadView): string[] {
  const texts: string[] = [];
  if (!lead.conditions.prerequisitesHold) {
    const missing = lead.requires.filter((item) => !item.holds).map((item) => item.lead);
    texts.push(`needs a won Mission from: ${missing.join(', ')}`);
  }
  if (!lead.conditions.noWinRecorded) {
    texts.push('its Mission is already won');
  }
  if (!lead.conditions.noMissionSiteInProgress) {
    texts.push('its Mission site is in progress');
  }
  if (!lead.conditions.factionNotDefeated) {
    texts.push('its Faction is defeated');
  }
  return texts;
}

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
      : state.leads.filter((item) => item.requires.some((required) => required.lead === lead.id));
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
            <Badge>difficulty {lead.difficulty}</Badge>
            {lead.recordedWins.length > 0 ? <Badge tone="good">Mission won</Badge> : null}
            {investigation !== undefined ? (
              <Badge tone="accent">Investigating</Badge>
            ) : lead.available ? (
              <Badge tone="good">Available</Badge>
            ) : (
              <Badge tone="muted">Not available</Badge>
            )}
          </header>
          <p className="muted small">{lead.description}</p>
          <p className="small">
            Completing it creates the Mission site: {siteName(lead.createsMissionSite)}.
          </p>
          {!lead.available && investigation === undefined ? (
            <p className="small muted">Not available because {blockers(lead).join('; ')}.</p>
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
                    act(() => player.actions.startInvestigation(lead.id, selected));
                  }}
                >
                  Investigate with {selected.length} selected
                </Button>
              </div>
            ) : null
          ) : (
            <>
              <div className="with-meter wide">
                <Meter value={investigation.progress} max={investigation.progressForCertainCompletion} />
                progress {investigation.progress} of {investigation.progressForCertainCompletion}
                {investigation.projectedCompletionProbability === null
                  ? ''
                  : `; ${percent(investigation.projectedCompletionProbability)} to complete this Turn`}
              </div>
              <p className="small">
                Team:{' '}
                {investigation.currentTeam
                  .map(
                    (member) => `${member.agent}${member.taskPhase === 'InTransit' ? ' (in transit)' : ''}`,
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
                    act(() => player.actions.assignAgentsToInvestigation(investigation.id, selected));
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

  const roots = state.leads.filter((lead) => lead.requires.length === 0);
  return (
    <ul className="tree" data-testid="leads-tree">
      {roots.map((lead) => node(lead, 0, []))}
    </ul>
  );
}
