/** HVIEW: the History View, the Turn by Turn table that finds the Turn in which something changed. */
import type { Snapshot } from '../store.ts';
import { Badge } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

export function HistoryView({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const entries = snapshot.history?.entries ?? [];
  return (
    <DetailView id="history" title="History" aside="Turn by Turn · newest first" onClose={onClose}>
      {entries.length === 0 ? (
        <p className="muted" data-testid="history">
          No Turn has ended yet.
        </p>
      ) : (
        <div className="table-scroll" data-testid="history">
          <table className="grid" data-testid="history-table">
            <thead>
              <tr>
                <th className="num">Turn</th>
                <th className="num">Money start</th>
                <th className="num">Money end</th>
                <th className="num">Income</th>
                <th className="num">Upkeep</th>
                <th className="num">Panic</th>
                <th className="num">Agents</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((entry) => (
                <tr key={entry.turn}>
                  <td className="num">{entry.turn}</td>
                  <td className="num">{entry.turnStart.money}</td>
                  <td className="num">{entry.turnEnd.money}</td>
                  <td className="num tone-good">+{entry.report.income}</td>
                  <td className="num tone-bad">−{entry.report.upkeep}</td>
                  <td className="num">{entry.report.panicAfter}%</td>
                  <td className="num">{entry.turnEnd.servingAgents}</td>
                  <td>
                    {entry.report.missions.map((mission) => (
                      <Badge key={mission.mission} tone={mission.result === 'Won' ? 'good' : 'bad'}>
                        {mission.missionSiteArchetype} {mission.result.toLowerCase()}
                        {mission.killed.length > 0 ? `, ${mission.killed.length} killed` : ''}
                      </Badge>
                    ))}
                    {entry.report.investigationsCompleted.length > 0 ? (
                      <Badge tone="accent">Lead completed</Badge>
                    ) : null}
                    {entry.report.discoveredLeads.length > 0 ? (
                      <Badge tone="accent">
                        {entry.report.discoveredLeads.length} Lead
                        {entry.report.discoveredLeads.length === 1 ? '' : 's'} discovered
                      </Badge>
                    ) : null}
                    {entry.report.expiredMissionSites.length > 0 ? (
                      <Badge tone="warn">{entry.report.expiredMissionSites.length} expired</Badge>
                    ) : null}
                    {entry.report.escalatedFactions.length > 0 ? (
                      <Badge tone="warn">Faction escalated</Badge>
                    ) : null}
                    {entry.report.ending === null ? null : (
                      <Badge tone={entry.report.ending === 'Victory' ? 'good' : 'bad'}>
                        {entry.report.ending}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DetailView>
  );
}
