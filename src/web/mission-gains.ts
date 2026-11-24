/**
 * What each resolved Mission brought, as the Turn summary (TSUM, Groups) and the Turn Report View (TRVIEW, Sections)
 * show it: the Mission site title, the Benefits and Setbacks lines, and the Recovered and Spent equipment with their
 * Sale values. Pure presentation; no gameplay rule.
 */
import type { CombatReport, ConsequenceRecord, MissionSiteView, TurnReport } from '../engine/index.ts';
import { decimalText } from './format.ts';

type MissionResult = TurnReport['missions'][number];

/** GUI, Mission site titles: e.g. "Apprehend member" and "Red Dawn · Initiative · #3", the name in Text. */
export interface MissionSiteTitle {
  readonly name: string;
  readonly details: string;
}

/** GUI, Mission site titles: the number that ends an Instance ID, e.g. "3" for mission-site-3. */
function instanceNumber(id: string): string {
  return /(\d+)$/.exec(id)?.[1] ?? id;
}

export function missionSiteTitle(
  id: string,
  site: MissionSiteView | undefined,
  fallback: { readonly name: string; readonly kind: string },
  factionName: (faction: string) => string,
): MissionSiteTitle {
  const faction = site === undefined ? null : factionName(site.targetFaction);
  return {
    name: site?.name ?? fallback.name,
    details: [faction, site?.kind ?? fallback.kind, `#${instanceNumber(id)}`]
      .filter((part) => part !== null && part !== '')
      .join(' · '),
  };
}

/** The text of a Mission site title on one line, e.g. "Apprehend member · Red Dawn · Initiative · #3". */
export function missionSiteTitleText(title: MissionSiteTitle): string {
  return `${title.name} · ${title.details}`;
}

/** One line of Benefits or Setbacks. */
export interface GainLine {
  readonly text: string;
  readonly tone: 'good' | 'bad';
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `−${-value}`;
}

/** Each Consequence that applied, as its own line, e.g. "+50 money", "−30 funding", or "Panic −1.00". */
function consequenceLines(c: ConsequenceRecord, factionName: (faction: string) => string): GainLine[] {
  const lines: GainLine[] = [];
  if (c.money !== 0) {
    lines.push({ text: `${signed(c.money)} money`, tone: c.money > 0 ? 'good' : 'bad' });
  }
  if (c.fundingChange !== 0) {
    lines.push({ text: `${signed(c.fundingChange)} funding`, tone: c.fundingChange > 0 ? 'good' : 'bad' });
  }
  if (c.panicReductionHundredths !== 0) {
    lines.push({ text: `Panic −${decimalText(c.panicReductionHundredths)}`, tone: 'good' });
  }
  if (c.panicIncreaseHundredths !== 0) {
    lines.push({ text: `Panic +${decimalText(c.panicIncreaseHundredths)}`, tone: 'bad' });
  }
  if (c.eliminatedFaction !== null) {
    lines.push({ text: `${factionName(c.eliminatedFaction)} eliminated`, tone: 'good' });
  }
  if (c.defeat) {
    lines.push({ text: 'Campaign lost', tone: 'bad' });
  }
  return lines;
}

/**
 * TSUM, Groups, Benefits: the gains of a Won Mission, then its rise in the Contracting cap, e.g. "Reputation increased
 * for first apprehension: our Contracting network expands by 4".
 */
export function benefitLines(
  mission: MissionResult,
  firstWinPhrase: string | null,
  factionName: (faction: string) => string,
): GainLine[] {
  if (mission.result !== 'Won') {
    return [];
  }
  const lines = consequenceLines(mission.consequence, factionName).filter((line) => line.tone === 'good');
  if (mission.contractingCapRise > 0) {
    const reason = firstWinPhrase === null ? '' : ` for ${firstWinPhrase}`;
    lines.push({
      text: `Reputation increased${reason}: our Contracting network expands by ${mission.contractingCapRise}`,
      tone: 'good',
    });
  }
  return lines;
}

/** TSUM, Groups, Setbacks: each Consequence that a Lost Mission applied, e.g. "−30 funding" or "Panic +5.00". */
export function setbackLines(mission: MissionResult, factionName: (faction: string) => string): GainLine[] {
  return mission.result === 'Lost' ? consequenceLines(mission.consequence, factionName) : [];
}

/** The Items and AmmoTypes of the Game build in authored order, with their `name` and `price`, and the sale share. */
export interface EquipmentCatalog {
  readonly weapons: readonly { readonly id: string; readonly name: string; readonly price: number | null }[];
  readonly armors: readonly { readonly id: string; readonly name: string; readonly price: number | null }[];
  readonly ammoTypes: readonly { readonly id: string; readonly name: string; readonly price: number }[];
  readonly salePriceFraction: { readonly numerator: number; readonly denominator: number } | null;
}

export interface EquipmentEntry {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly round: boolean;
}

/** TRVIEW, Sections, Equipment: one list, each entry an Item or AmmoType with its count, and its Sale value. */
export interface EquipmentList {
  readonly entries: readonly EquipmentEntry[];
  readonly items: number;
  readonly rounds: number;
  readonly value: number;
}

export interface MissionEquipment {
  readonly recovered: EquipmentList;
  readonly spent: EquipmentList;
}

function add(into: Map<string, number>, counts: Readonly<Record<string, number>>): void {
  for (const [id, count] of Object.entries(counts)) {
    if (count > 0) {
      into.set(id, (into.get(id) ?? 0) + count);
    }
  }
}

/**
 * EQUIP, Sale value of a list: round down(sale_price_fraction × Σ price × count), rounded once. Weapons, then Armors,
 * then AmmoTypes, each in authored order; an identifier the catalog lacks follows them, named by itself.
 */
function equipmentList(counts: Map<string, number>, catalog: EquipmentCatalog | null): EquipmentList {
  const known = [
    ...(catalog?.weapons ?? []).map((item) => ({ ...item, round: false })),
    ...(catalog?.armors ?? []).map((item) => ({ ...item, round: false })),
    ...(catalog?.ammoTypes ?? []).map((item) => ({ ...item, round: true })),
  ];
  const entries: EquipmentEntry[] = [];
  let priced = 0;
  for (const item of known) {
    const count = counts.get(item.id) ?? 0;
    if (count > 0) {
      entries.push({ id: item.id, name: item.name, count, round: item.round });
      priced += (item.price ?? 0) * count;
    }
  }
  for (const [id, count] of counts) {
    if (!known.some((item) => item.id === id)) {
      entries.push({ id, name: id, count, round: false });
    }
  }
  const fraction = catalog?.salePriceFraction;
  return {
    entries,
    items: entries.filter((entry) => !entry.round).reduce((sum, entry) => sum + entry.count, 0),
    rounds: entries.filter((entry) => entry.round).reduce((sum, entry) => sum + entry.count, 0),
    value: fraction == null ? 0 : Math.floor((priced * fraction.numerator) / fraction.denominator),
  };
}

/**
 * TRVIEW, Sections, Equipment: Recovered is the Spoils of war and the Recovered Items; Spent is the rounds its Combat
 * spent and the Items lost.
 */
export function missionEquipment(
  mission: MissionResult,
  combat: CombatReport | undefined,
  catalog: EquipmentCatalog | null,
): MissionEquipment {
  const recovered = new Map<string, number>();
  add(recovered, mission.equipment.spoils);
  add(recovered, mission.equipment.returned);
  const spent = new Map<string, number>();
  for (const item of combat?.ammo ?? []) {
    if (item.start > item.end) {
      spent.set(item.ammoType, (spent.get(item.ammoType) ?? 0) + item.start - item.end);
    }
  }
  add(spent, mission.equipment.lost);
  return { recovered: equipmentList(recovered, catalog), spent: equipmentList(spent, catalog) };
}

const counted = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** TSUM, Groups, Equipment recovered: e.g. "3 Items, 11 rounds · worth 165". */
export function recoveredText(list: EquipmentList): string {
  const parts = [
    ...(list.items > 0 ? [counted(list.items, 'Item')] : []),
    ...(list.rounds > 0 ? [counted(list.rounds, 'round')] : []),
  ];
  return `${parts.join(', ')} · worth ${list.value.toLocaleString('en-US')}`;
}
