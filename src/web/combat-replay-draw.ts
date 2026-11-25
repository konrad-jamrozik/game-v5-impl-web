/**
 * CRPLAY: draws the Battlefield of the Combat replay on a canvas. Every picture is a function of the replay and of the
 * steps being played, so that going back, the slider, and a paused step need no clean-up.
 */
import {
  BATTLEFIELD_CELLS,
  settledIndex,
  shownRange,
  type EnemyLook,
  type FigureValues,
  type Playback,
  type PlaybackStep,
  type RankInsignia,
  type Replay,
  type ReplayAttack,
  type ReplayFigure,
} from './combat-replay.ts';

/** VIS, Colours: the Design tokens the Battlefield is drawn in, read from the style sheet. */
export interface ReplayPalette {
  readonly surface: string;
  readonly divider: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly positive: string;
  readonly danger: string;
  readonly amber: string;
  readonly violet: string;
  readonly tracer: string;
  readonly beam: string;
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
    amber: token('--enemy-amber'),
    violet: token('--enemy-violet'),
    tracer: token('--tracer'),
    beam: token('--beam'),
    figureFont: token('--font-figure'),
  };
}

export interface DrawInput {
  readonly replay: Replay;
  readonly playback: Playback;
  /** The side of the square canvas, in CSS pixels. */
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

/** When, within one attack, its shot starts, lands, and has emptied its defender, as fractions of the attack. */
const T_AIM = 0.18;
const T_HIT = 0.55;
const T_DRAIN = 0.85;
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
  const cell = size / BATTLEFIELD_CELLS;
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
};
/** How far each shape reaches past the body radius, so that the shapes look alike in size. */
const REACH: Readonly<Record<EnemyLook['shape'], number>> = {
  triangle: 1.5,
  square: 1.28,
  pentagon: 1.16,
  hexagon: 1.1,
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
  return figure.look.colour === 'amber'
    ? palette.amber
    : figure.look.colour === 'violet'
      ? palette.violet
      : palette.danger;
}

/** CRPLAY, Figures, Armor: the thickness of the rim, the thicker the more current armor, and none without armor. */
function rimWidth(armor: number, armorScale: number, cell: number): number {
  return armor <= 0 ? 0 : Math.max(1, Math.sqrt(Math.min(1, armor / Math.max(1, armorScale))) * cell * 0.26);
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
  const cell = input.size / BATTLEFIELD_CELLS;
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
  if (!dead) {
    ctx.save();
    ctx.clip();
    const share = clamp(shown.health / (figure.maxHealth * 100), 0, 1);
    const height = (box.bottom - box.top) * share;
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
  const mark = insigniaWidth(figure.rank, cell);
  let reach = cell * 0.82;
  ctx.fillStyle = dead ? palette.border : palette.text;
  ctx.strokeStyle = dead ? palette.border : palette.text;
  if (figure.rank !== null) {
    drawInsignia(ctx, figure.rank, homeX + outward * (reach + mark / 2), homeY, cell);
    reach += mark + cell * 0.18;
  }
  if (named) {
    ctx.fillStyle = shown.condition === 'ableToFight' ? palette.muted : palette.border;
    ctx.font = `${Math.max(9, cell * 0.42)}px ${palette.figureFont}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = figure.side === 'agent' ? 'right' : 'left';
    ctx.fillText(figure.name, homeX + outward * reach, homeY);
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

/** CRPLAY, Shots, Blade: how far along its way to the defender a lunging attacker is. */
function lunge(t: number): number {
  if (t < T_AIM) {
    return 0;
  }
  if (t < T_HIT) {
    return ease((t - T_AIM) / (T_HIT - T_AIM));
  }
  return t < 0.7 ? 1 : 1 - ease((t - 0.7) / 0.25);
}

function tracer(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  head: number,
  length: number,
  width: number,
  colour: string,
  alpha: number,
): void {
  const total = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const ux = (to[0] - from[0]) / total;
  const uy = (to[1] - from[1]) / total;
  const tail = Math.max(0, head - length);
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = colour;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(from[0] + ux * tail, from[1] + uy * tail);
  ctx.lineTo(from[0] + ux * head, from[1] + uy * head);
  ctx.stroke();
  ctx.restore();
}

/** CRPLAY, Shots: one attack's marking of its attacker, its crossing, and, for a miss, the word that says so. */
function drawShot(
  ctx: CanvasRenderingContext2D,
  input: DrawInput,
  attack: ReplayAttack,
  t: number,
  sign: number,
): void {
  const { palette, replay } = input;
  const cell = input.size / BATTLEFIELD_CELLS;
  const attacker = replay.figures[attack.attacker];
  const defender = replay.figures[attack.defender];
  if (attacker === undefined || defender === undefined) {
    return;
  }
  const from = centre(attacker, cell);
  const to = centre(defender, cell);
  const r = bodyRadius(cell);
  const beside = besideDefender(from, to, sign, cell);

  if (t < T_AIM + 0.1) {
    const k = t / (T_AIM + 0.1);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = palette.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(from[0], from[1], r * 1.5 + k * cell * 0.5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // Where the shot ends: at the defender, or, for a miss, well past the point beside it.
  let end: Point = to;
  let flightEnd = T_HIT;
  let passAt = 1;
  if (!attack.hit) {
    const length = Math.hypot(beside[0] - from[0], beside[1] - from[1]) || 1;
    const extra = cell * 4;
    end = [
      from[0] + ((beside[0] - from[0]) / length) * (length + extra),
      from[1] + ((beside[1] - from[1]) / length) * (length + extra),
    ];
    flightEnd = T_HIT + (T_DRAIN - T_HIT) * 0.9;
    passAt = length / (length + extra);
  }
  const reach = Math.hypot(end[0] - from[0], end[1] - from[1]);
  const flight = (t - T_AIM) / (flightEnd - T_AIM);
  // CRPLAY, Shots: a tracer or a beam is the longer and thicker the higher the attacker's effective weapon damage.
  const weight = clamp(attack.strength / 10, 0.6, 3.2);

  if (attack.shot === 'bullet' || attack.shot === 'burst') {
    const rounds = attack.shot === 'burst' ? 3 : 1;
    const lag = 0.09;
    for (let k = 0; k < rounds; k += 1) {
      const f = (flight - k * lag) / (1 - (rounds - 1) * lag);
      if (f < 0 || f > 1) {
        continue;
      }
      const head = r + (reach - r - (attack.hit ? r : 0)) * f;
      const length = cell * (attack.shot === 'burst' ? 0.5 : 0.7) * (0.6 + weight * 0.4);
      tracer(
        ctx,
        from,
        end,
        head,
        length,
        1.2 + weight * 0.9,
        palette.tracer,
        attack.hit ? 1 : (1 - f) * 3.5,
      );
    }
  } else if (attack.shot === 'beam') {
    const rise = clamp((t - T_AIM) / 0.05, 0, 1);
    const fade = 1 - clamp((t - T_HIT) / 0.16, 0, 1);
    const alpha = Math.min(rise, fade);
    if (alpha > 0) {
      const ux = (end[0] - from[0]) / (reach || 1);
      const uy = (end[1] - from[1]) / (reach || 1);
      const stop = reach - (attack.hit ? r : 0);
      const width = 1.5 + weight * 1.3;
      for (const [colour, share, blur] of [
        [palette.beam, 1, 14],
        [palette.text, 0.35, 0],
      ] as const) {
        ctx.save();
        ctx.globalAlpha = alpha * (blur > 0 ? 0.85 : 1);
        ctx.strokeStyle = colour;
        ctx.lineWidth = width * share;
        ctx.lineCap = 'round';
        ctx.shadowColor = palette.beam;
        ctx.shadowBlur = blur;
        ctx.beginPath();
        ctx.moveTo(from[0] + ux * r, from[1] + uy * r);
        ctx.lineTo(from[0] + ux * stop, from[1] + uy * stop);
        ctx.stroke();
        ctx.restore();
      }
    }
  } else {
    // CRPLAY, Shots, Blade: a slash across the defender, or beside it for a miss.
    const k = (t - T_HIT + 0.04) / 0.2;
    if (k > 0 && k < 1.6) {
      const at = attack.hit ? to : beside;
      const span = r * 1.5;
      const shown = clamp(k, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(1.6 - k, 0, 1);
      ctx.strokeStyle = palette.text;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(at[0] - span * sign, at[1] - span);
      ctx.quadraticCurveTo(
        at[0] + span * 0.5 * sign,
        at[1] - span * 0.5,
        at[0] - span * sign + 2 * span * sign * shown,
        at[1] - span + 2 * span * shown,
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  const missed =
    attack.shot === 'blade' ? t >= T_HIT : attack.shot === 'beam' ? t >= T_AIM + 0.1 : flight >= passAt;
  if (!attack.hit && missed) {
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

/** CRPLAY, Shots: what the hits of one step do to each defender: the effect of each shot, then the damage, as one sum. */
function drawHits(ctx: CanvasRenderingContext2D, input: DrawInput, step: PlaybackStep): void {
  if (step.t < T_HIT) {
    return;
  }
  const { palette, replay } = input;
  const cell = input.size / BATTLEFIELD_CELLS;
  const r = bodyRadius(cell);
  const k = (step.t - T_HIT) / (1 - T_HIT);
  const hits = new Map<
    number,
    { damage: number; side: 'agent' | 'enemy'; shots: Set<ReplayAttack['shot']> }
  >();
  for (const attack of replay.attacks.slice(step.a, step.b)) {
    if (!attack.hit) {
      continue;
    }
    const hit = hits.get(attack.defender) ?? { damage: 0, side: attack.side, shots: new Set() };
    hit.damage += attack.damage;
    hit.shots.add(attack.shot);
    hits.set(attack.defender, hit);
  }
  for (const [index, hit] of hits) {
    const defender = replay.figures[index];
    if (defender === undefined) {
      continue;
    }
    const [x, y] = centre(defender, cell);
    const sparks = (delay: number, scale: number) => {
      const q = (k - delay) * 1.4;
      if (q < 0 || q > 0.6) {
        return;
      }
      ctx.save();
      ctx.globalAlpha = clamp(1 - q * 2.2, 0, 1);
      ctx.strokeStyle = palette.tracer;
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.arc(x, y, r + q * cell * 1.4 * scale, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      for (let spark = 0; spark < 7; spark += 1) {
        const angle = (spark * TAU) / 7 + step.a + delay * 9;
        const inner = r + q * cell * 0.9 * scale;
        const outer = inner + cell * 0.35 * scale;
        ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
        ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      }
      ctx.stroke();
      ctx.restore();
    };
    if (hit.shots.has('bullet')) {
      sparks(0, 1);
    }
    if (hit.shots.has('burst')) {
      sparks(0, 0.6);
      sparks(0.1, 0.6);
      sparks(0.2, 0.6);
    }
    if (hit.shots.has('beam')) {
      // CRPLAY, Shots, beam: a glow in Beam that spreads over the defender.
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * (1.2 + k * 2.2));
      glow.addColorStop(0, palette.beam);
      glow.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalAlpha = clamp(0.8 - k * 1.6, 0, 1);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * (1.2 + k * 2.2), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
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
  const cell = size / BATTLEFIELD_CELLS;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = palette.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < BATTLEFIELD_CELLS; k += 1) {
    const p = Math.round(k * cell) + 0.5;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  // CRPLAY, Figures, Name: a side with more Combatants than the Battlefield has rows shows no names, which would
  // lie over one another.
  const sideCount = (side: 'agent' | 'enemy') =>
    replay.figures.filter((figure) => figure.side === side).length;
  const crowded = {
    agent: sideCount('agent') > BATTLEFIELD_CELLS,
    enemy: sideCount('enemy') > BATTLEFIELD_CELLS,
  };
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
  // CRPLAY, Options, Aim lines: after a jump with the slider or a row of the Combat log, the attack shown has its line
  // even with Aim lines off, until the playing goes on.
  const jumped = !playing && playback.last === null;
  for (const attack of input.aimLines || jumped ? replay.attacks.slice(from, to) : []) {
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
  const r = bodyRadius(cell);
  for (const step of playback.active) {
    replay.attacks.slice(step.a, step.b).forEach((attack, k) => {
      if (attack.shot !== 'blade') {
        return;
      }
      const attacker = replay.figures[attack.attacker];
      const defender = replay.figures[attack.defender];
      if (attacker === undefined || defender === undefined) {
        return;
      }
      const start = centre(attacker, cell);
      const aim = attack.hit
        ? centre(defender, cell)
        : besideDefender(start, centre(defender, cell), (step.a + k) % 2 === 0 ? -1 : 1, cell);
      const length = Math.hypot(aim[0] - start[0], aim[1] - start[1]) || 1;
      const share = (Math.max(0, length - r * 2.6) / length) * lunge(step.t);
      const offset = offsets.get(attack.attacker) ?? [0, 0];
      offset[0] += (aim[0] - start[0]) * share;
      offset[1] += (aim[1] - start[1]) * share;
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
    drawFigure(ctx, input, figure, { health, armor, condition }, offset, !crowded[figure.side]);
  });

  for (const step of playback.active) {
    replay.attacks.slice(step.a, step.b).forEach((attack, k) => {
      drawShot(ctx, input, attack, step.t, (step.a + k) % 2 === 0 ? -1 : 1);
    });
    drawHits(ctx, input, step);
  }
}
