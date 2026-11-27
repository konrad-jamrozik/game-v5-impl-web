/**
 * TRVIEW: the Turn Report View. It shows exactly what the Turn report of the most recent committed Advance turn
 * holds, in four sections, with each Combat report one step away.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  CombatReport,
  CurrentLiveWorldStateView,
  MissionGrowthRecord,
  MissionSiteView,
  TurnReport,
} from '../../engine/index.ts';
import { armorText, combatLogRow, finalCondition } from '../combat-log.ts';
import { buildReplay } from '../combat-replay.ts';
import { Consequences, GainLineText, toneClass } from '../consequences.tsx';
import { enemyLabels, shortEnemyLabels } from '../enemy-labels.ts';
import { groupDigits, hitChanceText, progressGain, progressPoints, wholeText } from '../format.ts';
import { Exhaustion, exhaustionLevels, healthColor, type ExhaustionLevels } from '../condition.tsx';
import {
  joinedLines,
  missionConsequenceLines,
  missionEquipment,
  missionSiteTitle,
  missionSiteTitleText,
  type EquipmentCatalog,
  type EquipmentList,
  type GainLine,
  type MissionSiteTitle,
} from '../mission-gains.ts';
import { MissionSiteTitleView } from '../mission-site-title.tsx';
import { usePlace, usePlaceName, usePlaceState } from '../place.tsx';
import type { Snapshot } from '../store.ts';
import { turnSummaryHasContent } from '../turn-summary.ts';
import { backLabel, turnSummaryPlace } from '../view-trail.ts';
import { Button, Grid } from '../ui.tsx';
import { CopySetupSeedButton } from '../copy-setup-seed.tsx';
import { CombatReplay } from './CombatReplay.tsx';
import { DetailView } from './DetailView.tsx';

/**
 * Where following an item leads: from the Turn report, the History View, an Agent's Participation history, or a
 * Concluded Mission site's Agent.
 */
export type ReportTarget =
  | { readonly kind: 'missionSite'; readonly missionSite: string }
  | { readonly kind: 'lead'; readonly lead: string }
  /** MVIEW, Concluded Mission site: an Agent's details in the Agents View. */
  | { readonly kind: 'agent'; readonly agent: string }
  /** TRVIEW, Sections, New acquisitions: the Storage View, where they can be bought. */
  | { readonly kind: 'storage' }
  /** MVIEW, Deployment: the Agents View. */
  | { readonly kind: 'agents' };

function Section(props: { title: string; count: number; testId: string; children: ReactNode }) {
  return props.count === 0 ? null : (
    <section className="report-section" data-testid={props.testId}>
      <div className="sit-group-head">
        <span className="label">{props.title}</span>
        <span className="figure tone-accent">{groupDigits(props.count)}</span>
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
  // CRPLAY, Visualize button: the Combat replay is shown in place of the content, one step away like the Combat report.
  const [replayShown, setReplayShown] = usePlaceState('replay', false);
  const shownCombat = report?.combatReports.find((item) => item.mission === combat);
  usePlaceName(shownCombat === undefined ? null : replayShown ? 'Combat replay' : 'Combat report');
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
  const heading = `Turn ${groupDigits(report.turn)} ended · Turn ${groupDigits(report.turn + 1)} began`;
  if (shownCombat !== undefined) {
    const mission = report.missions.find((item) => item.mission === shownCombat.mission);
    const site = [...state.missionSites, ...(snapshot.retired?.missionSites ?? [])].find(
      (item) => item.id === mission?.missionSite,
    );
    // GUI, Mission site titles: the Combat report names its Mission site by its title.
    const siteName =
      mission === undefined
        ? undefined
        : missionSiteTitleText(
            missionSiteTitle(
              mission.missionSite,
              site,
              {
                name:
                  snapshot.gameData?.missionSiteArchetypes.find(
                    (item) => item.id === mission.missionSiteArchetype,
                  )?.name ?? mission.missionSiteArchetype,
                kind: mission.kind,
              },
              (faction) => state.factions.find((item) => item.id === faction)?.name ?? faction,
            ),
          );
    // GUI, Enemy labels: each Enemy by its Enemy label, each Agent by its Instance ID.
    // GUI, Enemy labels: the short Enemy label only beside a figure of the Combat replay.
    const shortLabels = shortEnemyLabels(site?.enemies ?? []);
    const labels = enemyLabels(site?.enemies ?? []);
    const aside = (
      <>
        {siteName}
        {mission === undefined ? null : (
          <>
            {' · '}
            <span className={mission.result === 'Won' ? 'tone-good' : 'tone-bad'}>{mission.result}</span>
          </>
        )}
        {/* TRVIEW, Sections: the Combat outcome only of a Lost Mission, as a Won one's is Won too. */}
        {`${mission?.result === 'Won' ? '' : ` · ${shownCombat.outcome}`} in ${groupDigits(shownCombat.rounds)} ${shownCombat.rounds === 1 ? 'round' : 'rounds'}`}
      </>
    );
    // The same line as text, which the pointer resting on a line cut short shows in full.
    const asideText = [
      siteName ?? '',
      mission === undefined ? '' : ` · ${mission.result}`,
      mission?.result === 'Won' ? '' : ` · ${shownCombat.outcome}`,
      ` in ${groupDigits(shownCombat.rounds)} ${shownCombat.rounds === 1 ? 'round' : 'rounds'}`,
    ].join('');
    if (replayShown) {
      const gameData = snapshot.gameData;
      const enemyOf = (id: string) => site?.enemies.find((enemy) => enemy.id === id);
      const replay = buildReplay(shownCombat, {
        nameOf: (id) => shortLabels.get(id) ?? id,
        fullNameOf: (id) => labels.get(id) ?? id,
        // GUI, EnemyArchetype order: the authored order of the EnemyArchetypes, which the game data keeps.
        enemyOrder: (id) =>
          gameData?.enemyArchetypes.findIndex((archetype) => archetype.id === enemyOf(id)?.archetype) ?? -1,
        // A Combat report written before it held each Weapon: an Enemy's Weapon never changes, and an Agent's is the
        // one it is equipped with now.
        weaponOf: (id) =>
          enemyOf(id)?.weapon ??
          [...state.agents, ...(snapshot.retired?.agents ?? [])].find((agent) => agent.id === id)?.weapon ??
          null,
        shotOfWeapon: (weapon) => gameData?.weapons.find((item) => item.id === weapon)?.shot,
        fallbackWeapon: state.agency.equipment.fallbackWeapon,
        ranks: gameData?.ranks ?? [],
        seed: shownCombat.mission,
      });
      // CRPLAY, Whole screen: the Combat replay covers the status bar, the Side panel, and the Globe stage, and stays
      // a place of the View trail.
      return createPortal(
        <div className="replay-whole-screen">
          <DetailView
            id="report"
            title="Combat replay"
            aside={aside}
            asideText={asideText}
            // CRPLAY, Whole screen: a Combat report button opens this Combat's Combat report as a Follow, before the
            // Back control.
            actions={
              <>
                <CopySetupSeedButton seed={shownCombat.setupSeed} />
                <Button
                  testId="replay-combat-report"
                  onClick={() => {
                    place.follow();
                    setReplayShown(false);
                  }}
                >
                  Combat report
                </Button>
              </>
            }
            onClose={props.onClose}
          >
            <CombatReplay
              combat={shownCombat}
              replay={replay}
              armorScale={Math.max(1, ...(gameData?.armors.map((armor) => armor.armor) ?? []))}
            />
          </DetailView>
        </div>,
        document.body,
      );
    }
    return (
      <DetailView
        id="report"
        title="Combat report"
        // CRPLAY, Visualize button: in the title row of a Combat report; the Combat replay opens as a Follow.
        lead={
          <Button
            testId="visualize-combat"
            onClick={() => {
              place.follow();
              setReplayShown(true);
            }}
          >
            Visualize
          </Button>
        }
        aside={aside}
        asideText={asideText}
        onClose={props.onClose}
      >
        <CombatReportDetails
          combat={shownCombat}
          growth={mission?.growth ?? []}
          nameOf={(id) => labels.get(id) ?? id}
          itemName={(id) =>
            props.snapshot.gameData?.weapons.find((item) => item.id === id)?.name ??
            props.snapshot.gameData?.ammoTypes.find((item) => item.id === id)?.name ??
            id
          }
          fallbackWeaponName={props.state.agency.equipment.fallbackWeaponName}
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
            setReplayShown(false);
            setCombat(mission);
          }}
          onVisualize={(mission) => {
            // CRPLAY, Visualize button: the Combat replay opens one step away as a Follow.
            place.follow();
            setLogOpen(false);
            setReplayShown(true);
            setCombat(mission);
          }}
        />
      </div>
    </DetailView>
  );
}

/** TRVIEW, Sections: a source Mission's title indented under the section's title, and its items indented under it. */
function SourceBlock(props: { title: MissionSiteTitle; testId?: string; children: ReactNode }) {
  return (
    <div className="report-source" data-testid={props.testId}>
      <MissionSiteTitleView title={props.title} className="report-source-title" />
      <div className="report-source-items">{props.children}</div>
    </div>
  );
}

function Sections(props: {
  report: TurnReport;
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  onOpen: (target: ReportTarget) => void;
  onCombat: (mission: string) => void;
  onVisualize: (mission: string) => void;
}) {
  const { report, snapshot, state, onOpen } = props;
  const sites: readonly MissionSiteView[] = [
    ...state.missionSites,
    ...(snapshot.retired?.missionSites ?? []),
  ];
  const site = (id: string) => sites.find((item) => item.id === id);
  const expiresIn = (id: string) => {
    const found = site(id);
    return found === undefined ? '-' : groupDigits(found.turnsUntilExpiration);
  };
  const gameData = snapshot.gameData;
  const archetype = (id: string) => gameData?.missionSiteArchetypes.find((item) => item.id === id);
  const leadName = (lead: string) => snapshot.retired?.leads.find((item) => item.id === lead)?.name ?? lead;
  const factionName = (faction: string) =>
    state.factions.find((item) => item.id === faction)?.name ?? faction;
  // GUI, Mission site titles: e.g. "Apprehend member · Red Dawn · Initiative · #3".
  const titleOf = (id: string, archetypeId?: string, kind?: string) => {
    const found = site(id);
    const name = archetypeId === undefined ? id : (archetype(archetypeId)?.name ?? archetypeId);
    return missionSiteTitle(id, found, { name, kind: found?.kind ?? kind ?? '' }, factionName);
  };
  const siteRow = (id: string, what: ReactNode, archetypeId?: string) => (
    <button
      key={id}
      type="button"
      className="list-row"
      onClick={() => {
        onOpen({ kind: 'missionSite', missionSite: id });
      }}
    >
      {/* TRVIEW, Sections, Mission sites: each by its Mission site title. */}
      <MissionSiteTitleView title={titleOf(id, archetypeId)} className="list-name" />
      <span className="list-value">{what}</span>
    </button>
  );
  const itemName = (id: string) =>
    gameData?.weapons.find((item) => item.id === id)?.name ??
    gameData?.armors.find((item) => item.id === id)?.name ??
    gameData?.ammoTypes.find((item) => item.id === id)?.name ??
    id;
  const catalog: EquipmentCatalog | null =
    gameData === null
      ? null
      : {
          weapons: gameData.weapons,
          armors: gameData.armors,
          ammoTypes: gameData.ammoTypes,
          salePriceFraction: state.agency.equipment.salePriceFraction,
        };
  const missionTitle = (mission: (typeof report.missions)[number]) =>
    titleOf(mission.missionSite, mission.missionSiteArchetype, mission.kind);
  const combatOf = (mission: string) => report.combatReports.find((item) => item.mission === mission);
  // TRVIEW, Sections, Consequences: the lines of the Turn summary's group, under the Mission each came from.
  const consequences = report.missions.flatMap((mission) => {
    const lines = missionConsequenceLines(
      mission,
      archetype(mission.missionSiteArchetype)?.firstWinPhrase ?? null,
      factionName,
    );
    return lines.length === 0 ? [] : [{ mission, lines }];
  });
  // TRVIEW, Sections, Equipment: Recovered and Spent for each Mission resolved, each left out when empty.
  const equipment = report.missions.flatMap((mission) => {
    const lists = missionEquipment(mission, combatOf(mission.mission), catalog);
    return lists.recovered.entries.length + lists.spent.entries.length === 0 ? [] : [{ mission, lists }];
  });
  // TRVIEW, Sections, Leads discovered: under each Mission it is credited to, then those credited to none.
  const credited = report.missions.flatMap((mission) => {
    const leads = report.discoveredLeads.filter((lead) => mission.discoveredLeads.includes(lead));
    return leads.length === 0 ? [] : [{ mission, leads }];
  });
  const uncredited = report.discoveredLeads.filter(
    (lead) => !report.missions.some((mission) => mission.discoveredLeads.includes(lead)),
  );
  const leadRow = (lead: string) => (
    <button
      key={lead}
      type="button"
      className="list-row report-item"
      onClick={() => {
        onOpen({ kind: 'lead', lead });
      }}
    >
      <span className="list-name">{leadName(lead)}</span>
    </button>
  );
  // TRVIEW, Sections, Consequences: a Mission's Consequences joined on one line, e.g. "+50 money, −5 funding", each
  // in its own tone, and its rise in the Contracting cap on a line of its own.
  const gainRows = (lines: readonly GainLine[]) =>
    joinedLines(lines).map((line, index) => (
      <div key={index} className={`report-item ${line.parts === undefined ? toneClass(line) : 'muted'}`}>
        <GainLineText line={line} />
      </div>
    ));
  const equipmentList = (label: string, list: EquipmentList, tone: string) =>
    list.entries.length === 0 ? null : (
      <div className="report-item" data-testid={`equipment-${label.toLowerCase()}`}>
        <div className="report-equipment-head">
          {label} <span className="muted small">· worth {groupDigits(list.value)}</span>
        </div>
        <ul className={`report-equipment-entries ${tone}`}>
          {list.entries.map((entry) => (
            <li key={entry.id}>
              <span className="figure">{groupDigits(entry.count)}</span> {entry.name}
            </li>
          ))}
        </ul>
      </div>
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
      report.unlockedEquipment.length +
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
        {/* TRVIEW, Sections, Missions: one item of two lines for each Combat report, because its facts are too many
            for one line of a table that fits its view. */}
        {report.missions.map((mission) => {
          const combat = report.combatReports.find((item) => item.mission === mission.mission);
          const enemies = combat?.participants.filter((who) => who.side === 'enemy') ?? [];
          const dead = enemies.filter((who) => who.final.condition === 'dead').length;
          // TRVIEW, Sections, Missions: the sum of the Mission experience of the survivors, e.g. "+176 exp".
          const experience = mission.growth.reduce((sum, item) => sum + item.missionExperience, 0);
          return (
            <div
              key={mission.mission}
              className="report-mission"
              data-testid={`report-mission-${mission.mission}`}
            >
              {/* The first line: the Mission site title, the outcome with the Combat rounds, and the two buttons. */}
              <div className="report-mission-line">
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    onOpen({ kind: 'missionSite', missionSite: mission.missionSite });
                  }}
                >
                  <MissionSiteTitleView title={missionTitle(mission)} />
                </button>
                <span className={mission.result === 'Won' ? 'tone-good' : 'tone-bad'}>
                  {mission.result}
                  {/* TRVIEW, Sections: the Combat outcome only of a Lost Mission, e.g. "Lost · Wiped". */}
                  {combat === undefined
                    ? ''
                    : `${mission.result === 'Won' ? '' : ` · ${combat.outcome}`} in ${groupDigits(combat.rounds)} rounds`}
                </span>
                {combat === undefined ? null : (
                  <span className="trade-buttons report-mission-buttons">
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
                    {/* CRPLAY, Visualize button: beside each Combat report button. */}
                    <button
                      type="button"
                      className="btn btn-plain"
                      data-testid={`visualize-${mission.mission}`}
                      onClick={() => {
                        props.onVisualize(mission.mission);
                      }}
                    >
                      Visualize
                    </button>
                  </span>
                )}
              </div>
              {/* The second line: the Agents on its side, the Agents Killed, the Enemies dead, and the experience. */}
              <div className="report-mission-facts">
                <span className="figure">
                  {combat === undefined ? '-' : groupDigits(combat.agents.length)} Agents
                </span>
                <span className={mission.killed.length > 0 ? 'tone-bad' : 'muted'}>
                  {mission.killed.length === 0 ? 'none killed' : `Killed ${mission.killed.join(', ')}`}
                </span>
                <span className="figure">
                  Enemies dead {groupDigits(dead)} / {groupDigits(enemies.length)}
                </span>
                <span className="figure" data-testid={`exp-${mission.mission}`}>
                  +{groupDigits(experience)} exp
                </span>
              </div>
            </div>
          );
        })}
      </Section>

      {/* TRVIEW, Sections: Consequences, Equipment, and Leads discovered name each source Mission as a heading,
          its items indented under it. */}
      <Section
        title="Consequences"
        count={consequences.reduce((sum, item) => sum + item.lines.length, 0)}
        testId="report-consequences"
      >
        {consequences.map(({ mission, lines }) => (
          <SourceBlock key={mission.mission} title={missionTitle(mission)}>
            {gainRows(lines)}
          </SourceBlock>
        ))}
      </Section>

      <Section title="Equipment" count={equipment.length} testId="report-equipment">
        {equipment.map(({ mission, lists }) => (
          <SourceBlock
            key={mission.mission}
            title={missionTitle(mission)}
            testId={`equipment-${mission.mission}`}
          >
            {equipmentList('Recovered', lists.recovered, 'tone-good')}
            {equipmentList('Spent', lists.spent, 'tone-bad')}
          </SourceBlock>
        ))}
      </Section>

      <Section title="Leads discovered" count={report.discoveredLeads.length} testId="discovered-leads">
        {credited.map(({ mission, leads }) => (
          <SourceBlock key={mission.mission} title={missionTitle(mission)}>
            {leads.map(leadRow)}
          </SourceBlock>
        ))}
        {uncredited.length === 0 ? null : (
          <SourceBlock title={{ name: 'Other', details: '' }}>{uncredited.map(leadRow)}</SourceBlock>
        )}
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
          siteRow(id, <span className="secondary">Created · {expiresIn(id)} T to expire</span>),
        )}
        {report.expiredMissionSites.map((item) =>
          siteRow(
            item.missionSite,
            <span>
              <span className="tone-accent">Expired</span> <Consequences consequence={item.consequence} />
            </span>,
            item.missionSiteArchetype,
          ),
        )}
        {report.cancelledMissionSites.map((id) => siteRow(id, <span className="muted">Cancelled</span>))}
      </Section>

      {/* TRVIEW, Sections, New acquisitions: what an interrogation unlocked; it opens the Storage View. */}
      <Section title="New acquisitions" count={report.unlockedEquipment.length} testId="new-acquisitions">
        <button
          type="button"
          className="list-row"
          onClick={() => {
            onOpen({ kind: 'storage' });
          }}
        >
          <span className="list-name">{report.unlockedEquipment.map(itemName).join(', ')}</span>
        </button>
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
 * wide enough for the widest value of its quantity, its Digit grouping commas included, e.g. "1,234" in Base,
 * "1,234 → 1,234" in Skill, "123 → 123/123" in Health, "123 → 123" in Armor, "123 → 123" and the warning triangle in
 * Exh., and "99.9% (1,234 vs 1,234)" in Hit chance; a participant, an attacker, and a defender hold the longest Enemy
 * label, e.g. "high-commander-12". The participants table is at most 1044 px in all, so that it fits its pane in the
 * Reference window; to fit, it leaves each participant's weapon damage to the tooltip of its name.
 */
const PARTICIPANT_WIDTHS = [
  '152px',
  '72px',
  '140px',
  '140px',
  '104px',
  '120px',
  '64px',
  '64px',
  '60px',
  '116px',
];
const LOG_WIDTHS = ['72px', '160px', '160px', '192px', '300px'];

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
    return <s className="muted">+{groupDigits(who.combatExperience)}</s>;
  }
  return <span className="tone-good">+{groupDigits(gained.missionExperience)}</span>;
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
  /** The `name` of an Item or AmmoType, and of the Fallback Weapon. */
  itemName: (id: string) => string;
  fallbackWeaponName: string;
}) {
  const { combat } = props;
  const sideOf = (id: string) => combat.participants.find((who) => who.id === id)?.side ?? 'enemy';
  const group = (side: 'agent' | 'enemy') => combat.participants.filter((who) => who.side === side);
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
              {/* VIS, Tables: a header is worded to fit the values under it, as in the Agent table of AVIEW. */}
              <th className="num" title="Base skill">
                Base
              </th>
              <th className="num" title="Effective skill">
                Skill
              </th>
              <th className="num">Health</th>
              <th className="num">Armor</th>
              <th className="num" title="Exhaustion">
                Exh.
              </th>
              <th className="num">Dealt</th>
              <th className="num">Taken</th>
              {/* The header says "Exp" alone, because the "+" of each value already says that it was gained. */}
              <th className="num" title="Experience gained">
                Exp
              </th>
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
                    {/* VIS, Tables: the weapon damage, which does not change in a Combat, moves one step away, into
                        the tooltip of the participant's name, so that the table fits its pane. */}
                    <th
                      scope="row"
                      className={condition.tone ?? undefined}
                      title={`Weapon damage ${groupDigits(who.start.weaponDamage)}`}
                      data-testid={`participant-name-${who.id}`}
                    >
                      {props.nameOf(who.id)}
                    </th>
                    <td className="num">{wholeText(who.start.skillHundredths)}</td>
                    <td className="num">
                      {groupDigits(who.start.effectiveSkill)} → {groupDigits(who.final.effectiveSkill)}
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
                      /{groupDigits(who.start.maxHealth)}
                    </td>
                    <td className="num" data-testid={`armor-${who.id}`}>
                      {armorText(who)}
                    </td>
                    <td className="num">
                      {groupDigits(who.start.exhaustion)} →{' '}
                      {who.side === 'agent' ? (
                        <Exhaustion value={who.final.exhaustion} levels={props.levels} />
                      ) : (
                        groupDigits(who.final.exhaustion)
                      )}
                    </td>
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
        {/* TRVIEW, Combat report: the Ammo line, each AmmoType's rounds at Combat start and at Combat end. */}
        {combat.ammo.length === 0 ? null : (
          <p className="small secondary" data-testid="combat-ammo">
            <span className="label">Ammo</span>{' '}
            {combat.ammo
              .map(
                (item) =>
                  `${props.itemName(item.ammoType)} ${groupDigits(item.start)} → ${groupDigits(item.end)}`,
              )
              .join(' · ')}
          </p>
        )}
      </section>
      <section className="pane">
        <h3 className="pane-title">Combat ratings</h3>
        {/* VIS, Tables: one row per Combat round, so that a long Combat makes the table taller, never wider. */}
        <Grid widths={['120px', '96px', '96px']} testId="combat-ratings">
          <thead>
            <tr>
              <th>Round</th>
              <th className="num">Agents</th>
              <th className="num">Enemies</th>
            </tr>
          </thead>
          <tbody>
            {combat.ratings.map((rating) => (
              <tr key={rating.round}>
                <th scope="row">{rating.round === 0 ? 'Start' : `Round ${groupDigits(rating.round)}`}</th>
                <td className="num">{groupDigits(rating.agents)}</td>
                <td className="num">{groupDigits(rating.enemies)}</td>
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
              ({groupDigits(combat.log.length)} {combat.log.length === 1 ? 'attack' : 'attacks'})
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
                    <td className="num">{groupDigits(attack.round)}</td>
                    <td>
                      {props.nameOf(attack.attacker)}
                      {attack.outOfAmmo === null ? null : (
                        <span className="muted">
                          {' '}
                          ({props.fallbackWeaponName}, out of {props.itemName(attack.outOfAmmo)})
                        </span>
                      )}
                    </td>
                    <td>{props.nameOf(attack.defender)}</td>
                    <td className="num">
                      {hitChanceText(attack.hitChance)} ({groupDigits(attack.a)} vs {groupDigits(attack.d)})
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
