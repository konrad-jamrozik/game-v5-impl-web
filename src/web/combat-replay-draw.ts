/**
 * CRPLAY: draws the Battlefield of the Combat replay on a canvas. Every picture is a function of the replay and of the
 * steps being played, so that going back, the slider, and a paused step need no clean-up.
 */
import {
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  namedFigures,
  settledIndex,
  shownRange,
  type EnemyColour,
  type EnemyLook,
  type FigureValues,
  type Playback,
  type PlaybackStep,
  type RankInsignia,
  type Replay,
  type ReplayAttack,
  type ReplayFigure,
} from './combat-replay.ts';
import {
  T_DRAIN,
  T_HIT,
  attackerOffset,
  drawShotEffect,
  missShownAt,
  outlineGlow,
  type ShotGeometry,
} from './combat-replay-shots.ts';

/** VIS, Colours: the Design tokens the Battlefield is drawn in, read from the style sheet. */
export interface ReplayPalette {
  readonly surface: string;
  readonly divider: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly positive: string;
  readonly danger: string;
  readonly background: string;
  /** VIS, Colours: the five Enemy colours of CRPLAY, Enemy figures. */
  readonly enemy: Readonly<Record<EnemyColour, string>>;
  readonly tracer: string;
  readonly muzzle: string;
  readonly tracerRed: string;
  readonly brass: string;
  readonly beam: string;
  readonly beamFringe: string;
  readonly figureFont: string;
}

export function readPalette(element: Element): ReplayPalette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    surface: token('--surface'),
    divider: token('--divider'),
    border: token('--border'),
    text: token('--text'),
    muted: token('--text-muted'),
    positive: token('--positive'),
    danger: token('--danger'),
    background: token('--background'),
    enemy: {
      yellow: token('--enemy-yellow'),
      amber: token('--enemy-amber'),
      orange: token('--enemy-orange'),
      red: token('--enemy-red'),
      violet: token('--enemy-violet'),
    },
    tracer: token('--tracer'),
    muzzle: token('--muzzle'),
    tracerRed: token('--tracer-red'),
    brass: token('--brass'),
    beam: token('--beam'),
    beamFringe: token('--beam-fringe'),
    figureFont: token('--font-figure'),
  };
}

export interface DrawInput {
  readonly replay: Replay;
  readonly playback: Playback;
  /** The width of the canvas, in CSS pixels; its height holds as many rows of cells of the same size. */
  readonly size: number;
  readonly palette: ReplayPalette;
  readonly instant: boolean;
  /** CRPLAY, Playback, Aim lines: whether a faint dashed line joins each attacker to its defender. */
  readonly aimLines: boolean;
  /** The current armor that gets the thickest rim: the largest armor of any Armor of the Game build. */
  readonly armorScale: number;
  /** Under reduced motion a hit does not shake its defender. */
  readonly reducedMotion: boolean;
}

/** How long, within one attack, its attacker stays marked, as a fraction of the attack. */
const T_MARK = 0.28;
const TAU = Math.PI * 2;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const ease = (x: number) => 1 - (1 - clamp(x, 0, 1)) ** 3;

type Point = readonly [number, number];

const centre = (figure: ReplayFigure, cell: number): Point => [
  (figure.x + 0.5) * cell,
  (figure.y + 0.5) * cell,
];
/** The radius of a figure's body; its rim and its marks stand outside it. */
const bodyRadius = (cell: number) => cell * 0.38;

/** The index of the figure under a point of the canvas, or null. */
export function figureAt(replay: Replay, size: number, x: number, y: number): number | null {
  const cell = size / BATTLEFIELD_COLUMNS;
  const index = replay.figures.findIndex((figure) => {
    const [cx, cy] = centre(figure, cell);
    return Math.hypot(cx - x, cy - y) <= cell * 0.6;
  });
  return index < 0 ? null : index;
}

const SIDES: Readonly<Record<EnemyLook['shape'], number>> = {
  triangle: 3,
  square: 4,
  pentagon: 5,
  hexagon: 6,
  heptagon: 7,
};
/** How far each shape reaches past the body radius, so that the shapes look alike in size. */
const REACH: Readonly<Record<EnemyLook['shape'], number>> = {
  triangle: 1.5,
  square: 1.28,
  pentagon: 1.16,
  hexagon: 1.1,
  heptagon: 1.07,
};

/** The corners of an Enemy's shape, grown outward by `grow`; a flat side is down, so that it reads as standing. */
function corners(shape: EnemyLook['shape'], cx: number, cy: number, r: number, grow: number): Point[] {
  const n = SIDES[shape];
  const radius = r * REACH[shape] + grow / Math.cos(Math.PI / n);
  // A triangle's centre of weight is below the middle of its height, so it is lifted to stand in its cell.
  const lift = shape === 'triangle' ? r * 0.2 : 0;
  const start = n % 2 === 0 ? -Math.PI / 2 + Math.PI / n : -Math.PI / 2;
  return Array.from({ length: n }, (_, k) => {
    const angle = start + (k * TAU) / n;
    return [cx + Math.cos(angle) * radius, cy + lift + Math.sin(angle) * radius] as const;
  });
}

/** Starts the path of a figure's outline, grown outward by `grow`, and returns its top and bottom. */
function outline(
  ctx: CanvasRenderingContext2D,
  look: EnemyLook | null,
  cx: number,
  cy: number,
  r: number,
  grow: number,
): { top: number; bottom: number } {
  ctx.beginPath();
  if (look === null) {
    ctx.arc(cx, cy, r + grow, 0, TAU);
    return { top: cy - r - grow, bottom: cy + r + grow };
  }
  const points = corners(look.shape, cx, cy, r, grow);
  points.forEach(([x, y], k) => {
    if (k === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
  const ys = points.map(([, y]) => y);
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
}

function colourOf(figure: ReplayFigure, palette: ReplayPalette): string {
  if (figure.look === null) {
    return palette.positive;
  }
  return palette.enemy[figure.look.colour];
}

/**
 * CRPLAY, Enemy figures: the upward chevrons inside an Enemy's shape, alike in shape and size and stacked centred on
 * the shape, a triangle's on its centre of weight, where it is wide enough to hold them.
 */
function chevronsPath(
  ctx: CanvasRenderingContext2D,
  look: EnemyLook,
  cx: number,
  cy: number,
  r: number,
): void {
  const half = r * 0.42;
  const rise = r * 0.3;
  const pitch = r * 0.38;
  const middle = cy + (look.shape === 'triangle' ? r * 0.2 : 0);
  ctx.beginPath();
  for (let k = 0; k < look.chevrons; k += 1) {
    const top = middle - rise / 2 + (k - (look.chevrons - 1) / 2) * pitch;
    ctx.moveTo(cx - half, top + rise);
    ctx.lineTo(cx, top);
    ctx.lineTo(cx + half, top + rise);
  }
}

/** CRPLAY, Figures, Armor: the thickness of the rim, the thicker the more current armor, and none without armor. */
function rimWidth(armor: number, armorScale: number, cell: number): number {
  return armor <= 0 ? 0 : Math.max(1, Math.sqrt(Math.min(1, armor / Math.max(1, armorScale))) * cell * 0.26);
}

/** The font of the names beside the figures. */
const nameFontSize = (cell: number) => Math.max(9, cell * 0.42);
const nameFont = (cell: number, palette: ReplayPalette) => `${nameFontSize(cell)}px ${palette.figureFont}`;

/** How far from the centre of its cell a figure's name starts: past the figure and its Rank insignia. */
function nameReach(figure: ReplayFigure, cell: number): number {
  return figure.rank === null ? cell * 0.82 : cell * 0.82 + insigniaWidth(figure.rank, cell) + cell * 0.18;
}

/** CRPLAY, Figures, Name: the figures named beside them, measured in the font the names are drawn in. */
function namedOf(
  ctx: CanvasRenderingContext2D,
  replay: Replay,
  cell: number,
  palette: ReplayPalette,
): Set<number> {
  ctx.save();
  ctx.font = nameFont(cell, palette);
  const named = namedFigures(replay.figures, (figure) => {
    const width = ctx.measureText(figure.name).width / cell;
    const start = figure.x + 0.5 + (figure.side === 'agent' ? -1 : 1) * (nameReach(figure, cell) / cell);
    const half = nameFontSize(cell) / cell / 2;
    return {
      left: figure.side === 'agent' ? start - width : start,
      right: figure.side === 'agent' ? start : start + width,
      top: figure.y + 0.5 - half,
      bottom: figure.y + 0.5 + half,
    };
  });
  ctx.restore();
  return named;
}

/** The width a Rank insignia takes beside its figure. */
function insigniaWidth(rank: RankInsignia | null, cell: number): number {
  if (rank === null) {
    return 0;
  }
  return rank.kind === 'chevron'
    ? cell * 0.4
    : rank.kind === 'bar'
      ? rank.count * cell * 0.11 + (rank.count - 1) * cell * 0.08
      : rank.count * cell * 0.34;
}

/** CRPLAY, Rank insignia thresholds: chevrons stacked, bars and stars side by side, centred on a point. */
function drawInsignia(
  ctx: CanvasRenderingContext2D,
  rank: RankInsignia,
  x: number,
  y: number,
  cell: number,
): void {
  const width = insigniaWidth(rank, cell);
  ctx.lineWidth = Math.max(1.2, cell * 0.07);
  ctx.lineJoin = 'miter';
  if (rank.kind === 'chevron') {
    const half = cell * 0.19;
    const rise = cell * 0.13;
    const pitch = cell * 0.17;
    ctx.beginPath();
    for (let k = 0; k < rank.count; k += 1) {
      const top = y - rise / 2 + (k - (rank.count - 1) / 2) * pitch;
      ctx.moveTo(x - half, top + rise);
      ctx.lineTo(x, top);
      ctx.lineTo(x + half, top + rise);
    }
    ctx.stroke();
    return;
  }
  if (rank.kind === 'bar') {
    const bar = cell * 0.11;
    const pitch = bar + cell * 0.08;
    for (let k = 0; k < rank.count; k += 1) {
      ctx.fillRect(x - width / 2 + k * pitch, y - cell * 0.21, bar, cell * 0.42);
    }
    return;
  }
  const outer = cell * 0.17;
  for (let k = 0; k < rank.count; k += 1) {
    const cx = x - width / 2 + (k + 0.5) * cell * 0.34;
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? outer : outer * 0.42;
      const angle = -Math.PI / 2 + (point * TAU) / 10;
      const px = cx + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (point === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
}

interface Shown {
  readonly health: number;
  readonly armor: number;
  readonly condition: FigureValues['condition'];
}

function drawFigure(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  figure: ReplayFigure,
  shown: Shown,
  offset: Point,
  named: boolean,
): void {
  const { palette } = input;
  const cell = input.size / BATTLEFIELD_COLUMNS;
  const [homeX, homeY] = centre(figure, cell);
  const cx = homeX + offset[0];
  const cy = homeY + offset[1];
  const r = bodyRadius(cell);
  const colour = colourOf(figure, palette);
  const dead = shown.condition === 'dead';
  const out = shown.condition === 'incapacitated';

  ctx.save();
  // CRPLAY, Figures, Health: filled from the bottom as far as current health is of effective max health.
  const box = outline(ctx, figure.look, cx, cy, r, 0);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  const share = dead ? 0 : clamp(shown.health / (figure.maxHealth * 100), 0, 1);
  const height = (box.bottom - box.top) * share;
  if (!dead) {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = out ? 0.35 : 0.85;
    ctx.fillStyle = colour;
    ctx.fillRect(cx - cell, box.bottom - height, cell * 2, height);
    ctx.restore();
  }
  outline(ctx, figure.look, cx, cy, r, 0);
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = dead ? palette.border : colour;
  if (out) {
    ctx.setLineDash([3, 3]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // CRPLAY, Enemy figures: the chevrons, in the figure's colour where it is empty and in Background where it is filled.
  if (figure.look !== null && figure.look.chevrons > 0) {
    ctx.lineWidth = Math.max(1.2, r * 0.16);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.globalAlpha = out ? 0.5 : 1;
    chevronsPath(ctx, figure.look, cx, cy, r);
    ctx.strokeStyle = dead ? palette.border : colour;
    ctx.stroke();
    if (height > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - cell, box.bottom - height, cell * 2, height);
      ctx.clip();
      chevronsPath(ctx, figure.look, cx, cy, r);
      ctx.strokeStyle = palette.background;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // CRPLAY, Figures, Armor: a rim in Text muted, the thicker the more current armor.
  const rim = dead ? 0 : rimWidth(shown.armor, input.armorScale, cell);
  if (rim > 0) {
    outline(ctx, figure.look, cx, cy, r, 1.5 + rim / 2);
    ctx.lineWidth = rim;
    ctx.strokeStyle = palette.muted;
    ctx.globalAlpha = out ? 0.5 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (dead) {
    const k = r * 0.5;
    ctx.strokeStyle = palette.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - k, cy - k);
    ctx.lineTo(cx + k, cy + k);
    ctx.moveTo(cx + k, cy - k);
    ctx.lineTo(cx - k, cy + k);
    ctx.stroke();
  }

  // The Rank insignia and the name stand on the outer side of the figure's own cell, whatever the figure does.
  const outward = figure.side === 'agent' ? -1 : 1;
  ctx.fillStyle = dead ? palette.border : palette.text;
  ctx.strokeStyle = dead ? palette.border : palette.text;
  if (figure.rank !== null) {
    const mark = insigniaWidth(figure.rank, cell);
    drawInsignia(ctx, figure.rank, homeX + outward * (cell * 0.82 + mark / 2), homeY, cell);
  }
  if (named) {
    ctx.fillStyle = shown.condition === 'ableToFight' ? palette.muted : palette.border;
    ctx.font = nameFont(cell, palette);
    ctx.textBaseline = 'middle';
    ctx.textAlign = figure.side === 'agent' ? 'right' : 'left';
    ctx.fillText(figure.name, homeX + outward * nameReach(figure, cell), homeY);
  }
  ctx.restore();
}

/** Where a shot that misses is aimed: beside the defender, on the side that alternates from attack to attack. */
function besideDefender(from: Point, to: Point, sign: number, cell: number): Point {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const px = -(to[1] - from[1]) / length;
  const py = (to[0] - from[0]) / length;
  return [to[0] + px * sign * cell * 0.95, to[1] + py * sign * cell * 0.95];
}

/** Where one attack is drawn: from its attacker to its defender, or, for a miss, to the point beside it. */
function geometryOf(input: DrawInput, attack: ReplayAttack, sign: number): ShotGeometry | null {
  const cell = input.size / BATTLEFIELD_COLUMNS;
  const attacker = input.replay.figures[attack.attacker];
  const defender = input.replay.figures[attack.defender];
  if (attacker === undefined || defender === undefined) {
    return null;
  }
  const from = centre(attacker, cell);
  const to = centre(defender, cell);
  return {
    from,
    to,
    aim: attack.hit ? to : besideDefender(from, to, sign, cell),
    r: bodyRadius(cell),
    cell,
    far: input.size,
    sign,
  };
}

/** CRPLAY, Shots: one attack's marking of its attacker, its shot, and, for a miss, the word that says so. */
function drawShot(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  attack: ReplayAttack,
  t: number,
  sign: number,
  seed: number,
): void {
  const { palette } = input;
  const geometry = geometryOf(input, attack, sign);
  if (geometry === null) {
    return;
  }
  const { from, to, r, cell } = geometry;

  if (t < T_MARK) {
    const k = t / T_MARK;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = palette.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(from[0], from[1], r * 1.5 + k * cell * 0.5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawShotEffect(ctx, palette, geometry, {
    shot: attack.shot,
    hit: attack.hit,
    strength: attack.strength,
    seed,
    t,
    still: input.reducedMotion,
  });

  // CRPLAY, Energy shots: the strongest leaves the defender outlined in Beam while its hit fades.
  const glow = attack.hit ? outlineGlow(attack.shot, t) : 0;
  const defender = input.replay.figures[attack.defender];
  if (glow > 0 && defender !== undefined) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = glow;
    ctx.strokeStyle = palette.beam;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    outline(ctx, defender.look, to[0], to[1], r, cell * 0.16);
    ctx.stroke();
    ctx.restore();
  }

  if (!attack.hit && t >= missShownAt(attack.shot)) {
    ctx.save();
    ctx.globalAlpha = clamp((1 - (t - T_HIT) / (1 - T_HIT)) * 2, 0, 1);
    ctx.fillStyle = palette.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(11, cell * 0.5)}px ${palette.figureFont}`;
    const far = besideDefender(from, to, sign * 2, cell);
    ctx.fillText('miss', far[0], far[1]);
    ctx.restore();
  }
}

/** CRPLAY, Shots: the damage outcome above each defender that the hits of one step hit, as one sum. */
function drawHits(ctx: CanvasRenderingContext2D, input: DrawInput, step: PlaybackStep): void {
  if (step.t < T_HIT) {
    return;
  }
  const { palette, replay } = input;
  const cell = input.size / BATTLEFIELD_COLUMNS;
  const r = bodyRadius(cell);
  const k = (step.t - T_HIT) / (1 - T_HIT);
  const hits = new Map<number, { damage: number; side: 'agent' | 'enemy' }>();
  for (const attack of replay.attacks.slice(step.a, step.b)) {
    if (!attack.hit) {
      continue;
    }
    const hit = hits.get(attack.defender) ?? { damage: 0, side: attack.side };
    hit.damage += attack.damage;
    hits.set(attack.defender, hit);
  }
  for (const [index, hit] of hits) {
    const defender = replay.figures[index];
    if (defender === undefined) {
      continue;
    }
    const [x, y] = centre(defender, cell);
    ctx.save();
    ctx.globalAlpha = clamp((1 - k) * 2.5, 0, 1);
    ctx.fillStyle = hit.side === 'agent' ? palette.positive : palette.danger;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(11, cell * 0.55)}px ${palette.figureFont}`;
    ctx.fillText(`−${hit.damage}`, x, y - r * 1.9 - 6 - k * cell * 0.8);
    ctx.restore();
  }
}

/** Draws the Battlefield as it is right now. The context is scaled so that one unit is one CSS pixel. */
export function drawReplay(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const { replay, playback, palette, size } = input;
  const cell = size / BATTLEFIELD_COLUMNS;
  const height = cell * BATTLEFIELD_ROWS;
  ctx.clearRect(0, 0, size, height);
  ctx.strokeStyle = palette.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < BATTLEFIELD_COLUMNS; k += 1) {
    const p = Math.round(k * cell) + 0.5;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, height);
  }
  for (let k = 1; k < BATTLEFIELD_ROWS; k += 1) {
    const p = Math.round(k * cell) + 0.5;
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  const named = namedOf(ctx, replay, cell, palette);
  const settled = settledIndex(playback);
  const base = replay.frames[settled] ?? [];
  const playing = playback.active.length > 0;
  // Faint lines say who attacks whom: every attack still playing, or, at rest, the last step played.
  const [from, to] = playing ? [settled, playback.index] : shownRange(playback, replay, input.instant);
  ctx.save();
  ctx.globalAlpha = playing ? 0.35 : 0.18;
  ctx.strokeStyle = palette.text;
  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  // CRPLAY, Options, Aim lines: an attack picked with the slider or a row of the Combat log has its line even with Aim
  // lines off.
  for (const attack of input.aimLines || playback.picked ? replay.attacks.slice(from, to) : []) {
    const attacker = replay.figures[attack.attacker];
    const defender = replay.figures[attack.defender];
    if (attacker !== undefined && defender !== undefined) {
      ctx.moveTo(...centre(attacker, cell));
      ctx.lineTo(...centre(defender, cell));
    }
  }
  ctx.stroke();
  ctx.restore();

  // Each figure shows its settled values, less what every step still playing has taken from it so far.
  const offsets = new Map<number, [number, number]>();
  for (const step of playback.active) {
    replay.attacks.slice(step.a, step.b).forEach((attack, k) => {
      const geometry = geometryOf(input, attack, (step.a + k) % 2 === 0 ? -1 : 1);
      if (geometry === null) {
        return;
      }
      // CRPLAY, Shots: a blade lunges to the defender and returns, and a kinetic shot that recoils kicks back.
      const moved = attackerOffset(geometry, attack.shot, step.t, input.reducedMotion);
      const offset = offsets.get(attack.attacker) ?? [0, 0];
      offset[0] += moved[0];
      offset[1] += moved[1];
      offsets.set(attack.attacker, offset);
    });
  }
  replay.figures.forEach((figure, index) => {
    const values = base[index];
    if (values === undefined) {
      return;
    }
    let health = values.healthHundredths;
    let armor = values.armor;
    let condition = values.condition;
    const offset = offsets.get(index) ?? [0, 0];
    for (const step of playback.active) {
      const before = replay.frames[step.a]?.[index];
      const after = replay.frames[step.b]?.[index];
      if (before === undefined || after === undefined) {
        continue;
      }
      const lostHealth = before.healthHundredths - after.healthHundredths;
      const lostArmor = before.armor - after.armor;
      if (lostHealth !== 0 || lostArmor !== 0) {
        if (step.t < T_HIT) {
          continue;
        }
        const k = ease((step.t - T_HIT) / (T_DRAIN - T_HIT));
        health -= lostHealth * k;
        armor -= lostArmor * k;
        if (k > 0.6) {
          condition = after.condition;
        }
        if (!input.reducedMotion) {
          offset[0] += Math.sin((step.t - T_HIT) * 70) * cell * 0.14 * (1 - k);
        }
      } else if (step.t >= T_DRAIN && after.condition !== before.condition) {
        condition = after.condition;
      }
    }
    drawFigure(ctx, input, figure, { health, armor, condition }, offset, named.has(index));
  });

  for (const step of playback.active) {
    replay.attacks.slice(step.a, step.b).forEach((attack, k) => {
      drawShot(ctx, input, attack, step.t, (step.a + k) % 2 === 0 ? -1 : 1, step.a + k + 1);
    });
    drawHits(ctx, input, step);
  }
}
