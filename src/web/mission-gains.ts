/**
 * What each resolved Mission brought, as the Turn summary (TSUM, Groups) and the Turn Report View (TRVIEW, Sections)
 * show it: the Mission site title, the Consequences lines, and the Recovered and Spent equipment with their
 * Sale values. Pure presentation; no gameplay rule.
 */
import type { CombatReport, ConsequenceRecord, MissionSiteView, TurnReport } from '../engine/index.ts';
import { decimalText, groupDigits } from './format.ts';

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

/** One Consequence, a rise in the Contracting cap, or, from `joinedLines`, Consequences joined on one line. */
export interface GainLine {
  readonly text: string;
  readonly tone: 'good' | 'bad';
  /** TRVIEW, Sections, Consequences: the rise in the Contracting cap takes a line of its own. */
  readonly ownLine?: boolean;
  /** VIS, Consequences: the Consequences a joined line holds, each in its own tone. */
  readonly parts?: readonly GainLine[];
}

function signed(value: number): string {
  return value > 0 ? `+${groupDigits(value)}` : `−${groupDigits(-value)}`;
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

/** TSUM, Groups, Consequences: a Won Mission's rise in the Contracting cap, with its first win phrase. */
function capRiseLines(mission: MissionResult, firstWinPhrase: string | null): GainLine[] {
  if (mission.result !== 'Won' || mission.contractingCapRise <= 0) {
    return [];
  }
  const reason = firstWinPhrase === null ? '' : ` for ${firstWinPhrase}`;
  return [
    {
      text: `Reputation increased${reason}: our Contracting network expands by ${groupDigits(mission.contractingCapRise)}`,
      tone: 'good',
      ownLine: true,
    },
  ];
}

/**
 * TRVIEW, Sections, Consequences: the Consequences a Mission applied, Won or Lost, then its rise in the Contracting
 * cap, e.g. "Reputation increased for first apprehension: our Contracting network expands by 4".
 */
export function missionConsequenceLines(
  mission: MissionResult,
  firstWinPhrase: string | null,
  factionName: (faction: string) => string,
): GainLine[] {
  return [...consequenceLines(mission.consequence, factionName), ...capRiseLines(mission, firstWinPhrase)];
}

/**
 * TRVIEW, Sections and TSUM, Groups, Consequences: the lines that are not `ownLine` joined on one line, e.g. "+50
 * money, −5 funding", each keeping its tone in `parts`, then each `ownLine` line, e.g. a rise in the Contracting cap.
 */
export function joinedLines(lines: readonly GainLine[]): GainLine[] {
  const joined = lines.filter((line) => line.ownLine !== true);
  const first = joined[0];
  return [
    ...(first === undefined
      ? []
      : [{ text: joined.map((line) => line.text).join(', '), tone: first.tone, parts: joined }]),
    ...lines.filter((line) => line.ownLine === true),
  ];
}

/**
 * TSUM, Groups, Consequences: the Consequences of every Mission, Won or Lost, summed by kind on one line, a gain and
 * a loss of one kind netting to one change, e.g. "+120 money, −15 funding, Panic +4.00"; each Faction made Eliminated
 * keeps a part of its own; then each rise in the Contracting cap on a line of its own.
 */
export function summedConsequenceLines(
  missions: readonly MissionResult[],
  firstWinPhrase: (archetype: string) => string | null,
  factionName: (faction: string) => string,
): GainLine[] {
  const records = missions.map((mission) => mission.consequence);
  const sum = (pick: (c: ConsequenceRecord) => number) => records.reduce((total, c) => total + pick(c), 0);
  const panic = sum((c) => c.panicIncreaseHundredths - c.panicReductionHundredths);
  const total: ConsequenceRecord = {
    money: sum((c) => c.money),
    fundingChange: sum((c) => c.fundingChange),
    panicIncreaseHundredths: Math.max(panic, 0),
    panicReductionHundredths: Math.max(-panic, 0),
    eliminatedFaction: null,
    defeat: false,
  };
  const eliminated = records.flatMap((c) =>
    c.eliminatedFaction === null
      ? []
      : [{ text: `${factionName(c.eliminatedFaction)} eliminated`, tone: 'good' as const }],
  );
  const defeat = records.some((c) => c.defeat) ? [{ text: 'Campaign lost', tone: 'bad' as const }] : [];
  const caps = missions.flatMap((mission) =>
    capRiseLines(mission, firstWinPhrase(mission.missionSiteArchetype)),
  );
  return joinedLines([...consequenceLines(total, factionName), ...eliminated, ...defeat, ...caps]);
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

const counted = (count: number, word: string) => `${groupDigits(count)} ${word}${count === 1 ? '' : 's'}`;

/**
 * TSUM, Groups, Equipment: the lists of every Mission summed into one, by its number of Items, its number of rounds,
 * and its Sale value, each the sum of the Missions' own, as the Turn Report View shows them.
 */
export function summedEquipmentList(lists: readonly EquipmentList[]): EquipmentList {
  return {
    entries: lists.flatMap((list) => list.entries),
    items: lists.reduce((sum, list) => sum + list.items, 0),
    rounds: lists.reduce((sum, list) => sum + list.rounds, 0),
    value: lists.reduce((sum, list) => sum + list.value, 0),
  };
}

/** TSUM, Groups, Equipment: e.g. "3 Items, 11 rounds · worth 165". */
export function equipmentText(list: EquipmentList): string {
  const parts = [
    ...(list.items > 0 ? [counted(list.items, 'Item')] : []),
    ...(list.rounds > 0 ? [counted(list.rounds, 'round')] : []),
  ];
  return `${parts.join(', ')} · worth ${groupDigits(list.value)}`;
}
