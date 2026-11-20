/**
 * MVIEW: the Missions View. Three panes read left to right as the Player decides: which Mission site, what is there,
 * and who goes.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type {
  ConsequenceView,
  CurrentLiveWorldStateView,
  HistoryEntry,
  MissionSiteView,
} from '../../engine/index.ts';
import { Consequences } from '../consequences.tsx';
import { enemyLabels } from '../enemy-labels.ts';
import { decimalText, wholeText } from '../format.ts';
import {
  appliedConsequence,
  conditionText,
  finalState,
  historyMission,
  participantRowClass,
  toneClass,
  type HistoryMission,
} from '../mission-outcome.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { TIRED_DEPLOYMENT_EXHAUSTION, confirmTiredDeployment } from '../tired-deployment.ts';
import { Exhaustion, exhaustionLevels } from '../condition.tsx';
import { DEPLOY_NUMERIC, deployRows, type DeployKey } from '../deploy-table.ts';
import { useRowSelection } from '../row-selection.ts';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { pressHeader, type SortTier } from '../table-sort.ts';
import { Button, Grid, SortMark, ariaSort } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';
import { assignmentText } from './AgentsView.tsx';

/**
 * MVIEW, Selected Mission site: each change written as what it does, e.g. "+60 money", "Panic −0.50", "Red Dawn
 * Eliminated", or "Campaign lost"; Panic with two decimals under GUI, Decimal quantities shown.
 */
export function consequenceParts(c: ConsequenceView, factionName: string): string[] {
  const parts: string[] = [];
  if (c.money !== 0) {
    parts.push(`${c.money > 0 ? '+' : '−'}${Math.abs(c.money)} money`);
  }
  if (c.fundingChange !== 0) {
    parts.push(`${c.fundingChange > 0 ? '+' : '−'}${Math.abs(c.fundingChange)} funding`);
  }
  if (c.panicReductionHundredths !== 0) {
    parts.push(`Panic −${decimalText(c.panicReductionHundredths)}`);
  }
  if (c.panicIncreaseHundredths !== 0) {
    parts.push(`Panic +${decimalText(c.panicIncreaseHundredths)}`);
  }
  if (c.eliminatesTargetFaction) {
    parts.push(`${factionName} Eliminated`);
  }
  if (c.defeat) {
    parts.push('Campaign lost');
  }
  return parts;
}

type ListItem = { readonly site: MissionSiteView; readonly detail: ReactNode; readonly tone?: string };

/**
 * MVIEW, Combat ratings: the one style the Combat ratings share, so that each stands out from the figures around it:
 * the Label "Combat rating" followed by the value in the Figure style and Accent text; a Concluded Mission site's at
 * Combat start and at Combat end, e.g. "240 → 0".
 */
function CombatRating(props: { value: number | string; testId: string }) {
  return (
    <span className="combat-rating" data-testid={props.testId}>
      <span className="label">Combat rating</span>
      <span className="figure tone-accent">{props.value}</span>
    </span>
  );
}

export function MissionsView(props: {
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  locked: string | null;
  initial: string | null;
  onClose: () => void;
}) {
  const { player } = theEngine();
  const { snapshot, state, locked } = props;
  // MVIEW, Mission site list: a Mission site selected from another view that is in a final state opens the View with
  // the toggle on Finished, so that the selected Mission site is in the list.
  const [showFinished, setShowFinished] = useState(
    () =>
      props.initial !== null &&
      (snapshot.retired?.missionSites.some((site) => site.id === props.initial) ?? false),
  );
  const [picked, setPicked] = useState<string | null>(props.initial);
  const [checked, setChecked] = useState<readonly string[]>([]);

  const factionName = (id: string) => state.factions.find((faction) => faction.id === id)?.name ?? id;
  const retired = snapshot.retired;
  const entries = snapshot.history?.entries ?? [];
  const active = state.missionSites
    .filter((site) => site.lifecycle === 'Active')
    .sort((a, b) => a.turnsUntilExpiration - b.turnsUntilExpiration);
  const deployed = state.missions
    .filter((mission) => mission.lifecycle === 'Deployed')
    .flatMap((mission) => {
      const site = state.missionSites.find((item) => item.id === mission.missionSite);
      return site === undefined
        ? []
        : [
            {
              site,
              detail: `${factionName(site.targetFaction)} · ${mission.teamSent.length} Agents`,
              tone: 'secondary',
            },
          ];
    });
  // MVIEW, Mission site list: each finished Mission site with its target Faction and the final state it reached.
  const finished: ListItem[] = [...(retired?.missionSites ?? [])].reverse().map((site) => {
    const reached = finalState(site.lifecycle, historyMission(entries, site.id));
    return {
      site,
      detail: (
        <>
          <span className="secondary">{factionName(site.targetFaction)} · </span>
          <span className={reached === null ? '' : toneClass(reached.tone)}>
            {reached?.text ?? site.lifecycle}
          </span>
        </>
      ),
    };
  });

  const everySite = [...state.missionSites, ...(retired?.missionSites ?? [])];
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
            data-sound="select"
            data-testid={`site-${item.site.id}`}
            onClick={() => {
              setPicked(item.site.id);
              setChecked([]);
            }}
          >
            {/* MVIEW, Mission site list: the Instance ID after the name, in Text muted. */}
            <span className="list-name">
              {item.site.name}
              <span className="list-id figure muted small">{item.site.id}</span>
            </span>
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
          data-sound="select"
          onClick={() => {
            setShowFinished((on) => !on);
            setPicked(null);
          }}
        >
          Finished {retired?.missionSites.length ?? 0}
        </button>
      }
      onClose={props.onClose}
    >
      <div className={selected?.lifecycle === 'Active' ? 'panes' : 'panes panes-two'}>
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
        {selected === null ? null : (
          <SiteDetails
            site={selected}
            snapshot={snapshot}
            state={state}
            entries={entries}
            factionName={factionName}
          />
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
  state: CurrentLiveWorldStateView;
  entries: readonly HistoryEntry[];
  factionName: (id: string) => string;
}) {
  const { player } = theEngine();
  const { site, snapshot, state, entries, factionName } = props;
  const target = factionName(site.targetFaction);
  const origin =
    site.origin.kind === 'Investigation'
      ? `Lead: ${snapshot.retired?.leads.find((lead) => lead.id === site.lead)?.name ?? site.lead ?? '-'}`
      : `Faction operation: ${site.operationLevel?.name ?? '-'}`;
  const mission = state.missions.find((item) => item.id === site.mission);
  const record = historyMission(entries, site.id);
  const reached = finalState(site.lifecycle, record);
  const won = consequenceParts(site.rewards, target);
  const lost = consequenceParts(site.penalties, target);
  const applied = reached === null ? null : appliedConsequence(entries, site.id, record);
  return (
    <div className="pane" data-testid={`site-details-${site.id}`}>
      <h4 className="pane-title">
        {site.name} <span className="figure muted small">{site.id}</span>
      </h4>
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
        ) : null}
        {/* MVIEW, Final state: a Concluded Mission site shows its Mission's outcome instead of "Concluded". */}
        <dt>State</dt>
        <dd className={reached === null ? '' : toneClass(reached.tone)} data-testid="site-state">
          {reached?.text ?? site.lifecycle}
        </dd>
      </dl>
      {site.lifecycle === 'Concluded' && record !== null ? (
        <Participants site={site} record={record} />
      ) : (
        /* MVIEW, Combat ratings: the Enemies' Combat rating sits on the line of the Enemies heading and ends at the
           right edge of the Enemies table. */
        <div className="enemies-block">
          <div className="sit-group-head pane-sub">
            <span className="label">Enemies</span>
            <CombatRating value={site.enemiesCombatRating} testId="enemies-combat-rating" />
          </div>
          <EnemiesTable site={site} />
        </div>
      )}
      <div className="label pane-sub">Consequences</div>
      {reached === null ? (
        <dl className="pairs">
          <dt>If won</dt>
          <dd className="tone-good">{won.length === 0 ? 'nothing' : won.join(', ')}</dd>
          <dt>If lost or expired</dt>
          <dd className="tone-bad">{lost.length === 0 ? 'nothing' : lost.join(', ')}</dd>
        </dl>
      ) : (
        /* MVIEW, Selected Mission site: once in a final state, only the Consequences that applied. */
        <div data-testid="applied-consequences">
          {applied === null || appliedNothing(applied) ? (
            <span className="muted">Applied: none</span>
          ) : (
            <Consequences consequence={applied} label="Applied" />
          )}
        </div>
      )}
      {site.lifecycle === 'Deployed' && mission !== undefined ? (
        <>
          <div className="label pane-sub">Mission</div>
          <dl className="pairs">
            <dt>Team sent</dt>
            <dd className="figure">{mission.teamSent.join(' · ')}</dd>
          </dl>
          {/* MVIEW, Selected Mission site: the Combat rating of a Deployed Mission's Current team. */}
          <div className="combat-rating-row">
            <CombatRating
              value={teamCombatRating(player, mission.currentTeam)}
              testId="current-team-combat-rating"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Whether a Consequence record changed nothing, e.g. a Lost Initiative Mission's. */
function appliedNothing(c: HistoryMission['consequence']): boolean {
  return (
    c.money === 0 &&
    c.fundingChange === 0 &&
    c.panicIncreaseHundredths === 0 &&
    c.panicReductionHundredths === 0 &&
    c.eliminatedFaction === null &&
    !c.defeat
  );
}

/**
 * MVIEW, Concluded Mission site: the Enemies and then the Agents of the Team sent, each participant's effective skill
 * and current health at Combat start and at Combat end and its final condition, from the History entry; each side's
 * Combat rating at Combat start and at Combat end on the line of its heading.
 */
function Participants(props: { site: MissionSiteView; record: HistoryMission }) {
  const { site, record } = props;
  const labels = enemyLabels(site.enemies);
  const side = (which: 'enemy' | 'agent') => {
    const rows = record.participants.filter((participant) => participant.side === which);
    const key = which === 'enemy' ? 'enemies' : 'agents';
    return (
      <div className="enemies-block" data-testid={`concluded-${key}`}>
        <div className="sit-group-head pane-sub">
          <span className="label">{which === 'enemy' ? 'Enemies' : 'Agents'}</span>
          <CombatRating
            value={`${record.ratingsStart[key]} → ${record.ratingsEnd[key]}`}
            testId={`concluded-${key}-combat-rating`}
          />
        </div>
        {/* VIS, Tables: Skill holds "1234 → 1234" and Health "123 → 123". */}
        <Grid widths={['150px', '120px', '150px', '136px']} className="compact">
          <thead>
            <tr>
              <th>{which === 'enemy' ? 'Enemy' : 'Agent'}</th>
              <th className="num">Skill</th>
              <th className="num">Health</th>
              <th>Condition</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((participant) => (
              <tr
                key={participant.id}
                className={participantRowClass(participant)}
                data-testid={`concluded-row-${participant.id}`}
              >
                <td className={which === 'agent' ? 'figure' : ''}>
                  {which === 'enemy' ? (labels.get(participant.id) ?? participant.id) : participant.id}
                </td>
                <td className="num">
                  {participant.startEffectiveSkill} → {participant.endEffectiveSkill}
                </td>
                <td className="num">
                  {wholeText(participant.startHealthHundredths)} →{' '}
                  {wholeText(participant.endHealthHundredths)}
                </td>
                <td>{conditionText(participant)}</td>
              </tr>
            ))}
          </tbody>
        </Grid>
      </div>
    );
  };
  return (
    <>
      {side('enemy')}
      {side('agent')}
    </>
  );
}

/** The Combat rating of Agents taken as one side, as the engine computes it. */
function teamCombatRating(player: ReturnType<typeof theEngine>['player'], agents: readonly string[]): number {
  if (agents.length === 0) {
    return 0;
  }
  const preview = player.queries.previewDeployment(null, agents);
  return preview.ok ? preview.value.teamCombatRating : 0;
}

function EnemiesTable(props: { site: MissionSiteView }) {
  const { site } = props;
  return (
    <Grid widths={['180px', '76px', '88px', '88px']} className="compact">
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
    </Grid>
  );
}

function Deployment(props: {
  site: MissionSiteView;
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  locked: string | null;
  checked: readonly string[];
  onCheck: (ids: readonly string[]) => void;
  onDeploy: (team: readonly string[]) => void;
}) {
  const { player } = theEngine();
  const { site, snapshot, state, checked, onCheck } = props;
  // MVIEW, Deployment: the Agents that can be assigned and are on Standby or Training.
  const candidates = state.agents.filter(
    (agent) =>
      agent.canBeAssigned &&
      // MISSION, Deploying Agents: an Agent In transit can be assigned but not deployed.
      agent.agentStatus === 'AtAssignment' &&
      (agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training'),
  );
  // MVIEW, Deployment: sorting reorders the rows only; `checked` keeps the order in which the Agents were checked.
  const team = checked.filter((id) => candidates.some((agent) => agent.id === id));
  // VIS, Tables: up to four sort tiers over the default order, by Instance ID.
  const [tiers, setTiers] = useState<SortTier<DeployKey>[]>([]);
  const rows = deployRows(candidates, tiers, (agent) => assignmentText(agent, state));
  const candidateIds = rows.map((agent) => agent.id);
  // VIS, Tables: Select all checks every row, follows the shown rows while on, and is cleared by any row change.
  const [selectAll, setSelectAll] = useState(false);
  const candidateKey = [...candidateIds].sort().join(',');
  useEffect(() => {
    if (selectAll && (team.length !== candidateIds.length || candidateIds.some((id) => !team.includes(id)))) {
      onCheck([...team, ...candidateIds.filter((id) => !team.includes(id))]);
    }
    // The candidate set is named by its key.
  }, [candidateKey, selectAll]);
  const selection = useRowSelection({
    order: candidateIds,
    selected: team,
    selectable: () => true,
    onChange: (ids) => {
      setSelectAll(false);
      onCheck(ids);
    },
  });
  const header = (key: DeployKey, label: string) => {
    const numeric = DEPLOY_NUMERIC.has(key);
    return (
      <th
        className={numeric ? 'sortable num' : 'sortable'}
        aria-sort={ariaSort(tiers, key)}
        data-testid={`deploy-sort-${key}`}
        onClick={() => {
          setTiers(pressHeader(tiers, key, numeric));
        }}
      >
        {label}
        <SortMark tiers={tiers} column={key} />
      </th>
    );
  };
  const taken = state.agency.deployedAgents + team.length;
  const over = taken > state.agency.transportCap;
  const preview = team.length === 0 ? null : player.queries.previewDeployment(site.id, team);
  const refused = preview !== null && preview.ok && !preview.value.accepted ? preview.value.message : null;
  return (
    <div className="pane" data-testid="deployment">
      <div className="sit-group-head">
        <span className="label">Deploy</span>
      </div>
      {/* MVIEW, Deployment: the Transport cap places taken and, after it on the same line, the Combat rating of the
          checked Agents taken as one side, 0 while none is checked. */}
      <div className="deploy-figures">
        <span className={`figure${over ? ' tone-bad' : ' secondary'}`} data-testid="transport">
          Transport {taken} / {state.agency.transportCap}
        </span>
        <CombatRating
          value={preview !== null && preview.ok ? preview.value.teamCombatRating : 0}
          testId="team-combat-rating"
        />
      </div>
      {candidates.length === 0 ? (
        <p className="muted small">No Agent on Standby or in Training can be deployed now.</p>
      ) : (
        <Grid
          widths={['36px', '110px', '220px', '96px', '112px']}
          className="compact pick-grid"
          testId="deploy-grid"
        >
          <thead>
            <tr>
              <th className="check">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  data-testid="deploy-select-all"
                  checked={selectAll}
                  onChange={() => {
                    // SOUNDS, Select click: checking or unchecking Select all.
                    playSound(SOUND.select);
                    if (selectAll) {
                      setSelectAll(false);
                      onCheck([]);
                    } else {
                      setSelectAll(true);
                      onCheck([...team, ...candidateIds.filter((id) => !team.includes(id))]);
                    }
                  }}
                />
              </th>
              {header('id', 'Agent')}
              {header('assignment', 'Assignment')}
              {header('effectiveSkill', 'Effective')}
              {header('exhaustion', 'Exhaustion')}
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
                      aria-label={`Deploy ${agent.id}`}
                      data-testid={`deploy-pick-${agent.id}`}
                      {...selection.checkbox(agent.id)}
                    />
                  </td>
                  <td className="figure">{agent.id}</td>
                  <td className="secondary">{assignmentText(agent, state)}</td>
                  <td className="num">{agent.effectiveSkill}</td>
                  <td className="num">
                    {/* MVIEW, Deployment: a tired Agent shows its exhaustion, coloured under VIS, Agent condition. */}
                    {agent.exhaustion >= TIRED_DEPLOYMENT_EXHAUSTION ? (
                      <Exhaustion value={agent.exhaustion} levels={exhaustionLevels(snapshot.gameData)} />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Grid>
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
