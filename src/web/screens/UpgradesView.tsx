/** UVIEW: the Upgrades View, one card per Upgrade with what one more purchase changes and whether it is affordable. */
import type { CurrentStateView, UpgradeView } from '../../engine/index.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Button, Tally } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

const CAPS: Record<string, { name: string; value: (state: CurrentStateView) => number }> = {
  agent_cap: { name: 'Agent cap', value: (state) => state.agency.agentCap },
  transport_cap: { name: 'Transport cap', value: (state) => state.agency.transportCap },
  training_cap: { name: 'Training cap', value: (state) => state.agency.trainingCap },
};

/** UVIEW, Upgrade cards: what one more acquisition changes, by its `effect` and `increment`. */
function change(upgrade: UpgradeView, state: CurrentStateView): { kind: string; text: string } {
  const cap = CAPS[upgrade.effect];
  if (cap !== undefined) {
    const now = cap.value(state);
    return { kind: 'Cap Upgrade', text: `${cap.name} ${now} → ${now + upgrade.increment}` };
  }
  return { kind: 'Weapon damage Upgrade', text: `+${upgrade.increment} base weapon damage` };
}

export function UpgradesView(props: {
  snapshot: Snapshot;
  state: CurrentStateView;
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
          const { kind, text } = change(upgrade, state);
          const missing = upgrade.price - money;
          return (
            <article key={upgrade.id} className="card upgrade-card" data-testid={`upgrade-${upgrade.id}`}>
              <h4>{upgrade.name}</h4>
              <span className="label">{kind}</span>
              <p className="upgrade-change figure">{text}</p>
              <p className="muted small">Bought {upgrade.acquisitions}×</p>
              <div className="card-actions">
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
                {missing > 0 ? <span className="tone-bad small">{missing} money missing</span> : null}
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
