/**
 * MUSIC, Music control: the Music toggle, the Skip button, the Volume slider with its value, and the Track title of the Current Track.
 * It is shown in the Settings panel of the Main menu and in the footer of the Side panel of the Campaign screen.
 */
import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import { music } from '../music-player.ts';
import { sliderFill } from '../slider.ts';
import { act, theEngine, type Snapshot } from '../store.ts';

/** The effective Music on and Music volume of the Global configuration in `snapshot`. */
export function musicSettings(snapshot: Snapshot): { on: boolean; volume: number } {
  const find = (setting: string) =>
    snapshot.configuration.settings.find((item) => item.setting === setting)?.effectiveValue;
  const on = find('musicOn');
  const volume = find('musicVolume');
  return { on: on !== false, volume: typeof volume === 'number' ? volume : 50 };
}

function Speaker({ off }: { off: boolean }) {
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
  const { on, volume } = musicSettings(snapshot);
  const status = useSyncExternalStore(music.subscribe, music.getStatus);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? volume;

  const commit = () => {
    if (dragging === null) {
      return;
    }
    const value = dragging;
    setDragging(null);
    music.preview(null);
    if (value !== volume) {
      // A rejected value leaves the control showing the previous one, which the snapshot still holds.
      act(() => session.globalConfiguration.set('musicVolume', value));
    }
  };

  const title = on ? (status.title === null ? '' : `♪ ${status.title}`) : 'Music off';

  return (
    <div className="music-control" data-testid="music-control">
      <button
        type="button"
        className="btn btn-plain music-toggle"
        aria-label={on ? 'Music on' : 'Music off'}
        aria-pressed={on}
        title={on ? 'Turn music off' : 'Turn music on'}
        data-testid="music-toggle"
        data-sound="none"
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
      <span className="slider music-volume" style={{ '--fill': sliderFill(shown, 0, 100) } as CSSProperties}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={shown}
          aria-label="Music volume"
          data-testid="music-volume"
          onChange={(event) => {
            const value = Number(event.target.value);
            setDragging(value);
            music.preview(value);
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </span>
      <span className="figure music-volume-value">{shown}</span>
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
