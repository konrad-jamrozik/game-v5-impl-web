/**
 * CVIEW: the Charts View. It leads with a full-width Panic chart, because Panic is how a Campaign is lost, above three
 * smaller trend charts of the resources the agency runs on, and one Faction chart for each Faction below them.
 */
import { responseSitesSeries } from '../faction-activity.ts';
import { decimalText } from '../format.ts';
import type { Snapshot } from '../store.ts';
import { DetailView } from './DetailView.tsx';
import { LineChart } from './LineChart.tsx';

export function ChartsView({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const history = snapshot.history;
  const entries = history?.entries ?? [];
  const state = snapshot.state;
  const panicLimit = state?.panicLimit;
  const sites = [...(state?.missionSites ?? []), ...(history?.retained.missionSites ?? [])];
  return (
    <DetailView id="charts" title="Charts" onClose={onClose}>
      <div className="stack" data-testid="charts">
        <LineChart
          headline
          title="Panic after each Turn"
          unit="%"
          points={entries.map((entry) => ({
            turn: entry.turn,
            value: entry.report.panicAfterHundredths / 100,
          }))}
          // CVIEW, Panic chart: the current value is written with two decimals, e.g. "24.35%", under GUI, Decimal
          // quantities shown; the drawn value is in percentage points, so the text goes back to whole hundredths.
          valueText={(value) => decimalText(Math.round(value * 100))}
          testId="panic-chart"
          {...(panicLimit === undefined ? {} : { limit: panicLimit, valueNote: `of ${panicLimit}% limit` })}
        />
        <div className="charts">
          <LineChart
            title="Money at the start of each Turn"
            points={history?.turnSeries.moneyAtStartOfTurn ?? []}
          />
          <LineChart
            title="Serving Agents"
            points={entries.map((entry) => ({ turn: entry.turn, value: entry.turnEnd.servingAgents }))}
          />
          <LineChart
            title="Funding"
            points={entries.map((entry) => ({ turn: entry.turn, value: entry.report.fundingAfter }))}
          />
        </div>
        {/* CVIEW, Faction charts: three side by side to a row, in the order of the Factions in Campaign state. */}
        <div className="charts charts-three">
          {(state?.factions ?? []).map((faction) => (
            <LineChart
              key={faction.id}
              title={`${faction.name} · response sites`}
              points={responseSitesSeries(faction.id, state?.turn ?? 1, sites)}
              testId={`faction-chart-${faction.id}`}
            />
          ))}
        </div>
      </div>
    </DetailView>
  );
}
