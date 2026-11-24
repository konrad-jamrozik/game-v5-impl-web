/**
 * CRPLAY: what the Combat replay shows of one Combat report and how its playback moves through the Combat log. Pure
 * presentation: it reads only the Combat report and fights nothing again, and where a figure stands decides nothing.
 */
import type { CombatReport } from '../engine/index.ts';

type Participant = CombatReport['participants'][number];
type AttackRecord = CombatReport['log'][number];

/** CRPLAY, Battlefield layout: the Battlefield is a grid of this many cells by as many. */
export const BATTLEFIELD_CELLS = 30;

// ---- Rank insignia -------------------------------------------------------------------------------

export interface RankInsignia {
  readonly kind: 'chevron' | 'bar' | 'star';
  readonly count: 1 | 2 | 3;
}

/** CRPLAY, Rank insignia thresholds: the least base skill of each Rank insignia, highest first. */
const RANKS: readonly (readonly [number, RankInsignia])[] = [
  [700, { kind: 'star', count: 3 }],
  [450, { kind: 'star', count: 2 }],
  [300, { kind: 'star', count: 1 }],
  [250, { kind: 'bar', count: 3 }],
  [210, { kind: 'bar', count: 2 }],
  [175, { kind: 'bar', count: 1 }],
  [145, { kind: 'chevron', count: 3 }],
  [120, { kind: 'chevron', count: 2 }],
  [100, { kind: 'chevron', count: 1 }],
];

/**
 * CRPLAY, Rank insignia thresholds: the Rank insignia of a Combatant, from its base skill at Combat start rounded
 * down, or null below the first threshold.
 */
export function rankInsignia(baseSkillHundredths: number): RankInsignia | null {
  const skill = Math.floor(baseSkillHundredths / 100);
  return RANKS.find(([least]) => skill >= least)?.[1] ?? null;
}

// ---- Enemy looks ---------------------------------------------------------------------------------

export type EnemyShape = 'triangle' | 'square' | 'pentagon' | 'hexagon';
export type EnemyColour = 'amber' | 'danger' | 'violet';
export interface EnemyLook {
  readonly shape: EnemyShape;
  readonly colour: EnemyColour;
}

const SHAPES: readonly EnemyShape[] = ['triangle', 'square', 'pentagon', 'hexagon'];
const COLOURS: readonly EnemyColour[] = ['amber', 'danger', 'violet'];

/**
 * CRPLAY, Figures: the shape and colour of an Enemy, by the place of its EnemyArchetype in the EnemyArchetype order,
 * counted from 0: every three share a shape, and within a shape the colour steps amber, Danger, violet. The specification
 * names four shapes; past them the code starts over, and an EnemyArchetype the Game build does not hold is a square in
 * Danger.
 */
export function enemyLook(order: number): EnemyLook {
  if (order < 0) {
    return { shape: 'square', colour: 'danger' };
  }
  return {
    shape: SHAPES[Math.floor(order / COLOURS.length) % SHAPES.length] ?? 'square',
    colour: COLOURS[order % COLOURS.length] ?? 'danger',
  };
}

// ---- Shots ---------------------------------------------------------------------------------------

/** CRPLAY, Shots: the `shot` of an AmmoType, or a blade for a Weapon that has no `ammo_type`. */
export type ShotKind = 'bullet' | 'burst' | 'beam' | 'blade';

/** What the Combat replay reads beside the Combat report: names, and the Display content of the Game build. */
export interface ReplaySource {
  /** GUI, Enemy labels: an Agent by its Instance ID, an Enemy by its Enemy label. */
  readonly nameOf: (id: string) => string;
  /** The place of an Enemy's EnemyArchetype in the EnemyArchetype order, counted from 0, or -1 when unknown. */
  readonly enemyOrder: (id: string) => number;
  /** The AmmoType of an Enemy's Weapon, or null when the Weapon has no `ammo_type`. */
  readonly enemyAmmoType: (id: string) => string | null;
  /**
   * The AmmoType of an Agent's Weapon, or null when it has none, for a Combat report whose Agents spend no round, i.e.
   * that of a Detached Combat on explicit values; absent for a Combat of a Campaign, whose Combat log says it.
   */
  readonly agentAmmoType?: (id: string) => string | null;
  /** The `shot` of an AmmoType. */
  readonly shotOfAmmoType: (ammoType: string) => Exclude<ShotKind, 'blade'> | undefined;
  /** What the positions are derived from, so that one Combat always looks the same: the Mission's Instance ID. */
  readonly seed: string;
}

/**
 * CRPLAY, Shots: the shot of one attack. An Agent's attack that spent a round follows that round's AmmoType, and one
 * that spent none was made with a Weapon without `ammo_type`, e.g. the Fallback Weapon after its Ammo ran out, so it
 * is a blade. An Enemy spends no round, so its shot follows the AmmoType of its Weapon.
 */
export function shotOfAttack(attack: AttackRecord, side: 'agent' | 'enemy', source: ReplaySource): ShotKind {
  const ammoType =
    side === 'enemy'
      ? source.enemyAmmoType(attack.attacker)
      : source.agentAmmoType === undefined
        ? attack.ammoSpent
        : source.agentAmmoType(attack.attacker);
  return ammoType === null ? 'blade' : (source.shotOfAmmoType(ammoType) ?? 'bullet');
}

// ---- The replay of one Combat report -------------------------------------------------------------

export interface ReplayFigure {
  readonly id: string;
  readonly side: 'agent' | 'enemy';
  readonly name: string;
  /** The cell of the Battlefield the figure stands in. */
  readonly x: number;
  readonly y: number;
  readonly maxHealth: number;
  readonly baseSkillHundredths: number;
  /** The effective weapon damage at Combat start. */
  readonly weaponDamage: number;
  readonly rank: RankInsignia | null;
  /** Null for an Agent, which is a circle in Positive. */
  readonly look: EnemyLook | null;
}

/** The values of one Combatant that change in a Combat, as of one moment of the Combat log. */
export interface FigureValues {
  readonly healthHundredths: number;
  readonly armor: number;
  readonly exhaustion: number;
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
 * it: room is left outside them for names and between them for shots.
 */
const SIDE_COLUMNS = { agent: { front: 9, away: -1 }, enemy: { front: 19, away: 1 } } as const;
/** How many columns deep a side stands, and the most it may take when it has more Combatants than those hold. */
const SIDE_DEPTH = 5;
const SIDE_DEPTH_MAX = 9;
/** How far chance moves a figure from the depth its Combat rating alone gives it, as a share of the side's depth. */
const DEPTH_CHANCE = 0.5;

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
 * CRPLAY, Battlefield layout: the cell of each Combatant of one side, spread from top to bottom in the side's fixed
 * order. Its column follows its Combat rating at Combat start, given in that order: the lower, the nearer the other
 * side, and chance moves it a little, so that a side of equal Combatants does not stand in one line.
 */
function sideCells(
  side: 'agent' | 'enemy',
  ratings: readonly number[],
  random: () => number,
): { x: number; y: number }[] {
  const count = ratings.length;
  const columns = SIDE_COLUMNS[side];
  const depth = Math.min(SIDE_DEPTH_MAX, Math.max(SIDE_DEPTH, Math.ceil(count / BATTLEFIELD_CELLS)));
  const ranks = ratingRanks(ratings);
  const slot = BATTLEFIELD_CELLS / Math.max(1, count);
  const cells: { x: number; y: number }[] = [];
  for (let k = 0; k < count; k += 1) {
    const jitter = slot > 2 ? Math.floor((random() - 0.5) * Math.min(slot - 1, 3)) : 0;
    const y = Math.min(BATTLEFIELD_CELLS - 1, Math.max(0, Math.floor((k + 0.5) * slot) + jitter));
    const place = (ranks[k] ?? 0.5) + (random() - 0.5) * DEPTH_CHANCE;
    let back = Math.min(depth - 1, Math.max(0, Math.floor(place * depth)));
    // A side with more Combatants than rows shares rows, so a column of its own keeps each cell to one figure.
    const shared = cells.filter((cell) => cell.y === y).map((cell) => cell.x);
    for (let tries = 0; shared.includes(columns.front + columns.away * back) && tries < depth; tries += 1) {
      back = (back + 1) % depth;
    }
    cells.push({ x: columns.front + columns.away * back, y });
  }
  return cells;
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
        x: cell.x,
        y: cell.y,
        maxHealth: who.start.maxHealth,
        baseSkillHundredths: who.start.skillHundredths,
        weaponDamage: who.start.weaponDamage,
        rank: rankInsignia(who.start.skillHundredths),
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
      condition: conditionOf(health, start?.incapacitated ?? false),
    };
  });
  const frames: FigureValues[][] = [current];
  const attacks: ReplayAttack[] = [];
  for (const record of report.log) {
    const attacker = indexOf.get(record.attacker);
    const defender = indexOf.get(record.defender);
    if (attacker === undefined || defender === undefined) {
      continue;
    }
    const side = figures[attacker]?.side ?? 'agent';
    attacks.push({
      round: record.round,
      side,
      attacker,
      defender,
      hit: record.hit,
      damage: record.damage ?? 0,
      shot: shotOfAttack(record, side, source),
      strength: figures[attacker]?.weaponDamage ?? 0,
    });
    current = current.map((values, index) => {
      if (index === defender) {
        return {
          healthHundredths: record.defenderAfter.currentHealthHundredths,
          armor: record.defenderAfter.currentArmor,
          exhaustion: record.defenderAfter.exhaustion,
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
          condition: record.attackerIncapacitated ? 'incapacitated' : values.condition,
        };
      }
      return values;
    });
    frames.push(current);
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
export const SPEEDS_MS = [2000, 1500, 1000, 500, 250, 100] as const;
export const DELAYS_MS = [1500, 1000, 500, 250, 100] as const;

export function newPlayback(): Playback {
  return { index: 0, active: [], since: 0, target: 0, playing: false };
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
  return [instant ? phaseStart(replay, playback.index - 1) : playback.index - 1, playback.index];
}

/**
 * Plays on until `target` attacks have started. `now` starts the next step at once, as a step button does; otherwise
 * a step still playing keeps its pace.
 */
export function playTo(playback: Playback, replay: Replay, target: number, now: boolean): void {
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
  playback.index = Math.min(replay.attacks.length, Math.max(0, index));
}

/**
 * CRPLAY, Playback, Going back: returns to before the last attack: steps still playing are dropped, and at rest the
 * last step played is undone, i.e. one attack, or with Instant on one phase.
 */
export function stepBack(playback: Playback, replay: Replay, instant: boolean): void {
  const oldest = playback.active[0];
  if (oldest !== undefined) {
    jumpTo(playback, replay, oldest.a);
  } else if (playback.index > 0) {
    jumpTo(playback, replay, instant ? phaseStart(replay, playback.index - 1) : playback.index - 1);
  }
}

/**
 * CRPLAY, Playback: moves the playback on by `dtMs`. Every step playing advances by the Speed; a new step starts once
 * the gap since the last start has passed, which is the Delay with Overlap on and otherwise the Speed, i.e. when the
 * last step ends. A step is one attack, or with Instant on the rest of the phase.
 */
export function advance(playback: Playback, replay: Replay, dtMs: number, settings: PlaybackSettings): void {
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
  const gap = settings.overlap ? settings.delayMs : settings.speedMs;
  if (playback.index < playback.target && playback.since >= gap) {
    const end = settings.instant ? phaseEnd(replay, playback.index) : playback.index + 1;
    playback.active.push({ a: playback.index, b: end, t: 0 });
    playback.index = end;
    const over = playback.since - gap;
    playback.since = over < gap ? over : 0;
  }
  if (playback.index >= playback.target && playback.active.length === 0) {
    playback.playing = false;
  }
}
