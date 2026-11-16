/** History: charts of the Turn series and of the History entries, the entries as a table, and retained instances. */
import type { Snapshot } from '../store.ts';
import { Badge, Section } from '../ui.tsx';
import { LineChart } from './LineChart.tsx';

export function HistoryPanel({ snapshot }: { snapshot: Snapshot }) {
  const history = snapshot.history;
  if (history === null) {
    return null;
  }
  const entries = history.entries;
  const panicLimit = snapshot.state?.panicLimit;
  return (
    <div className="stack" data-testid="history">
      {/* VIS, Charts: the History tab leads with Panic, because Panic is how a Campaign is lost. */}
      <LineChart
        headline
        title="Panic after each Turn"
        unit="%"
        points={entries.map((entry) => ({ turn: entry.turn, value: entry.report.panicAfter }))}
        {...(panicLimit === undefined ? {} : { limit: panicLimit, valueNote: `of ${panicLimit}% limit` })}
      />
      <div className="charts">
        <LineChart title="Money at the start of each Turn" points={history.turnSeries.moneyAtStartOfTurn} />
        <LineChart
          title="Serving Agents at the end of each Turn"
          points={entries.map((entry) => ({ turn: entry.turn, value: entry.turnEnd.servingAgents }))}
        />
        <LineChart
          title="Funding after each Turn"
          points={entries.map((entry) => ({ turn: entry.turn, value: entry.report.fundingAfter }))}
        />
      </div>

      <Section title="Turn by Turn" aside={<span className="label">Newest first</span>}>
        {entries.length === 0 ? (
          <p className="muted">No Turn has ended yet.</p>
        ) : (
          <div className="table-scroll short">
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
                      {entry.report.completedInvestigations.length > 0 ? (
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
      </Section>

      <Section title="No longer in play">
        <dl className="pairs">
          <dt>Agents</dt>
          <dd>
            {history.retained.agents
              .map((agent) => `${agent.id} (${agent.agentStatus.toLowerCase()})`)
              .join(', ') || 'none'}
          </dd>
          <dt>Missions</dt>
          <dd>
            {history.retained.missions
              .map((mission) => `${mission.id} (${mission.lifecycle.toLowerCase()})`)
              .join(', ') || 'none'}
          </dd>
          <dt>Mission sites</dt>
          <dd>
            {history.retained.missionSites
              .map((site) => `${site.name} (${site.lifecycle.toLowerCase()})`)
              .join(', ') || 'none'}
          </dd>
          <dt>Investigations</dt>
          <dd>
            {history.retained.investigations
              .map((item) => `${item.leadName} (${item.lifecycle.toLowerCase()})`)
              .join(', ') || 'none'}
          </dd>
        </dl>
      </Section>
    </div>
  );
}
