/**
 * CRPLAY, Shots: what each `shot` of a Weapon looks like on the Battlefield, and the moments of an attack at which it
 * fires and lands. Every part of a shot is a function of the attack's place in the Combat log and of how far the
 * attack has played, so that an attack always looks the same and nothing needs clean-up when the Player goes back.
 */
import { shotFamily, type ShotKind } from './combat-replay.ts';
import { KINETIC_MISS, replaySoundName } from './sounds.ts';

/** When, within one attack, its attacker is marked, its shot lands, and its defender is emptied, as fractions. */
export const T_AIM = 0.18;
export const T_HIT = 0.55;
export const T_DRAIN = 0.85;

const TAU = Math.PI * 2;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const ease = (x: number) => 1 - (1 - clamp(x, 0, 1)) ** 3;
/** A value from 0 up to 1 that follows from two numbers alone, e.g. an attack's place and the number of a spark. */
function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type Point = readonly [number, number];

/** VIS, Colours: the Design tokens the shots are drawn in. */
export interface ShotPalette {
  readonly text: string;
  readonly muted: string;
  readonly tracer: string;
  readonly muzzle: string;
  readonly tracerRed: string;
  readonly brass: string;
  readonly beam: string;
  readonly beamFringe: string;
}

/** Where one attack is drawn. */
export interface ShotGeometry {
  /** The centre of the attacker's cell. */
  readonly from: Point;
  /** The centre of the defender's cell. */
  readonly to: Point;
  /** Where the shot is aimed: the defender, or, for a miss, the point beside it. */
  readonly aim: Point;
  /** The radius of a figure's body. */
  readonly r: number;
  readonly cell: number;
  /** How far past its aim a shot that misses flies on. */
  readonly far: number;
  /** Which way a blade slashes: -1 or 1, alternating from attack to attack. */
  readonly sign: number;
}

export interface ShotInput {
  readonly shot: ShotKind;
  readonly hit: boolean;
  /** The attacker's effective weapon damage. */
  readonly strength: number;
  /** The attack's place in the Combat log, from which where its sparks fly follows. */
  readonly seed: number;
  /** How far the attack has played, from 0 to 1. */
  readonly t: number;
  /** Under reduced motion a beam does not flicker. */
  readonly still: boolean;
}

/** CRPLAY, Kinetic shots: the values of one kinetic shot; lengths are in 28ths of a cell. */
interface Kinetic {
  /** When the first round is fired, and how long a round takes to reach the defender, as fractions of the attack. */
  readonly fire: number;
  readonly flight: number;
  readonly rounds: number;
  /** The time from one round to the next. */
  readonly lag: number;
  readonly flash: number;
  readonly streak: number;
  readonly width: number;
  readonly head: number;
  readonly sparks: number;
  readonly recoil: number;
  readonly casing: boolean;
  readonly smoke: number;
  readonly trail: boolean;
  readonly spall: number;
  /** Whether every round is in Tracer red. */
  readonly red: boolean;
  readonly reticle: boolean;
  readonly ring: boolean;
  /** How far the rounds spread around the aim, in body radii. */
  readonly spread: number;
  /** The one round that is a tracer round in Tracer red while the others are fainter, or null when all are alike. */
  readonly tracerAt: number | null;
}

const PLAIN = {
  rounds: 1,
  lag: 0,
  red: false,
  reticle: false,
  ring: false,
  spread: 0,
  tracerAt: null,
} as const;

const KINETIC: Readonly<Record<string, Kinetic>> = {
  light_pistol: {
    ...PLAIN,
    fire: 0.45,
    flight: 0.1,
    flash: 7,
    streak: 14,
    width: 1,
    head: 1.3,
    sparks: 3,
    recoil: 0,
    casing: false,
    smoke: 1,
    trail: false,
    spall: 0,
  },
  heavy_pistol: {
    ...PLAIN,
    fire: 0.46,
    flight: 0.09,
    flash: 10,
    streak: 22,
    width: 1.1,
    head: 1.5,
    sparks: 5,
    recoil: 0,
    casing: true,
    smoke: 2,
    trail: false,
    spall: 0,
  },
  rifle: {
    ...PLAIN,
    fire: 0.49,
    flight: 0.06,
    flash: 16,
    streak: 46,
    width: 1.2,
    head: 1.6,
    sparks: 6,
    recoil: 4,
    casing: true,
    smoke: 2,
    trail: true,
    spall: 5,
  },
  sighted_rifle: {
    ...PLAIN,
    fire: 0.49,
    flight: 0.06,
    flash: 18,
    streak: 56,
    width: 1.3,
    head: 1.9,
    sparks: 7,
    recoil: 4,
    casing: true,
    smoke: 2,
    trail: true,
    spall: 8,
    red: true,
    reticle: true,
    ring: true,
  },
  machine_gun: {
    ...PLAIN,
    fire: 0.43,
    flight: 0.06,
    rounds: 5,
    lag: 0.04,
    flash: 13,
    streak: 34,
    width: 1,
    head: 1.7,
    sparks: 3,
    recoil: 2.2,
    casing: true,
    smoke: 1,
    trail: true,
    spall: 2,
    spread: 0.6,
    tracerAt: 2,
  },
};

/** CRPLAY, Energy shots: the values of one energy shot; lengths are in 28ths of a cell. */
interface Energy {
  /** When light starts to gather at the muzzle; the beam fires at `T_HIT`. */
  readonly gather: number;
  /** How long the beam holds and then fades, as fractions of the attack. */
  readonly hold: number;
  readonly fade: number;
  readonly width: number;
  readonly motes: number;
  readonly rings: number;
  /** Whether the beam has a halo, two wound filaments, and a closing ring, all in Beam fringe. */
  readonly fringe: boolean;
  readonly embers: number;
  /** Whether the hit throws a ring and outlines the defender. */
  readonly shock: boolean;
  /** Whether the beam leaves a faint line behind. */
  readonly after: boolean;
  /** How large the glow of the hit is. */
  readonly bloom: number;
}

const ENERGY: Readonly<Record<string, Energy>> = {
  laser_pistol: {
    gather: 0.45,
    hold: 0.03,
    fade: 0.08,
    width: 1.6,
    motes: 0,
    rings: 0,
    fringe: false,
    embers: 4,
    shock: false,
    after: false,
    bloom: 0.7,
  },
  laser_rifle: {
    gather: 0.32,
    hold: 0.07,
    fade: 0.2,
    width: 2.6,
    motes: 7,
    rings: 0,
    fringe: false,
    embers: 9,
    shock: false,
    after: true,
    bloom: 1,
  },
  focused_laser_rifle: {
    gather: 0.2,
    hold: 0.09,
    fade: 0.28,
    width: 3.6,
    motes: 12,
    rings: 3,
    fringe: true,
    embers: 15,
    shock: true,
    after: true,
    bloom: 1.25,
  },
};

/** When a blade's attacker reaches the defender, which is when it is heard. */
const T_BLADE = T_HIT - 0.05;

// ---- Moments -------------------------------------------------------------------------------------

/** One moment of an attack that is heard: how far the attack has played, and the Sound name. */
export interface ShotMoment {
  readonly at: number;
  readonly sound: string;
}

/**
 * SOUNDS, Combat replay Sounds: the moments of one attack and the Sound of each: the shot Sound each time the Weapon
 * fires, one hit Sound as the shot lands, and a kinetic miss, which stands for its three Sounds, as the first round of
 * a kinetic shot passes the defender.
 */
export function shotMoments(shot: ShotKind, hit: boolean): readonly ShotMoment[] {
  const sound = `shot-${shot.replaceAll('_', '-')}`;
  const family = shotFamily(shot);
  const kinetic = KINETIC[shot];
  if (family === 'kinetic' && kinetic !== undefined) {
    const fired = Array.from({ length: kinetic.rounds }, (_, k) => ({
      at: kinetic.fire + k * kinetic.lag,
      sound,
    }));
    return [...fired, { at: kinetic.fire + kinetic.flight, sound: hit ? 'hit-kinetic' : KINETIC_MISS }];
  }
  if (family === 'energy') {
    return hit
      ? [
          { at: T_HIT, sound },
          { at: T_HIT, sound: 'hit-energy' },
        ]
      : [{ at: T_HIT, sound }];
  }
  const swung = { at: T_BLADE, sound: 'shot-blade' };
  return hit ? [swung, { at: T_HIT, sound: 'hit-blade' }] : [swung];
}

/**
 * SOUNDS, Combat replay Sounds: the Sounds heard as the steps being played move on, each step from one moment of its
 * attacks to a later one, with the attack each belongs to. Of the Sounds of one Sound name that start at the same
 * time only one is heard, so that a phase played at once is a volley and not one loud Sound; the three Sounds of a
 * kinetic miss count as one Sound name, and the attack that is heard chooses among them.
 */
export function heardBetween(
  replay: { readonly attacks: readonly { readonly shot: ShotKind; readonly hit: boolean }[] },
  steps: readonly { readonly a: number; readonly b: number; readonly from: number; readonly to: number }[],
): readonly { readonly sound: string; readonly attack: number }[] {
  const heard = new Map<string, number>();
  for (const step of steps) {
    replay.attacks.slice(step.a, step.b).forEach((attack, k) => {
      for (const moment of shotMoments(attack.shot, attack.hit)) {
        if (moment.at > step.from && moment.at <= step.to && !heard.has(moment.sound)) {
          heard.set(moment.sound, step.a + k);
        }
      }
    });
  }
  return [...heard].map(([sound, attack]) => ({ sound: replaySoundName(sound, attack), attack }));
}

/** When a shot that misses has passed its defender, which is when the word that says so appears. */
export function missShownAt(shot: ShotKind): number {
  const kinetic = KINETIC[shot];
  return kinetic === undefined ? T_HIT : kinetic.fire + kinetic.flight;
}

// ---- The attacker --------------------------------------------------------------------------------

/** CRPLAY, Blade: how far along its way to the defender a lunging attacker is. */
function lunge(t: number): number {
  if (t < T_AIM) {
    return 0;
  }
  if (t < T_HIT) {
    return ease((t - T_AIM) / (T_HIT - T_AIM));
  }
  return t < 0.7 ? 1 : 1 - ease((t - 0.7) / 0.25);
}

/**
 * How far an attack moves its attacker out of its cell: a blade lunges to the defender and returns, and a kinetic
 * shot that recoils kicks the attacker back with each round, though not under reduced motion.
 */
export function attackerOffset(g: ShotGeometry, shot: ShotKind, t: number, still: boolean): Point {
  const dx = g.aim[0] - g.from[0];
  const dy = g.aim[1] - g.from[1];
  const length = Math.hypot(dx, dy) || 1;
  if (shotFamily(shot) === 'blade') {
    const share = (Math.max(0, length - g.r * 2.6) / length) * lunge(t);
    return [dx * share, dy * share];
  }
  const kinetic = KINETIC[shot];
  if (kinetic === undefined || kinetic.recoil === 0 || still) {
    return [0, 0];
  }
  let back = 0;
  for (let k = 0; k < kinetic.rounds; k += 1) {
    const q = (t - kinetic.fire - k * kinetic.lag) / 0.1;
    if (q >= 0 && q < 1) {
      back += kinetic.recoil * (g.cell / 28) * (1 - q) ** 2;
    }
  }
  return [(-dx / length) * back, (-dy / length) * back];
}

// ---- Drawing -------------------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(ctx: Ctx, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, radius), 0, TAU);
  ctx.fill();
}

/** Within one shot, a streak is the longer and a beam the thicker the higher the effective weapon damage. */
const gainOf = (strength: number) => 0.85 + clamp(strength, 0, 40) / 100;

function muzzleFlash(
  ctx: Ctx,
  palette: ShotPalette,
  at: Point,
  angle: number,
  size: number,
  alpha: number,
  jitter: number,
): void {
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(angle);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = palette.muzzle;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.16);
  ctx.quadraticCurveTo(size * 0.6, -size * 0.24, size, 0);
  ctx.quadraticCurveTo(size * 0.6, size * 0.24, 0, size * 0.16);
  ctx.closePath();
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * (1.05 + jitter * 0.35));
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.07);
    ctx.lineTo(size * 0.55, 0);
    ctx.lineTo(0, size * 0.07);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = clamp(alpha, 0, 1) * 0.55;
  ctx.fillStyle = palette.tracer;
  dot(ctx, size * 0.15, 0, size * 0.32);
  ctx.restore();
}

/** CRPLAY, Kinetic shots: the brackets that close on the defender of a `sighted_rifle` before it fires. */
function reticle(ctx: Ctx, palette: ShotPalette, g: ShotGeometry, fire: number, t: number): void {
  if (t >= fire + 0.08) {
    return;
  }
  const closed = clamp((t - 0.08) / (fire - 0.14), 0, 1);
  const size = g.r * (2.6 - 1.2 * ease(closed));
  const arm = size * 0.4;
  ctx.save();
  ctx.globalAlpha = Math.min(1, closed * 3) * (t > fire ? 1 - (t - fire) / 0.08 : 1);
  ctx.strokeStyle = palette.tracerRed;
  ctx.lineWidth = Math.max(1, g.cell * 0.045);
  ctx.beginPath();
  for (const cx of [-1, 1]) {
    for (const cy of [-1, 1]) {
      const x = g.to[0] + cx * size;
      const y = g.to[1] + cy * size;
      ctx.moveTo(x - cx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - cy * arm);
    }
  }
  ctx.stroke();
  if (closed >= 1) {
    ctx.fillStyle = palette.tracerRed;
    dot(ctx, g.to[0], g.to[1], g.cell * 0.05);
  }
  ctx.restore();
}

function drawKinetic(ctx: Ctx, palette: ShotPalette, g: ShotGeometry, input: ShotInput, p: Kinetic): void {
  const { t, hit, seed } = input;
  const px = g.cell / 28;
  const { from, r } = g;
  const dx = g.aim[0] - from[0];
  const dy = g.aim[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const perp: Point = [-dy / length, dx / length];
  const streak = p.streak * px * gainOf(input.strength);

  if (p.reticle) {
    reticle(ctx, palette, g, p.fire, t);
  }
  for (let k = 0; k < p.rounds; k += 1) {
    const fired = p.fire + k * p.lag;
    if (t < fired) {
      continue;
    }
    const spread = p.spread === 0 ? 0 : (hash(seed, k) - 0.5) * 2 * p.spread * r;
    const ax = g.aim[0] + perp[0] * spread;
    const ay = g.aim[1] + perp[1] * spread;
    const reach = Math.hypot(ax - from[0], ay - from[1]) || 1;
    const ux = (ax - from[0]) / reach;
    const uy = (ay - from[1]) / reach;
    const angle = Math.atan2(uy, ux);
    const muzzleAt = r + 3 * px;
    const muzzle: Point = [from[0] + ux * muzzleAt, from[1] + uy * muzzleAt];
    const tracerRound = p.tracerAt === null || k === p.tracerAt;
    const red = p.red || (p.tracerAt !== null && tracerRound);
    const landAt = reach - r;

    // The muzzle flash: a short flame, smaller as it goes.
    const flash = (t - fired) / 0.045;
    if (flash < 1) {
      muzzleFlash(
        ctx,
        palette,
        muzzle,
        angle,
        p.flash * px * (1 - flash * 0.45),
        1 - flash * 0.8,
        hash(seed, k + 20),
      );
    }
    if (p.ring && k === 0) {
      const ring = (t - fired) / 0.12;
      if (ring < 1) {
        ctx.save();
        ctx.globalAlpha = (1 - ring) * 0.6;
        ctx.strokeStyle = palette.text;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(muzzle[0], muzzle[1], (3 + ring * 13) * px, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    // The puff of smoke, which drifts up.
    const smoke = (t - fired) / 0.3;
    if (smoke < 1) {
      ctx.save();
      ctx.fillStyle = palette.muted;
      ctx.globalAlpha = 0.16 * (1 - smoke);
      for (let j = 0; j < p.smoke; j += 1) {
        const out = (3 + smoke * 9 + j * 4) * px;
        dot(
          ctx,
          muzzle[0] + ux * out,
          muzzle[1] + uy * out - (smoke * 8 + j * 3) * px,
          (2 + smoke * 5 + j) * px,
        );
      }
      ctx.restore();
    }

    // The round: a thin streak behind a small dot, without a glow. A miss flies on at the same speed.
    const flown = (t - fired) / p.flight;
    const head = muzzleAt + (landAt - muzzleAt) * flown;
    const shown = Math.min(head, hit ? landAt : reach + g.far);
    if (hit ? flown <= 1 : head < reach + g.far) {
      const tail = Math.max(muzzleAt, head - streak);
      const hx = from[0] + ux * head;
      const hy = from[1] + uy * head;
      const tx = from[0] + ux * tail;
      const ty = from[1] + uy * tail;
      const colour = red ? palette.tracerRed : palette.muzzle;
      const fading = ctx.createLinearGradient(tx, ty, hx, hy);
      fading.addColorStop(0, 'transparent');
      fading.addColorStop(1, colour);
      ctx.save();
      ctx.globalAlpha = tracerRound ? 0.95 : 0.5;
      ctx.strokeStyle = fading;
      ctx.lineWidth = Math.max(1, p.width * px);
      ctx.lineCap = 'butt';
      line(ctx, tx, ty, hx, hy);
      if (tracerRound) {
        ctx.fillStyle = colour;
        dot(ctx, hx, hy, Math.max(1, p.head * px));
      }
      ctx.restore();
    }

    // The line of smoke a rifle round leaves, which lifts as it fades.
    if (p.trail) {
      const faded = (t - fired - p.flight) / 0.3;
      if (faded < 1) {
        const lift = faded > 0 ? faded * 3 * px : 0;
        ctx.save();
        ctx.globalAlpha = 0.2 * (faded < 0 ? 1 : 1 - faded) * (tracerRound ? 1 : 0.55);
        ctx.strokeStyle = palette.muted;
        ctx.lineWidth = 1;
        line(ctx, muzzle[0], muzzle[1] - lift, from[0] + ux * shown, from[1] + uy * shown - lift);
        ctx.restore();
      }
    }

    // The casing: thrown up and back from the attacker, then falling.
    if (p.casing) {
      const thrown = (t - fired) / 0.32;
      if (thrown < 1) {
        const back = (5 + thrown * (10 + hash(seed, k + 40) * 10)) * px;
        ctx.save();
        ctx.translate(
          from[0] - ux * back,
          from[1] - uy * back + (-22 * thrown + 34 * thrown * thrown) * px - r * 0.4,
        );
        ctx.rotate(thrown * 9 + k);
        ctx.globalAlpha = 1 - thrown ** 3;
        ctx.fillStyle = palette.brass;
        ctx.fillRect(-1.5 * px, -0.7 * px, 3 * px, 1.4 * px);
        ctx.restore();
      }
    }

    // The hit: a flash, sparks that fly back toward the attacker, dust, and spall thrown out behind the defender.
    const landed = (t - fired - p.flight) / 0.22;
    if (hit && landed >= 0 && landed < 1) {
      const ix = from[0] + ux * landAt;
      const iy = from[1] + uy * landAt;
      ctx.save();
      if (landed < 0.18) {
        ctx.fillStyle = palette.muzzle;
        dot(ctx, ix, iy, 3.5 * px * (1 - landed / 0.18));
      }
      ctx.fillStyle = palette.muted;
      ctx.globalAlpha = 0.2 * (1 - landed);
      dot(ctx, ix, iy, (2 + landed * 6) * px);
      ctx.strokeStyle = palette.tracer;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1 - landed;
      for (let s = 0; s < p.sparks; s += 1) {
        const a = angle + Math.PI + (hash(seed + k, s + 60) - 0.5) * 2.4;
        const out = (5 + hash(seed + k, s + 70) * 11) * px * ease(landed);
        const long = (3 + hash(seed + k, s + 80) * 3) * px * (1 - landed);
        line(
          ctx,
          ix + Math.cos(a) * out,
          iy + Math.sin(a) * out,
          ix + Math.cos(a) * (out + long),
          iy + Math.sin(a) * (out + long),
        );
      }
      ctx.fillStyle = palette.text;
      ctx.globalAlpha = (1 - landed) * 0.8;
      for (let s = 0; s < p.spall; s += 1) {
        const a = angle + (hash(seed + k, s + 90) - 0.5) * 0.9;
        const out = reach + r + (6 + hash(seed + k, s + 100) * 24) * px * ease(landed);
        dot(
          ctx,
          from[0] + ux * reach + Math.cos(a) * (out - reach),
          from[1] + uy * reach + Math.sin(a) * (out - reach),
          1.1 * px,
        );
      }
      ctx.restore();
    }
  }
}

function drawEnergy(ctx: Ctx, palette: ShotPalette, g: ShotGeometry, input: ShotInput, p: Energy): void {
  const { t, hit, seed } = input;
  const px = g.cell / 28;
  const { from, to, r } = g;
  const dx = g.aim[0] - from[0];
  const dy = g.aim[1] - from[1];
  const reach = Math.hypot(dx, dy) || 1;
  const ux = dx / reach;
  const uy = dy / reach;
  const muzzleAt = r + 3 * px;
  const mx = from[0] + ux * muzzleAt;
  const my = from[1] + uy * muzzleAt;
  const end = hit ? reach - r : reach + g.far;
  const ex = from[0] + ux * end;
  const ey = from[1] + uy * end;
  const width = p.width * px * gainOf(input.strength);

  // The light that gathers at the muzzle until the beam fires.
  const gathered = (t - p.gather) / (T_HIT - p.gather);
  if (gathered >= 0 && gathered < 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = palette.beam;
    for (let j = 0; j < p.motes; j += 1) {
      const near = clamp(gathered * 1.35 - hash(seed, j + 40) * 0.35, 0, 1);
      if (near <= 0 || near >= 1) {
        continue;
      }
      const angle = hash(seed, j) * TAU;
      const away = (1 - ease(near)) * (13 + hash(seed, j + 10) * 10) * px;
      ctx.globalAlpha = near * 0.9;
      dot(ctx, mx + Math.cos(angle) * away, my + Math.sin(angle) * away, px);
    }
    const core = px + gathered * width * 1.2;
    ctx.globalAlpha = 0.45 + 0.5 * gathered;
    dot(ctx, mx, my, core);
    ctx.fillStyle = palette.muzzle;
    dot(ctx, mx, my, core * 0.45);
    if (p.fringe) {
      ctx.globalAlpha = gathered * 0.7;
      ctx.strokeStyle = palette.beamFringe;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx, my, ((1 - gathered) * 16 + 3) * px, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  const fired = t - T_HIT;
  if (fired < 0) {
    return;
  }
  const faded = clamp((fired - p.hold) / p.fade, 0, 1);
  const alpha = clamp(fired / 0.015, 0, 1) * (1 - faded);
  const flicker = input.still ? 1 : 0.82 + 0.18 * hash(Math.floor(t * 140), seed);
  const now = width * (1 - 0.6 * faded);

  if (alpha > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    if (p.fringe) {
      ctx.globalAlpha = alpha * 0.12;
      ctx.strokeStyle = palette.beamFringe;
      ctx.lineWidth = now * 4.6;
      line(ctx, mx, my, ex, ey);
    }
    ctx.globalAlpha = alpha * 0.18;
    ctx.strokeStyle = palette.beam;
    ctx.lineWidth = now * 3.2;
    line(ctx, mx, my, ex, ey);
    ctx.globalAlpha = alpha * 0.9 * flicker;
    ctx.lineWidth = now;
    line(ctx, mx, my, ex, ey);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = palette.muzzle;
    ctx.lineWidth = now * 0.4;
    line(ctx, mx, my, ex, ey);

    const along = end - muzzleAt;
    if (p.fringe) {
      // The two filaments wound around the beam.
      ctx.strokeStyle = palette.beamFringe;
      ctx.lineWidth = Math.max(0.8, 0.9 * px);
      ctx.globalAlpha = alpha * 0.6;
      const step = Math.max(2, 3 * px);
      for (let strand = 0; strand < 2; strand += 1) {
        ctx.beginPath();
        for (let s = 0; s <= along; s += step) {
          const swing =
            (2.5 * px + width * 0.5) * Math.min(1, s / (18 * px)) * Math.min(1, (along - s) / (10 * px));
          const off = Math.sin((s / px) * 0.16 - fired * 90 + strand * Math.PI) * swing;
          const x = mx + ux * s - uy * off;
          const y = my + uy * s + ux * off;
          if (s === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }
    ctx.strokeStyle = palette.beam;
    ctx.lineWidth = 1;
    for (let j = 0; j < p.rings; j += 1) {
      const place = (fired / (p.hold + p.fade * 0.6) + j / p.rings) % 1;
      ctx.globalAlpha = alpha * 0.85 * Math.sin(Math.PI * place);
      ctx.beginPath();
      ctx.ellipse(
        mx + ux * along * place,
        my + uy * along * place,
        1.8 * px,
        4 * px + width * 1.5,
        Math.atan2(uy, ux),
        0,
        TAU,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // The faint line a held beam leaves behind.
  if (p.after && fired > p.hold) {
    const gone = (fired - p.hold) / (p.fade * 1.2);
    if (gone < 1) {
      ctx.save();
      ctx.globalAlpha = 0.2 * (1 - gone);
      ctx.strokeStyle = palette.beam;
      ctx.lineWidth = 1;
      line(ctx, mx, my, ex, ey);
      ctx.restore();
    }
  }

  // The hit: a glow that spreads over the defender, embers that fall, and for the strongest a ring and an outline.
  const landed = fired / (p.hold + p.fade + 0.08);
  if (!hit || landed >= 1) {
    return;
  }
  const bloom = r * (1.2 + landed * 2.2) * p.bloom;
  const glow = ctx.createRadialGradient(to[0], to[1], 0, to[0], to[1], bloom);
  glow.addColorStop(0, palette.beam);
  glow.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(0.85 * (1 - landed), 0, 1);
  ctx.fillStyle = glow;
  dot(ctx, to[0], to[1], bloom);
  if (fired < 0.03) {
    ctx.globalAlpha = 1 - fired / 0.03;
    ctx.fillStyle = palette.muzzle;
    dot(ctx, to[0] - ux * r, to[1] - uy * r, 2 * px + width);
  }
  for (let j = 0; j < p.embers; j += 1) {
    const angle = hash(seed, j + 120) * TAU;
    const out = (7 + hash(seed, j + 130) * 17) * px * ease(landed);
    ctx.globalAlpha = 1 - landed;
    ctx.fillStyle = j % 3 === 0 ? palette.muzzle : palette.beam;
    dot(
      ctx,
      to[0] + Math.cos(angle) * out,
      to[1] + Math.sin(angle) * out + 12 * px * landed * landed,
      1.1 * px,
    );
  }
  if (p.shock) {
    ctx.globalAlpha = (1 - landed) * 0.8;
    ctx.strokeStyle = palette.beam;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(to[0], to[1], r + landed * g.cell * 1.3, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * CRPLAY, Energy shots: how strongly the defender is outlined in Beam while the hit of a shot that does so fades, from
 * 0 to 1; 0 for every other shot. The Battlefield draws the outline, since it knows the defender's shape.
 */
export function outlineGlow(shot: ShotKind, t: number): number {
  const energy = ENERGY[shot];
  if (energy === undefined || !energy.shock || t < T_HIT) {
    return 0;
  }
  return clamp(1 - (t - T_HIT) / (energy.hold + energy.fade + 0.08), 0, 1) * 0.9;
}

/** CRPLAY, Blade: a tapered slash across the defender, or beside it for a miss, with three sparks on a hit. */
function drawBlade(ctx: Ctx, palette: ShotPalette, g: ShotGeometry, input: ShotInput): void {
  const { t, hit, seed } = input;
  const k = (t - T_HIT + 0.04) / 0.2;
  if (k <= 0 || k >= 1.6) {
    return;
  }
  const px = g.cell / 28;
  const at = g.aim;
  const span = g.r * 1.5;
  const shown = clamp(k, 0, 1);
  const ax = at[0] - span * g.sign;
  const ay = at[1] - span;
  const bx = ax + 2 * span * g.sign * shown;
  const by = ay + 2 * span * shown;
  const cx = at[0] + span * 0.5 * g.sign;
  const cy = at[1] - span * 0.5;
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  ctx.save();
  ctx.globalAlpha = clamp(1.6 - k, 0, 1);
  ctx.fillStyle = palette.muzzle;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(cx, cy, bx, by);
  ctx.quadraticCurveTo(cx + (midX - cx) * 0.4, cy + (midY - cy) * 0.4, ax, ay);
  ctx.fill();
  const landed = (t - T_HIT) / 0.2;
  if (hit && landed >= 0 && landed < 1) {
    ctx.globalAlpha = 1 - landed;
    ctx.strokeStyle = palette.tracer;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (let s = 0; s < 3; s += 1) {
      const a = Math.atan2(1, g.sign) + (hash(seed, s + 5) - 0.5) * 1.3;
      const out = g.r + (4 + hash(seed, s + 9) * 9) * px * ease(landed);
      const long = 3 * px * (1 - landed);
      line(
        ctx,
        at[0] + Math.cos(a) * out,
        at[1] + Math.sin(a) * out,
        at[0] + Math.cos(a) * (out + long),
        at[1] + Math.sin(a) * (out + long),
      );
    }
  }
  ctx.restore();
}

/** CRPLAY, Shots: draws one attack's shot as far as the attack has played: its firing, its crossing, and its hit. */
export function drawShotEffect(ctx: Ctx, palette: ShotPalette, g: ShotGeometry, input: ShotInput): void {
  const kinetic = KINETIC[input.shot];
  const energy = ENERGY[input.shot];
  if (kinetic !== undefined) {
    drawKinetic(ctx, palette, g, input, kinetic);
  } else if (energy !== undefined) {
    drawEnergy(ctx, palette, g, input, energy);
  } else {
    drawBlade(ctx, palette, g, input);
  }
}
