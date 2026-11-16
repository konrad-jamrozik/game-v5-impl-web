/** The Main menu: new-Campaign setup, Campaign saves, and the Global configuration. */
import { useEffect, useState } from 'react';
import { GAME_BUILD, type SaveListEntry } from '../../engine/index.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { Badge, Button, NumberField, Section } from '../ui.tsx';

const KIND_NAMES: Record<string, string> = {
  current: 'Current Autosave',
  turnEnd: 'Turn-end Autosave',
  engagement: 'Engagement Autosave',
  return: 'Return Autosave',
};

export function SettingsPanel({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  return (
    <Section title="Settings">
      <table className="grid">
        <tbody>
          {snapshot.configuration.settings.map((setting) => (
            <tr key={setting.setting}>
              <th scope="row">{setting.name}</th>
              <td>
                {setting.setting === 'theme' ? (
                  <select
                    aria-label={setting.name}
                    data-testid="setting-theme"
                    value={String(setting.effectiveValue)}
                    onChange={(event) => {
                      act(() => session.globalConfiguration.set(setting.setting, event.target.value));
                    }}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                ) : (
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
                )}
              </td>
              <td className="muted">{setting.permitted}</td>
              <td>
                {setting.stored ? (
                  <Button
                    onClick={() => {
                      act(() => session.globalConfiguration.reset(setting.setting));
                    }}
                  >
                    Reset to {String(setting.gameBuildDefault)}
                  </Button>
                ) : (
                  <span className="muted">Game build default</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {snapshot.configuration.problems.map((problem) => (
        <p key={problem} className="warning-text">
          {problem}
        </p>
      ))}
    </Section>
  );
}

export function MainMenu({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  const [saves, setSaves] = useState<SaveListEntry[]>([]);
  const [seed, setSeed] = useState('');

  useEffect(() => {
    let live = true;
    void session.saves.list().then((result) => {
      if (live && result.ok) {
        setSaves(result.value);
      }
    });
    return () => {
      live = false;
    };
  }, [session, snapshot.key]);

  const presets = session.newCampaignSetup.listPresets();
  const presetList = presets.ok ? presets.value : [];
  const selected = presetList.find((preset) => preset.isSelected);
  const values = selected === undefined ? null : session.newCampaignSetup.getPreset(selected.preset);

  return (
    <main className="menu">
      <header className="menu-head">
        <h1>Game v5</h1>
        <p className="muted">
          Lead a covert agency: hire Agents, investigate Leads, win Missions, and eliminate every Faction
          before Panic reaches its limit.
        </p>
        <p className="muted small">Game build {GAME_BUILD}</p>
      </header>

      <div className="menu-columns">
        <Section title="New Campaign">
          <label className="field">
            <span>Campaign configuration preset</span>
            <select
              data-testid="preset-select"
              value={selected?.preset ?? ''}
              onChange={(event) => {
                act(() => session.newCampaignSetup.selectPreset(event.target.value));
              }}
            >
              {presetList.map((preset) => (
                <option key={preset.preset} value={preset.preset}>
                  {preset.name}
                  {preset.isGameBuildDefault ? ' (default)' : ''}
                  {preset.hasPresetEdits ? ' (edited)' : ''}
                </option>
              ))}
            </select>
          </label>
          {selected !== undefined && values?.ok === true ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Value</th>
                  <th>Preset</th>
                  <th>Your edit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {values.value.map((value) => (
                  <tr key={value.key}>
                    <th scope="row" title={value.permitted}>
                      {value.name}
                    </th>
                    <td className="num">{value.presetValue}</td>
                    <td>
                      <NumberField
                        label={`${value.name} edit`}
                        testId={`preset-edit-${value.key}`}
                        placeholder={String(value.presetValue)}
                        stored={value.presetEdit === null ? '' : String(value.presetEdit)}
                        onCommit={(text) => {
                          act(() =>
                            text === ''
                              ? session.newCampaignSetup.removePresetEdit(selected.preset, value.key)
                              : session.newCampaignSetup.setPresetEdit(selected.preset, {
                                  key: value.key,
                                  value: Number(text),
                                }),
                          );
                        }}
                      />
                    </td>
                    <td>
                      {value.presetEdit === null ? null : (
                        <Button
                          onClick={() => {
                            act(() => session.newCampaignSetup.removePresetEdit(selected.preset, value.key));
                          }}
                        >
                          Remove edit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <label className="field">
            <span>Campaign seed (optional; leave empty for a random one)</span>
            <input
              data-testid="seed-input"
              value={seed}
              onChange={(event) => {
                setSeed(event.target.value);
              }}
            />
          </label>
          <Button
            kind="primary"
            testId="new-campaign"
            onClick={() => {
              act(() => session.campaign.create(seed.trim() === '' ? {} : { seed: seed.trim() }));
            }}
          >
            Start Campaign
          </Button>
        </Section>

        <Section title="Campaign saves">
          {saves.length === 0 ? (
            <p className="muted">
              No Campaign saves yet. The game saves the Campaign you play automatically.
            </p>
          ) : (
            <table className="grid" data-testid="saves-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Kind</th>
                  <th className="num">Turn</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {saves.map((save) => (
                  <tr key={save.saveId}>
                    <td title={save.campaignId}>{save.campaignId.slice(0, 8)}</td>
                    <td>
                      {save.autosaveKind === null ? (
                        <Badge tone="accent">Manual save</Badge>
                      ) : (
                        (KIND_NAMES[save.autosaveKind] ?? save.autosaveKind)
                      )}
                    </td>
                    <td className="num">{save.turn}</td>
                    <td>
                      <Button
                        testId={`load-${save.autosaveKind ?? 'manual'}`}
                        onClick={() => {
                          void run(() => session.saves.load(save.saveId));
                        }}
                      >
                        Load
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <SettingsPanel snapshot={snapshot} />
    </main>
  );
}
