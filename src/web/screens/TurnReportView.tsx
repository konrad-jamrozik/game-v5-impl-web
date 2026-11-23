/**
 * TRVIEW: the Turn Report View. It shows exactly what the Turn report of the most recent committed Advance turn
 * holds, in four sections, with each Combat report one step away.
 */
import type { ReactNode } from 'react';
import type {
  CombatReport,
  CurrentLiveWorldStateView,
  MissionGrowthRecord,
  MissionSiteView,
  TurnReport,
} from '../../engine/index.ts';
import { armorText, combatLogRow, finalCondition } from '../combat-log.ts';
import { Consequences } from '../consequences.tsx';
import { enemyLabels } from '../enemy-labels.ts';
import { hitChanceText, progressGain, progressPoints, wholeText } from '../format.ts';
import { Exhaustion, exhaustionLevels, healthColor, type ExhaustionLevels } from '../condition.tsx';
import { usePlace, usePlaceName, usePlaceState } from '../place.tsx';
import type { Snapshot } from '../store.ts';
import { turnSummaryHasContent } from '../turn-summary.ts';
import { backLabel, turnSummaryPlace } from '../view-trail.ts';
import { Button, Grid } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

/**
 * Where following an item leads: from the Turn report, the History View, an Agent's Participation history, or a
 * Concluded Mission site's Agent.
 */
export type ReportTarget =
  | { readonly kind: 'missionSite'; readonly missionSite: string }
  | { readonly kind: 'lead'; readonly lead: string }
  /** MVIEW, Concluded Mission site: an Agent's details in the Agents View. */
  | { readonly kind: 'agent'; readonly agent: string };

function Section(props: { title: string; count: number; testId: string; children: ReactNode }) {
  return props.count === 0 ? null : (
    <section className="report-section" data-testid={props.testId}>
      <div className="sit-group-head">
        <span className="label">{props.title}</span>
        <span className="figure tone-accent">{props.count}</span>
      </div>
      {props.children}
    </section>
  );
}

export function TurnReportView(props: {
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  onOpen: (target: ReportTarget) => void;
  onOpenSummary: () => void;
  onClose: () => void;
}) {
  const { snapshot, state } = props;
  const report = snapshot.report;
  const place = usePlace();
  // CSCR, View trail: the Combat report shown one step away, and whether its Combat log is expanded, are part of the
  // place.
  const [combat, setCombat] = usePlaceState<string | null>('combat', null);
  const [logOpen, setLogOpen] = usePlaceState('logOpen', false);
  const shownCombat = report?.combatReports.find((item) => item.mission === combat);
  usePlaceName(shownCombat === undefined ? null : 'Combat report');
  // TRVIEW, Turn summary button: disabled, not hidden, when there is no Turn report or no group to show. While the
  // Back control returns to the Turn summary, the Back control stands in its place and the button is not shown.
  const backToSummary = place.back?.label === backLabel([turnSummaryPlace(null)]);
  const summaryButton = backToSummary ? undefined : (
    <Button
      testId="reopen-summary"
      disabledReason={
        report === null
          ? 'There is no Turn report yet.'
          : turnSummaryHasContent(report)
            ? null
            : 'This Turn report has nothing for the Turn summary.'
      }
      onClick={props.onOpenSummary}
    >
      Turn summary
    </Button>
  );
  if (report === null) {
    return (
      <DetailView
        id="report"
        title="Turn report"
        lead={summaryButton}
        backInLead={backToSummary}
        onClose={props.onClose}
      >
        <p className="muted" data-testid="turn-report">
          There is no Turn report yet. Advance the turn to get the first one.
        </p>
      </DetailView>
    );
  }
  const heading = `Turn ${report.turn} ended · Turn ${report.turn + 1} began`;
  if (shownCombat !== undefined) {
    const mission = report.missions.find((item) => item.mission === shownCombat.mission);
    const site = [...state.missionSites, ...(snapshot.retired?.missionSites ?? [])].find(
      (item) => item.id === mission?.missionSite,
    );
    const siteName = site?.name ?? mission?.missionSite;
    // GUI, Enemy labels: each Enemy by its Enemy label, each Agent by its Instance ID.
    const labels = enemyLabels(site?.enemies ?? []);
    return (
      <DetailView
        id="report"
        title="Combat report"
        aside={
          <>
            {siteName}
            {mission === undefined ? null : (
              <>
                {' · '}
                <span className={mission.result === 'Won' ? 'tone-good' : 'tone-bad'}>{mission.result}</span>
              </>
            )}
            {/* TRVIEW, Sections: the Combat outcome only of a Lost Mission, as a Won one's is Won too. */}
            {`${mission?.result === 'Won' ? '' : ` · ${shownCombat.outcome}`} in ${shownCombat.rounds} ${shownCombat.rounds === 1 ? 'round' : 'rounds'}`}
          </>
        }
        onClose={props.onClose}
      >
        <CombatReportDetails
          combat={shownCombat}
          growth={mission?.growth ?? []}
          nameOf={(id) => labels.get(id) ?? id}
          levels={exhaustionLevels(snapshot.gameData)}
          logOpen={logOpen}
          onToggleLog={setLogOpen}
        />
      </DetailView>
    );
  }
  return (
    <DetailView
      id="report"
      title="Turn report"
      aside={heading}
      // TRVIEW, Turn summary button: right after the Turn the report covers; "‹ Turn summary" stands in its place.
      lead={summaryButton}
      backInLead={backToSummary}
      onClose={props.onClose}
    >
      <div className="stack" data-testid="turn-report">
        {report.ending === null ? null : (
          <p className={report.ending.ending === 'Victory' ? 'tone-good' : 'tone-bad'}>
            Campaign ending: {report.ending.ending}
          </p>
        )}
        <Sections
          report={report}
          snapshot={snapshot}
          state={state}
          onOpen={props.onOpen}
          onCombat={(mission) => {
            // TRVIEW, Combat report: it opens one step away as a Follow.
            place.follow();
            setLogOpen(false);
            setCombat(mission);
          }}
        />
      </div>
    </DetailView>
  );
}

function Sections(props: {
  report: TurnReport;
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  onOpen: (target: ReportTarget) => void;
  onCombat: (mission: string) => void;
}) {
  const { report, snapshot, state, onOpen } = props;
  const sites: readonly MissionSiteView[] = [
    ...state.missionSites,
    ...(snapshot.retired?.missionSites ?? []),
  ];
  const site = (id: string) => sites.find((item) => item.id === id);
  const archetypeName = (archetype: string) =>
    snapshot.gameData?.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;
  const leadName = (lead: string) => snapshot.retired?.leads.find((item) => item.id === lead)?.name ?? lead;
  const factionName = (faction: string) =>
    state.factions.find((item) => item.id === faction)?.name ?? faction;
  const siteRow = (id: string, what: ReactNode) => (
    <button
      key={id}
      type="button"
      className="list-row"
      onClick={() => {
        onOpen({ kind: 'missionSite', missionSite: id });
      }}
    >
      {/* TRVIEW, Sections, Mission sites: the name, the Instance ID in Text muted, and the target Faction. */}
      <span className="list-name">
        {site(id)?.name ?? id} <span className="figure muted small">{id}</span>{' '}
        <span className="secondary small">· {factionName(site(id)?.targetFaction ?? '')}</span>
      </span>
      <span className="list-value">{what}</span>
    </button>
  );
  const siteCount =
    report.createdMissionSites.length +
    report.expiredMissionSites.length +
    report.cancelledMissionSites.length;
  if (
    report.missions.length +
      report.investigationsCompleted.length +
      siteCount +
      report.discoveredLeads.length +
      report.investigationsInterrupted.length ===
    0
  ) {
    return (
      <p className="muted">
        No Mission was fought, no Investigation completed, no Mission site changed, and no Lead was
        discovered.
      </p>
    );
  }

  return (
    <>
      <Section title="Missions" count={report.missions.length} testId="report-missions">
        <Grid widths={['200px', '200px', '96px', '170px', '208px', '120px', '150px']}>
          <tbody>
            {report.missions.map((mission) => {
              const combat = report.combatReports.find((item) => item.mission === mission.mission);
              const enemies = combat?.participants.filter((who) => who.side === 'enemy') ?? [];
              const dead = enemies.filter((who) => who.final.condition === 'dead').length;
              // TRVIEW, Missions: the sum of the Mission experience of the survivors, e.g. "+176 exp".
              const experience = mission.growth.reduce((sum, item) => sum + item.missionExperience, 0);
              return (
                <tr key={mission.mission}>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        onOpen({ kind: 'missionSite', missionSite: mission.missionSite });
                      }}
                    >
                      {archetypeName(mission.missionSiteArchetype)}
                    </button>
                  </td>
                  <td className={mission.result === 'Won' ? 'tone-good' : 'tone-bad'}>
                    {mission.result}
                    {/* TRVIEW, Sections: the Combat outcome only of a Lost Mission, e.g. "Lost · Wiped". */}
                    {combat === undefined
                      ? ''
                      : `${mission.result === 'Won' ? '' : ` · ${combat.outcome}`} in ${combat.rounds} rounds`}
                  </td>
                  <td className="num">{combat?.agents.length ?? '-'} Agents</td>
                  <td className={mission.killed.length > 0 ? 'tone-bad' : 'muted'}>
                    {mission.killed.length === 0 ? 'none killed' : `Killed ${mission.killed.join(', ')}`}
                  </td>
                  <td className="num">
                    Enemies dead {dead} / {enemies.length}
                  </td>
                  <td className="num" data-testid={`exp-${mission.mission}`}>
                    +{experience} exp
                  </td>
                  <td>
                    {combat === undefined ? null : (
                      <button
                        type="button"
                        className="btn btn-plain"
                        data-testid={`combat-${mission.mission}`}
                        onClick={() => {
                          props.onCombat(mission.mission);
                        }}
                      >
                        Combat report
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Grid>
      </Section>

      <Section
        title="Investigations completed"
        count={report.investigationsCompleted.length}
        testId="report-investigations"
      >
        {report.investigationsCompleted.map((item) => {
          const step = report.investigations.find((one) => one.investigation === item.investigation);
          const lead = step?.lead ?? '';
          return (
            <button
              key={item.investigation}
              type="button"
              className="list-row"
              onClick={() => {
                onOpen({ kind: 'lead', lead });
              }}
            >
              <span className="list-name">{leadName(lead)}</span>
              <span className="list-value figure">
                <span className="tone-good">+{progressGain(item.gain)}</span> →{' '}
                {progressPoints(step?.progressAfter ?? 0)}
              </span>
            </button>
          );
        })}
      </Section>

      <Section title="Mission sites" count={siteCount} testId="report-sites">
        {report.createdMissionSites.map((id) =>
          siteRow(
            id,
            <span className="secondary">Created · {site(id)?.turnsUntilExpiration ?? '-'} T to expire</span>,
          ),
        )}
        {report.expiredMissionSites.map((item) =>
          siteRow(
            item.missionSite,
            <span>
              <span className="tone-accent">Expired</span> <Consequences consequence={item.consequence} />
            </span>,
          ),
        )}
        {report.cancelledMissionSites.map((id) => siteRow(id, <span className="muted">Cancelled</span>))}
      </Section>

      <Section title="Leads discovered" count={report.discoveredLeads.length} testId="discovered-leads">
        {report.discoveredLeads.map((lead) => (
          <button
            key={lead}
            type="button"
            className="list-row"
            onClick={() => {
              onOpen({ kind: 'lead', lead });
            }}
          >
            <span className="list-name">{leadName(lead)}</span>
          </button>
        ))}
      </Section>

      {/* TRVIEW, Sections: Investigations interrupted, left out when there is none. */}
      {report.investigationsInterrupted.length === 0 ? null : (
        <Section
          title="Investigations interrupted"
          count={report.investigationsInterrupted.length}
          testId="interrupted-investigations"
        >
          {report.investigationsInterrupted.map((item) => (
            <button
              key={item.investigation}
              type="button"
              className="list-row"
              onClick={() => {
                onOpen({ kind: 'lead', lead: item.lead });
              }}
            >
              <span className="list-name">{leadName(item.lead)}</span>
              <span className="list-value muted">Abandoned</span>
            </button>
          ))}
        </Section>
      )}
    </>
  );
}

/**
 * VIS, Tables: the fixed widths of the participants table, the Combat log, and the Combat ratings table, each column
 * wide enough for the widest value of its quantity, e.g. "1234 → 1234" in Eff. skill, "123 → 123/123" in Health,
 * "123 → 123" in Armor, and "99.9% (1234 vs 1234)" in Hit chance.
 */
const PARTICIPANT_WIDTHS = [
  '112px',
  '92px',
  '120px',
  '140px',
  '104px',
  '104px',
  '72px',
  '64px',
  '64px',
  '72px',
  '128px',
];
const LOG_WIDTHS = ['72px', '120px', '120px', '184px', '300px'];

/**
 * TRVIEW, Combat report: the Exp of one participant. A survivor shows its Mission experience as one total in Positive,
 * e.g. "+43", never split into its parts; a Killed Agent its combat experience struck through in Text muted, because it
 * was never added; an Enemy nothing.
 */
function Experience(props: {
  who: CombatReport['participants'][number];
  growth: readonly MissionGrowthRecord[];
}) {
  const { who } = props;
  if (who.side !== 'agent' || who.combatExperience === null) {
    return null;
  }
  const gained = props.growth.find((item) => item.agent === who.id);
  if (gained === undefined) {
    return <s className="muted">+{who.combatExperience}</s>;
  }
  return <span className="tone-good">+{gained.missionExperience}</span>;
}

function CombatReportDetails(props: {
  combat: CombatReport;
  /** The Mission growth of this Combat's Mission, from the Turn report. */
  growth: readonly MissionGrowthRecord[];
  /** How the participants table and the Combat log name a participant: an Agent by Instance ID, an Enemy by Enemy label. */
  nameOf: (id: string) => string;
  levels: ExhaustionLevels;
  logOpen: boolean;
  onToggleLog: (open: boolean) => void;
}) {
  const { combat } = props;
  const sideOf = (id: string) => combat.participants.find((who) => who.id === id)?.side ?? 'enemy';
  const group = (side: 'agent' | 'enemy') => combat.participants.filter((who) => who.side === side);
  const rounds = combat.ratings.map((rating) => rating.round);
  return (
    <div className="stack" data-testid="combat-report">
      <section className="pane">
        <div className="pane-head">
          <h3 className="pane-title">Participants</h3>
          <span className="muted">start → final</span>
        </div>
        <Grid widths={PARTICIPANT_WIDTHS} testId="combat-participants">
          <thead>
            <tr>
              <th>Participant</th>
              <th className="num">Base skill</th>
              <th className="num">Eff. skill</th>
              <th className="num">Health</th>
              <th className="num">Armor</th>
              <th className="num">Exhaustion</th>
              <th className="num">Damage</th>
              <th className="num">Dealt</th>
              <th className="num">Taken</th>
              {/* The header says "Exp" alone, because the "+" of each value already says that it was gained. */}
              <th className="num">Exp</th>
              <th>Condition</th>
            </tr>
          </thead>
          {(['agent', 'enemy'] as const).map((side) => (
            <tbody key={side}>
              <tr className="group-row">
                <th scope="rowgroup" colSpan={PARTICIPANT_WIDTHS.length} className="label">
                  {side === 'agent' ? 'Agents' : 'Enemies'}
                </th>
              </tr>
              {group(side).map((who) => {
                // TRVIEW, Combat report: the participant's name and its final condition are in Danger when it is dead
                // and in Warning when it is Incapacitated, on both sides alike; its other values keep their colours.
                const condition = finalCondition(who.side, who.final.condition);
                return (
                  <tr key={who.id} data-testid={`participant-${who.id}`}>
                    <th scope="row" className={condition.tone ?? undefined}>
                      {props.nameOf(who.id)}
                    </th>
                    <td className="num">{wholeText(who.start.skillHundredths)}</td>
                    <td className="num">
                      {who.start.effectiveSkill} → {who.final.effectiveSkill}
                    </td>
                    <td className="num">
                      {wholeText(who.start.currentHealthHundredths)} →{' '}
                      {/* VIS, Agent condition: an Agent's values take their condition colours; an Enemy's do not. */}
                      {who.side === 'agent' ? (
                        <span
                          style={{
                            color: healthColor(who.final.currentHealthHundredths / 100, who.start.maxHealth),
                          }}
                        >
                          {wholeText(who.final.currentHealthHundredths)}
                        </span>
                      ) : (
                        wholeText(who.final.currentHealthHundredths)
                      )}
                      /{who.start.maxHealth}
                    </td>
                    <td className="num" data-testid={`armor-${who.id}`}>
                      {armorText(who)}
                    </td>
                    <td className="num">
                      {who.start.exhaustion} →{' '}
                      {who.side === 'agent' ? (
                        <Exhaustion value={who.final.exhaustion} levels={props.levels} />
                      ) : (
                        who.final.exhaustion
                      )}
                    </td>
                    <td className="num">{who.start.weaponDamage}</td>
                    {/* GUI, Decimal quantities shown: health removed from an Agent, a Decimal quantity, rounds down. */}
                    <td className="num">{wholeText(who.damageDealtHundredths)}</td>
                    <td className="num">{wholeText(who.damageTakenHundredths)}</td>
                    <td className="num" data-testid={`exp-${who.id}`}>
                      <Experience who={who} growth={props.growth} />
                    </td>
                    <td className={condition.tone ?? undefined} data-testid={`condition-${who.id}`}>
                      {condition.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </Grid>
      </section>
      <section className="pane">
        <h3 className="pane-title">Combat ratings</h3>
        <Grid widths={['120px', ...rounds.map(() => '96px')]} testId="combat-ratings">
          <thead>
            <tr>
              <th>Side</th>
              {rounds.map((round) => (
                <th key={round} className="num">
                  {round === 0 ? 'Start' : `Round ${round}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['agents', 'enemies'] as const).map((side) => (
              <tr key={side}>
                <th scope="row">{side === 'agents' ? 'Agents' : 'Enemies'}</th>
                {combat.ratings.map((rating) => (
                  <td key={rating.round} className="num">
                    {rating[side]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Grid>
      </section>
      <section className="pane">
        <details
          open={props.logOpen}
          onToggle={(event) => {
            props.onToggleLog(event.currentTarget.open);
          }}
        >
          {/* The toggle names the Combat log and, after a space, the number of its attacks in Text muted. */}
          <summary data-testid="combat-log-toggle">
            Combat log{' '}
            <span className="muted">
              ({combat.log.length} {combat.log.length === 1 ? 'attack' : 'attacks'})
            </span>
          </summary>
          <Grid widths={LOG_WIDTHS} className="log" testId="combat-log">
            <thead>
              <tr>
                <th className="num">Round</th>
                <th>Attacker</th>
                <th>Defender</th>
                <th className="num">Hit chance</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {combat.log.map((attack, index) => {
                // TRVIEW, Combat log colours: the row by the attacker's side, the outcome by whom it favours.
                const row = combatLogRow(attack, sideOf);
                return (
                  <tr key={index} className={`log-${row.tint}`} data-testid={`combat-log-row-${index}`}>
                    <td className="num">{attack.round}</td>
                    <td>{props.nameOf(attack.attacker)}</td>
                    <td>{props.nameOf(attack.defender)}</td>
                    <td className="num">
                      {hitChanceText(attack.hitChance)} ({attack.a} vs {attack.d})
                    </td>
                    <td className={`log-outcome ${row.tone === 'muted' ? 'muted' : `tone-${row.tone}`}`}>
                      {row.outcome}
                      {row.decisive === null ? null : (
                        <>
                          , <strong>{row.decisive}</strong>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Grid>
        </details>
      </section>
    </div>
  );
}
