/**
 * HVIEW: the History View, the Turn by Turn table that finds the Turn in which something changed, with what the player
 * did in each Turn one press away, and the current Turn on top as if it ended now. Each Mission among the events of a
 * Turn is a link to its Mission site.
 */
import { Fragment, useEffect, type ReactNode } from 'react';
import type { HistoryEntry } from '../../engine/index.ts';
import { actionLines, expenditures, type ActionNames } from '../history-actions.ts';
import { historyRows } from '../history-rows.ts';
import { usePlaceState } from '../place.tsx';
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
function Events(props: {
  entry: HistoryEntry;
  missionSiteName: (archetype: string) => string;
  onOpenMissionSite: (missionSite: string) => void;
}) {
  const report = props.entry.report;
  return (
    <>
      {report.missions.map((mission) => (
        // HVIEW, Mission links: the label is a link to its Mission site; it keeps its colour, and the pointer resting
        // on it underlines it. SOUNDS, Main click: pressing it opens a view.
        <button
          key={mission.mission}
          type="button"
          className={`history-event history-link ${mission.result === 'Won' ? 'tone-good' : 'tone-bad'}`}
          data-testid={`history-mission-${mission.missionSite}`}
          data-sound="main"
          onClick={() => {
            props.onOpenMissionSite(mission.missionSite);
          }}
        >
          {props.missionSiteName(mission.missionSiteArchetype)} {mission.result === 'Won' ? 'won' : 'lost'}
          {mission.killed.length > 0 ? `, ${mission.killed.length} killed` : ''}
        </button>
      ))}
      {report.investigationsCompleted.length > 0 ? (
        <Label tone="tone-good">
          {count(report.investigationsCompleted.length, 'Investigation')} completed
        </Label>
      ) : null}
      {report.discoveredLeads.length > 0 ? (
        // In Notice, because a discovered Lead is welcome news that asks for no action.
        <Label tone="tone-notice">{count(report.discoveredLeads.length, 'Lead')} discovered</Label>
      ) : null}
      {report.expiredMissionSites.length > 0 ? (
        <Label tone="tone-accent">{count(report.expiredMissionSites.length, 'Mission site')} expired</Label>
      ) : null}
      {report.escalatedFactions.length > 0 ? (
        <Label tone="tone-bad">{count(report.escalatedFactions.length, 'Faction')} escalated</Label>
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

export function HistoryView({
  snapshot,
  onOpenMissionSite,
  onClose,
}: {
  snapshot: Snapshot;
  /** HVIEW, Mission links: opens the Missions View with that Mission site selected, as a Follow. */
  onOpenMissionSite: (missionSite: string) => void;
  onClose: () => void;
}) {
  const rows = historyRows(snapshot);
  // HVIEW, Player actions list: every list is closed when the View opens; several can be open at once. A list is kept
  // by its Turn number, so the current Turn's list stays open while its Action record changes and when Advance turn
  // ends that Turn. HVIEW, Mission links: the open lists are part of the place, so that going back from a Mission site
  // shows the History View as the Player left it.
  const [open, setOpen] = usePlaceState<ReadonlySet<number>>('openActions', new Set());
  const current = rows.find((row) => row.now);
  const emptied = current !== undefined && current.actions.length === 0 && open.has(current.turn);
  // HVIEW, Player actions list: the current Turn's list closes when an undo empties its Action record.
  useEffect(() => {
    if (emptied) {
      setOpen((before) => {
        const next = new Set(before);
        next.delete(current.turn);
        return next;
      });
    }
  }, [emptied, current]);
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
      <div className="table-scroll" data-testid="history">
        <Grid
          widths={['104px', '120px', '120px', '112px', '92px', '92px', '76px', '84px', '128px', '440px']}
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
            {rows.map((row) => {
              const spent = expenditures(row.actions);
              const isOpen = open.has(row.turn) && row.actions.length > 0;
              return (
                <Fragment key={row.turn}>
                  <tr data-testid={row.now ? 'history-turn-now' : `history-turn-${row.turn}`}>
                    <td className="num">
                      {row.turn}
                      {row.now ? <span className="muted"> now</span> : null}
                    </td>
                    <td className="num">{row.moneyStart}</td>
                    <td className={spent > 0 ? 'num tone-bad' : 'num muted'}>
                      {spent > 0 ? `−${spent}` : '0'}
                    </td>
                    <td className="num">{row.moneyEnd}</td>
                    <td className="num tone-good">+{row.income}</td>
                    <td className="num tone-bad">−{row.upkeep}</td>
                    <td className="num">{row.panic}%</td>
                    <td className="num">{row.agents}</td>
                    <td className="num">
                      {row.actions.length === 0 ? (
                        <span className="muted">0</span>
                      ) : (
                        <button
                          type="button"
                          className="history-actions-toggle figure"
                          aria-expanded={isOpen}
                          data-testid={`history-actions-${row.turn}`}
                          onClick={() => {
                            toggle(row.turn);
                          }}
                        >
                          {isOpen ? '▾' : '▸'} {row.actions.length}
                        </button>
                      )}
                    </td>
                    <td>
                      {row.entry === null ? null : (
                        <Events
                          entry={row.entry}
                          missionSiteName={missionSiteName}
                          onOpenMissionSite={onOpenMissionSite}
                        />
                      )}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="history-actions-row" data-testid={`history-actions-list-${row.turn}`}>
                      <td colSpan={COLUMNS}>
                        <ol className="history-actions">
                          {actionLines(row.actions, names).map((line) => (
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
    </DetailView>
  );
}
