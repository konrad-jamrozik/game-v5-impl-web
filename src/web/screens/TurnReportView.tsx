/**
 * TRVIEW: the Turn Report View. It shows exactly what the Turn report of the most recent committed Advance turn
 * holds, in four sections, with each Combat report one step away.
 */
import { useState, type ReactNode } from 'react';
import type { CombatReport, CurrentStateView, MissionSiteView, TurnReport } from '../../engine/index.ts';
import { consequenceText, progressPoints } from '../format.ts';
import { Exhaustion, exhaustionLevels, healthColor, type ExhaustionLevels } from '../condition.tsx';
import type { Snapshot } from '../store.ts';
import { turnSummaryHasContent } from '../turn-summary.ts';
import { Button, percent, Grid } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

const CONDITIONS = { ableToFight: 'able to fight', incapacitated: 'incapacitated', dead: 'dead' } as const;

/** Where selecting an item of the Turn report leads. */
export type ReportTarget =
  | { readonly kind: 'missionSite'; readonly missionSite: string }
  | { readonly kind: 'lead'; readonly lead: string };

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
  state: CurrentStateView;
  onOpen: (target: ReportTarget) => void;
  onOpenSummary: () => void;
  onClose: () => void;
}) {
  const { snapshot, state } = props;
  const report = snapshot.report;
  const [combat, setCombat] = useState<string | null>(null);
  // TRVIEW: the Turn summary button is disabled, not hidden, when there is no Turn report or no group to show.
  const summaryButton = (
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
      <DetailView id="report" title="Turn report" actions={summaryButton} onClose={props.onClose}>
        <p className="muted" data-testid="turn-report">
          There is no Turn report yet. Advance the turn to get the first one.
        </p>
      </DetailView>
    );
  }
  const heading = `Turn ${report.turn} ended · Turn ${report.turn + 1} began`;
  const shownCombat = report.combatReports.find((item) => item.mission === combat);
  if (shownCombat !== undefined) {
    return (
      <DetailView
        id="report"
        title="Combat report"
        aside={heading}
        actions={summaryButton}
        onClose={props.onClose}
      >
        <CombatReportDetails
          combat={shownCombat}
          levels={exhaustionLevels(snapshot.gameData)}
          onBack={() => {
            setCombat(null);
          }}
        />
      </DetailView>
    );
  }
  return (
    <DetailView
      id="report"
      title="Turn report"
      aside={heading}
      actions={summaryButton}
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
          onCombat={setCombat}
        />
      </div>
    </DetailView>
  );
}

function Sections(props: {
  report: TurnReport;
  snapshot: Snapshot;
  state: CurrentStateView;
  onOpen: (target: ReportTarget) => void;
  onCombat: (mission: string) => void;
}) {
  const { report, snapshot, state, onOpen } = props;
  const sites: readonly MissionSiteView[] = [
    ...state.missionSites,
    ...(snapshot.history?.retained.missionSites ?? []),
  ];
  const site = (id: string) => sites.find((item) => item.id === id);
  const archetypeName = (archetype: string) =>
    snapshot.gameData?.missionSiteArchetypes.find((item) => item.id === archetype)?.name ?? archetype;
  const leadName = (lead: string) => state.leads.find((item) => item.id === lead)?.name ?? lead;
  const siteRow = (id: string, what: ReactNode) => (
    <button
      key={id}
      type="button"
      className="list-row"
      onClick={() => {
        onOpen({ kind: 'missionSite', missionSite: id });
      }}
    >
      <span className="list-name">{site(id)?.name ?? id}</span>
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
      report.discoveredLeads.length ===
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
        <Grid widths={['200px', '200px', '96px', '170px', '208px', '150px']}>
          <tbody>
            {report.missions.map((mission) => {
              const combat = report.combatReports.find((item) => item.mission === mission.mission);
              const enemies = combat?.participants.filter((who) => who.side === 'enemy') ?? [];
              const dead = enemies.filter((who) => who.final.condition === 'dead').length;
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
                    {combat === undefined ? '' : ` · ${combat.outcome} in ${combat.rounds} rounds`}
                  </td>
                  <td className="num">{combat?.agents.length ?? '-'} Agents</td>
                  <td className={mission.killed.length > 0 ? 'tone-bad' : 'muted'}>
                    {mission.killed.length === 0 ? 'none killed' : `Killed ${mission.killed.join(', ')}`}
                  </td>
                  <td className="num">
                    Enemies dead {dead} / {enemies.length}
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
                <span className="tone-good">+{progressPoints(item.gain)}</span> →{' '}
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
            <span className="tone-accent">Expired · {consequenceText(item.consequence)}</span>,
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
    </>
  );
}

function CombatReportDetails(props: { combat: CombatReport; levels: ExhaustionLevels; onBack: () => void }) {
  const { combat } = props;
  return (
    <div className="stack" data-testid="combat-report">
      <div>
        <button type="button" className="link" data-testid="combat-back" onClick={props.onBack}>
          ← Turn report
        </button>
      </div>
      <p>
        {combat.outcome} after {combat.rounds} {combat.rounds === 1 ? 'round' : 'rounds'}
      </p>
      <Grid widths={['120px', '108px', '104px', '128px', '76px', '76px', '110px']}>
        <thead>
          <tr>
            <th>Combatant</th>
            <th className="num">Skill</th>
            <th className="num">Health</th>
            <th className="num">Exhaustion</th>
            <th className="num">Dealt</th>
            <th className="num">Taken</th>
            <th>End</th>
          </tr>
        </thead>
        <tbody>
          {combat.participants.map((who) => (
            <tr key={who.id} className={who.side === 'enemy' ? 'row-enemy' : ''}>
              <th scope="row">{who.id}</th>
              <td className="num">
                {who.start.effectiveSkill} → {who.final.effectiveSkill}
              </td>
              <td className="num">
                {who.start.currentHealth} →{' '}
                {/* VIS, Agent condition: an Agent's values take their condition colours; an Enemy's do not. */}
                {who.side === 'agent' ? (
                  <span style={{ color: healthColor(who.final.currentHealth, who.start.baseHealth) }}>
                    {who.final.currentHealth}
                  </span>
                ) : (
                  who.final.currentHealth
                )}
              </td>
              <td className="num">
                {who.start.exhaustion} →{' '}
                {who.side === 'agent' ? (
                  <Exhaustion value={who.final.exhaustion} levels={props.levels} />
                ) : (
                  who.final.exhaustion
                )}
              </td>
              <td className="num">{who.damageDealt}</td>
              <td className="num">{who.damageTaken}</td>
              <td className={who.side === 'agent' && who.final.condition === 'dead' ? 'tone-bad' : undefined}>
                {who.side === 'agent' && who.final.condition === 'dead'
                  ? 'Killed'
                  : CONDITIONS[who.final.condition]}
              </td>
            </tr>
          ))}
        </tbody>
      </Grid>
      <div className="label">Combat rating</div>
      <Grid widths={['80px', '96px', '96px']} className="compact">
        <thead>
          <tr>
            <th className="num">Round</th>
            <th className="num">Agents</th>
            <th className="num">Enemies</th>
          </tr>
        </thead>
        <tbody>
          {combat.ratings.map((rating) => (
            <tr key={rating.round}>
              <td className="num">{rating.round === 0 ? 'start' : rating.round}</td>
              <td className="num">{rating.agents}</td>
              <td className="num">{rating.enemies}</td>
            </tr>
          ))}
        </tbody>
      </Grid>
      <details>
        <summary>Combat log ({combat.log.length} attacks)</summary>
        <Grid widths={['72px', '130px', '130px', '164px', '320px']} className="log">
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
            {combat.log.map((attack, index) => (
              <tr key={index}>
                <td className="num">{attack.round}</td>
                <td>{attack.attacker}</td>
                <td>{attack.defender}</td>
                <td className="num">
                  {percent(attack.hitProbability)} ({attack.a} vs {attack.d})
                </td>
                <td>
                  {attack.hit
                    ? `hit for ${attack.damage ?? 0}, health ${attack.defenderAfter.currentHealth}` +
                      (attack.defenderDead ? ', dead' : attack.defenderIncapacitated ? ', incapacitated' : '')
                    : 'miss'}
                </td>
              </tr>
            ))}
          </tbody>
        </Grid>
      </details>
    </div>
  );
}
