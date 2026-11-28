/**
 * GUI, Settings panel: the one place where the Player sets Global configuration, on both screens. Its rows, from top
 * to bottom, are the Music row, the Sounds row, the Tutorials row, one row for each other
 * setting except the Autopilot settings, the Changed settings row, and, on the Campaign screen only, the Tools row. On
 * the Main menu it stands in the right column with the Music control above its rows and no
 * close control; on the Campaign screen it is a dialog over a Scrim with no buttons at its bottom, closed with its
 * close control or the Escape key.
 */
import { useEffect, useRef, useState } from 'react';
import { changedSettingLine, changedSettings } from '../changed-settings.ts';
import { groupDigits } from '../format.ts';
import { REFERENCE_WINDOW } from '../screen-limit.ts';
import { playSound } from '../sound-player.ts';
import { SOUND, soundSettings } from '../sounds.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Button, CloseControl, NumberField, Section, VolumeSlider } from '../ui.tsx';
import { MusicControl, MusicToggle, MusicVolumeSlider, Speaker } from './MusicControl.tsx';
import { TutorialsCheckbox } from './TutorialsCheckbox.tsx';

/** GUI, Settings panel: these settings have no rows of their own beyond the Music, Sounds, and Tutorials rows. */
const OWN_ROWS = new Set(['musicOn', 'musicVolume', 'soundsOn', 'soundsVolume', 'tutorialsOn']);

/**
 * GUI, Settings panel, Other settings: a setting that a control elsewhere sets where the Player uses it has no row,
 * e.g. the Autopilot settings, the settings of the developer tools, or whether the Side panel is hidden.
 */
const SET_ELSEWHERE = new Set([
  'autopilotControlsShown',
  'autopilotTurns',
  'autopilotControlsExpanded',
  'autopilotAi',
  'devModeOn',
  'revealHiddenContentOn',
  'combatSimulatorShown',
  'combatSimulatorSetup',
  'sidePanelHidden',
  'globeDevastationControlsShown',
  'lastTurnsCharts',
  'artworkTuning',
  'combatReplayOptionsShown',
]);

/** The label of the checkbox of a setting that is on or off; VIS, Screen limit names the Screen limit's. */
const CHECKBOX_LABELS: Readonly<Record<string, string>> = {
  screenLimit: `Limit the screen to ${groupDigits(REFERENCE_WINDOW.width)} × ${groupDigits(REFERENCE_WINDOW.height)}`,
};

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
      {/* MUSIC, Music volume slider: the Music row holds a Music toggle and the Music volume slider. */}
      <div className="settings-row">
        <div>Music</div>
        <div className="settings-input">
          <MusicToggle snapshot={snapshot} buttonClass="btn btn-plain" testId="settings-music-toggle" />
          <MusicVolumeSlider snapshot={snapshot} />
        </div>
      </div>
      <SoundsRow snapshot={snapshot} />
      <div className="settings-row">
        <div>Tutorials</div>
        <TutorialsCheckbox snapshot={snapshot} label="Tutorials enabled" testId="settings-tutorials" />
      </div>
      {snapshot.configuration.settings
        .filter((setting) => !OWN_ROWS.has(setting.setting) && !SET_ELSEWHERE.has(setting.setting))
        .map((setting) => (
          <div key={setting.setting} className="settings-row">
            <div>
              {setting.name}
              <span className="hint">
                {typeof setting.gameBuildDefault === 'boolean' ? 'On or off' : setting.permitted} ·{' '}
                {setting.stored ? 'your value' : 'build default'}
              </span>
            </div>
            {typeof setting.gameBuildDefault === 'boolean' ? (
              // A setting that is on or off is set with a checkbox; the Changed settings row resets it.
              <label className="check-label">
                <input
                  type="checkbox"
                  data-testid={`setting-${setting.setting}`}
                  checked={setting.effectiveValue === true}
                  onChange={(event) => {
                    act(() => session.globalConfiguration.set(setting.setting, event.target.checked));
                  }}
                />
                {CHECKBOX_LABELS[setting.setting] ?? setting.name}
              </label>
            ) : (
              <div className="actions">
                {setting.stored ? (
                  <Button
                    onClick={() => {
                      act(() => session.globalConfiguration.reset(setting.setting));
                    }}
                  >
                    Reset to{' '}
                    {typeof setting.gameBuildDefault === 'number'
                      ? groupDigits(setting.gameBuildDefault)
                      : setting.gameBuildDefault}
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
            )}
          </div>
        ))}
      <ChangedSettingsRow snapshot={snapshot} />
      {tools === undefined ? null : (
        <div className="settings-row">
          <div>Tools</div>
          <div className="actions">
            {/* VIS, Buttons: the ? and ` keys open the same views from the Campaign screen. */}
            <Button testId="open-shortcuts" keyHint="?" onClick={tools.onShortcuts}>
              Keyboard shortcuts
            </Button>
            <Button testId="open-developer" keyHint="`" onClick={tools.onDeveloper}>
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
