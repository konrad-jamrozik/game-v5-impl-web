/**
 * CRPLAY: what the Combat replay shows of one Combat report and how its playback moves through the Combat log. Pure
 * presentation: it reads only the Combat report and fights nothing again, and where a figure stands decides nothing.
 */
import type { CombatReport, GameDataView } from '../engine/index.ts';

type Participant = CombatReport['participants'][number];
type AttackRecord = CombatReport['log'][number];

/** CRPLAY, Battlefield layout: the Battlefield is a grid this many cells wide and this many high. */
export const BATTLEFIELD_COLUMNS = 40;
export const BATTLEFIELD_ROWS = 32;

// ---- Rank insignia -------------------------------------------------------------------------------

import { groupDigits } from './format.ts';
import { rankInsignia, type RankInsignia, type RankThreshold } from './rank.ts';

export { rankInsignia, type RankInsignia, type RankThreshold };

// ---- Enemy looks ---------------------------------------------------------------------------------

export type EnemyShape = 'triangle' | 'square' | 'pentagon' | 'hexagon' | 'heptagon';
export type EnemyColour = 'yellow' | 'amber' | 'orange' | 'red' | 'violet';
export interface EnemyLook {
  readonly shape: EnemyShape;
  readonly colour: EnemyColour;
  /** How many upward chevrons stand inside the shape. */
  readonly chevrons: number;
}

/** CRPLAY, Enemy figures: the look of each place of the EnemyArchetype order, counted from 0. */
const LOOKS: readonly EnemyLook[] = [
  { shape: 'triangle', colour: 'yellow', chevrons: 0 },
  { shape: 'triangle', colour: 'yellow', chevrons: 1 },
  { shape: 'triangle', colour: 'yellow', chevrons: 2 },
  { shape: 'square', colour: 'amber', chevrons: 0 },
  { shape: 'square', colour: 'amber', chevrons: 1 },
  { shape: 'pentagon', colour: 'orange', chevrons: 0 },
  { shape: 'pentagon', colour: 'orange', chevrons: 1 },
  { shape: 'hexagon', colour: 'red', chevrons: 0 },
  { shape: 'heptagon', colour: 'violet', chevrons: 0 },
];
const LAST_LOOK: EnemyLook = { shape: 'heptagon', colour: 'violet', chevrons: 0 };

/**
 * CRPLAY, Enemy figures: the shape, colour, and chevrons of an Enemy, by the place of its EnemyArchetype in the
 * EnemyArchetype order, counted from 0; every place past the table is a heptagon, and an EnemyArchetype the Game build
 * does not hold is a plain square.
 */
export function enemyLook(order: number): EnemyLook {
  if (order < 0) {
    return { shape: 'square', colour: 'amber', chevrons: 0 };
  }
  return LOOKS[order] ?? LAST_LOOK;
}

// ---- Shots ---------------------------------------------------------------------------------------

/** CRPLAY, Shots: the `shot` of a Weapon. */
export type ShotKind = GameDataView['weapons'][number]['shot'];

/** CRPLAY, Shots: the three kinds of shot: a blade, the kinetic shots of guns, and the energy shots of lasers. */
export type ShotFamily = 'blade' | 'kinetic' | 'energy';

export function shotFamily(shot: ShotKind): ShotFamily {
  if (shot === 'blade') {
    return 'blade';
  }
  return shot === 'laser_pistol' || shot === 'laser_rifle' || shot === 'focused_laser_rifle'
    ? 'energy'
    : 'kinetic';
}

/** What the Combat replay reads beside the Combat report: names, and the Display content of the Game build. */
export interface ReplaySource {
  /** GUI, Enemy labels: an Agent by its Instance ID, an Enemy by its Enemy label. */
  readonly nameOf: (id: string) => string;
  /** GUI, Enemy labels: the name in a tooltip, an Agent by its Instance ID, an Enemy by its full Enemy label. */
  readonly fullNameOf: (id: string) => string;
  /** The place of an Enemy's EnemyArchetype in the EnemyArchetype order, counted from 0, or -1 when unknown. */
  readonly enemyOrder: (id: string) => number;
  /**
   * The Weapon of a Combatant whose Weapon the Combat report does not hold, i.e. one given as explicit values or one
   * of a Combat report written before it held the Weapon, or null when it is not known.
   */
  readonly weaponOf: (id: string) => string | null;
  /** The `shot` of a Weapon. */
  readonly shotOfWeapon: (weapon: string) => ShotKind | undefined;
  /** COMBAT, Ammo in a Combat: the Fallback Weapon, which an Agent attacks with once its Ammo has run out. */
  readonly fallbackWeapon: string | null;
  /** GUI, Ranks: every Rank GDR of the Game build. */
  readonly ranks: readonly RankThreshold[];
  /** What the positions are derived from, so that one Combat always looks the same: the Mission's Instance ID. */
  readonly seed: string;
}

/**
 * CRPLAY, Shots: the shot of one attack: the `shot` of the Weapon it is made with, whichever side the attacker is on.
 * That is the Fallback Weapon for an Agent's attack after its Ammo has run out, and otherwise the Weapon the attacker
 * is equipped with, which the Combat report holds as `weapon`. A Weapon the Game build does not hold is a blade.
 */
export function shotOfAttack(
  attack: AttackRecord,
  weapon: string | undefined,
  source: ReplaySource,
): ShotKind {
  const madeWith =
    attack.outOfAmmo !== null ? source.fallbackWeapon : (weapon ?? source.weaponOf(attack.attacker));
  return madeWith === null ? 'blade' : (source.shotOfWeapon(madeWith) ?? 'blade');
}

// ---- The replay of one Combat report -------------------------------------------------------------

export interface ReplayFigure {
  readonly id: string;
  readonly side: 'agent' | 'enemy';
  readonly name: string;
  /** The name its tooltip gives, e.g. the full Enemy label. */
  readonly fullName: string;
  /** The cell of the Battlefield the figure stands in. */
  readonly x: number;
  readonly y: number;
  readonly maxHealth: number;
  /** The current armor at Combat start, i.e. the effective armor. */
  readonly startArmor: number;
  readonly baseSkillHundredths: number;
  /** The effective weapon damage at Combat start. */
  readonly weaponDamage: number;
  /** COMBAT, Combat report, Starting values: its Combat rating at Combat start; null in an older Combat report. */
  readonly startCombatRating: number | null;
  readonly rank: RankInsignia | null;
  /** Null for an Agent, which is a circle in Positive. */
  readonly look: EnemyLook | null;
}

/**
 * CRPLAY, Figures, Name: the Combat rating at a moment out of the one at Combat start, with the share in percent
 * rounded down to one decimal, e.g. "150/240 (62.5%)"; without a share when the one at Combat start is 0.
 */
export function ratingShareText(rating: number, startRating: number): string {
  if (startRating <= 0) {
    return `${groupDigits(rating)}/${groupDigits(startRating)}`;
  }
  const tenths = Math.floor((rating * 1000) / startRating);
  return `${groupDigits(rating)}/${groupDigits(startRating)} (${groupDigits(Math.floor(tenths / 10))}.${tenths % 10}%)`;
}

/**
 * CRPLAY, Figures, Name: effective skill out of base skill, with the share in percent rounded down to one decimal,
 * e.g. "200/300 (66.6%)". Base skill reads as a whole number, rounded down.
 */
export function skillShareText(effectiveSkill: number, baseSkillHundredths: number): string {
  const base = Math.floor(baseSkillHundredths / 100);
  if (baseSkillHundredths <= 0) {
    return `${groupDigits(effectiveSkill)}/${groupDigits(base)}`;
  }
  const tenths = Math.floor((effectiveSkill * 100_000) / baseSkillHundredths);
  return `${groupDigits(effectiveSkill)}/${groupDigits(base)} (${groupDigits(Math.floor(tenths / 10))}.${tenths % 10}%)`;
}

/** The values of one Combatant that change in a Combat, as of one moment of the Combat log. */
export interface FigureValues {
  readonly healthHundredths: number;
  readonly armor: number;
  readonly exhaustion: number;
  /** CRPLAY, Figures, Name: the effective skill at this moment, as the Combat log records it. */
  readonly effectiveSkill: number;
  /** CRPLAY, Figures, Name: the Combat rating at this moment, as the Combat log records it; null when it does not. */
  readonly combatRating: number | null;
  readonly condition: Participant['final']['condition'];
}

export interface ReplayAttack {
  readonly round: number;
  /** The side whose phase the attack belongs to, i.e. its attacker's side. */
  readonly side: 'agent' | 'enemy';
  /** The attacker and the defender as indices of `figures`. */
  readonly attacker: number;
  readonly defender: number;
  readonly hit: boolean;
  /** The damage outcome, or 0 for a miss. */
  readonly damage: number;
  readonly shot: ShotKind;
  /** The attacker's effective weapon damage, which makes a tracer or a beam longer and thicker. */
  readonly strength: number;
}

export interface Replay {
  readonly figures: readonly ReplayFigure[];
  readonly attacks: readonly ReplayAttack[];
  /** `frames[n]` holds every figure's values after the first n attacks, so `frames[0]` is Combat start. */
  readonly frames: readonly (readonly FigureValues[])[];
}

/** A small seeded generator, for positions only: the same seed always gives the same Battlefield. */
function seeded(seed: string): () => number {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The columns of the Battlefield each side stands in, from its front column, the one nearest the other side, away from
 * it, two cells apart so that no figure has another beside it: room is left outside them for names and between the
 * two sides for shots.
 */
const SIDE_COLUMNS = { agent: { front: 17, away: -2 }, enemy: { front: 22, away: 2 } } as const;
/** How many columns deep a side stands, and the most it may take when it has more Combatants than those hold. */
const SIDE_DEPTH = 7;
const SIDE_DEPTH_MAX = 9;
/** The fewest rows apart two neighbours of one column stand, so that no figure has another above or below it. */
const ROW_GAP_MIN = 2;
/** How far chance moves a figure from the depth its Combat rating alone gives it, as a share of the side's depth. */
const DEPTH_CHANCE = 0.3;
/**
 * The most rows apart two neighbours of one column stand, when the column has room to spare. Columns that stand so
 * are staggered, each one row below the column before it, so that a name beside a figure has that many cells free.
 */
const ROW_GAP_MAX = 4;

/** A rectangle of the Battlefield, in cells. */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * CRPLAY, Figures, Name: which figures are named beside them. A name that would lie over another figure or a name
 * placed before it, or reach past the Battlefield, is left out; names are placed in the order of the figures, i.e. in
 * each side's fixed order. `nameBox` gives where a figure's name would stand, in cells.
 */
export function namedFigures(
  figures: readonly ReplayFigure[],
  nameBox: (figure: ReplayFigure) => Box,
): Set<number> {
  const body = (figure: ReplayFigure): Box => ({
    left: figure.x + 0.05,
    right: figure.x + 0.95,
    top: figure.y + 0.05,
    bottom: figure.y + 0.95,
  });
  const placed: Box[] = [];
  const named = new Set<number>();
  figures.forEach((figure, index) => {
    const box = nameBox(figure);
    const inside =
      box.left >= 0 && box.right <= BATTLEFIELD_COLUMNS && box.top >= 0 && box.bottom <= BATTLEFIELD_ROWS;
    const clear =
      inside &&
      figures.every((other, k) => k === index || !overlaps(box, body(other))) &&
      placed.every((other) => !overlaps(box, other));
    if (clear) {
      placed.push(box);
      named.add(index);
    }
  });
  return named;
}

/**
 * CRPLAY, Battlefield layout: where among the Combat ratings of its side each one stands, from 0 for the lowest to 1
 * for the highest; equal ones share the middle of their places, and a side of one stands in the middle.
 */
export function ratingRanks(ratings: readonly number[]): number[] {
  const sorted = [...ratings].sort((a, b) => a - b);
  return ratings.map((rating) =>
    ratings.length < 2
      ? 0.5
      : (sorted.indexOf(rating) + sorted.lastIndexOf(rating)) / 2 / (ratings.length - 1),
  );
}

/**
 * CRPLAY, Battlefield layout: the cell of each Combatant of one side, by its Combat rating at Combat start, given in
 * the side's fixed order. Its column follows its Combat rating: the lower, the nearer the other side, and chance moves
 * it a little, so that a side of equal Combatants does not stand in one line. The Combatants of one column stand
 * evenly spaced around the middle row, and fill it from the middle outwards in order of Combat rating.
 */
function sideCells(
  side: 'agent' | 'enemy',
  ratings: readonly number[],
  random: () => number,
): { x: number; y: number }[] {
  const count = ratings.length;
  const columns = SIDE_COLUMNS[side];
  const xOf = (back: number) => columns.front + columns.away * back;
  // How many figures one column holds with its neighbours the given number of rows apart, and so how many a side does.
  const holds = (gap: number) => Math.floor((BATTLEFIELD_ROWS - 1) / gap) + 1;
  const room = (depth: number, gap: number) => depth * holds(gap);
  // A side stands with free neighbours whenever its columns hold it so; a side larger than that, which no Combat has,
  // stands closer rather than two figures in one cell.
  const minGap = count <= room(SIDE_DEPTH_MAX, ROW_GAP_MIN) ? ROW_GAP_MIN : 1;
  const depth = count <= room(SIDE_DEPTH, minGap) ? SIDE_DEPTH : SIDE_DEPTH_MAX;
  const ranks = ratingRanks(ratings);
  // Who stands in each column, from the front one. A column that is full sends a Combatant to the nearest with room.
  const members: number[][] = Array.from({ length: depth }, () => []);
  for (let k = 0; k < count; k += 1) {
    const place = (ranks[k] ?? 0.5) + (random() - 0.5) * DEPTH_CHANCE;
    const wanted = Math.min(depth - 1, Math.max(0, Math.floor(place * depth)));
    const roomy = members
      .map((_, column) => column)
      .filter((column) => (members[column]?.length ?? 0) < holds(minGap))
      .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || b - a);
    members[roomy[0] ?? wanted]?.push(k);
  }
  const cells: { x: number; y: number }[] = Array.from({ length: count }, () => ({ x: 0, y: 0 }));
  const middleRow = BATTLEFIELD_ROWS / 2;
  members.forEach((column, back) => {
    const gap = Math.min(ROW_GAP_MAX, BATTLEFIELD_ROWS / Math.max(1, column.length));
    // Each column stands one row below the column before it, and the back column, holding the strongest, unshifted.
    const stagger = (((back - (depth - 1)) % ROW_GAP_MAX) + ROW_GAP_MAX) % ROW_GAP_MAX;
    // A column with room to spare takes the staggered rows nearest the middle, so that its places lie evenly on both
    // sides of its middle one; a crowded column spans the Battlefield evenly.
    const first = middleRow - ((column.length - 1) / 2) * gap;
    const rows =
      gap === ROW_GAP_MAX
        ? rowsFromMiddleOut(
            Array.from({ length: BATTLEFIELD_ROWS / ROW_GAP_MAX }, (_, step) => stagger + step * ROW_GAP_MAX),
            middleRow,
          ).slice(0, column.length)
        : column.map((_, place) =>
            Math.min(BATTLEFIELD_ROWS - 1, Math.max(0, Math.floor(first + place * gap))),
          );
    for (const [k, y] of zip(fromMiddleOut(column, ratings), rowsFromMiddleOut(rows, middleRow))) {
      cells[k] = { x: xOf(back), y };
    }
  });
  return cells;
}

/**
 * CRPLAY, Battlefield layout: the Combatants of one column in the order they take its places, the highest Combat
 * rating first, and equal ones in the fixed order of their side.
 */
function fromMiddleOut(column: readonly number[], ratings: readonly number[]): number[] {
  return [...column].sort((a, b) => (ratings[b] ?? 0) - (ratings[a] ?? 0) || a - b);
}

/**
 * CRPLAY, Battlefield layout: the rows of one column from the middle row outwards, the nearest first, and of two as
 * near, the upper one first.
 */
function rowsFromMiddleOut(rows: readonly number[], middleRow: number): number[] {
  return [...rows].sort((a, b) => Math.abs(a - middleRow) - Math.abs(b - middleRow) || a - b);
}

function zip<A, B>(as: readonly A[], bs: readonly B[]): [A, B][] {
  return as.map((a, i) => [a, bs[i] as B]);
}

function conditionOf(healthHundredths: number, incapacitated: boolean): FigureValues['condition'] {
  return healthHundredths <= 0 ? 'dead' : incapacitated ? 'incapacitated' : 'ableToFight';
}

/** CRPLAY: everything the Combat replay draws of one Combat report. */
export function buildReplay(report: CombatReport, source: ReplaySource): Replay {
  const random = seeded(source.seed);
  const byId = new Map(report.participants.map((who) => [who.id, who]));
  const figures: ReplayFigure[] = [];
  for (const [side, ids] of [
    ['agent', report.agents],
    ['enemy', report.enemies],
  ] as const) {
    // A Combat report written before it held the Combat rating of each participant falls back on effective skill.
    const ratings = ids.map((id) => {
      const start = byId.get(id)?.start;
      return start?.combatRating ?? start?.effectiveSkill ?? 0;
    });
    const cells = sideCells(side, ratings, random);
    ids.forEach((id, k) => {
      const who = byId.get(id);
      const cell = cells[k];
      if (who === undefined || cell === undefined) {
        return;
      }
      figures.push({
        id,
        side,
        name: source.nameOf(id),
        fullName: source.fullNameOf(id),
        x: cell.x,
        y: cell.y,
        maxHealth: who.start.maxHealth,
        startArmor: who.start.armor,
        baseSkillHundredths: who.start.skillHundredths,
        weaponDamage: who.start.weaponDamage,
        startCombatRating: who.start.combatRating ?? null,
        // GUI, Ranks: an Enemy's shape says how strong its kind is, so it has no Rank insignia.
        rank: side === 'agent' ? rankInsignia(who.start.skillHundredths, source.ranks) : null,
        look: side === 'enemy' ? enemyLook(source.enemyOrder(id)) : null,
      });
    });
  }
  const indexOf = new Map(figures.map((figure, index) => [figure.id, index]));

  let current: FigureValues[] = figures.map((figure) => {
    const start = byId.get(figure.id)?.start;
    const health = start?.currentHealthHundredths ?? 0;
    return {
      healthHundredths: health,
      armor: start?.armor ?? 0,
      exhaustion: start?.exhaustion ?? 0,
      effectiveSkill: start?.effectiveSkill ?? 0,
      combatRating: start?.combatRating ?? null,
      condition: conditionOf(health, start?.incapacitated ?? false),
    };
  });
  const frames: FigureValues[][] = [current];
  const attacks: ReplayAttack[] = [];
  /** The attacker's and the defender's effective skill as each attack found them, by attack. */
  const skillsAt: { attacker: number; defender: number; a: number; d: number }[] = [];
  for (const record of report.log) {
    const attacker = indexOf.get(record.attacker);
    const defender = indexOf.get(record.defender);
    if (attacker === undefined || defender === undefined) {
      continue;
    }
    skillsAt.push({ attacker, defender, a: record.a, d: record.d });
    const side = figures[attacker]?.side ?? 'agent';
    attacks.push({
      round: record.round,
      side,
      attacker,
      defender,
      hit: record.hit,
      damage: record.damage ?? 0,
      shot: shotOfAttack(record, byId.get(record.attacker)?.start.weapon, source),
      strength: figures[attacker]?.weaponDamage ?? 0,
    });
    current = current.map((values, index) => {
      if (index === defender) {
        return {
          ...values,
          healthHundredths: record.defenderAfter.currentHealthHundredths,
          armor: record.defenderAfter.currentArmor,
          exhaustion: record.defenderAfter.exhaustion,
          combatRating: record.defenderAfter.combatRating ?? null,
          condition: record.defenderDead
            ? 'dead'
            : record.defenderIncapacitated
              ? 'incapacitated'
              : values.condition,
        };
      }
      if (index === attacker) {
        return {
          ...values,
          exhaustion: record.attackerAfter.exhaustion,
          combatRating: record.attackerAfter.combatRating ?? null,
          condition: record.attackerIncapacitated ? 'incapacitated' : values.condition,
        };
      }
      return values;
    });
    frames.push(current);
  }
  // A Combatant's effective skill changes only in the attacks it takes part in, and each attack records it as the
  // attack found it, so a frame holds the effective skill of the next attack it takes part in, or the final one.
  const next = figures.map((figure) => byId.get(figure.id)?.final.effectiveSkill ?? 0);
  for (let n = frames.length - 1; n >= 0; n -= 1) {
    frames[n] = (frames[n] ?? []).map((values, index) => ({ ...values, effectiveSkill: next[index] ?? 0 }));
    const before = skillsAt[n - 1];
    if (before !== undefined) {
      next[before.attacker] = before.a;
      next[before.defender] = before.d;
    }
  }
  return { figures, attacks, frames };
}

/**
 * CRPLAY, Playback: the Combat ratings of the two sides as of the last Combat round completed once `settled` attacks
 * have been played: those of Combat start during the first Combat round, and the final ones at the end.
 */
export function ratingsAt(
  report: Pick<CombatReport, 'ratings'>,
  replay: Replay,
  settled: number,
): { readonly agents: number; readonly enemies: number } {
  const next = replay.attacks[settled];
  const last = report.ratings[report.ratings.length - 1];
  const found = next === undefined ? last : report.ratings.find((rating) => rating.round === next.round - 1);
  return { agents: (found ?? last)?.agents ?? 0, enemies: (found ?? last)?.enemies ?? 0 };
}

/**
 * CRPLAY, Attack being played: the Agents' Combat rating as a percentage of the Enemies', rounded to a whole percent,
 * or "–" when the Enemies' Combat rating is 0.
 */
export function ratingsRatioText(ratings: { readonly agents: number; readonly enemies: number }): string {
  return ratings.enemies === 0
    ? '–'
    : `${groupDigits(Math.round((100 * ratings.agents) / ratings.enemies))}%`;
}

// ---- Stepping ------------------------------------------------------------------------------------

const samePhase = (a: ReplayAttack | undefined, b: ReplayAttack | undefined) =>
  a !== undefined && b !== undefined && a.round === b.round && a.side === b.side;

/** The index after the last attack of the phase that the attack at `index` belongs to. */
export function phaseEnd(replay: Replay, index: number): number {
  let end = index;
  while (samePhase(replay.attacks[end], replay.attacks[index])) {
    end += 1;
  }
  return end;
}

/** The index after the last attack of the Combat round that the attack at `index` belongs to. */
export function roundEnd(replay: Replay, index: number): number {
  const round = replay.attacks[index]?.round;
  let end = index;
  while (round !== undefined && replay.attacks[end]?.round === round) {
    end += 1;
  }
  return end;
}

/** The index of the first attack of the phase that the attack at `index` belongs to. */
export function phaseStart(replay: Replay, index: number): number {
  let start = index;
  while (start > 0 && samePhase(replay.attacks[start - 1], replay.attacks[index])) {
    start -= 1;
  }
  return start;
}

// ---- Playback ------------------------------------------------------------------------------------

/** One step being played: the attacks `a` to `b - 1` together, `t` of the way through, from 0 to 1. */
export interface PlaybackStep {
  readonly a: number;
  readonly b: number;
  t: number;
}

export interface Playback {
  /** How many attacks have started. */
  index: number;
  /** The steps still playing, oldest first. */
  active: PlaybackStep[];
  /** The milliseconds since the last step started. */
  since: number;
  /** Playing stops once this many attacks have started and every step has finished. */
  target: number;
  playing: boolean;
  /** The attacks of the step started last, as a range, or null after a jump. */
  last: readonly [number, number] | null;
  /** CRPLAY, Options, Aim lines: the attack being played was picked with the slider or the Combat log. */
  picked: boolean;
  /** CRPLAY, Options, Attacker mark: how far into its attacks the step started last began, 0 with the mark on. */
  lead: number;
}

/** CRPLAY, Transport buttons: a pace, i.e. the values a pace button sets the Options to. */
export interface Pace {
  readonly id: 'slow' | 'medium' | 'fast' | 'very-fast';
  readonly name: string;
  /** How many arrows its button shows. */
  readonly arrows: number;
  readonly speedMs: number;
  readonly overlap: boolean;
  /** The Delay, or null for a pace that leaves it as it is. */
  readonly delayMs: number | null;
  readonly instant: boolean;
  readonly aimLines: boolean;
}

/** CRPLAY, Transport buttons: the four paces, slowest first. */
export const PACES: readonly Pace[] = [
  {
    id: 'slow',
    name: 'Slow',
    arrows: 1,
    speedMs: 2000,
    overlap: false,
    delayMs: null,
    instant: false,
    aimLines: true,
  },
  {
    id: 'medium',
    name: 'Medium',
    arrows: 2,
    speedMs: 1500,
    overlap: true,
    delayMs: 1000,
    instant: false,
    aimLines: true,
  },
  {
    id: 'fast',
    name: 'Fast',
    arrows: 3,
    speedMs: 1000,
    overlap: true,
    delayMs: 250,
    instant: false,
    aimLines: false,
  },
  {
    id: 'very-fast',
    name: 'Very fast',
    arrows: 4,
    speedMs: 1500,
    overlap: false,
    delayMs: null,
    instant: true,
    aimLines: false,
  },
];

/**
 * CRPLAY, Transport buttons: how a pace plays, whatever the Options hold. A pace without Overlap has no Delay; the next
 * attack then waits for the Speed, so the Delay it is given is never read.
 */
export function paceSettings(pace: Pace): PlaybackSettings {
  return {
    speedMs: pace.speedMs,
    delayMs: pace.delayMs ?? pace.speedMs,
    overlap: pace.overlap,
    instant: pace.instant,
  };
}

export interface PlaybackSettings {
  /** CRPLAY, Playback, Speed: how long one attack takes to play. */
  readonly speedMs: number;
  /** CRPLAY, Playback, Overlap: the Delay from one start to the next. */
  readonly delayMs: number;
  readonly overlap: boolean;
  /** CRPLAY, Playback, Instant: a step is a whole phase. */
  readonly instant: boolean;
}

/** CRPLAY, Playback: the values the Player picks the Speed and the Delay from, in milliseconds. */
export const SPEEDS_MS = [
  6000, 5500, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1750, 1500, 1250, 1000, 750, 500, 250, 100,
] as const;
export const DELAYS_MS = [2000, 1750, 1500, 1250, 1000, 750, 500, 250, 100] as const;

export function newPlayback(): Playback {
  return { index: 0, active: [], since: 0, target: 0, playing: false, last: null, picked: false, lead: 0 };
}

/** How many attacks have finished playing: those before the oldest step still playing. */
export function settledIndex(playback: Playback): number {
  return playback.active[0]?.a ?? playback.index;
}

/**
 * The attacks the Combat replay names and marks in the Combat log, as a range: those of the newest step playing, or,
 * at rest, the last step played.
 */
export function shownRange(playback: Playback, replay: Replay, instant: boolean): readonly [number, number] {
  const newest = playback.active[playback.active.length - 1];
  if (newest !== undefined) {
    return [newest.a, newest.b];
  }
  if (playback.index === 0) {
    return [0, 0];
  }
  if (playback.last !== null && playback.last[1] === playback.index) {
    return playback.last;
  }
  return [instant ? phaseStart(replay, playback.index - 1) : playback.index - 1, playback.index];
}

/**
 * Plays on until `target` attacks have started. `now` starts the next step at once, as a step button does; otherwise
 * a step still playing keeps its pace.
 */
export function playTo(playback: Playback, replay: Replay, target: number, now: boolean): void {
  playback.picked = false;
  playback.target = Math.min(replay.attacks.length, target);
  if (playback.target <= playback.index && playback.active.length === 0) {
    return;
  }
  if (now || playback.active.length === 0) {
    playback.since = Number.POSITIVE_INFINITY;
  }
  playback.playing = true;
}

/** Shows the Combat right after its first `index` attacks, at rest. */
export function jumpTo(playback: Playback, replay: Replay, index: number): void {
  playback.playing = false;
  playback.active = [];
  playback.last = null;
  playback.picked = false;
  playback.index = Math.min(replay.attacks.length, Math.max(0, index));
}

/**
 * CRPLAY, Slider and Combat log: shows the Combat right before its attack number `attack`, counted from 1, and plays
 * that attack alone, with its aim line; 0 shows Combat start.
 */
export function playAttack(playback: Playback, replay: Replay, attack: number): void {
  const index = Math.min(replay.attacks.length, Math.max(0, attack));
  if (index === 0) {
    jumpTo(playback, replay, 0);
    return;
  }
  jumpTo(playback, replay, index - 1);
  playTo(playback, replay, index, true);
  playback.picked = true;
}

/**
 * CRPLAY, Playback: moves the playback on by `dtMs`. Every step playing advances by the Speed; a new step starts once
 * the gap since the last start has passed, which is the Delay with Overlap on and otherwise the Speed, i.e. when the
 * last step ends. A step is one attack, or with Instant on the rest of the phase, and never goes past the target, so
 * that the Combat turn button plays one attack also with Instant on.
 *
 * CRPLAY, Options, Attacker mark: `leads`, given while the mark is off, holds how far into each attack its shot first
 * shows; a step then starts at the least lead of its attacks, and without Overlap the next one follows when it ends.
 */
export function advance(
  playback: Playback,
  replay: Replay,
  dtMs: number,
  settings: PlaybackSettings,
  leads: readonly number[] | null = null,
): void {
  if (!playback.playing) {
    return;
  }
  for (const step of playback.active) {
    step.t += dtMs / settings.speedMs;
  }
  while (playback.active[0] !== undefined && playback.active[0].t >= 1) {
    playback.active.shift();
  }
  playback.since += dtMs;
  const gap = settings.overlap ? settings.delayMs : settings.speedMs * (1 - playback.lead);
  if (playback.index < playback.target && playback.since >= gap) {
    const end = settings.instant
      ? Math.min(phaseEnd(replay, playback.index), playback.target)
      : playback.index + 1;
    const lead = leads === null ? 0 : Math.min(...leads.slice(playback.index, end));
    playback.lead = lead;
    playback.active.push({ a: playback.index, b: end, t: lead });
    playback.last = [playback.index, end];
    playback.index = end;
    const over = playback.since - gap;
    playback.since = over < gap ? over : 0;
  }
  if (playback.index >= playback.target && playback.active.length === 0) {
    playback.playing = false;
  }
}
