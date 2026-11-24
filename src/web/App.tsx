import { useEffect, useState } from 'react';
import { Campaign } from './screens/Campaign.tsx';
import { CombatSimulator } from './screens/CombatSimulator.tsx';
import { MainMenu } from './screens/MainMenu.tsx';
import { musicSettings } from './screens/MusicControl.tsx';
import { music } from './music-player.ts';
import { configureSounds, installButtonSounds } from './sound-player.ts';
import { soundSettings } from './sounds.ts';
import { dismissNotice, useSnapshot } from './store.ts';

export function App() {
  const snapshot = useSnapshot();
  // CSIM, Opening the Combat simulator: an address whose query holds `combat-simulator` shows it at once, whatever
  // the Combat simulator shown setting is, so that a test reaches it without setting anything first.
  const [simulator, setSimulator] = useState(() =>
    new URLSearchParams(window.location.search).has('combat-simulator'),
  );

  // MUSIC, Playback: one player for the whole page, so changing screen never restarts the Current Track.
  const { on: musicOn, volume: musicVolume } = musicSettings(snapshot);
  useEffect(() => {
    music.configure(musicOn, musicVolume);
  }, [musicOn, musicVolume]);

  // SOUNDS, Sound settings and When Sounds play: one listener answers every button of every screen.
  const { on: soundsOn, volume: soundsVolume } = soundSettings(snapshot.configuration.settings);
  useEffect(() => {
    configureSounds(soundsOn, soundsVolume);
  }, [soundsOn, soundsVolume]);
  useEffect(() => installButtonSounds(document), []);

  useEffect(() => {
    const newest = snapshot.notices.at(-1);
    if (newest === undefined || newest.kind === 'error') {
      return undefined;
    }
    const timer = setTimeout(() => {
      dismissNotice(newest.id);
    }, 4000);
    return () => {
      clearTimeout(timer);
    };
  }, [snapshot.notices]);

  return (
    <>
      {snapshot.status.hasCurrentCampaign && snapshot.state !== null ? (
        <Campaign snapshot={snapshot} state={snapshot.state} />
      ) : simulator ? (
        <CombatSimulator
          onClose={() => {
            setSimulator(false);
          }}
        />
      ) : (
        <MainMenu
          snapshot={snapshot}
          onOpenSimulator={() => {
            setSimulator(true);
          }}
        />
      )}
      <div className="notices" aria-live="polite">
        {snapshot.notices.map((notice) => (
          <div
            key={notice.id}
            className={`notice notice-${notice.kind}`}
            data-testid={`notice-${notice.kind}`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              className="notice-close"
              aria-label="Dismiss"
              data-sound="back"
              onClick={() => {
                dismissNotice(notice.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
