/**
 * GUI, Settings panel: the one place where the Player sets Global configuration, on both screens. Its rows, from top
 * to bottom, are the Music volume slider, the Sounds row, one row for each other setting except the Autopilot settings,
 * the Changed settings row, and, on the Campaign screen only, the Tools row. On the Main menu it stands in the right column with the Music control above its rows and no
 * close control; on the Campaign screen it is a dialog over a Scrim with no buttons at its bottom, closed with its
 * close control or the Escape key.
 */
import { useEffect, useRef, useState } from 'react';
import { changedSettingLine, changedSettings } from '../changed-settings.ts';
import { playSound } from '../sound-player.ts';
import { SOUND, soundSettings } from '../sounds.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Button, CloseControl, NumberField, Section, VolumeSlider } from '../ui.tsx';
import { MusicControl, MusicVolumeSlider, Speaker } from './MusicControl.tsx';

/**
 * GUI, Settings panel: Music on is set with the Music control and Sounds on with the Sounds toggle; these four
 * settings have no rows of their own beyond the Music volume and Sounds rows.
 */
const OWN_ROWS = new Set(['musicOn', 'musicVolume', 'soundsOn', 'soundsVolume']);

/** GUI, Settings panel: the Autopilot settings have no row; the Player sets them where they are used. */
const SET_ELSEWHERE = new Set(['autopilotControlsShown', 'autopilotTurns']);

/** GUI, Changed settings: one line per setting whose stored value overrides its Game build default, with Reset. */
function ChangedSettingsRow({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  const changed = changedSettings(snapshot.configuration.settings);
  return (
    <div className="settings-row settings-changed" data-testid="changed-settings">
      <div>Changed settings</div>
      {changed.length === 0 ? (
        <div className="muted">Every setting is at its default.</div>
      ) : (
        <ul className="changed-settings">
          {changed.map((setting) => (
            <li key={setting.setting} className="changed-setting">
              <span>{changedSettingLine(setting)}</span>
              <Button
                testId={`changed-reset-${setting.setting}`}
                onClick={() => {
                  act(() => session.globalConfiguration.reset(setting.setting));
                }}
              >
                Reset
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** SOUNDS, Sound settings: the Sounds toggle and the Sounds volume slider, in one row labelled Sounds. */
function SoundsRow({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  const { on, volume } = soundSettings(snapshot.configuration.settings);
  const [dragging, setDragging] = useState<number | null>(null);
  return (
    <div className="settings-row">
      <div>Sounds</div>
      <div className="settings-input">
        {/* SOUNDS, Main click: turning Sounds on plays main-click, and turning them off plays no Sound. */}
        <button
          type="button"
          className="btn btn-plain speaker-toggle"
          aria-label={on ? 'Sounds on' : 'Sounds off'}
          aria-pressed={on}
          title={on ? 'Turn Sounds off' : 'Turn Sounds on'}
          data-testid="sounds-toggle"
          data-sound="none"
          onClick={() => {
            if (!on) {
              playSound(SOUND.main, { volume });
            }
            act(() => session.globalConfiguration.set('soundsOn', !on));
          }}
        >
          <Speaker off={!on} />
        </button>
        <VolumeSlider
          label="Sounds volume"
          testId="sounds-volume"
          value={dragging ?? volume}
          onDrag={setDragging}
          onRelease={() => {
            if (dragging === null) {
              return;
            }
            const value = dragging;
            setDragging(null);
            // SOUNDS, Sound settings: on release main-click plays at the new Sounds volume, unless Sounds are off.
            if (on) {
              playSound(SOUND.main, { volume: value });
            }
            if (value !== volume) {
              // A rejected value leaves the row showing the previous one, which the snapshot still holds.
              act(() => session.globalConfiguration.set('soundsVolume', value));
            }
          }}
        />
      </div>
    </div>
  );
}

function SettingsRows(props: {
  snapshot: Snapshot;
  tools?: { readonly onShortcuts: () => void; readonly onDeveloper: () => void } | undefined;
}) {
  const { snapshot, tools } = props;
  const { session } = theEngine();
  return (
    <>
      <div className="settings-row">
        <div>Music volume</div>
        <div className="settings-input">
          <MusicVolumeSlider snapshot={snapshot} />
        </div>
      </div>
      <SoundsRow snapshot={snapshot} />
      {snapshot.configuration.settings
        .filter((setting) => !OWN_ROWS.has(setting.setting) && !SET_ELSEWHERE.has(setting.setting))
        .map((setting) => (
          <div key={setting.setting} className="settings-row">
            <div>
              {setting.name}
              <span className="hint">
                {setting.permitted} · {setting.stored ? 'your value' : 'build default'}
              </span>
            </div>
            <div className="actions">
              {setting.stored ? (
                <Button
                  onClick={() => {
                    act(() => session.globalConfiguration.reset(setting.setting));
                  }}
                >
                  Reset to {String(setting.gameBuildDefault)}
                </Button>
              ) : null}
              <NumberField
                label={setting.name}
                testId={`setting-${setting.setting}`}
                stored={String(setting.effectiveValue)}
                onCommit={(text) => {
                  act(() =>
                    text === ''
                      ? session.globalConfiguration.reset(setting.setting)
                      : session.globalConfiguration.set(setting.setting, Number(text)),
                  );
                }}
              />
            </div>
          </div>
        ))}
      <ChangedSettingsRow snapshot={snapshot} />
      {tools === undefined ? null : (
        <div className="settings-row">
          <div>Tools</div>
          <div className="actions">
            <Button testId="open-shortcuts" onClick={tools.onShortcuts}>
              Keyboard shortcuts
            </Button>
            <Button testId="open-developer" onClick={tools.onDeveloper}>
              Developer tools
            </Button>
          </div>
        </div>
      )}
      {snapshot.configuration.problems.map((problem) => (
        <p key={problem} className="warning-text">
          {problem}
        </p>
      ))}
    </>
  );
}

/** MENU, Layout: the Settings panel of the Main menu, opening with the Music control labelled Music. */
export function MenuSettingsPanel({ snapshot }: { snapshot: Snapshot }) {
  return (
    <Section title="Settings" testId="settings">
      <div className="settings-row settings-music">
        <div>Music</div>
        <MusicControl snapshot={snapshot} />
      </div>
      <SettingsRows snapshot={snapshot} />
    </Section>
  );
}

/** CSCR, Side panel: the Settings panel of the Campaign screen, a dialog opened from the Settings button. */
export function SettingsDialog(props: {
  snapshot: Snapshot;
  onClose: () => void;
  onShortcuts: () => void;
  onDeveloper: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('.close-control')?.focus();
  }, []);
  return (
    <div className="scrim">
      <div
        ref={dialog}
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings"
      >
        <header className="dialog-head">
          <h2 id="settings-title">Settings</h2>
        </header>
        <CloseControl testId="close-settings" onClose={props.onClose} />
        <div className="dialog-body settings-body">
          <SettingsRows
            snapshot={props.snapshot}
            tools={{ onShortcuts: props.onShortcuts, onDeveloper: props.onDeveloper }}
          />
        </div>
      </div>
    </div>
  );
}
