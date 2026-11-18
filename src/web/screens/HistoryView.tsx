/**
 * HVIEW: the History View, the Turn by Turn table that finds the Turn in which something changed, with what the player
 * did in each Turn one press away.
 */
import { Fragment, useState, type ReactNode } from 'react';
import type { HistoryEntry } from '../../engine/index.ts';
import { actionLines, expenditures, type ActionNames } from '../history-actions.ts';
import type { Snapshot } from '../store.ts';
import { Grid } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

const COLUMNS = 10;

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Label(props: { tone: string; children: ReactNode }) {
  // Inline, so that labels too many for the column are cut short with "…" under VIS, Tables.
  return <span className={`history-event ${props.tone}`}>{props.children}</span>;
}

/** HVIEW, Events: the labels of what the Advance turn ending the Turn did, in this order, each only when it applies. */
function Events(props: { entry: HistoryEntry; missionSiteName: (archetype: string) => string }) {
  const report = props.entry.report;
  return (
    <>
      {report.missions.map((mission) => (
        <Label key={mission.mission} tone={mission.result === 'Won' ? 'tone-good' : 'tone-bad'}>
          {props.missionSiteName(mission.missionSiteArchetype)} {mission.result === 'Won' ? 'won' : 'lost'}
          {mission.killed.length > 0 ? `, ${mission.killed.length} killed` : ''}
        </Label>
      ))}
      {report.investigationsCompleted.length > 0 ? (
        <Label tone="tone-accent">
          {count(report.investigationsCompleted.length, 'Investigation')} completed
        </Label>
      ) : null}
      {report.discoveredLeads.length > 0 ? (
        <Label tone="tone-accent">{count(report.discoveredLeads.length, 'Lead')} discovered</Label>
      ) : null}
      {report.expiredMissionSites.length > 0 ? (
        <Label tone="tone-accent">{count(report.expiredMissionSites.length, 'Mission site')} expired</Label>
      ) : null}
      {report.escalatedFactions.length > 0 ? (
        <Label tone="tone-warning">{count(report.escalatedFactions.length, 'Faction')} escalated</Label>
      ) : null}
      {report.ending === null ? null : (
        <Label tone={report.ending === 'Victory' ? 'tone-good' : 'tone-bad'}>{report.ending}</Label>
      )}
    </>
  );
}

function MoneyChange(props: { value: number }) {
  if (props.value === 0) {
    return <span />;
  }
  return props.value < 0 ? (
    <span className="figure num tone-bad">−{-props.value}</span>
  ) : (
    <span className="figure num tone-good">+{props.value}</span>
  );
}

export function HistoryView({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const entries = snapshot.history?.entries ?? [];
  // HVIEW, Player actions list: every list is closed when the View opens; several can be open at once.
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const state = snapshot.state;
  const retained = snapshot.history?.retained;
  const investigations = [...(state?.investigations ?? []), ...(retained?.investigations ?? [])];
  const missionSites = [...(state?.missionSites ?? []), ...(retained?.missionSites ?? [])];
  const archetypes = snapshot.gameData?.missionSiteArchetypes ?? [];
  const missionSiteName = (archetype: string): string =>
    archetypes.find((item) => item.id === archetype)?.name ?? archetype;
  const names: ActionNames = {
    lead: (id) =>
      state?.leads.find((lead) => lead.id === id)?.name ??
      investigations.find((item) => item.lead === id)?.leadName ??
      id,
    investigationLead: (id) => investigations.find((item) => item.id === id)?.leadName ?? id,
    missionSite: (id) => missionSites.find((site) => site.id === id)?.name ?? id,
    upgrade: (id) => state?.agency.upgrades.find((upgrade) => upgrade.id === id)?.name ?? id,
  };
  const toggle = (turn: number) => {
    const next = new Set(open);
    if (!next.delete(turn)) {
      next.add(turn);
    }
    setOpen(next);
  };
  return (
    <DetailView id="history" title="History" aside="Turn by Turn · newest first" onClose={onClose}>
      {entries.length === 0 ? (
        <p className="muted" data-testid="history">
          No Turn has ended yet.
        </p>
      ) : (
        <div className="table-scroll" data-testid="history">
          <Grid
            widths={['64px', '120px', '120px', '112px', '92px', '92px', '76px', '84px', '128px', '440px']}
            testId="history-table"
            scroll={false}
          >
            <thead>
              <tr>
                <th className="num">Turn</th>
                <th className="num">Money start</th>
                <th className="num">Expenditures</th>
                <th className="num">Money end</th>
                <th className="num">Income</th>
                <th className="num">Upkeep</th>
                <th className="num">Panic</th>
                <th className="num">Agents</th>
                <th className="num">Player actions</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((entry) => {
                const spent = expenditures(entry.actions);
                const isOpen = open.has(entry.turn);
                return (
                  <Fragment key={entry.turn}>
                    <tr data-testid={`history-turn-${entry.turn}`}>
                      <td className="num">{entry.turn}</td>
                      <td className="num">{entry.turnStart.money}</td>
                      <td className={spent > 0 ? 'num tone-bad' : 'num muted'}>
                        {spent > 0 ? `−${spent}` : '0'}
                      </td>
                      <td className="num">{entry.turnEnd.money}</td>
                      <td className="num tone-good">+{entry.report.income}</td>
                      <td className="num tone-bad">−{entry.report.upkeep}</td>
                      <td className="num">{entry.report.panicAfter}%</td>
                      <td className="num">{entry.turnEnd.servingAgents}</td>
                      <td className="num">
                        {entry.actions.length === 0 ? (
                          <span className="muted">0</span>
                        ) : (
                          <button
                            type="button"
                            className="history-actions-toggle figure"
                            aria-expanded={isOpen}
                            data-testid={`history-actions-${entry.turn}`}
                            onClick={() => {
                              toggle(entry.turn);
                            }}
                          >
                            {isOpen ? '▾' : '▸'} {entry.actions.length}
                          </button>
                        )}
                      </td>
                      <td>
                        <Events entry={entry} missionSiteName={missionSiteName} />
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="history-actions-row" data-testid={`history-actions-list-${entry.turn}`}>
                        <td colSpan={COLUMNS}>
                          <ol className="history-actions">
                            {actionLines(entry.actions, names).map((line) => (
                              <li key={line.numbers}>
                                <span className="figure muted num">{line.numbers}</span>
                                <span>{line.text}</span>
                                <MoneyChange value={line.moneyChange} />
                              </li>
                            ))}
                          </ol>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </Grid>
        </div>
      )}
    </DetailView>
  );
}
