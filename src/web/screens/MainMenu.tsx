/** The Main menu: new-Campaign setup, Campaign saves, and the Global configuration. */
import { useEffect, useState } from 'react';
import { GAME_BUILD, type SaveListEntry } from '../../engine/index.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { Button, NumberField, Section } from '../ui.tsx';

const KIND_NAMES: Record<string, string> = {
  current: 'Current Autosave',
  turnEnd: 'Turn-end Autosave',
  engagement: 'Engagement Autosave',
  disengagement: 'Disengagement Autosave',
  return: 'Return Autosave',
};

interface CampaignGroup {
  readonly campaignId: string;
  /** The latest Turn among its Campaign saves. */
  readonly turn: number;
  readonly saves: readonly SaveListEntry[];
}

/** The Campaign saves of each Campaign, in the order the engine lists them. */
function groupByCampaign(saves: readonly SaveListEntry[]): CampaignGroup[] {
  const groups = new Map<string, SaveListEntry[]>();
  for (const save of saves) {
    const list = groups.get(save.campaignId) ?? [];
    list.push(save);
    groups.set(save.campaignId, list);
  }
  return [...groups].map(([campaignId, list]) => ({
    campaignId,
    turn: Math.max(...list.map((save) => save.turn)),
    saves: list,
  }));
}

export function SettingsPanel({ snapshot }: { snapshot: Snapshot }) {
  const { session } = theEngine();
  return (
    <Section title="Settings" testId="settings">
      {snapshot.configuration.settings.map((setting) => (
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
          </div>
        </div>
      ))}
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

  // VIS, Main menu Artboard: the Campaign saves grouped by Campaign. DEC-007: the Campaign that has gone furthest is
  // the one the Player most likely wants, so its card takes the Accent edge.
  const campaigns = groupByCampaign(saves);
  const likely = campaigns.reduce<CampaignGroup | null>(
    (best, group) => (best === null || group.turn > best.turn ? group : best),
    null,
  );

  return (
    <main className="menu">
      <header className="menu-head">
        <div>
          <h1>Game v5</h1>
          <p className="secondary">
            Lead a covert agency: hire Agents, investigate Leads, win Missions, and eliminate every Faction
            before Panic reaches its limit.
          </p>
        </div>
        <p className="figure muted small">build {GAME_BUILD}</p>
      </header>

      <div className="menu-columns">
        <section className="menu-saves" aria-label="Campaign saves">
          <header className="menu-saves-head">
            <h2>Campaign saves</h2>
            <span className="label">
              {campaigns.length} {campaigns.length === 1 ? 'Campaign' : 'Campaigns'}
            </span>
          </header>
          {saves.length === 0 ? (
            <p className="muted">
              No Campaign saves yet. The game saves the Campaign you play automatically.
            </p>
          ) : (
            <div className="menu-saves" data-testid="saves-table">
              {campaigns.map((group) => (
                <article
                  key={group.campaignId}
                  className={group === likely ? 'campaign-card likely' : 'campaign-card'}
                  data-testid={`campaign-${group.campaignId}`}
                >
                  <header className="campaign-card-head">
                    <div className="inline">
                      <span className="figure" title={group.campaignId}>
                        {group.campaignId.slice(0, 8)}
                      </span>
                      <span className="label">Turn {group.turn}</span>
                    </div>
                    <div className="actions">
                      <Button
                        kind="danger"
                        testId={`delete-campaign-${group.campaignId}`}
                        onClick={() => {
                          // GUI, Main menu: deleting cannot be undone, so the Player confirms it first.
                          if (
                            window.confirm(
                              `Delete Campaign ${group.campaignId.slice(0, 8)} with all its ${group.saves.length} Campaign saves? This cannot be undone.`,
                            )
                          ) {
                            void run(() => session.saves.deleteCampaign(group.campaignId));
                          }
                        }}
                      >
                        Delete Campaign
                      </Button>
                    </div>
                  </header>
                  <table className="grid">
                    <tbody>
                      {group.saves.map((save) => (
                        <tr key={save.saveId}>
                          <td>
                            {save.autosaveKind === null ? (
                              'Manual save'
                            ) : save.autosaveKind === 'current' ? (
                              <span className="tone-warn">{KIND_NAMES['current']}</span>
                            ) : (
                              (KIND_NAMES[save.autosaveKind] ?? save.autosaveKind)
                            )}
                          </td>
                          <td className="num">T{save.turn}</td>
                          <td>
                            <div className="actions">
                              <Button
                                testId={`load-${save.autosaveKind ?? 'manual'}`}
                                onClick={() => {
                                  void run(() => session.saves.load(save.saveId));
                                }}
                              >
                                Load
                              </Button>
                              <Button
                                kind="danger"
                                testId={`delete-save-${save.saveId}`}
                                onClick={() => {
                                  const kind =
                                    save.autosaveKind === null
                                      ? 'manual save'
                                      : (KIND_NAMES[save.autosaveKind] ?? save.autosaveKind);
                                  // GUI, Main menu: deleting cannot be undone, so the Player confirms it first.
                                  if (
                                    window.confirm(
                                      `Delete the ${kind} of Turn ${save.turn} of Campaign ${save.campaignId.slice(0, 8)}? This removes 1 Campaign save and cannot be undone.`,
                                    )
                                  ) {
                                    void run(() => session.saves.delete(save.saveId));
                                  }
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="menu-side">
          <Section title="New Campaign">
            <label className="field">
              <span>Preset</span>
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
              <div className="setup-values">
                {values.value.map((value) => (
                  <div key={value.key} className="field">
                    <span title={value.permitted}>{value.name}</span>
                    <div className="field-edit">
                      <NumberField
                        label={`${value.name} edit`}
                        testId={`preset-edit-${value.key}`}
                        placeholder={`${value.presetValue} (preset)`}
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
                      {value.presetEdit === null ? null : (
                        <Button
                          onClick={() => {
                            act(() => session.newCampaignSetup.removePresetEdit(selected.preset, value.key));
                          }}
                        >
                          Remove edit
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <label className="field">
              <span>Seed — optional</span>
              <input
                data-testid="seed-input"
                placeholder="random"
                value={seed}
                onChange={(event) => {
                  setSeed(event.target.value);
                }}
              />
            </label>
            <Button
              kind="primary"
              main
              testId="new-campaign"
              onClick={() => {
                act(() => session.campaign.create(seed.trim() === '' ? {} : { seed: seed.trim() }));
              }}
            >
              Start Campaign
            </Button>
          </Section>

          <SettingsPanel snapshot={snapshot} />
        </div>
      </div>
    </main>
  );
}
