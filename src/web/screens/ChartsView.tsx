/**
 * CVIEW: the Charts View. It leads with a full-width Panic chart, because Panic is how a Campaign is lost, above three
 * smaller trend charts of the resources the agency runs on, five full-width Agency charts, and one Faction chart for
 * each Faction below them.
 */
import {
  ACTIVITY_SERIES,
  activityBars,
  ASSET_SERIES,
  assetLines,
  COMBAT_BAR_SERIES,
  COMBAT_LINE_SERIES,
  combatStrength,
  EXPENDITURE_SERIES,
  INCOME_SERIES,
  moneyFlow,
  NET_FLOW,
  skillBands,
  wornLines,
} from '../agency-charts.ts';
import { responseSitesSeries } from '../faction-activity.ts';
import { decimalText } from '../format.ts';
import type { Snapshot } from '../store.ts';
import { DetailView } from './DetailView.tsx';
import { LineChart } from './LineChart.tsx';
import { SeriesChart } from './SeriesChart.tsx';

/** CVIEW, Agency charts: five full-width charts below the trend charts and above the Faction charts. */
function AgencyCharts({ snapshot }: { snapshot: Snapshot }) {
  const history = snapshot.history;
  const entries = history?.entries ?? [];
  const open = history?.openEntry ?? null;
  const moneyAtStart = history?.turnSeries.moneyAtStartOfTurn ?? [];
  // ECON, Glossary: a Cap Upgrade raises the Agent cap, the Transport cap, or the Training cap.
  const capUpgrades = new Set(
    (snapshot.state?.agency.upgrades ?? [])
      .filter((upgrade) => ['agent_cap', 'transport_cap', 'training_cap'].includes(upgrade.effect))
      .map((upgrade) => upgrade.id),
  );
  const flow = moneyFlow(entries, moneyAtStart, capUpgrades);
  const skills = skillBands(entries, open);
  // CVIEW, Agents by effective skill: the thresholds of its exhaustion lines come from AgentParameters.
  const parameters = snapshot.gameData?.agentParameters ?? {};
  const worn = wornLines(entries, open, { freePoints: parameters['exhaustionFreePoints'] ?? 30 });
  const assets = assetLines(entries, open, moneyAtStart);
  const strength = combatStrength(entries, open, [
    ...(snapshot.state?.missionSites ?? []),
    ...(snapshot.retired?.missionSites ?? []),
  ]);
  return (
    <>
      <SeriesChart
        title="Agents · end of Turn"
        barSeries={ACTIVITY_SERIES}
        bars={activityBars(entries, open)}
        total
        testId="agent-activity-chart"
      />
      <SeriesChart
        title="Money flow"
        barSeries={[...INCOME_SERIES, ...EXPENDITURE_SERIES]}
        bars={flow.bars}
        lines={[{ ...NET_FLOW, points: flow.net }]}
        testId="money-flow-chart"
      />
      <SeriesChart
        title="Assets · start of Turn"
        lines={[
          { ...ASSET_SERIES.money, points: assets.money },
          { ...ASSET_SERIES.servingAgents, points: assets.servingAgents, axis: 'right' },
          { ...ASSET_SERIES.agentCap, points: assets.agentCap, axis: 'right' },
          { ...ASSET_SERIES.transportCap, points: assets.transportCap, axis: 'right' },
          { ...ASSET_SERIES.trainingCap, points: assets.trainingCap, axis: 'right' },
        ]}
        testId="assets-chart"
      />
      <SeriesChart
        title="Agents by effective skill · end of Turn"
        barSeries={skills.series}
        bars={skills.bars}
        lines={worn}
        total
        testId="skill-chart"
      />
      <SeriesChart
        title="Combat ratings · end of Turn"
        barSeries={COMBAT_BAR_SERIES}
        bars={strength.bars}
        lines={[
          { ...COMBAT_LINE_SERIES.lastSite, points: strength.lastSite },
          { ...COMBAT_LINE_SERIES.lastFiveSites, points: strength.lastFiveSites },
        ]}
        total
        testId="combat-strength-chart"
      />
    </>
  );
}

export function ChartsView({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const history = snapshot.history;
  const entries = history?.entries ?? [];
  const state = snapshot.state;
  const panicLimit = state?.panicLimit;
  const sites = [...(state?.missionSites ?? []), ...(snapshot.retired?.missionSites ?? [])];
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
        <AgencyCharts snapshot={snapshot} />
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
