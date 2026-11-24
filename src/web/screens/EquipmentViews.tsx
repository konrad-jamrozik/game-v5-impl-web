/**
 * STVIEW, the Storage View, and ACQVIEW, the Acquisitions View: the Items and Ammo the agency holds, grouped into
 * Weapons, Armor, and Ammo, with a bar that gathers the chosen counts into one sale or one purchase.
 */
import { useState, type ReactNode } from 'react';
import type { CurrentLiveWorldStateView, EquipmentItemView, EquipmentView } from '../../engine/index.ts';
import { stepOf, steppedCount } from '../stepper.ts';
import { act, theEngine } from '../store.ts';
import { Button, Grid } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';
import { AmmoWarning, ArmorIcon, SwordIcon } from './equipment-icons.tsx';

const GROUPS: readonly { readonly kind: EquipmentItemView['kind']; readonly name: string }[] = [
  { kind: 'weapon', name: 'Weapons' },
  { kind: 'armor', name: 'Armor' },
  { kind: 'ammo', name: 'Ammo' },
];

/** EQUIP, Sale value: round down(sale_price_fraction × Σ price × count), rounded once for the whole sale. */
export function saleValueOf(view: EquipmentView, priced: number): number {
  return Math.floor((priced * view.salePriceFraction.numerator) / view.salePriceFraction.denominator);
}

/** The Sale value of one, with two decimals when it is not whole, e.g. "0.50"; GUI, Decimal quantities shown. */
function unitText(view: EquipmentView, price: number, count = 1): string {
  const exact = (price * count * view.salePriceFraction.numerator) / view.salePriceFraction.denominator;
  return Number.isInteger(exact) ? exact.toLocaleString('en-US') : exact.toFixed(2);
}

function sumText(
  view: EquipmentView,
  items: readonly EquipmentItemView[],
  count: (item: EquipmentItemView) => number,
) {
  const priced = items.reduce((sum, item) => sum + item.price * count(item), 0);
  const exact = (priced * view.salePriceFraction.numerator) / view.salePriceFraction.denominator;
  return Number.isInteger(exact) ? exact.toLocaleString('en-US') : exact.toFixed(2);
}

/** STVIEW, Storage header: what a value is, the share of the price `sale_price_fraction` gives, e.g. "half the price". */
function valueNote(view: EquipmentView): string {
  const { numerator, denominator } = view.salePriceFraction;
  if (numerator * 2 === denominator) {
    return 'Value is half the price';
  }
  const percent = (numerator * 100) / denominator;
  return `Value is ${Number.isInteger(percent) ? percent : percent.toFixed(1)}% of the price`;
}

/**
 * STVIEW, Storage table, Stats: a Weapon's damage and AmmoType, an Armor's armor, an AmmoType's rounds against need.
 * The number sits right-aligned in a fixed width, so the icons and names after it line up from row to row.
 */
function Stats(props: { item: EquipmentItemView; ammoName: (id: string) => string; withNeed: boolean }) {
  const { item } = props;
  if (item.kind === 'weapon') {
    return (
      <span>
        <span className="figure stat-figure">{item.stat}</span>
        <SwordIcon />{' '}
        <span className="muted">{item.ammoType === null ? '' : props.ammoName(item.ammoType)}</span>
      </span>
    );
  }
  if (item.kind === 'armor') {
    return (
      <span>
        <span className="figure stat-figure">{item.stat}</span>
        <ArmorIcon />
      </span>
    );
  }
  return (
    <span className={item.ammoShort ? 'tone-warn figure' : 'figure'}>
      {item.available.toLocaleString('en-US')} / {item.ammoNeeded.toLocaleString('en-US')} recommended
      {props.withNeed ? ` (${item.ammoAgents} Agents)` : ''}
      {item.ammoShort ? (
        <AmmoWarning
          title={`${item.name} ${item.available}, below ${item.ammoNeeded} for ${item.ammoAgents} Agents`}
        />
      ) : null}
    </span>
  );
}

/** VIS, Steppers: a stepper with a number field, from 0 to `max`, and extra buttons after it. */
function Stepper(props: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  extra?: ReactNode;
}) {
  const set = (value: number) => {
    props.onChange(Math.max(0, Math.min(props.max, Number.isFinite(value) ? Math.floor(value) : 0)));
  };
  return (
    <span className="stepper">
      <button
        type="button"
        aria-label={`One fewer ${props.label}`}
        title="Shift: 10 · Ctrl: 100"
        onMouseDown={(event) => {
          if (event.shiftKey) {
            event.preventDefault();
          }
        }}
        onClick={(event) => set(steppedCount(props.value, -stepOf(event), props.max))}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={props.max}
        aria-label={`${props.label} count`}
        className={props.value > 0 ? 'chosen' : undefined}
        value={props.value}
        onChange={(event) => set(Number(event.target.value))}
      />
      <button
        type="button"
        aria-label={`One more ${props.label}`}
        title="Shift: 10 · Ctrl: 100"
        onMouseDown={(event) => {
          if (event.shiftKey) {
            event.preventDefault();
          }
        }}
        onClick={(event) => set(steppedCount(props.value, stepOf(event), props.max))}
      >
        +
      </button>
      {props.extra}
    </span>
  );
}

/** "2 Rifles", "1 Ballistic vest", "50 Pistol ammo": each chosen entry by count and name, one per line. */
function chosenLines(
  items: readonly EquipmentItemView[],
  count: (item: EquipmentItemView) => number,
): string[] {
  return items
    .filter((item) => count(item) > 0)
    .map((item) => {
      const n = count(item);
      const plural =
        item.kind !== 'ammo' && n !== 1 && !item.name.endsWith('s') ? `${item.name}s` : item.name;
      return `${n} ${plural}`;
    });
}

/** ACQVIEW, Buying, and STVIEW, Selling, item 1: the label, then each chosen entry on a line of its own. */
function Chosen(props: { label: string; lines: readonly string[] }) {
  return (
    <div className="trade-chosen">
      <span className="label">{props.label}</span>
      {props.lines.length === 0 ? (
        <span className="muted">nothing</span>
      ) : (
        props.lines.map((line) => <span key={line}>{line}</span>)
      )}
    </div>
  );
}

/** STVIEW: the Storage View. */
export function StorageView(props: {
  state: CurrentLiveWorldStateView;
  locked: string | null;
  onClose: () => void;
}) {
  const { player } = theEngine();
  const view = props.state.agency.equipment;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [takeEquipped, setTakeEquipped] = useState(false);
  const owned = view.items.filter((item) => item.owned > 0);
  const ammoName = (id: string) => view.items.find((item) => item.id === id)?.name ?? id;
  const limit = (item: EquipmentItemView) =>
    takeEquipped && item.kind !== 'ammo' ? item.owned : item.available;
  const count = (item: EquipmentItemView) => Math.min(counts[item.id] ?? 0, limit(item));
  const chosen = owned.filter((item) => count(item) > 0);
  const earns = saleValueOf(
    view,
    chosen.reduce((sum, item) => sum + item.price * count(item), 0),
  );
  const money = props.state.agency.money;
  const stripped = takeEquipped ? strippedAgents(props.state, chosen, count) : [];
  return (
    <DetailView
      id="storage"
      title="Storage"
      aside={
        <>
          Money {money.toLocaleString('en-US')}
          <span className="muted" data-testid="storage-value-note">
            {' '}
            · {valueNote(view)}
          </span>
          {/* STVIEW, Totals: what all the gear is worth, at the end of the header. */}
          <span data-testid="storage-totals">
            {' '}
            · Owned worth {sumText(view, view.items, (item) => item.owned)} · Available worth{' '}
            {sumText(view, view.items, (item) => item.available)}
          </span>
        </>
      }
      onClose={props.onClose}
    >
      <Grid
        // VIS, Tables: 1042 px in all, so that the table fits its view in the Reference window with its Sell column.
        // Stats holds the longest Ammo Stats on one line, e.g. "950 / 1300 recommended (13 Agents)".
        widths={['170px', '340px', '64px', '70px', '64px', '60px', '190px', '84px']}
        className="equipment-table"
        testId="storage-table"
      >
        <thead>
          <tr>
            <th>Item</th>
            <th>Stats</th>
            <th className="num">Owned</th>
            <th className="num">Equip.</th>
            <th className="num">Avail.</th>
            <th className="num" title="Sale value of one">
              Unit
            </th>
            <th>Sell</th>
            <th className="num">Earns</th>
          </tr>
        </thead>
        {GROUPS.map((group) => {
          const items = owned.filter((item) => item.kind === group.kind);
          const all = view.items.filter((item) => item.kind === group.kind);
          const sum = (f: (item: EquipmentItemView) => number) =>
            all.reduce((total, item) => total + f(item), 0);
          return (
            <tbody key={group.kind} data-testid={`storage-group-${group.kind}`}>
              <tr className="group-row">
                <td colSpan={2}>▾ {group.name}</td>
                <td className="num">{sum((item) => item.owned).toLocaleString('en-US')}</td>
                <td className="num">{group.kind === 'ammo' ? '–' : sum((item) => item.equipped)}</td>
                <td className="num">{sum((item) => item.available).toLocaleString('en-US')}</td>
                <td />
                <td />
                <td />
              </tr>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Nothing in Storage
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} data-testid={`storage-${item.id}`}>
                    <td className="indent">{item.name}</td>
                    <td>
                      <Stats item={item} ammoName={ammoName} withNeed />
                    </td>
                    <td className="num">{item.owned.toLocaleString('en-US')}</td>
                    <td className="num">{item.kind === 'ammo' ? '–' : item.equipped}</td>
                    <td className="num">{item.available.toLocaleString('en-US')}</td>
                    <td className="num">{unitText(view, item.price)}</td>
                    <td>
                      <Stepper
                        label={item.name}
                        value={count(item)}
                        max={limit(item)}
                        onChange={(value) => setCounts({ ...counts, [item.id]: value })}
                        extra={
                          limit(item) > 0 ? (
                            <button
                              type="button"
                              className="stepper-link"
                              onClick={() => setCounts({ ...counts, [item.id]: limit(item) })}
                            >
                              max
                            </button>
                          ) : null
                        }
                      />
                    </td>
                    <td className="num tone-good" data-testid={`storage-earns-${item.id}`}>
                      {count(item) > 0 ? `+${unitText(view, item.price, count(item))}` : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          );
        })}
      </Grid>
      <div className="trade-bar" data-testid="sell-bar">
        <Chosen label="Selling" lines={chosenLines(chosen, count)} />
        <div className="trade-line">
          <span className="figure">
            Earns <span className="tone-good">+{earns.toLocaleString('en-US')}</span> · Money after{' '}
            {(money + earns).toLocaleString('en-US')}
          </span>
        </div>
        {stripped.map((line) => (
          <div key={line} className="trade-line muted small">
            {line}
          </div>
        ))}
        <div className="trade-line">
          <label className="trade-check">
            <input
              type="checkbox"
              checked={takeEquipped}
              onChange={(event) => setTakeEquipped(event.target.checked)}
              data-testid="allow-selling-equipped"
            />
            Allow selling equipped
          </label>
          <span className="trade-buttons">
            <Button
              disabledReason={chosen.length === 0 ? 'Nothing is chosen.' : null}
              onClick={() => setCounts({})}
            >
              Clear
            </Button>
            <Button
              kind="primary"
              testId="sell"
              disabledReason={props.locked ?? (chosen.length === 0 ? 'Nothing is chosen.' : null)}
              onClick={() => {
                act(() =>
                  player.actions.sellItems(
                    chosen.map((item) => ({ id: item.id, count: count(item) })),
                    takeEquipped,
                  ),
                );
                setCounts({});
              }}
            >
              Sell · {earns.toLocaleString('en-US')}
            </Button>
          </span>
        </div>
      </div>
    </DetailView>
  );
}

/**
 * STVIEW, Selling, item 3: one line per Agent a sale takes an Item off, in the order EQUIP, Selling Items, takes them:
 * the lowest effective skill first, and among equal the higher Instance ID number.
 */
function strippedAgents(
  state: CurrentLiveWorldStateView,
  chosen: readonly EquipmentItemView[],
  count: (item: EquipmentItemView) => number,
): string[] {
  const view = state.agency.equipment;
  const number = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1));
  const lines: string[] = [];
  for (const item of chosen) {
    const rest = count(item) - item.available;
    if (rest <= 0 || item.kind === 'ammo') {
      continue;
    }
    const wearers = state.agents
      .filter((agent) => agent.agentStatus !== 'Killed' && agent.agentStatus !== 'Dismissed')
      .filter((agent) => agent.weapon === item.id || agent.armor === item.id)
      .sort((x, y) => x.effectiveSkill - y.effectiveSkill || number(y.id) - number(x.id))
      .slice(0, rest);
    const fallbackName = item.kind === 'weapon' ? view.fallbackWeaponName : view.fallbackArmorName;
    for (const agent of wearers) {
      lines.push(`${agent.id} loses ${item.name} → ${fallbackName}`);
    }
  }
  return lines;
}

/** ACQVIEW: the Acquisitions View, listing only what is Unlocked. */
export function AcquisitionsView(props: {
  state: CurrentLiveWorldStateView;
  locked: string | null;
  onClose: () => void;
}) {
  const { player } = theEngine();
  const view = props.state.agency.equipment;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const unlocked = view.items.filter((item) => item.unlocked);
  const ammoName = (id: string) => view.items.find((item) => item.id === id)?.name ?? id;
  const count = (item: EquipmentItemView) => counts[item.id] ?? 0;
  const chosen = unlocked.filter((item) => count(item) > 0);
  const cost = chosen.reduce((sum, item) => sum + item.price * count(item), 0);
  const money = props.state.agency.money;
  const missing = cost - money;
  const add = (item: EquipmentItemView, n: number) => setCounts({ ...counts, [item.id]: count(item) + n });
  return (
    <DetailView
      id="acquisitions"
      title="Acquisitions"
      aside={`Money ${money.toLocaleString('en-US')}`}
      onClose={props.onClose}
    >
      <Grid
        // VIS, Tables: 1016 px in all. Stats holds the longest Ammo Stats on one line, e.g. "95 / 130 recommended".
        widths={['170px', '260px', '70px', '70px', '76px', '70px', '210px', '90px']}
        className="equipment-table"
        testId="acquisitions-table"
      >
        <thead>
          <tr>
            <th>Item</th>
            <th>Stats</th>
            <th className="num">Price</th>
            <th className="num">Owned</th>
            <th className="num">Equip.</th>
            <th className="num">Avail.</th>
            <th>Buy</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
        {GROUPS.map((group) => {
          const items = unlocked.filter((item) => item.kind === group.kind);
          return (
            <tbody key={group.kind} data-testid={`acquisitions-group-${group.kind}`}>
              <tr className="group-row">
                <td colSpan={8}>▾ {group.name}</td>
              </tr>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Nothing to buy yet
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} data-testid={`acquisitions-${item.id}`}>
                    <td className="indent">{item.name}</td>
                    <td>
                      <Stats item={item} ammoName={ammoName} withNeed={false} />
                    </td>
                    <td className="num">{item.price.toLocaleString('en-US')}</td>
                    <td className="num">{item.owned.toLocaleString('en-US')}</td>
                    <td className="num">{item.kind === 'ammo' ? '–' : item.equipped}</td>
                    <td className="num">{item.available.toLocaleString('en-US')}</td>
                    <td>
                      <Stepper
                        label={item.name}
                        value={count(item)}
                        max={Number.MAX_SAFE_INTEGER}
                        onChange={(value) => setCounts({ ...counts, [item.id]: value })}
                        extra={
                          item.kind === 'ammo' ? (
                            <>
                              <button type="button" className="stepper-link" onClick={() => add(item, 10)}>
                                +10
                              </button>
                              <button type="button" className="stepper-link" onClick={() => add(item, 100)}>
                                +100
                              </button>
                            </>
                          ) : null
                        }
                      />
                    </td>
                    <td className="num" data-testid={`acquisitions-cost-${item.id}`}>
                      {count(item) > 0 ? (item.price * count(item)).toLocaleString('en-US') : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          );
        })}
      </Grid>
      <div className="trade-bar" data-testid="buy-bar">
        <Chosen label="Buying" lines={chosenLines(chosen, count)} />
        <div className="trade-line">
          <span className="figure">
            Costs <span className={missing > 0 ? 'tone-bad' : undefined}>{cost.toLocaleString('en-US')}</span>{' '}
            · Money after {(money - cost).toLocaleString('en-US')}
            {missing > 0 ? (
              <span className="tone-bad"> · {missing.toLocaleString('en-US')} missing</span>
            ) : null}
          </span>
        </div>
        <div className="trade-line">
          <span className="trade-buttons">
            <Button
              disabledReason={chosen.length === 0 ? 'Nothing is chosen.' : null}
              onClick={() => setCounts({})}
            >
              Clear
            </Button>
            <Button
              kind="primary"
              testId="buy"
              disabledReason={
                props.locked ??
                (chosen.length === 0
                  ? 'Nothing is chosen.'
                  : missing > 0
                    ? `${missing} money missing.`
                    : null)
              }
              onClick={() => {
                act(() =>
                  player.actions.buyItems(chosen.map((item) => ({ id: item.id, count: count(item) }))),
                );
                setCounts({});
              }}
            >
              Buy · {cost.toLocaleString('en-US')}
            </Button>
          </span>
        </div>
      </div>
    </DetailView>
  );
}
