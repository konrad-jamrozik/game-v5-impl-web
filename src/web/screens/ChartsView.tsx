/**
 * CVIEW: the Charts View. It leads with a full-width Panic chart, because Panic is how a Campaign is lost, above three
 * smaller trend charts of the resources the agency runs on.
 */
import type { Snapshot } from '../store.ts';
import { DetailView } from './DetailView.tsx';
import { LineChart } from './LineChart.tsx';

export function ChartsView({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const history = snapshot.history;
  const entries = history?.entries ?? [];
  const panicLimit = snapshot.state?.panicLimit;
  return (
    <DetailView id="charts" title="Charts" onClose={onClose}>
      <div className="stack" data-testid="charts">
        <LineChart
          headline
          title="Panic after each Turn"
          unit="%"
          points={entries.map((entry) => ({ turn: entry.turn, value: entry.report.panicAfter }))}
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
      </div>
    </DetailView>
  );
}
