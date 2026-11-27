/**
 * CRPLAY: the Combat replay. It plays one Combat back from its Combat report on the Battlefield, a canvas drawn with
 * the Canvas 2D API, with the attack being played, the transport buttons, the Options, and the Combat log beside it.
 */
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { CombatReport } from '../../engine/index.ts';
import { attackResultText, combatLogRow } from '../combat-log.ts';
import {
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  DELAYS_MS,
  PACES,
  SPEEDS_MS,
  advance,
  jumpTo,
  newPlayback,
  paceSettings,
  phaseEnd,
  playAttack,
  playTo,
  ratingsAt,
  ratingsRatioText,
  roundEnd,
  settledIndex,
  shownRange,
  ratingShareText,
  skillShareText,
  type Pace,
  type Playback,
  type PlaybackSettings,
  type Replay,
} from '../combat-replay.ts';
import { drawReplay, figureAt, readPalette, type ReplayPalette } from '../combat-replay-draw.ts';
import { groupDigits, hitChanceText, wholeText } from '../format.ts';
import { replayOptionsShown } from '../replay-options.ts';
import { sliderFill } from '../slider.ts';
import { heardBetween } from '../combat-replay-shots.ts';
import { playReplaySound, playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { Button, typingIn } from '../ui.tsx';

/**
 * CRPLAY, Rewind, Repeat, and Options buttons: the steps Repeat plays again: the four step buttons, and an attack
 * picked with the slider, a row of the Combat log, or Back one; and, after a pace button, the last step it started.
 */
type StepKind = 'turn' | 'phase' | 'round' | 'combat' | 'pick' | 'pace';

/** CRPLAY, Repeat: a step the Player took: the attacks it played, and the Combat it was taken in. */
interface TakenStep {
  kind: StepKind;
  from: number;
  to: number;
  combatKey: string | number | undefined;
  /** The pace whose last step this is, which Repeat plays it at in place of the Options. */
  pace?: Pace;
}

const STEP_NAMES: Record<Exclude<StepKind, 'pace'>, string> = {
  turn: 'Combat turn',
  phase: 'Phase',
  round: 'Combat round',
  combat: 'Combat',
  pick: 'Picked attack',
};

/** CRPLAY, Repeat: the name its tooltip gives the last step, e.g. "Combat turn" or, after a pace, "Medium". */
const stepName = (step: TakenStep) =>
  step.kind === 'pace' ? (step.pace?.name ?? '') : STEP_NAMES[step.kind];

/** CRPLAY, Options: a Speed or a Delay as the Player reads it, e.g. "1.5 s". */
const seconds = (ms: number) => `${ms / 1000} s`;

/** The longest one drawing step may take, so that a tab that slept does not skip a whole Combat. */
const MAX_STEP_MS = 100;

/** CRPLAY, Options: the Combat replay opens with the values of the Medium pace. */
const OPENING_PACE = PACES.find((pace) => pace.id === 'medium') ?? PACES[0];

/** CRPLAY, Transport buttons: right-pointing arrows, like the keys of a tape player. */
function Arrows({ count }: { count: number }) {
  const width = 6 + count * 7;
  return (
    <svg width={width} height="12" viewBox={`0 0 ${width} 12`} aria-hidden="true">
      {Array.from({ length: count }, (_, k) => (
        <path key={k} d={`M${k * 7} 0 L${k * 7 + 9} 6 L${k * 7} 12 Z`} fill="currentColor" />
      ))}
    </svg>
  );
}

/** CRPLAY, Transport buttons: two upright bars. */
function PauseSymbol() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1" y="0" width="3.5" height="12" fill="currentColor" />
      <rect x="7.5" y="0" width="3.5" height="12" fill="currentColor" />
    </svg>
  );
}

/** CRPLAY, Rewind: the rewind symbol of a tape player, a bar before two left-pointing arrows. */
function RewindSymbol() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
      <rect x="0" y="0" width="2.5" height="12" fill="currentColor" />
      <path d="M11 0 L2.5 6 L11 12 Z M18 0 L9.5 6 L18 12 Z" fill="currentColor" />
    </svg>
  );
}

/** CRPLAY, Back one: a left-pointing arrow before the digit 1, the mirror of the Combat turn button. */
function BackOneSymbol() {
  return (
    <span className="replay-back-one">
      <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
        <path d="M8 0 L0 6 L8 12 Z" fill="currentColor" />
      </svg>
      <span className="replay-digit">1</span>
    </span>
  );
}

/** CRPLAY: a button that shows a symbol and no label; its name is its tooltip and its accessible name. */
/** CRPLAY, Attack being played: the Agents' share of the two Combat ratings in Positive, the rest in Danger. */
function RatingsPie({ share }: { share: number }) {
  const angle = share * 2 * Math.PI;
  const x = 50 + 50 * Math.sin(angle);
  const y = 50 - 50 * Math.cos(angle);
  return (
    <svg
      className="replay-pie"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Agents' share of the Combat ratings: ${Math.round(share * 100)}%`}
    >
      <circle cx="50" cy="50" r="50" className={share >= 1 ? 'pie-agents' : 'pie-enemies'} />
      {share <= 0 || share >= 1 ? null : (
        <path
          className="pie-agents"
          d={`M50 50 L50 0 A50 50 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`}
        />
      )}
    </svg>
  );
}

function SymbolButton(props: {
  name: string;
  testId: string;
  disabledReason?: string | null;
  pressed?: boolean;
  shortcut?: string;
  /** A note the tooltip gives after the name, e.g. what the button does with Ctrl held. */
  hint?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  const disabled = props.disabledReason !== undefined && props.disabledReason !== null;
  const named = props.hint === undefined ? props.name : `${props.name} · ${props.hint}`;
  const title = props.shortcut === undefined ? named : `${named} · Shortcut: ${props.shortcut}`;
  return (
    <button
      type="button"
      className={`btn btn-plain replay-symbol${props.pressed === true ? ' pressed' : ''}`}
      aria-label={props.name}
      aria-pressed={props.pressed}
      title={
        disabled
          ? `${props.name}: ${props.disabledReason ?? ''}${props.shortcut === undefined ? '' : ` · Shortcut: ${props.shortcut}`}`
          : title
      }
      disabled={disabled}
      data-testid={props.testId}
      data-sound="select"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function CombatReplay(props: {
  combat: CombatReport;
  replay: Replay;
  /** The largest armor of any Armor of the Game build, which gets the thickest rim. */
  armorScale: number;
  /** A value that changes when another Combat is shown, which returns the playback to Combat start. */
  combatKey?: string | number;
}) {
  const { combat, replay } = props;
  const total = replay.attacks.length;
  const [speedMs, setSpeedMs] = useState<number>(OPENING_PACE?.speedMs ?? 1000);
  const [delayMs, setDelayMs] = useState<number>(OPENING_PACE?.delayMs ?? 1000);
  const [overlap, setOverlap] = useState(OPENING_PACE?.overlap ?? false);
  const [instant, setInstant] = useState(OPENING_PACE?.instant ?? false);
  const [aimLines, setAimLines] = useState(OPENING_PACE?.aimLines ?? true);
  // CRPLAY, Options: hidden when a Session starts, and as the Player last left them for the rest of it.
  const optionsShown = replayOptionsShown.use();
  const [takenStep, setTakenStep] = useState<TakenStep | null>(null);
  const [size, setSize] = useState(0);
  const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null);
  const [, setVersion] = useState(0);

  const playbackRef = useRef<Playback | null>(null);
  playbackRef.current ??= newPlayback();
  const playback = playbackRef.current;
  const shownCombatKey = useRef(props.combatKey);
  if (shownCombatKey.current !== props.combatKey) {
    shownCombatKey.current = props.combatKey;
    jumpTo(playback, replay, 0);
  }
  // CRPLAY, Transport buttons: the pace being played, or null while the Options govern the playing. A pace never
  // reads or changes the Options.
  const [activePace, setActivePace] = useState<Pace | null>(null);
  const options: PlaybackSettings = { speedMs, delayMs, overlap, instant };
  const settings: PlaybackSettings = activePace === null ? options : paceSettings(activePace);
  const shownAimLines = activePace === null ? aimLines : activePace.aimLines;
  // What the drawing loop reads: it outlives the render that started it, so it reads the newest values from here.
  const live = useRef({ replay, settings, size, aimLines: shownAimLines, armorScale: props.armorScale });
  live.current = { replay, settings, size, aimLines: shownAimLines, armorScale: props.armorScale };
  /** CRPLAY, Options: every button but a pace plays with the Options; the drawing loop reads them from here at once. */
  const withOptions = () => {
    setActivePace(null);
    live.current = { ...live.current, settings: options, aimLines };
  };
  /** CRPLAY, Transport buttons: plays with the values of a pace; the drawing loop reads them from here at once. */
  const withPace = (pace: Pace) => {
    setActivePace(pace);
    live.current = { ...live.current, settings: paceSettings(pace), aimLines: pace.aimLines };
  };

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<ReplayPalette | null>(null);
  const frame = useRef(0);
  const lastTime = useRef(0);
  const shownKey = useRef('');

  /** Draws the Battlefield, and renders the panel again when what it names has changed. */
  const paint = () => {
    const canvas = canvasRef.current;
    const now = live.current;
    if (canvas !== null && now.size > 0) {
      const ratio = window.devicePixelRatio || 1;
      const pixels = Math.round(now.size * ratio);
      if (canvas.width !== pixels) {
        canvas.width = pixels;
        canvas.height = Math.round((now.size * BATTLEFIELD_ROWS * ratio) / BATTLEFIELD_COLUMNS);
      }
      const ctx = canvas.getContext('2d');
      paletteRef.current ??= readPalette(canvas);
      if (ctx !== null) {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawReplay(ctx, {
          replay: now.replay,
          playback,
          size: now.size,
          palette: paletteRef.current,
          instant: now.settings.instant,
          aimLines: now.aimLines,
          armorScale: now.armorScale,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
      }
    }
    const [from, to] = shownRange(playback, now.replay, now.settings.instant);
    const key = `${from}|${to}|${playback.index}|${playback.playing}|${playback.target}|${settledIndex(playback)}|${playback.active.length > 0}`;
    if (key !== shownKey.current) {
      shownKey.current = key;
      setVersion((version) => version + 1);
    }
  };

  const loop = (time: number) => {
    // SOUNDS, Combat replay Sounds: each moment of a shot is heard as the playing passes it.
    const before = playback.active.map((step) => ({ step, from: step.t }));
    advance(
      playback,
      live.current.replay,
      Math.min(MAX_STEP_MS, time - lastTime.current),
      live.current.settings,
    );
    for (const heard of heardBetween(
      live.current.replay,
      before.map(({ step, from }) => ({ a: step.a, b: step.b, from, to: step.t })),
    )) {
      playReplaySound(heard.sound, heard.attack);
    }
    lastTime.current = time;
    paint();
    frame.current = playback.playing ? requestAnimationFrame(loop) : 0;
  };
  /** Starts the drawing loop when the playback plays and no loop runs yet, and draws at once either way. */
  const refresh = () => {
    if (playback.playing && frame.current === 0) {
      lastTime.current = performance.now();
      frame.current = requestAnimationFrame(loop);
    }
    paint();
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap === null) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setSize(Math.floor(wrap.clientWidth));
    });
    observer.observe(wrap);
    setSize(Math.floor(wrap.clientWidth));
    // The names on the Battlefield are drawn in the figure font, which may arrive after the first drawing.
    void document.fonts.ready.then(() => {
      setVersion((version) => version + 1);
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);
  // Every render draws: the size, a setting, or the Combat shown may have changed.
  useEffect(paint);

  const [from, to] = shownRange(playback, replay, settings.instant);
  const settled = settledIndex(playback);
  const resting = playback.active.length === 0;
  const ended = playback.index >= total && resting;
  const atStart = playback.index === 0 && resting;
  const sideOf = (id: string) => combat.participants.find((who) => who.id === id)?.side ?? 'enemy';
  const nameOf = (id: string) => replay.figures.find((figure) => figure.id === id)?.name ?? id;

  // CRPLAY, Slider and Combat log: the Combat log follows the attack being played.
  useEffect(() => {
    const log = logRef.current;
    const row = log?.children[to - 1];
    if (log === null || log === undefined) {
      return;
    }
    log.scrollTop = row instanceof HTMLElement ? row.offsetTop - log.clientHeight / 2 + 12 : 0;
  }, [to]);

  const finished = 'Every attack has been played.';
  const step = (kind: StepKind) => {
    // CRPLAY, Slider and Combat log: a step goes on from the attack the slider or the Combat log picked, also when it
    // is taken before the picked attack has started to play.
    // CRPLAY, Options, Steps: the Combat button plays the whole Combat, from Combat start wherever the replay stands.
    const start = kind === 'combat' ? 0 : playback.picked ? playback.target : playback.index;
    const target =
      kind === 'turn'
        ? start + 1
        : kind === 'phase'
          ? phaseEnd(replay, start)
          : kind === 'round'
            ? roundEnd(replay, start)
            : total;
    withOptions();
    if (kind === 'combat') {
      jumpTo(playback, replay, 0);
    }
    setTakenStep({
      kind,
      from: start,
      to: Math.min(total, target),
      combatKey: props.combatKey,
    });
    playTo(playback, replay, target, true);
    refresh();
  };
  // CRPLAY, Repeat: the last step taken in the Combat shown, which Repeat plays again from where it began. After a pace
  // button, it is the last step that pace started, i.e. one attack or, with Instant on, a phase.
  const taken = takenStep !== null && takenStep.combatKey === props.combatKey ? takenStep : null;
  const lastStep: TakenStep | null =
    taken?.kind !== 'pace'
      ? taken
      : playback.last === null
        ? null
        : { ...taken, from: playback.last[0], to: playback.last[1] };
  const repeat = () => {
    if (lastStep !== null) {
      if (lastStep.pace === undefined) {
        withOptions();
      } else {
        withPace(lastStep.pace);
      }
      if (lastStep.kind === 'pick') {
        // A picked attack plays again as it was picked, with its aim line.
        playAttack(playback, replay, lastStep.to);
      } else {
        jumpTo(playback, replay, lastStep.from);
        playTo(playback, replay, lastStep.to, true);
      }
      refresh();
    }
  };
  // The R key presses Repeat, and while the Combat replay is shown no other listener hears the key, e.g. not the Redo
  // button of the Campaign screen.
  const onRepeatKey = useRef<() => void>(() => undefined);
  onRepeatKey.current = () => {
    if (lastStep !== null) {
      playSound(SOUND.select);
      repeat();
    }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'r' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        typingIn(event.target)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onRepeatKey.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  /**
   * CRPLAY, Transport buttons: a pace button plays to the end of the Combat with the values of its pace, from Combat
   * start when the Combat replay is at the end of the Combat, and leaves the Options as they are.
   */
  const playAt = (next: Pace) => {
    withPace(next);
    // CRPLAY, Repeat: the last step a pace started is the step Repeat plays again, at that pace.
    setTakenStep({ kind: 'pace', from: 0, to: 0, combatKey: props.combatKey, pace: next });
    if (ended) {
      jumpTo(playback, replay, 0);
    }
    playTo(playback, replay, total, false);
    refresh();
  };
  /** CRPLAY, Transport buttons: a pace button pressed with Ctrl held only sets the Options to the values of its pace. */
  const setOptionsTo = (next: Pace) => {
    setSpeedMs(next.speedMs);
    if (next.delayMs !== null) {
      setDelayMs(next.delayMs);
    }
    setOverlap(next.overlap);
    setInstant(next.instant);
    setAimLines(next.aimLines);
  };
  /** CRPLAY, Slider and Combat log, and Back one: plays one picked attack with the Options. */
  const pick = (attack: number) => {
    withOptions();
    // CRPLAY, Repeat: a picked attack is a step Repeat plays again; Combat start is none.
    const picked = Math.min(total, attack);
    if (picked > 0) {
      setTakenStep({ kind: 'pick', from: picked - 1, to: picked, combatKey: props.combatKey });
    }
    playAttack(playback, replay, attack);
    refresh();
  };
  // CRPLAY, Slider and Combat log: the attack picked, also in the moment before its step starts, so that the slider
  // does not jump back while it is dragged.
  const sliderAt = playback.picked ? playback.target : playback.index;

  const shownAttack = to > from ? combat.log[to - 1] : undefined;
  const shownSide = shownAttack === undefined ? null : sideOf(shownAttack.attacker);
  const several = combat.log.slice(from, to);
  const ratings = ratingsAt(combat, replay, settled);
  const share =
    ratings.agents + ratings.enemies === 0 ? 0.5 : ratings.agents / (ratings.agents + ratings.enemies);
  const cell = size / BATTLEFIELD_COLUMNS;
  const height = cell * BATTLEFIELD_ROWS;
  const hoveredFigure = hovered === null ? undefined : replay.figures[hovered.index];
  const hoveredValues = hovered === null ? undefined : replay.frames[settled]?.[hovered.index];
  const shownRow = shownAttack === undefined ? null : combatLogRow(shownAttack, sideOf);

  const select = (
    id: string,
    label: string,
    value: number,
    values: readonly number[],
    onPick: (ms: number) => void,
    disabled = false,
  ) => (
    <label className="replay-option">
      <span className="label">{label}</span>
      <select
        id={id}
        data-testid={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          playSound(SOUND.select);
          onPick(Number(event.currentTarget.value));
        }}
      >
        {values.map((ms) => (
          <option key={ms} value={ms}>
            {seconds(ms)}
          </option>
        ))}
      </select>
    </label>
  );
  const check = (testId: string, label: string, on: boolean, onToggle: () => void) => (
    <label className="check-label">
      <input
        type="checkbox"
        data-testid={testId}
        checked={on}
        onChange={() => {
          playSound(SOUND.select);
          onToggle();
        }}
      />
      {label}
    </label>
  );

  return (
    <div className="replay" data-testid="combat-replay">
      <section className="pane replay-field">
        <div className="replay-canvas" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            data-testid="replay-battlefield"
            aria-label="Battlefield: the Agents on the left and the Enemies on the right"
            style={{ width: size, height }}
            onMouseMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - box.left;
              const y = event.clientY - box.top;
              const index = figureAt(replay, size, x, y);
              setHovered(index === null ? null : { index, x, y });
            }}
            onMouseLeave={() => {
              setHovered(null);
            }}
          />
          {hovered === null || hoveredFigure === undefined || hoveredValues === undefined ? null : (
            <div
              className="replay-tip small"
              style={
                hovered.x > size / 2
                  ? { right: size - hovered.x + 14, top: hovered.y + 14 }
                  : { left: hovered.x + 14, top: hovered.y + 14 }
              }
            >
              {/* CRPLAY, Figures, Name: the full Enemy label, health and armor as left of what it started with, and
                  effective skill out of base skill. */}
              <div>{hoveredFigure.fullName}</div>
              <div className="figure secondary">
                health {wholeText(hoveredValues.healthHundredths)}/{groupDigits(hoveredFigure.maxHealth)} ·
                armor {groupDigits(hoveredValues.armor)}/{groupDigits(hoveredFigure.startArmor)}
              </div>
              <div className="figure secondary">
                skill {skillShareText(hoveredValues.effectiveSkill, hoveredFigure.baseSkillHundredths)} ·
                exhaustion {groupDigits(hoveredValues.exhaustion)}
              </div>
              {/* CRPLAY, Figures, Name: the Combat rating at this moment out of the one at Combat start, left out for a
                  Combat report that does not hold them. */}
              {hoveredValues.combatRating === null || hoveredFigure.startCombatRating === null ? null : (
                <div className="figure secondary" data-testid="replay-tip-rating">
                  CR {ratingShareText(hoveredValues.combatRating, hoveredFigure.startCombatRating)}
                </div>
              )}
              <div className="figure secondary">
                weapon damage {groupDigits(hoveredFigure.weaponDamage)}
                {hoveredValues.condition === 'dead'
                  ? ' · dead'
                  : hoveredValues.condition === 'incapacitated'
                    ? ' · Incapacitated'
                    : ''}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="pane replay-side">
        <div className="replay-head">
          {/* CRPLAY, Attack being played: the Combat ratings of the two sides as of the last Combat round completed, as a
            pie chart with their values and ratio under it, before the attack being played. */}
          <div className="replay-ratings" data-testid="replay-ratings">
            <RatingsPie share={share} />
            <div className="figure">
              <span className="tone-good">{groupDigits(ratings.agents)}</span> :{' '}
              <span className="tone-bad">{groupDigits(ratings.enemies)}</span>
            </div>
            <div className="figure">{ratingsRatioText(ratings)}</div>
          </div>
          {/* CRPLAY, Attack being played: the attack being played, and at the end the Combat outcome. */}
          <div className="replay-readout" data-testid="replay-readout">
            <span className="label">
              {ended ? (
                <>
                  Combat outcome:{' '}
                  <span className={combat.outcome === 'Won' ? 'tone-good' : 'tone-bad'}>
                    {combat.outcome}
                  </span>{' '}
                  after {groupDigits(combat.rounds)} {combat.rounds === 1 ? 'Combat round' : 'Combat rounds'}
                </>
              ) : shownAttack === undefined ? (
                'Combat start'
              ) : (
                `Combat round ${groupDigits(shownAttack.round)} · ${shownSide === 'agent' ? "Agents' phase" : "Enemies' phase"}`
              )}
            </span>
            {shownAttack === undefined || shownRow === null ? (
              <span className="muted">No attack yet</span>
            ) : several.length > 1 ? (
              <>
                <span>
                  <span className={shownSide === 'agent' ? 'tone-good' : 'tone-bad'}>
                    {shownSide === 'agent' ? 'Agents' : 'Enemies'}
                  </span>{' '}
                  attack together
                </span>
                <span className="figure secondary">
                  {groupDigits(several.length)} attacks:{' '}
                  {groupDigits(several.filter((attack) => attack.hit).length)} hits,{' '}
                  {groupDigits(several.filter((attack) => !attack.hit).length)} misses
                </span>
                <span className={`figure ${shownSide === 'agent' ? 'tone-good' : 'tone-bad'}`}>
                  {groupDigits(several.reduce((sum, attack) => sum + (attack.damage ?? 0), 0))} damage
                  {several.some((attack) => attack.defenderDead)
                    ? ` · ${groupDigits(several.filter((attack) => attack.defenderDead).length)} dead`
                    : ''}
                </span>
              </>
            ) : (
              <>
                <span>
                  <span className={shownSide === 'agent' ? 'tone-good' : 'tone-bad'}>
                    {nameOf(shownAttack.attacker)}
                  </span>{' '}
                  →{' '}
                  <span className={shownSide === 'agent' ? 'tone-bad' : 'tone-good'}>
                    {nameOf(shownAttack.defender)}
                  </span>
                </span>
                <span className="figure secondary">
                  Hit chance {hitChanceText(shownAttack.hitChance)} ({groupDigits(shownAttack.a)} vs{' '}
                  {groupDigits(shownAttack.d)})
                </span>
                <span
                  className={`figure ${shownRow.tone === 'muted' ? 'muted' : `tone-${shownRow.tone}`}`}
                  data-testid="replay-result"
                >
                  {attackResultText(shownAttack)}
                  {shownRow.decisive === null ? null : (
                    <>
                      , <strong>{shownRow.decisive}</strong>
                    </>
                  )}
                </span>
              </>
            )}
          </div>
        </div>

        {/* CRPLAY, Transport buttons: symbols like the keys of a tape player, in one row. */}
        <div className="replay-transport">
          <SymbolButton
            name="Pause"
            testId="replay-pause"
            disabledReason={playback.playing ? null : 'Nothing is playing.'}
            onClick={() => {
              playback.playing = false;
              refresh();
            }}
          >
            <PauseSymbol />
          </SymbolButton>
          <SymbolButton
            name="Combat turn: play the next attack"
            testId="replay-turn"
            disabledReason={playback.index >= total ? finished : null}
            onClick={() => {
              step('turn');
            }}
          >
            <span className="replay-digit">1</span>
          </SymbolButton>
          {PACES.map((pace) => (
            <SymbolButton
              key={pace.id}
              name={pace.name}
              testId={`replay-${pace.id}`}
              pressed={playback.playing && !playback.picked && activePace?.id === pace.id}
              disabledReason={total === 0 ? 'This Combat had no attack.' : null}
              hint="Ctrl+click sets the Options to this pace without playing"
              onClick={(event) => {
                // GUI, Glossary, Ctrl: on a Mac the Command key works in its place. With it held, a pace button only
                // sets the Options and leaves the playing as it is.
                if (event.ctrlKey || event.metaKey) {
                  setOptionsTo(pace);
                } else {
                  playAt(pace);
                }
              }}
            >
              <Arrows count={pace.arrows} />
            </SymbolButton>
          ))}
        </div>

        {/* CRPLAY, Rewind, Repeat, and Options buttons. */}
        <div className="replay-transport">
          <SymbolButton
            name="Rewind to Combat start"
            testId="replay-rewind"
            disabledReason={atStart ? 'This is Combat start.' : null}
            onClick={() => {
              withOptions();
              jumpTo(playback, replay, 0);
              refresh();
            }}
          >
            <RewindSymbol />
          </SymbolButton>
          <SymbolButton
            name="Back one attack"
            testId="replay-back-one"
            disabledReason={sliderAt === 0 ? 'This is Combat start.' : null}
            onClick={() => {
              // CRPLAY, Back one: as the slider does, it plays the previous attack again from right before it.
              pick(sliderAt - 1);
            }}
          >
            <BackOneSymbol />
          </SymbolButton>
          <SymbolButton
            name={
              lastStep === null
                ? 'Repeat'
                : `Repeat: ${stepName(lastStep)}, attacks ${groupDigits(lastStep.from + 1)} to ${groupDigits(lastStep.to)}`
            }
            testId="replay-repeat"
            shortcut="R"
            disabledReason={lastStep === null ? 'No step has been taken yet.' : null}
            onClick={repeat}
          >
            <span className="replay-repeat-symbol">↻</span>
          </SymbolButton>
          <button
            type="button"
            className="btn btn-plain replay-options-toggle"
            aria-expanded={optionsShown}
            data-testid="replay-options"
            data-sound="select"
            onClick={() => {
              replayOptionsShown.set(!optionsShown);
            }}
          >
            Options {optionsShown ? '▾' : '▸'}
          </button>
        </div>

        {/* CRPLAY, Options: named by one or two words each, in few rows. */}
        <div className="replay-settings" hidden={!optionsShown}>
          <div className="replay-settings-row">
            {select('replay-speed', 'Speed', speedMs, SPEEDS_MS, setSpeedMs)}
            {select('replay-delay', 'Delay', delayMs, DELAYS_MS, setDelayMs, !overlap)}
          </div>
          <div className="replay-settings-row">
            {check('replay-aim-lines', 'Aim lines', aimLines, () => {
              setAimLines(!aimLines);
            })}
            {check('replay-instant', 'Instant', instant, () => {
              setInstant(!instant);
            })}
            {check('replay-overlap', 'Overlap', overlap, () => {
              setOverlap(!overlap);
            })}
          </div>
          <div className="replay-settings-row">
            <Button
              testId="replay-options-turn"
              sound="select"
              disabledReason={playback.index >= total ? finished : null}
              onClick={() => {
                step('turn');
              }}
            >
              Turn <Arrows count={1} />
            </Button>
            <Button
              testId="replay-phase"
              sound="select"
              disabledReason={playback.index >= total ? finished : null}
              onClick={() => {
                step('phase');
              }}
            >
              Phase <Arrows count={1} />
            </Button>
            <Button
              testId="replay-round"
              sound="select"
              disabledReason={playback.index >= total ? finished : null}
              onClick={() => {
                step('round');
              }}
            >
              Round <Arrows count={1} />
            </Button>
            <Button
              testId="replay-combat"
              sound="select"
              disabledReason={total === 0 ? 'This Combat had no attack.' : null}
              onClick={() => {
                step('combat');
              }}
            >
              Combat <Arrows count={1} />
            </Button>
          </div>
        </div>

        {/* CRPLAY, Slider and Combat log. */}
        <div className="replay-slider">
          <label className="label" htmlFor="replay-slider">
            Attack{' '}
            <span className="figure">
              {groupDigits(sliderAt)} / {groupDigits(total)}
            </span>
          </label>
          <span className="slider" style={{ '--fill': sliderFill(sliderAt, 0, total) } as CSSProperties}>
            <input
              id="replay-slider"
              data-testid="replay-slider"
              type="range"
              min={0}
              max={total}
              step={1}
              value={sliderAt}
              onChange={(event) => {
                pick(Number(event.currentTarget.value));
              }}
            />
          </span>
        </div>

        <div className="replay-log" ref={logRef} data-testid="replay-log">
          {combat.log.map((attack, index) => {
            const row = combatLogRow(attack, sideOf);
            return (
              <button
                key={index}
                type="button"
                data-sound="select"
                className={`replay-log-row log-${row.tint}${index >= from && index < to ? ' current' : ''}${index >= to ? ' ahead' : ''}`}
                onClick={() => {
                  pick(index + 1);
                }}
              >
                <span className="figure muted">{groupDigits(attack.round)}</span>
                <span className="figure">
                  {nameOf(attack.attacker)} → {nameOf(attack.defender)}
                </span>
                <span className={`figure ${row.tone === 'muted' ? 'muted' : `tone-${row.tone}`}`}>
                  {attack.hit ? `−${groupDigits(attack.damage ?? 0)}` : 'miss'}
                  {row.decisive === null ? '' : ` ${row.decisive === 'dead' ? 'dead' : 'out'}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
