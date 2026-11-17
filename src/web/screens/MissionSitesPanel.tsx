/** Mission sites: what each offers and threatens, and deploying the selected Agents to one. */
import type { ConsequenceView, CurrentStateView, MissionSiteView } from '../../engine/index.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { confirmTiredDeployment } from '../tired-deployment.ts';
import { Badge, Button, signed } from '../ui.tsx';

function consequence(c: ConsequenceView, won: boolean): string {
  const parts: string[] = [];
  if (c.money !== 0) {
    parts.push(`money ${signed(c.money)}`);
  }
  if (c.fundingChange !== 0) {
    parts.push(`funding ${signed(c.fundingChange)}`);
  }
  if (c.panicReduction !== 0) {
    parts.push(`Panic −${c.panicReduction}`);
  }
  if (c.panicIncrease !== 0) {
    parts.push(`Panic +${c.panicIncrease}`);
  }
  if (c.eliminatesTargetFaction) {
    parts.push('eliminates the Faction');
  }
  return parts.length === 0 ? (won ? 'nothing' : 'no penalty') : parts.join(', ');
}

function enemySummary(site: MissionSiteView): string {
  const counts = new Map<string, number>();
  for (const enemy of site.enemies) {
    counts.set(enemy.archetypeName, (counts.get(enemy.archetypeName) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => `${count} × ${name}`).join(', ');
}

export function MissionSitesPanel(props: {
  snapshot: Snapshot;
  state: CurrentStateView;
  selected: readonly string[];
  locked: string | null;
}) {
  const { player } = theEngine();
  const { state, selected, locked } = props;
  const places = props.snapshot.actions?.deployAgents.transportPlacesLeft ?? 0;
  const factionName = (id: string) => state.factions.find((faction) => faction.id === id)?.name ?? id;

  if (state.missionSites.length === 0) {
    return (
      <p className="muted pad">
        No Mission sites now. Completing the Investigation of a Lead creates one, and so does a Faction
        operation.
      </p>
    );
  }
  return (
    <div className="cards">
      <p className="muted small">
        Transport places left this Turn: {places}. Select Agents in the grid, then deploy them to a Mission
        site; the Mission is fought when the Turn advances.
      </p>
      {state.missionSites.map((site) => {
        const preview = player.queries.previewDeployment(site.id, selected);
        const view = preview.ok ? preview.value : null;
        const mission = state.missions.find((item) => item.id === site.mission);
        const ahead =
          view !== null &&
          view.enemiesCombatRating !== null &&
          view.teamCombatRating > view.enemiesCombatRating;
        return (
          <article key={site.id} className="card" data-testid={`site-${site.id}`}>
            <header className="card-head">
              <h4>{site.name}</h4>
              <Badge tone={site.kind === 'Response' ? 'warn' : 'accent'}>{site.kind}</Badge>
              <Badge>{factionName(site.targetFaction)}</Badge>
              {site.lifecycle === 'Active' ? (
                <Badge tone={site.turnsUntilExpiration <= 1 ? 'bad' : 'muted'}>
                  expires in {site.turnsUntilExpiration} {site.turnsUntilExpiration === 1 ? 'turn' : 'turns'}
                </Badge>
              ) : (
                <Badge tone="good">Team deployed</Badge>
              )}
            </header>
            <dl className="pairs">
              <dt>Enemies</dt>
              <dd>
                {enemySummary(site)} (Combat rating {site.enemiesCombatRating})
              </dd>
              <dt>If won</dt>
              <dd>{consequence(site.rewards, true)}</dd>
              <dt>If lost or expired</dt>
              <dd>{consequence(site.penalties, false)}</dd>
              {mission === undefined ? null : (
                <>
                  <dt>Team</dt>
                  <dd>{mission.currentTeam.join(', ')}</dd>
                </>
              )}
            </dl>
            {site.lifecycle === 'Active' ? (
              <div className="card-actions">
                <Button
                  kind="primary"
                  testId={`deploy-${site.id}`}
                  disabledReason={
                    locked ??
                    (selected.length === 0
                      ? 'Select Agents first.'
                      : view === null
                        ? 'Unavailable.'
                        : view.accepted
                          ? null
                          : (view.message ?? 'Unavailable.'))
                  }
                  onClick={() => {
                    if (confirmTiredDeployment(state, selected)) {
                      act(() => player.actions.deployAgents(site.id, selected));
                    }
                  }}
                >
                  Deploy {selected.length} selected
                </Button>
                {view !== null && selected.length > 0 ? (
                  <span className={ahead ? 'good-text' : 'warning-text'} data-testid={`preview-${site.id}`}>
                    Team Combat rating {view.teamCombatRating} against {view.enemiesCombatRating ?? '-'}
                    {view.accepted ? '' : ` — ${view.message ?? ''}`}
                  </span>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
