/**
 * MUSIC, Music control: the Music toggle, the Skip button, and the Track title of the Current Track. It is shown above
 * the Settings panel of the Main menu and on the Globe stage of the Campaign screen. MUSIC, Music volume
 * slider: the row of the Settings panel that sets the Music volume.
 */
import { useState, useSyncExternalStore } from 'react';
import { music } from '../music-player.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { VolumeSlider } from '../ui.tsx';

/** The effective Music on and Music volume of the Global configuration in `snapshot`. */
export function musicSettings(snapshot: Snapshot): { on: boolean; volume: number } {
  const find = (setting: string) =>
    snapshot.configuration.settings.find((item) => item.setting === setting)?.effectiveValue;
  const on = find('musicOn');
  const volume = find('musicVolume');
  return { on: on !== false, volume: typeof volume === 'number' ? volume : 50 };
}

/** A speaker, struck through while `off`; the Music toggle and the Sounds toggle both show it. */
export function Speaker({ off }: { off: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none" />
      {off ? (
        <path d="M16 8l6 8M22 8l-6 8" strokeLinecap="round" />
      ) : (
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * MUSIC, Music control: the Music toggle, which sets Music on to the opposite value. MUSIC, Music volume slider: the
 * Music row of the Settings panel holds one too, showing the same Music on.
 */
export function MusicToggle(props: { snapshot: Snapshot; buttonClass: string; testId: string }) {
  const { session } = theEngine();
  const { on } = musicSettings(props.snapshot);
  return (
    // SOUNDS, Main click: the Music toggle changes a setting of Global configuration, whichever way it turns.
    <button
      type="button"
      className={`${props.buttonClass} speaker-toggle`}
      aria-label={on ? 'Music on' : 'Music off'}
      aria-pressed={on}
      title={on ? 'Turn music off' : 'Turn music on'}
      data-testid={props.testId}
      onClick={() => {
        act(() => session.globalConfiguration.set('musicOn', !on));
      }}
    >
      <Speaker off={!on} />
    </button>
  );
}

/**
 * `onGlobeStage`: MUSIC, Music control on the Globe stage: one row with the Track title first, at the bottom right
 * corner of the Globe stage, its buttons drawn as the globe's own controls are.
 */
export function MusicControl({ snapshot, onGlobeStage }: { snapshot: Snapshot; onGlobeStage?: boolean }) {
  const { on } = musicSettings(snapshot);
  const status = useSyncExternalStore(music.subscribe, music.getStatus);
  const buttonClass = onGlobeStage === true ? 'globe-stage-button' : 'btn btn-plain';

  const title = on ? (status.title === null ? '' : `♪ ${status.title}`) : 'Music off';
  const titleLine = (
    <span
      className={`music-title${on ? '' : ' muted'}`}
      title={on && status.title !== null ? status.title : undefined}
      data-testid="music-title"
    >
      {title}
    </span>
  );
  const buttons = (
    <>
      <MusicToggle snapshot={snapshot} buttonClass={buttonClass} testId="music-toggle" />
      <button
        type="button"
        className={`${buttonClass} music-skip`}
        aria-label="Next Track"
        title="Next Track"
        data-testid="music-skip"
        disabled={!on || status.title === null}
        onClick={() => {
          music.skip();
        }}
      >
        ⏭
      </button>
    </>
  );

  if (onGlobeStage === true) {
    return (
      <div className="music-control music-control-globe" data-testid="music-control">
        {titleLine}
        {buttons}
      </div>
    );
  }

  return (
    <div className="music-control" data-testid="music-control">
      {buttons}
      {titleLine}
    </div>
  );
}

/**
 * MUSIC, Music volume slider: while the Player drags it the gain follows at once; the Music volume is stored when the
 * Player releases it, and the slider stays enabled while Music on is false.
 */
export function MusicVolumeSlider({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  const { volume } = musicSettings(snapshot);
  const [dragging, setDragging] = useState<number | null>(null);
  return (
    <VolumeSlider
      label="Music volume"
      testId="music-volume"
      value={dragging ?? volume}
      onDrag={(value) => {
        setDragging(value);
        music.preview(value);
      }}
      onRelease={() => {
        if (dragging === null) {
          return;
        }
        const value = dragging;
        setDragging(null);
        music.preview(null);
        if (value !== volume) {
          // A rejected value leaves the slider showing the previous one, which the snapshot still holds.
          act(() => session.globalConfiguration.set('musicVolume', value));
        }
      }}
    />
  );
}
