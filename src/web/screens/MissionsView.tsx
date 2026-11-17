/**
 * MVIEW: the Missions View. Three panes read left to right as the Player decides: which Mission site, what is there,
 * and who goes.
 */
import { useState } from 'react';
import type { ConsequenceView, CurrentStateView, MissionSiteView } from '../../engine/index.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { TIRED_DEPLOYMENT_EXHAUSTION, confirmTiredDeployment } from '../tired-deployment.ts';
import { Button } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';
import { assignmentText } from './AgentsView.tsx';

/** MVIEW, Selected Mission site: each change written as what it does, e.g. "+60 money" or "Panic −5". */
export function consequenceParts(c: ConsequenceView, factionName: string): string[] {
  const parts: string[] = [];
  if (c.money !== 0) {
    parts.push(`${c.money > 0 ? '+' : '−'}${Math.abs(c.money)} money`);
  }
  if (c.fundingChange !== 0) {
    parts.push(`${c.fundingChange > 0 ? '+' : '−'}${Math.abs(c.fundingChange)} funding`);
  }
  if (c.panicReduction !== 0) {
    parts.push(`Panic −${c.panicReduction}`);
  }
  if (c.panicIncrease !== 0) {
    parts.push(`Panic +${c.panicIncrease}`);
  }
  if (c.eliminatesTargetFaction) {
    parts.push(`${factionName} Eliminated`);
  }
  return parts;
}

type ListItem = { readonly site: MissionSiteView; readonly detail: string; readonly tone?: string };

export function MissionsView(props: {
  snapshot: Snapshot;
  state: CurrentStateView;
  locked: string | null;
  initial: string | null;
  onClose: () => void;
}) {
  const { player } = theEngine();
  const { snapshot, state, locked } = props;
  const [showFinished, setShowFinished] = useState(false);
  const [picked, setPicked] = useState<string | null>(props.initial);
  const [checked, setChecked] = useState<readonly string[]>([]);

  const factionName = (id: string) => state.factions.find((faction) => faction.id === id)?.name ?? id;
  const retained = snapshot.history?.retained;
  const active = state.missionSites
    .filter((site) => site.lifecycle === 'Active')
    .sort((a, b) => a.turnsUntilExpiration - b.turnsUntilExpiration);
  const deployed = state.missions
    .filter((mission) => mission.lifecycle === 'Deployed')
    .flatMap((mission) => {
      const site = state.missionSites.find((item) => item.id === mission.missionSite);
      return site === undefined ? [] : [{ site, detail: `${mission.teamSent.length} Agents` }];
    });
  const finished: ListItem[] = [...(retained?.missionSites ?? [])].reverse().map((site) => {
    const mission = retained?.missions.find((item) => item.id === site.mission);
    if (site.lifecycle === 'Concluded' && mission !== undefined) {
      return {
        site,
        detail: `Concluded · ${mission.lifecycle}`,
        tone: mission.lifecycle === 'Won' ? 'tone-good' : 'tone-bad',
      };
    }
    return { site, detail: site.lifecycle, tone: site.lifecycle === 'Expired' ? 'tone-accent' : 'muted' };
  });

  const everySite = [...state.missionSites, ...(retained?.missionSites ?? [])];
  const selected =
    everySite.find((site) => site.id === picked) ?? (showFinished ? finished[0]?.site : active[0]) ?? null;

  const list = (title: string, items: readonly ListItem[], testId: string) =>
    items.length === 0 ? null : (
      <div className="list-group" data-testid={testId}>
        <div className="sit-group-head">
          <span className="label">{title}</span>
          <span className="figure tone-accent">{items.length}</span>
        </div>
        {items.map((item) => (
          <button
            key={`${testId}-${item.site.id}`}
            type="button"
            className={`list-row${selected?.id === item.site.id ? ' list-row-on' : ''}`}
            data-testid={`site-${item.site.id}`}
            onClick={() => {
              setPicked(item.site.id);
              setChecked([]);
            }}
          >
            <span className="list-name">{item.site.name}</span>
            <span className={`list-value ${item.tone ?? ''}`}>{item.detail}</span>
          </button>
        ))}
      </div>
    );

  return (
    <DetailView
      id="missions"
      title="Missions"
      aside={`${active.length} Active`}
      actions={
        <button
          type="button"
          className={showFinished ? 'chip chip-on' : 'chip'}
          data-testid="missions-finished"
          onClick={() => {
            setShowFinished((on) => !on);
            setPicked(null);
          }}
        >
          Finished {retained?.missionSites.length ?? 0}
        </button>
      }
      onClose={props.onClose}
    >
      <div className="panes">
        <div className="pane pane-list">
          {showFinished ? (
            finished.length === 0 ? (
              <p className="muted">No Mission site has reached a final state yet.</p>
            ) : (
              list('Finished', finished, 'missions-finished-list')
            )
          ) : active.length === 0 && deployed.length === 0 ? (
            <p className="muted">
              No Mission sites now. Completing the Investigation of a Lead creates one, and so does a Faction
              operation.
            </p>
          ) : (
            <>
              {list(
                'Active Mission sites',
                active.map((site) => ({
                  site,
                  detail: `${site.kind} · ${factionName(site.targetFaction)} · ${site.turnsUntilExpiration} T left`,
                  tone: site.turnsUntilExpiration <= 2 ? 'tone-accent' : 'secondary',
                })),
                'missions-active',
              )}
              {list('Deployed this Turn', deployed, 'missions-deployed')}
            </>
          )}
        </div>
        {selected === null ? (
          <div className="pane" />
        ) : (
          <SiteDetails site={selected} snapshot={snapshot} state={state} factionName={factionName} />
        )}
        {selected?.lifecycle === 'Active' ? (
          <Deployment
            key={selected.id}
            site={selected}
            snapshot={snapshot}
            state={state}
            locked={locked}
            checked={checked}
            onCheck={setChecked}
            onDeploy={(team) => {
              if (confirmTiredDeployment(state, team)) {
                act(() => player.actions.deployAgents(selected.id, team));
                setChecked([]);
              }
            }}
          />
        ) : null}
      </div>
    </DetailView>
  );
}

function SiteDetails(props: {
  site: MissionSiteView;
  snapshot: Snapshot;
  state: CurrentStateView;
  factionName: (id: string) => string;
}) {
  const { site, snapshot, state, factionName } = props;
  const target = factionName(site.targetFaction);
  const origin =
    site.origin.kind === 'Investigation'
      ? `Lead: ${state.leads.find((lead) => lead.id === site.lead)?.name ?? site.lead ?? '-'}`
      : `Faction operation: ${site.operationLevel?.name ?? '-'}`;
  const mission =
    state.missions.find((item) => item.id === site.mission) ??
    snapshot.history?.retained.missions.find((item) => item.id === site.mission);
  const won = consequenceParts(site.rewards, target);
  const lost = consequenceParts(site.penalties, target);
  return (
    <div className="pane" data-testid={`site-details-${site.id}`}>
      <h4 className="pane-title">{site.name}</h4>
      <dl className="pairs">
        <dt>Kind</dt>
        <dd>{site.kind}</dd>
        <dt>Origin</dt>
        <dd>{origin}</dd>
        <dt>Target</dt>
        <dd>{target}</dd>
        <dt>Turn created</dt>
        <dd className="figure">{site.turnCreated}</dd>
        {site.lifecycle === 'Active' ? (
          <>
            <dt>Expires in</dt>
            <dd className="figure">{site.turnsUntilExpiration} T</dd>
          </>
        ) : (
          <>
            <dt>State</dt>
            <dd>{site.lifecycle}</dd>
          </>
        )}
      </dl>
      <div className="sit-group-head pane-sub">
        <span className="label">Enemies</span>
        <span className="figure secondary">Combat rating {site.enemiesCombatRating}</span>
      </div>
      <table className="grid compact">
        <thead>
          <tr>
            <th>Enemy</th>
            <th className="num">Skill</th>
            <th className="num">Health</th>
            <th className="num">Damage</th>
          </tr>
        </thead>
        <tbody>
          {site.enemies.map((enemy) => (
            <tr key={enemy.id}>
              <td>{enemy.archetypeName}</td>
              <td className="num">{enemy.skill}</td>
              <td className="num">
                {enemy.currentHealth}/{enemy.baseHealth}
              </td>
              <td className="num">{enemy.weaponDamage}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="label pane-sub">Consequences</div>
      <dl className="pairs">
        <dt>If won</dt>
        <dd className="tone-good">{won.length === 0 ? 'nothing' : won.join(', ')}</dd>
        <dt>If lost or expired</dt>
        <dd className="tone-bad">{lost.length === 0 ? 'nothing' : lost.join(', ')}</dd>
      </dl>
      {site.lifecycle !== 'Active' && mission !== undefined ? (
        <>
          <div className="label pane-sub">Mission</div>
          <dl className="pairs">
            <dt>Team sent</dt>
            <dd className="figure">{mission.teamSent.join(' · ')}</dd>
            <dt>State</dt>
            <dd>{mission.lifecycle}</dd>
          </dl>
        </>
      ) : null}
    </div>
  );
}

function Deployment(props: {
  site: MissionSiteView;
  snapshot: Snapshot;
  state: CurrentStateView;
  locked: string | null;
  checked: readonly string[];
  onCheck: (ids: readonly string[]) => void;
  onDeploy: (team: readonly string[]) => void;
}) {
  const { player } = theEngine();
  const { site, state, checked, onCheck } = props;
  // MVIEW, Deployment: the Agents that can be assigned and are on Standby or Training.
  const candidates = state.agents.filter(
    (agent) =>
      agent.canBeAssigned && (agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training'),
  );
  const team = checked.filter((id) => candidates.some((agent) => agent.id === id));
  const taken = state.agency.deployedAgents + team.length;
  const over = taken > state.agency.transportCap;
  const preview = team.length === 0 ? null : player.queries.previewDeployment(site.id, team);
  const refused = preview !== null && preview.ok && !preview.value.accepted ? preview.value.message : null;
  return (
    <div className="pane" data-testid="deployment">
      <div className="sit-group-head">
        <span className="label">Deploy</span>
        <span className={`figure${over ? ' tone-bad' : ' secondary'}`} data-testid="transport">
          Transport {taken} / {state.agency.transportCap}
        </span>
      </div>
      {candidates.length === 0 ? (
        <p className="muted small">No Agent on Standby or in Training can be deployed now.</p>
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
                      aria-label={`Deploy ${agent.id}`}
                      data-testid={`deploy-pick-${agent.id}`}
                      checked={on}
                      onChange={() => {
                        onCheck(on ? team.filter((id) => id !== agent.id) : [...team, agent.id]);
                      }}
                    />
                  </td>
                  <td className="figure">{agent.id}</td>
                  <td className="secondary">{assignmentText(agent, state)}</td>
                  <td className="num">{agent.effectiveSkill}</td>
                  <td
                    className={`num${agent.exhaustion >= TIRED_DEPLOYMENT_EXHAUSTION ? ' tone-accent' : ' muted'}`}
                  >
                    {agent.exhaustion >= TIRED_DEPLOYMENT_EXHAUSTION ? `exh ${agent.exhaustion}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="pane-actions">
        <Button
          kind="primary"
          testId={`deploy-${site.id}`}
          disabledReason={
            props.locked ??
            (team.length === 0
              ? 'Check the Agents to deploy first.'
              : over
                ? 'The checked Agents would exceed the Transport cap.'
                : refused)
          }
          onClick={() => {
            props.onDeploy(team);
          }}
        >
          Deploy {team.length}
        </Button>
      </div>
    </div>
  );
}
