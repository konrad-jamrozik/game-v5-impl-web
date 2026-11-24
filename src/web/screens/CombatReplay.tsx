/**
 * CRPLAY: the Combat replay. It plays one Combat back from its Combat report on the Battlefield, a canvas drawn with
 * the Canvas 2D API, with the playback controls and the Combat log beside it.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CombatReport } from '../../engine/index.ts';
import { combatLogRow } from '../combat-log.ts';
import {
  DELAYS_MS,
  SPEEDS_MS,
  advance,
  jumpTo,
  newPlayback,
  phaseEnd,
  playTo,
  ratingsAt,
  roundEnd,
  settledIndex,
  shownRange,
  stepBack,
  type Playback,
  type PlaybackSettings,
  type Replay,
} from '../combat-replay.ts';
import { drawReplay, figureAt, readPalette, type ReplayPalette } from '../combat-replay-draw.ts';
import { hitChanceText, wholeText } from '../format.ts';
import { sliderFill } from '../slider.ts';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { Button, typingIn } from '../ui.tsx';

/** CRPLAY, Playback, Steps: the three steps, which Repeat does again. */
type StepKind = 'turn' | 'phase' | 'round';

/** CRPLAY, Playback: a Speed or a Delay as the Player reads it, e.g. "1.5 s". */
const seconds = (ms: number) => `${ms / 1000} s`;

/** The longest one drawing step may take, so that a tab that slept does not skip a whole Combat. */
const MAX_STEP_MS = 100;

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
  const [speedMs, setSpeedMs] = useState<number>(1000);
  const [delayMs, setDelayMs] = useState<number>(250);
  const [overlap, setOverlap] = useState(false);
  const [instant, setInstant] = useState(false);
  const [aimLines, setAimLines] = useState(true);
  const [lastStep, setLastStep] = useState<StepKind | null>(null);
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
  const settings: PlaybackSettings = { speedMs, delayMs, overlap, instant };
  // What the drawing loop reads: it outlives the render that started it, so it reads the newest values from here.
  const live = useRef({ replay, settings, size, aimLines, armorScale: props.armorScale });
  live.current = { replay, settings, size, aimLines, armorScale: props.armorScale };

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
        canvas.height = pixels;
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
    const key = `${from}|${to}|${playback.index}|${playback.playing}|${settledIndex(playback)}|${playback.active.length > 0}`;
    if (key !== shownKey.current) {
      shownKey.current = key;
      setVersion((version) => version + 1);
    }
  };

  const loop = (time: number) => {
    advance(
      playback,
      live.current.replay,
      Math.min(MAX_STEP_MS, time - lastTime.current),
      live.current.settings,
    );
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

  const [from, to] = shownRange(playback, replay, instant);
  const settled = settledIndex(playback);
  const resting = playback.active.length === 0;
  const ended = playback.index >= total && resting;
  const atStart = playback.index === 0 && resting;
  const sideOf = (id: string) => combat.participants.find((who) => who.id === id)?.side ?? 'enemy';
  const nameOf = (id: string) => replay.figures.find((figure) => figure.id === id)?.name ?? id;

  // CRPLAY, Playback: the Combat log follows the attack being played.
  useEffect(() => {
    const log = logRef.current;
    const row = log?.children[to - 1];
    if (log === null || log === undefined) {
      return;
    }
    log.scrollTop = row instanceof HTMLElement ? row.offsetTop - log.clientHeight / 2 + 12 : 0;
  }, [to]);

  /** CRPLAY, Playback, Steps: why a step cannot be taken now, or null. */
  const stepOff = (kind: StepKind): string | null =>
    playback.index >= total
      ? 'Every attack has been played.'
      : kind === 'turn' && instant
        ? 'With Instant on, a step is a phase.'
        : null;
  const step = (kind: StepKind) => {
    const target =
      kind === 'turn'
        ? playback.index + 1
        : kind === 'phase'
          ? phaseEnd(replay, playback.index)
          : roundEnd(replay, playback.index);
    playTo(playback, replay, target, true);
    setLastStep(kind);
    refresh();
  };
  const repeatOff = lastStep === null ? 'No step has been taken yet.' : stepOff(lastStep);
  // CRPLAY, Playback, Repeat: the R key presses it, and while the Combat replay is shown no other listener hears the
  // key, e.g. not the Redo button of the Campaign screen.
  const onRepeatKey = useRef<() => void>(() => undefined);
  onRepeatKey.current = () => {
    if (lastStep !== null && repeatOff === null) {
      playSound(SOUND.select);
      step(lastStep);
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

  const shownAttack = to > from ? combat.log[to - 1] : undefined;
  const shownSide = shownAttack === undefined ? null : sideOf(shownAttack.attacker);
  const several = combat.log.slice(from, to);
  const ratings = ratingsAt(combat, replay, settled);
  const share =
    ratings.agents + ratings.enemies === 0 ? 50 : (100 * ratings.agents) / (ratings.agents + ratings.enemies);
  const hoveredFigure = hovered === null ? undefined : replay.figures[hovered.index];
  const hoveredValues = hovered === null ? undefined : replay.frames[settled]?.[hovered.index];
  const shownRow = shownAttack === undefined ? null : combatLogRow(shownAttack, sideOf);

  const select = (
    id: string,
    value: number,
    values: readonly number[],
    onPick: (ms: number) => void,
    disabled = false,
  ) => (
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
  );

  return (
    <div className="replay" data-testid="combat-replay">
      <section className="pane replay-field">
        {/* CRPLAY, Playback: the Combat ratings of the two sides as of the last Combat round completed. */}
        <div className="replay-balance" data-testid="replay-ratings">
          <span className="figure tone-good">{ratings.agents}</span>
          <div className="replay-bar" role="img" aria-label="Combat rating of the Agents against the Enemies">
            <i style={{ width: `${share}%` }} />
          </div>
          <span className="figure tone-bad">{ratings.enemies}</span>
        </div>
        <div className="replay-canvas" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            data-testid="replay-battlefield"
            aria-label="Battlefield: the Agents on the left and the Enemies on the right"
            style={{ width: size, height: size }}
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
              <div>{hoveredFigure.name}</div>
              <div className="figure secondary">
                health {wholeText(hoveredValues.healthHundredths)}/{hoveredFigure.maxHealth} · armor{' '}
                {hoveredValues.armor}
              </div>
              <div className="figure secondary">
                base skill {wholeText(hoveredFigure.baseSkillHundredths)} · exhaustion{' '}
                {hoveredValues.exhaustion}
              </div>
              <div className="figure secondary">
                weapon damage {hoveredFigure.weaponDamage}
                {hoveredValues.condition === 'dead'
                  ? ' · dead'
                  : hoveredValues.condition === 'incapacitated'
                    ? ' · Incapacitated'
                    : ''}
              </div>
            </div>
          )}
        </div>
        <div className="replay-legend small muted">
          <span>The rim is armor and the fill is health; a hit thins the rim, then empties the figure.</span>
          <span>
            Chevrons, bars, and stars rank base skill. A dashed outline is Incapacitated; a cross is dead.
          </span>
        </div>
      </section>

      <section className="pane replay-side">
        {/* CRPLAY, Playback: the attack being played, and at the end the Combat outcome. */}
        <div className="replay-readout" data-testid="replay-readout">
          <span className="label">
            {ended ? (
              <>
                Combat outcome:{' '}
                <span className={combat.outcome === 'Won' ? 'tone-good' : 'tone-bad'}>{combat.outcome}</span>{' '}
                after {combat.rounds} {combat.rounds === 1 ? 'Combat round' : 'Combat rounds'}
              </>
            ) : shownAttack === undefined ? (
              'Combat start'
            ) : (
              `Combat round ${shownAttack.round} · ${shownSide === 'agent' ? "Agents' phase" : "Enemies' phase"}`
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
                {several.length} attacks: {several.filter((attack) => attack.hit).length} hits,{' '}
                {several.filter((attack) => !attack.hit).length} misses
              </span>
              <span className={`figure ${shownSide === 'agent' ? 'tone-good' : 'tone-bad'}`}>
                {several.reduce((sum, attack) => sum + (attack.damage ?? 0), 0)} damage
                {several.some((attack) => attack.defenderDead)
                  ? ` · ${several.filter((attack) => attack.defenderDead).length} dead`
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
                Hit chance {hitChanceText(shownAttack.hitChance)} ({shownAttack.a} vs {shownAttack.d})
              </span>
              <span className={`figure ${shownRow.tone === 'muted' ? 'muted' : `tone-${shownRow.tone}`}`}>
                {shownRow.outcome}
                {shownRow.decisive === null ? null : (
                  <>
                    , <strong>{shownRow.decisive}</strong>
                  </>
                )}
              </span>
            </>
          )}
        </div>

        <div className="replay-buttons">
          <Button
            testId="replay-turn"
            sound="select"
            disabledReason={stepOff('turn')}
            onClick={() => {
              step('turn');
            }}
          >
            Combat turn ▸
          </Button>
          <Button
            testId="replay-phase"
            sound="select"
            disabledReason={stepOff('phase')}
            onClick={() => {
              step('phase');
            }}
          >
            Phase ▸▸
          </Button>
          <Button
            testId="replay-round"
            sound="select"
            disabledReason={stepOff('round')}
            onClick={() => {
              step('round');
            }}
          >
            Combat round ▸▸▸
          </Button>
          <Button
            testId="replay-repeat"
            sound="select"
            shortcut="R"
            tooltip={
              lastStep === null
                ? undefined
                : `Again: ${lastStep === 'turn' ? 'Combat turn' : lastStep === 'phase' ? 'Phase' : 'Combat round'}`
            }
            disabledReason={repeatOff}
            onClick={() => {
              if (lastStep !== null) {
                step(lastStep);
              }
            }}
          >
            ↻ Repeat
          </Button>
        </div>
        <div className="replay-buttons">
          <Button
            testId="replay-play"
            kind="primary"
            sound="select"
            disabledReason={total === 0 ? 'This Combat had no attack.' : null}
            onClick={() => {
              if (playback.playing) {
                playback.playing = false;
              } else {
                if (ended) {
                  jumpTo(playback, replay, 0);
                }
                playTo(playback, replay, total, false);
              }
              refresh();
            }}
          >
            {playback.playing ? '❚❚ Pause' : ended ? '↻ Replay' : '▶ Play'}
          </Button>
          <Button
            testId="replay-back"
            sound="select"
            disabledReason={atStart ? 'This is Combat start.' : null}
            onClick={() => {
              stepBack(playback, replay, instant);
              refresh();
            }}
          >
            ◂ Back
          </Button>
          <Button
            testId="replay-start"
            sound="select"
            disabledReason={atStart ? 'This is Combat start.' : null}
            onClick={() => {
              jumpTo(playback, replay, 0);
              refresh();
            }}
          >
            ⏮ Start
          </Button>
        </div>

        <div className="replay-settings">
          <label className="label" htmlFor="replay-speed">
            Speed: one attack takes
          </label>
          {select('replay-speed', speedMs, SPEEDS_MS, setSpeedMs)}
          <label className="check-label">
            <input
              type="checkbox"
              data-testid="replay-overlap"
              checked={overlap}
              onChange={() => {
                playSound(SOUND.select);
                setOverlap(!overlap);
              }}
            />
            Overlap: the next attack starts without waiting
          </label>
          <label className="label" htmlFor="replay-delay">
            Delay: the next attack starts after
          </label>
          {select('replay-delay', delayMs, DELAYS_MS, setDelayMs, !overlap)}
          <label className="check-label">
            <input
              type="checkbox"
              data-testid="replay-instant"
              checked={instant}
              onChange={() => {
                playSound(SOUND.select);
                setInstant(!instant);
              }}
            />
            Instant: a whole phase attacks at once
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              data-testid="replay-aim-lines"
              checked={aimLines}
              onChange={() => {
                playSound(SOUND.select);
                setAimLines(!aimLines);
              }}
            />
            Aim lines from attacker to defender
          </label>
        </div>

        <div className="replay-slider">
          <label className="label" htmlFor="replay-slider">
            Attack{' '}
            <span className="figure">
              {playback.index} / {total}
            </span>
          </label>
          <span
            className="slider"
            style={{ '--fill': sliderFill(playback.index, 0, total) } as CSSProperties}
          >
            <input
              id="replay-slider"
              data-testid="replay-slider"
              type="range"
              min={0}
              max={total}
              step={1}
              value={playback.index}
              onChange={(event) => {
                jumpTo(playback, replay, Number(event.currentTarget.value));
                refresh();
              }}
            />
          </span>
        </div>

        {/* CRPLAY, Playback, Going back: selecting a row shows the Combat right after that attack. */}
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
                  jumpTo(playback, replay, index + 1);
                  refresh();
                }}
              >
                <span className="figure muted">{attack.round}</span>
                <span className="figure">
                  {nameOf(attack.attacker)} → {nameOf(attack.defender)}
                </span>
                <span className={`figure ${row.tone === 'muted' ? 'muted' : `tone-${row.tone}`}`}>
                  {attack.hit ? `−${attack.damage ?? 0}` : 'miss'}
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
