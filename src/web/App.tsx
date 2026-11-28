import { useEffect, useLayoutEffect, useState } from 'react';
import { Campaign } from './screens/Campaign.tsx';
import { CombatSimulator } from './screens/CombatSimulator.tsx';
import { MainMenu } from './screens/MainMenu.tsx';
import { musicSettings } from './screens/MusicControl.tsx';
import { useBlockedKeys, useWindowCheck, WindowCheckDialog } from './screens/WindowCheck.tsx';
import { music } from './music-player.ts';
import { applyScreenLimit, screenLimitOn } from './screen-limit.ts';
import { configureSounds, installButtonSounds } from './sound-player.ts';
import { soundSettings } from './sounds.ts';
import { dismissNotice, type Notice, useSnapshot } from './store.ts';

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
  // MUSIC, Playback, Start: the music begins with the first Campaign created or loaded, and plays on at the Main menu.
  const campaignCurrent = snapshot.status.hasCurrentCampaign;
  useEffect(() => {
    if (campaignCurrent) {
      music.begin();
    }
  }, [campaignCurrent]);

  // SOUNDS, Sound settings and When Sounds play: one listener answers every button of every screen.
  const { on: soundsOn, volume: soundsVolume } = soundSettings(snapshot.configuration.settings);
  useEffect(() => {
    configureSounds(soundsOn, soundsVolume);
  }, [soundsOn, soundsVolume]);
  useEffect(() => installButtonSounds(document), []);

  // VIS, Screen limit: one area for every screen, set before the screen is painted.
  const limited = screenLimitOn(snapshot.configuration.settings);
  useLayoutEffect(() => {
    applyScreenLimit(limited);
  }, [limited]);

  // VIS, Window check: while its dialog stands, every button, input, and keyboard shortcut beneath it is disabled.
  const windowCheck = useWindowCheck();
  const blocked = windowCheck.state !== 'ok';
  useBlockedKeys(blocked);

  return (
    <>
      <fieldset
        className="window-check-gate"
        disabled={blocked}
        inert={blocked}
        data-testid="window-check-gate"
      >
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
      </fieldset>
      <div className="notices" aria-live="polite">
        {snapshot.notices.map((notice) => (
          <NoticeToast key={notice.id} notice={notice} />
        ))}
      </div>
      {windowCheck.state === 'ok' ? null : (
        <WindowCheckDialog
          state={windowCheck.state}
          measure={windowCheck.measure}
          onContinue={windowCheck.dismiss}
        />
      )}
    </>
  );
}

/** How long a notice stays; its fade-out in `.notice` of styles.css takes the last 300 ms of it. */
const NOTICE_MS = 3000;

/**
 * One notice, of any kind: it fades out and is dismissed NOTICE_MS after it appears, each on its own timer, so a
 * newer notice never keeps an older one on the screen. Its close control dismisses it at once.
 */
function NoticeToast({ notice }: { notice: Notice }) {
  useEffect(() => {
    if (notice.dismissed) {
      return undefined;
    }
    const timer = setTimeout(() => {
      dismissNotice(notice.id);
    }, NOTICE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice.id, notice.dismissed]);

  // A dismissed notice keeps its place and its height, unseen, so that the notices below it stay where they are.
  return notice.dismissed ? (
    <div className={`notice notice-${notice.kind} notice-gone`} aria-hidden="true">
      <span>{notice.text}</span>
      <span className="notice-close">×</span>
    </div>
  ) : (
    <div className={`notice notice-${notice.kind}`} data-testid={`notice-${notice.kind}`}>
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
  );
}
