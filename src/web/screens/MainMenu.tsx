/** The Main menu: the New Campaign panel, the Campaign saves, and the Settings button. */
import { useEffect, useState } from 'react';
import {
  BUILD_INFO,
  GAME_BUILD,
  decodeCampaignSetupSeed,
  isCampaignSetupSeedText,
  type SaveListEntry,
} from '../../engine/index.ts';
import { buildCommitUrl, buildLabel } from '../build-label.ts';
import { newCampaignName } from '../campaign-name.ts';
import { groupDigits } from '../format.ts';
import { orderSaveRows } from '../save-rows.ts';

/** The page of the commit the build was made from; null when the build knew no commit. */
const buildUrl = buildCommitUrl(BUILD_INFO);
import { confirmOrGoBack, playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { noteCampaignCreation } from '../special-events.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { Button, CloseControl, NumberField, Section, Grid, typingIn } from '../ui.tsx';
import { Cogwheel, SettingsDialog } from './SettingsPanel.tsx';

const KIND_NAMES: Record<string, string> = {
  current: 'Current Autosave',
  turnEnd: 'Turn-end Autosave',
  autopilot: 'Autopilot Autosave',
  engagement: 'Engagement Autosave',
  disengagement: 'Disengagement Autosave',
  furthestProgress: 'Furthest progress Autosave',
};

interface CampaignGroup {
  readonly campaignId: string;
  /** MENU, Layout: how the card names the Campaign, by its Campaign name or else the start of its Campaign ID. */
  readonly label: string;
  readonly campaignName: string;
  /** The latest Turn among its Campaign saves. */
  readonly turn: number;
  /** When its most recent Campaign save was last written, as an ISO 8601 UTC time. */
  readonly writtenAt: string;
  readonly saves: readonly SaveListEntry[];
}

/** The Campaign saves of each Campaign, its rows ordered under MENU, Layout. */
function groupByCampaign(saves: readonly SaveListEntry[]): CampaignGroup[] {
  const groups = new Map<string, SaveListEntry[]>();
  for (const save of saves) {
    const list = groups.get(save.campaignId) ?? [];
    list.push(save);
    groups.set(save.campaignId, list);
  }
  return [...groups].map(([campaignId, list]) => {
    const campaignName = list.find((save) => save.campaignName !== '')?.campaignName ?? '';
    return {
      campaignId,
      label: campaignName === '' ? campaignId.slice(0, 8) : campaignName,
      campaignName,
      turn: Math.max(...list.map((save) => save.turn)),
      writtenAt: list.reduce((latest, save) => (save.writtenAt > latest ? save.writtenAt : latest), ''),
      saves: orderSaveRows(list),
    };
  });
}

/**
 * MENU, Layout: Resume returns the Player to the Campaign where they left it, by loading its Current Autosave, or its
 * most recent Campaign save when it has none.
 */
function resumeSave(group: CampaignGroup): SaveListEntry | null {
  return (
    group.saves.find((save) => save.autosaveKind === 'current') ??
    group.saves.reduce<SaveListEntry | null>(
      (latest, save) => (latest === null || save.writtenAt > latest.writtenAt ? save : latest),
      null,
    )
  );
}

function resume(group: CampaignGroup): void {
  const save = resumeSave(group);
  if (save !== null) {
    void run(() => theEngine().session.saves.load(save.saveId));
  }
}

export function MainMenu({ snapshot, onOpenSimulator }: { snapshot: Snapshot; onOpenSimulator: () => void }) {
  // CSIM, Opening the Combat simulator: its button is shown while the Combat simulator shown setting is on.
  const simulatorShown =
    snapshot.configuration.settings.find((setting) => setting.setting === 'combatSimulatorShown')
      ?.effectiveValue === true;
  const { session } = theEngine();
  const [saves, setSaves] = useState<SaveListEntry[]>([]);
  const [seed, setSeed] = useState('');
  // MENU, New Campaign: the fields under Advanced options are folded whenever the Main menu opens.
  const [advanced, setAdvanced] = useState(false);
  // GUI, Settings panel: on the Main menu too it opens from the Settings button.
  const [settings, setSettings] = useState(false);
  // MENU, New Campaign: a value the engine rejects changes nothing, and its field shows the reason the engine reports.
  const [editErrors, setEditErrors] = useState<Readonly<Record<string, string>>>({});

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

  // MENU, Layout: the Campaign saves grouped into one card per Campaign, and the card of the Campaign of the most
  // recent Campaign save takes the Accent edge.
  const campaigns = groupByCampaign(saves);
  const likely = campaigns.reduce<CampaignGroup | null>(
    (best, group) => (best === null || group.writtenAt > best.writtenAt ? group : best),
    null,
  );

  // MENU, Layout: with a close control, the Escape key does what Resume does for the Campaign the Player left.
  const left = campaigns.find((group) => group.campaignId === snapshot.leftCampaign) ?? null;
  // GUI, Settings panel: while it is open, the Escape key closes it instead.
  useEffect(() => {
    if (left === null && !settings) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !typingIn(event.target)) {
        event.preventDefault();
        playSound(SOUND.back);
        if (settings) {
          setSettings(false);
        } else if (left !== null) {
          resume(left);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  // MENU, New Campaign, Seed: what a Campaign setup seed in the Seed field holds, or none for a Campaign seed.
  const pastedSetup = isCampaignSetupSeedText(seed) ? decodeCampaignSetupSeed(seed) : null;

  return (
    <main className="menu">
      <header className="menu-head">
        <div>
          <h1>Continuity – Demo</h1>
          <p className="secondary" data-testid="menu-subtitle">
            Lead a clandestine organization to wage a secret war to protect humanity, in a turn-based strategy
          </p>
        </div>
        <div className="menu-head-side">
          {/* MENU, Layout: the Settings button, which opens the Settings panel; no Music control. */}
          <div className="menu-head-controls">
            {simulatorShown ? (
              <Button testId="open-combat-simulator" onClick={onOpenSimulator}>
                Combat simulator
              </Button>
            ) : null}
            <button
              type="button"
              className="btn btn-plain menu-settings-button"
              data-testid="open-settings"
              onClick={() => {
                setSettings(true);
              }}
            >
              Settings <Cogwheel />
            </button>
            {/* MENU, Layout: the close control sits at the upper right corner of the Main menu's content, beside the
                header's buttons. */}
            {left === null ? null : (
              <CloseControl
                testId="menu-close"
                title="Back to the Campaign"
                onClose={() => {
                  resume(left);
                }}
              />
            )}
          </div>
          {/* MENU, Layout: the build label, the Game build ID after the word "build", linking to its commit. */}
          <p className="figure muted small">
            {buildUrl === null ? (
              buildLabel(BUILD_INFO)
            ) : (
              <a
                href={buildUrl}
                target="_blank"
                rel="noreferrer"
                className="build-link"
                data-testid="build-label"
              >
                {buildLabel(BUILD_INFO)}
              </a>
            )}
          </p>
        </div>
      </header>

      <div className="menu-columns">
        <div className="menu-side">
          <Section title="New Campaign">
            <Button
              kind="primary"
              main
              testId="new-campaign"
              onClick={() => {
                // TSUM, Special events: the Campaign screen shows the Special event of campaign_start once this
                // Campaign is created.
                const creation = noteCampaignCreation();
                // MENU, New Campaign: the Campaign name, for the day in the time zone of the Player's device.
                const campaignName = newCampaignName(
                  campaigns.map((group) => group.campaignName),
                  new Date(),
                );
                act(async () => {
                  try {
                    const result = await session.campaign.create(
                      seed.trim() === '' ? { campaignName } : { seed: seed.trim(), campaignName },
                    );
                    if (!result.ok) {
                      creation.failed();
                    }
                    return result;
                  } catch (error) {
                    creation.failed();
                    throw error;
                  }
                });
              }}
            >
              Start a new Campaign
            </Button>
            {/* MENU, New Campaign: Advanced options shows or hides the fields, ▸ while folded and ▾ while unfolded. */}
            <Button
              testId="advanced-options"
              sound="select"
              className="menu-advanced-toggle"
              onClick={() => {
                setAdvanced(!advanced);
              }}
            >
              Advanced options {advanced ? '▾' : '▸'}
            </Button>
            {!advanced ? null : (
              <div className="menu-advanced" data-testid="advanced-fields">
                <label className="field">
                  <span>Preset</span>
                  <select
                    data-testid="preset-select"
                    disabled={pastedSetup !== null}
                    title={
                      pastedSetup === null ? undefined : 'Set by the Campaign setup seed in the Seed field'
                    }
                    value={pastedSetup?.preset ?? selected?.preset ?? ''}
                    onChange={(event) => {
                      setEditErrors({});
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
                {pastedSetup !== null ? (
                  // MENU, New Campaign, Seed: a Campaign setup seed shows the Preset edits it holds, which cannot be changed.
                  <div className="setup-values" data-testid="setup-seed-edits">
                    {Object.keys(pastedSetup.edits).length === 0 ? (
                      <span className="label">No Preset edits</span>
                    ) : (
                      Object.entries(pastedSetup.edits).map(([key, edit]) => (
                        <div key={key} className="field">
                          <span>
                            {values?.ok === true
                              ? (values.value.find((item) => item.key === key)?.name ?? key)
                              : key}
                          </span>
                          <span className="figure">{groupDigits(edit)}</span>
                        </div>
                      ))
                    )}
                  </div>
                ) : selected !== undefined && values?.ok === true ? (
                  <div className="setup-values">
                    {values.value.map((value) => (
                      <div key={value.key} className="field">
                        <span title={value.permitted}>{value.name}</span>
                        <div className="field-edit">
                          <NumberField
                            label={`${value.name} edit`}
                            testId={`preset-edit-${value.key}`}
                            placeholder={`${groupDigits(value.presetValue)} (preset)`}
                            stored={value.presetEdit === null ? '' : String(value.presetEdit)}
                            onCommit={(text) => {
                              const result =
                                text === ''
                                  ? session.newCampaignSetup.removePresetEdit(selected.preset, value.key)
                                  : session.newCampaignSetup.setPresetEdit(selected.preset, {
                                      key: value.key,
                                      value: Number(text),
                                    });
                              setEditErrors(({ [value.key]: _previous, ...rest }) =>
                                result.ok ? rest : { ...rest, [value.key]: result.error.message },
                              );
                              if (result.ok) {
                                act(() => result);
                              }
                            }}
                          />
                          {value.presetEdit === null ? null : (
                            <Button
                              onClick={() => {
                                setEditErrors(({ [value.key]: _cleared, ...rest }) => rest);
                                act(() =>
                                  session.newCampaignSetup.removePresetEdit(selected.preset, value.key),
                                );
                              }}
                            >
                              Remove edit
                            </Button>
                          )}
                        </div>
                        {editErrors[value.key] === undefined ? null : (
                          <span
                            className="field-error tone-bad"
                            data-testid={`preset-edit-error-${value.key}`}
                          >
                            {editErrors[value.key]}
                          </span>
                        )}
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
                {pastedSetup !== null && pastedSetup.gameBuild !== GAME_BUILD ? (
                  <span className="field-error tone-warn" data-testid="setup-seed-build">
                    This Campaign setup seed is from the Game build {pastedSetup.gameBuild}, so the Campaign
                    may unfold differently.
                  </span>
                ) : null}
              </div>
            )}
          </Section>
        </div>

        <section className="menu-saves" aria-label="Campaign saves">
          <header className="menu-saves-head">
            <h2>Campaign saves</h2>
            <span className="label">
              {groupDigits(campaigns.length)} {campaigns.length === 1 ? 'Campaign' : 'Campaigns'}
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
                      <span className="figure" title={group.campaignId} data-testid="campaign-name">
                        {group.label}
                      </span>
                      <span className="label">Turn {groupDigits(group.turn)}</span>
                    </div>
                    <div className="actions">
                      <Button
                        kind={group === likely ? 'primary' : 'plain'}
                        testId={`resume-${group.campaignId}`}
                        onClick={() => {
                          resume(group);
                        }}
                      >
                        Resume
                      </Button>
                      <Button
                        kind="danger"
                        testId={`delete-campaign-${group.campaignId}`}
                        onClick={() => {
                          // MENU, Campaign saves: deleting cannot be undone, so the Player confirms it first.
                          if (
                            confirmOrGoBack(
                              `Delete ${group.campaignName === '' ? `Campaign ${group.label}` : group.label} with all its ${groupDigits(group.saves.length)} Campaign saves? This cannot be undone.`,
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
                  {/* VIS, Tables: the first column holds "Furthest progress Autosave" after the card's 18 px inset,
                      and the second a Turn of four digits with its comma and the Player actions in it, e.g.
                      "T1,234 A123". */}
                  <Grid widths={['212px', '120px', '160px']}>
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
                          <td
                            className="num"
                            title={`Turn ${groupDigits(save.turn)}, ${groupDigits(save.actions)} Player actions in it`}
                          >
                            T{groupDigits(save.turn)} A{groupDigits(save.actions)}
                          </td>
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
                                  // MENU, Campaign saves: deleting cannot be undone, so the Player confirms it first.
                                  if (
                                    confirmOrGoBack(
                                      `Delete the ${kind} of Turn ${groupDigits(save.turn)} of ${group.campaignName === '' ? `Campaign ${group.label}` : group.label}? This removes 1 Campaign save and cannot be undone.`,
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
                  </Grid>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {settings ? (
        <SettingsDialog
          snapshot={snapshot}
          onClose={() => {
            setSettings(false);
          }}
        />
      ) : null}
    </main>
  );
}
