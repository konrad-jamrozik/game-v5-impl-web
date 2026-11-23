/** UVIEW: the Upgrades View, one card per Upgrade with what one more purchase changes and whether it is affordable. */
import type { CurrentLiveWorldStateView, UpgradeView } from '../../engine/index.ts';
import { decimalText } from '../format.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Button, Tally } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

const CAPS: Record<string, { name: string; value: (state: CurrentLiveWorldStateView) => number }> = {
  agent_cap: { name: 'Agent cap', value: (state) => state.agency.agentCap },
  transport_cap: { name: 'Transport cap', value: (state) => state.agency.transportCap },
  training_cap: { name: 'Training cap', value: (state) => state.agency.trainingCap },
};

/** ECON, Rate Upgrades: each rate is a Decimal quantity, in hundredths. */
const RATES: Record<
  string,
  { name: string; unit: string; value: (state: CurrentLiveWorldStateView) => number }
> = {
  training_skill_gain: {
    name: 'Training skill gain',
    unit: '',
    value: (state) => state.agency.trainingSkillGainHundredths,
  },
  exhaustion_recovery: {
    name: 'Exhaustion recovery',
    unit: '',
    value: (state) => state.agency.exhaustionRecoveryHundredths,
  },
  health_recovery: {
    name: 'Health recovery',
    unit: '%',
    value: (state) => state.agency.healthRecoveryPctHundredths,
  },
};

/**
 * UVIEW, Upgrade cards: what one more acquisition changes, by its `effect` and `increment`: the value it changes, as a
 * line of its own, then that value now and after one more acquisition, or the Increment alone, as the Screenshot shows.
 */
interface Change {
  readonly kind: string;
  readonly what: string;
  readonly before: string | null;
  readonly after: string;
}

function change(upgrade: UpgradeView, state: CurrentLiveWorldStateView): Change {
  const cap = CAPS[upgrade.effect];
  if (cap !== undefined) {
    const now = cap.value(state);
    return {
      kind: 'Cap Upgrade',
      what: cap.name,
      before: String(now),
      after: String(now + upgrade.incrementHundredths / 100),
    };
  }
  const rate = RATES[upgrade.effect];
  if (rate !== undefined) {
    // UVIEW, Upgrade cards: e.g. "Exhaustion recovery 5.00 → 5.50" under GUI, Decimal quantities shown.
    const now = rate.value(state);
    return {
      kind: 'Rate Upgrade',
      what: rate.name,
      before: `${decimalText(now)}${rate.unit}`,
      after: `${decimalText(now + upgrade.incrementHundredths)}${rate.unit}`,
    };
  }
  // UVIEW, Upgrade cards: the Increment added to the effective max health of every Serving Agent, e.g. "+1 max
  // health": "Max health of every Agent" above a bare "+1".
  return {
    kind: 'Max health Upgrade',
    what: 'Max health of every Agent',
    before: null,
    after: `+${upgrade.incrementHundredths / 100}`,
  };
}

export function UpgradesView(props: {
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  locked: string | null;
  onClose: () => void;
}) {
  const { player } = theEngine();
  const { snapshot, state, locked } = props;
  const purchases = snapshot.actions?.purchaseUpgrade ?? [];
  const money = state.agency.money;
  return (
    <DetailView id="upgrades" title="Upgrades" aside={`Money ${money}`} onClose={props.onClose}>
      <div className="upgrade-cards" data-testid="upgrades">
        {state.agency.upgrades.map((upgrade) => {
          const purchase = purchases.find((item) => item.upgrade === upgrade.id);
          const { kind, what, before, after } = change(upgrade, state);
          const missing = upgrade.price - money;
          return (
            <article key={upgrade.id} className="card upgrade-card" data-testid={`upgrade-${upgrade.id}`}>
              <span className="label">{kind}</span>
              <h4>{upgrade.name}</h4>
              <p className="secondary small upgrade-what">{what}</p>
              <p className="upgrade-change figure" data-testid={`upgrade-change-${upgrade.id}`}>
                {before === null ? null : <>{before} → </>}
                <span className="tone-good">{after}</span>
              </p>
              <p className="muted small">Bought {upgrade.acquisitions}×</p>
              <div className="card-actions upgrade-buy">
                <Button
                  kind="primary"
                  testId={`buy-${upgrade.id}`}
                  disabledReason={
                    locked ?? (purchase?.available === true ? null : (purchase?.message ?? 'Unavailable.'))
                  }
                  onClick={() => {
                    act(() => player.actions.purchaseUpgrade(upgrade.id));
                  }}
                >
                  Buy · {upgrade.price}
                </Button>
                {missing > 0 ? (
                  <span className="tone-bad small upgrade-missing">{missing} missing</span>
                ) : null}
              </div>
              <Tally
                count={upgrade.acquisitions}
                label={`Bought ${upgrade.acquisitions}×`}
                testId={`tally-${upgrade.id}`}
              />
            </article>
          );
        })}
      </div>
    </DetailView>
  );
}
