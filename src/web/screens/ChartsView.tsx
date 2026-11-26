/**
 * CVIEW: the Charts View. It leads with a full-width Panic chart, because Panic is how a Campaign is lost, above three
 * smaller trend charts of the resources the agency runs on, five full-width Agency charts, and one Faction chart for
 * each Faction below them.
 */
import { agencyCharts, capUpgradeIds } from '../agency-charts.ts';
import { responseSitesSeries } from '../faction-activity.ts';
import { decimalText } from '../format.ts';
import type { Snapshot } from '../store.ts';
import { ChartsFullScreenContext, WholeScreen } from './ChartFullScreen.tsx';
import { DetailView } from './DetailView.tsx';
import { usePlace, usePlaceState } from '../place.tsx';
import { LineChart } from './LineChart.tsx';
import { SeriesChart } from './SeriesChart.tsx';

/** CVIEW, Agency charts: five full-width charts below the trend charts and above the Faction charts. */
function AgencyCharts({ snapshot }: { snapshot: Snapshot }) {
  const history = snapshot.history;
  const charts = agencyCharts({
    entries: history?.entries ?? [],
    open: history?.openEntry ?? null,
    moneyAtStartOfTurn: history?.turnSeries.moneyAtStartOfTurn ?? [],
    capUpgrades: capUpgradeIds(snapshot.state?.agency.upgrades ?? []),
    sites: [...(snapshot.state?.missionSites ?? []), ...(snapshot.retired?.missionSites ?? [])],
    ranks: snapshot.gameData?.ranks ?? [],
    agentParameters: snapshot.gameData?.agentParameters ?? {},
  });
  return (
    <>
      {charts.map((chart) => (
        <SeriesChart key={chart.key} chart={chart} />
      ))}
    </>
  );
}

export function ChartsView({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const history = snapshot.history;
  const entries = history?.entries ?? [];
  const state = snapshot.state;
  const panicLimit = state?.panicLimit;
  const sites = [...(state?.missionSites ?? []), ...(snapshot.retired?.missionSites ?? [])];
  // VIS, Charts, Full screen: a chart shown full screen is a Follow, one step away in place of the other charts, and
  // the Charts View then covers the whole screen; the Back control and Escape return.
  const place = usePlace();
  const [fullKey, setFullKey] = usePlaceState<string | null>('fullChart', null);
  const fullScreen = {
    fullKey,
    open: (key: string) => {
      place.follow();
      setFullKey(key);
    },
  };
  return (
    <ChartsFullScreenContext value={fullScreen}>
      <WholeScreen active={fullKey !== null}>
        <DetailView id="charts" title="Charts" onClose={onClose}>
          <div className={fullKey === null ? 'stack' : 'stack charts-full'} data-testid="charts">
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
              {...(panicLimit === undefined
                ? {}
                : { limit: panicLimit, valueNote: `of ${panicLimit}% limit` })}
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
            <AgencyCharts snapshot={snapshot} />
            {/* CVIEW, Faction charts: in the order of the Factions in Campaign state. VIS, Charts: two to a row. */}
            <div className="charts">
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
      </WholeScreen>
    </ChartsFullScreenContext>
  );
}
