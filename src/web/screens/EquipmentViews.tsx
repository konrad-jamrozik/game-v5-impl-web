/**
 * STVIEW, the Storage View: the Items and Ammo the agency holds and can buy, grouped into Weapons, Armor, and Ammo,
 * with a trade bar that gathers the chosen counts into one sale and one purchase.
 */
import { useState, type KeyboardEvent } from 'react';
import type { CurrentLiveWorldStateView, EquipmentItemView, EquipmentView } from '../../engine/index.ts';
import { stepOf } from '../stepper.ts';
import { run, theEngine } from '../store.ts';
import { Button, Grid } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';
import { AmmoWarning, ArmorIcon, SwordIcon } from './equipment-icons.tsx';

const GROUPS: readonly { readonly kind: EquipmentItemView['kind']; readonly name: string }[] = [
  { kind: 'weapon', name: 'Weapons' },
  { kind: 'armor', name: 'Armor' },
  { kind: 'ammo', name: 'Ammo' },
];

type GroupKind = EquipmentItemView['kind'];

/**
 * VIS, Tables: pressing a group row anywhere folds its group and pressing it again unfolds it. The row starts with ▾
 * while unfolded and ▸ while folded. Every group is unfolded whenever the view opens, so the state lives in the view.
 */
function useFoldedGroups() {
  const [folded, setFolded] = useState<ReadonlySet<GroupKind>>(new Set());
  const toggle = (kind: GroupKind) => {
    const next = new Set(folded);
    if (!next.delete(kind)) {
      next.add(kind);
    }
    setFolded(next);
  };
  return {
    isFolded: (kind: GroupKind) => folded.has(kind),
    mark: (kind: GroupKind) => (folded.has(kind) ? '▸' : '▾'),
    row: (kind: GroupKind, name: string) => ({
      className: 'group-row foldable',
      role: 'button',
      tabIndex: 0,
      'aria-expanded': !folded.has(kind),
      'aria-label': `${folded.has(kind) ? 'Unfold' : 'Fold'} ${name}`,
      'data-testid': `fold-${kind}`,
      'data-sound': 'select',
      onClick: () => toggle(kind),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle(kind);
        }
      },
    }),
  };
}

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
function Stats(props: { item: EquipmentItemView; ammoName: (id: string) => string }) {
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
    <span
      className={item.ammoShort ? 'tone-warn figure' : 'figure'}
      title={`Recommended for ${item.ammoAgents} Agents`}
    >
      {item.available.toLocaleString('en-US')} / {item.ammoNeeded.toLocaleString('en-US')}
      {item.ammoShort ? (
        <AmmoWarning
          title={`${item.name} ${item.available}, below ${item.ammoNeeded} for ${item.ammoAgents} Agents`}
        />
      ) : null}
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

/** STVIEW, Trading, item 1: the label, then each chosen entry on a line of its own. */
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

/**
 * STVIEW, Trade count: one control for both directions of one Item, a count below 0 selling and above 0 buying,
 * between a worded Sell and Buy button rather than a bare "−" and "+". The count shows its sign and its direction's
 * colour, "−5" in Positive and "+10" in Accent text, with "Sell 5" or "Buy 10" as its tooltip. "all" before Sell sets
 * the count to the sale limit; for an AmmoType, "+10" and "+100" after Buy add to what is bought.
 */
function TradeControl(props: {
  name: string;
  count: number;
  /** How many can be sold at most, i.e. the count can go down to minus this. */
  saleLimit: number;
  canBuy: boolean;
  bulk: boolean;
  testId: string;
  onChange: (count: number) => void;
}) {
  const { count, saleLimit, canBuy } = props;
  const most = canBuy ? Number.MAX_SAFE_INTEGER : 0;
  const clamp = (value: number) => Math.max(-saleLimit, Math.min(most, Number.isFinite(value) ? value : 0));
  const [draft, setDraft] = useState<string | null>(null);
  const shown = count > 0 ? `+${count}` : count < 0 ? `−${-count}` : '0';
  const tone =
    count < 0 ? 'trade-count tone-good' : count > 0 ? 'trade-count tone-accent' : 'trade-count muted';
  const commit = () => {
    if (draft !== null) {
      const parsed = Number(draft.replace('−', '-').replace('+', '').trim());
      props.onChange(clamp(Number.isNaN(parsed) ? count : Math.trunc(parsed)));
      setDraft(null);
    }
  };
  const move = (direction: 1 | -1, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    props.onChange(clamp(count + direction * stepOf(event)));
  };
  return (
    <span className="trade-control" data-testid={props.testId}>
      <button
        type="button"
        className="stepper-link"
        disabled={saleLimit === 0 || count === -saleLimit}
        title={`Sell every ${props.name} that can be sold`}
        onClick={() => props.onChange(-saleLimit)}
      >
        all
      </button>
      <button
        type="button"
        className="btn trade-step"
        disabled={saleLimit === 0 || count <= -saleLimit}
        title="Sell one · Shift: 10 · Ctrl: 100"
        aria-label={`Sell one more ${props.name}`}
        onMouseDown={(event) => {
          if (event.shiftKey) {
            event.preventDefault();
          }
        }}
        onClick={(event) => move(-1, event)}
      >
        Sell
      </button>
      <input
        type="text"
        inputMode="numeric"
        className={tone}
        aria-label={`${props.name} to trade: below 0 sells, above 0 buys`}
        title={count < 0 ? `Sell ${-count}` : count > 0 ? `Buy ${count}` : 'Nothing traded'}
        value={draft ?? shown}
        onFocus={(event) => {
          setDraft(String(count));
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
      />
      <button
        type="button"
        className="btn trade-step"
        disabled={!canBuy}
        title={canBuy ? 'Buy one · Shift: 10 · Ctrl: 100' : 'Not unlocked'}
        aria-label={`Buy one more ${props.name}`}
        onMouseDown={(event) => {
          if (event.shiftKey) {
            event.preventDefault();
          }
        }}
        onClick={(event) => move(1, event)}
      >
        Buy
      </button>
      {props.bulk && canBuy ? (
        <>
          <button
            type="button"
            className="stepper-link"
            onClick={() => props.onChange(clamp(Math.max(0, count) + 10))}
          >
            +10
          </button>
          <button
            type="button"
            className="stepper-link"
            onClick={() => props.onChange(clamp(Math.max(0, count) + 100))}
          >
            +100
          </button>
        </>
      ) : null}
    </span>
  );
}

/** STVIEW: the Storage View, which shows the agency's gear and what it can buy, and sells and buys in one trade. */
export function StorageView(props: {
  state: CurrentLiveWorldStateView;
  locked: string | null;
  onClose: () => void;
}) {
  const { player } = theEngine();
  const view = props.state.agency.equipment;
  // STVIEW, Trade count: one signed count per row, below 0 selling and above 0 buying.
  const [trades, setTrades] = useState<Record<string, number>>({});
  const folds = useFoldedGroups();
  const [takeEquipped, setTakeEquipped] = useState(false);
  // STVIEW, Storage table: every Item and AmmoType that is Unlocked or owned; nothing says what would unlock the rest.
  const shown = view.items.filter((item) => item.unlocked || item.owned > 0);
  const ammoName = (id: string) => view.items.find((item) => item.id === id)?.name ?? id;
  const limit = (item: EquipmentItemView) =>
    takeEquipped && item.kind !== 'ammo' ? item.owned : item.available;
  const tradeOf = (item: EquipmentItemView) => trades[item.id] ?? 0;
  const sellCount = (item: EquipmentItemView) => Math.min(Math.max(0, -tradeOf(item)), limit(item));
  const buyCount = (item: EquipmentItemView) => (item.unlocked ? Math.max(0, tradeOf(item)) : 0);
  const selling = shown.filter((item) => sellCount(item) > 0);
  const buying = shown.filter((item) => buyCount(item) > 0);
  const earns = saleValueOf(
    view,
    selling.reduce((sum, item) => sum + item.price * sellCount(item), 0),
  );
  const cost = buying.reduce((sum, item) => sum + item.price * buyCount(item), 0);
  const money = props.state.agency.money;
  const missing = cost - money - earns;
  const stripped = takeEquipped ? strippedAgents(props.state, selling, sellCount) : [];
  const nothing = selling.length === 0 && buying.length === 0;
  const clear = () => {
    setTrades({});
  };
  // STVIEW, Trading: the sale first, so that its money pays for the purchase; each is one Player action.
  const trade = () => {
    const sale = selling.map((item) => ({ id: item.id, count: sellCount(item) }));
    const purchase = buying.map((item) => ({ id: item.id, count: buyCount(item) }));
    const equipped = takeEquipped;
    clear();
    void (async () => {
      if (sale.length > 0 && (await run(() => player.actions.sellItems(sale, equipped))) === null) {
        return;
      }
      if (purchase.length > 0) {
        await run(() => player.actions.buyItems(purchase));
      }
    })();
  };
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
      <div className="storage-trade">
        <Grid
          // VIS, Tables: 994 px in all, so that the table fits its view in the Reference window with room for the
          // view's scroll bar. Item holds "Reinforced ballistic vest" after its indent, Stats "32 ⚔ Laser rifle battery",
          // the counts "10,000", and Trade its "all", Sell, count, Buy, "+10", and "+100".
          widths={['186px', '176px', '68px', '60px', '68px', '64px', '72px', '300px']}
          className="equipment-table"
          testId="storage-table"
        >
          <thead>
            <tr>
              <th>Item</th>
              <th>Stats</th>
              <th className="num">Owned</th>
              <th className="num" title="Equipped count">
                Equip.
              </th>
              <th className="num" title="Count in Storage">
                Avail.
              </th>
              <th className="num">Price</th>
              <th className="num" title="Sale value of one">
                Value
              </th>
              <th title="Below 0 sells, above 0 buys">Trade</th>
            </tr>
          </thead>
          {GROUPS.map((group) => {
            const items = shown.filter((item) => item.kind === group.kind);
            const all = view.items.filter((item) => item.kind === group.kind);
            const sum = (f: (item: EquipmentItemView) => number) =>
              all.reduce((total, item) => total + f(item), 0);
            return (
              <tbody key={group.kind} data-testid={`storage-group-${group.kind}`}>
                <tr {...folds.row(group.kind, group.name)}>
                  <td colSpan={2}>
                    {folds.mark(group.kind)} {group.name}
                  </td>
                  <td className="num">{sum((item) => item.owned).toLocaleString('en-US')}</td>
                  <td className="num">{group.kind === 'ammo' ? '–' : sum((item) => item.equipped)}</td>
                  <td className="num">{sum((item) => item.available).toLocaleString('en-US')}</td>
                  <td />
                  <td />
                  <td />
                </tr>
                {folds.isFolded(group.kind) ? null : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      Nothing yet
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} data-testid={`storage-${item.id}`}>
                      <td className="indent">{item.name}</td>
                      <td>
                        <Stats item={item} ammoName={ammoName} />
                      </td>
                      <td className="num">{item.owned.toLocaleString('en-US')}</td>
                      <td className="num">{item.kind === 'ammo' ? '–' : item.equipped}</td>
                      <td className="num">{item.available.toLocaleString('en-US')}</td>
                      <td className="num">{item.unlocked ? item.price.toLocaleString('en-US') : ''}</td>
                      <td className="num">{unitText(view, item.price)}</td>
                      <td>
                        <TradeControl
                          name={item.name}
                          count={tradeOf(item)}
                          saleLimit={limit(item)}
                          canBuy={item.unlocked}
                          bulk={item.kind === 'ammo'}
                          testId={`trade-${item.id}`}
                          onChange={(value) => setTrades({ ...trades, [item.id]: value })}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            );
          })}
        </Grid>
        {/* STVIEW, Trading: one bar as wide as the table, its parts from its left edge. */}
        <div className="trade-bar" data-testid="trade-bar">
          <div className="trade-chosen-pair">
            <Chosen label="Selling" lines={chosenLines(selling, sellCount)} />
            <Chosen label="Buying" lines={chosenLines(buying, buyCount)} />
          </div>
          <div className="trade-line">
            <span className="figure">
              Earns <span className="tone-good">+{earns.toLocaleString('en-US')}</span> · Costs{' '}
              <span className={missing > 0 ? 'tone-bad' : undefined}>{cost.toLocaleString('en-US')}</span> ·
              Money after {(money + earns - cost).toLocaleString('en-US')}
              {missing > 0 ? (
                <span className="tone-bad"> · {missing.toLocaleString('en-US')} missing</span>
              ) : null}
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
              <Button disabledReason={nothing ? 'Nothing is chosen.' : null} onClick={clear}>
                Clear
              </Button>
              <Button
                kind="primary"
                testId="trade"
                disabledReason={
                  props.locked ??
                  (nothing ? 'Nothing is chosen.' : missing > 0 ? `${missing} money missing.` : null)
                }
                onClick={trade}
              >
                Trade
              </Button>
            </span>
          </div>
        </div>
      </div>
    </DetailView>
  );
}

/**
 * STVIEW, Trading, item 3: one line per Agent a sale takes an Item off, in the order EQUIP, Selling Items, takes them:
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
