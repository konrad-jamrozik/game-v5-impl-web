/**
 * MUSIC, Music control: the Music toggle, the Skip button, and the Track title of the Current Track. It is shown above
 * the Settings panel of the Main menu and in the footer of the Side panel of the Campaign screen. MUSIC, Music volume
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

export function MusicControl({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  const { on } = musicSettings(snapshot);
  const status = useSyncExternalStore(music.subscribe, music.getStatus);

  const title = on ? (status.title === null ? '' : `♪ ${status.title}`) : 'Music off';

  return (
    <div className="music-control" data-testid="music-control">
      {/* SOUNDS, Main click: the Music toggle changes a setting of Global configuration, whichever way it turns. */}
      <button
        type="button"
        className="btn btn-plain speaker-toggle"
        aria-label={on ? 'Music on' : 'Music off'}
        aria-pressed={on}
        title={on ? 'Turn music off' : 'Turn music on'}
        data-testid="music-toggle"
        onClick={() => {
          act(() => session.globalConfiguration.set('musicOn', !on));
        }}
      >
        <Speaker off={!on} />
      </button>
      <button
        type="button"
        className="btn btn-plain music-skip"
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
      <span
        className={`music-title${on ? '' : ' muted'}`}
        title={on && status.title !== null ? status.title : undefined}
        data-testid="music-title"
      >
        {title}
      </span>
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
