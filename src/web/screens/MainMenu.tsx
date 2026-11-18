/** The Main menu: new-Campaign setup, Campaign saves, and the Global configuration. */
import { useEffect, useState } from 'react';
import { GAME_BUILD, type SaveListEntry } from '../../engine/index.ts';
import { confirmOrGoBack, playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { act, run, theEngine, type Snapshot } from '../store.ts';
import { Button, CloseControl, NumberField, Section, Grid, typingIn } from '../ui.tsx';
import { MenuSettingsPanel } from './SettingsPanel.tsx';

const KIND_NAMES: Record<string, string> = {
  current: 'Current Autosave',
  turnEnd: 'Turn-end Autosave',
  engagement: 'Engagement Autosave',
  disengagement: 'Disengagement Autosave',
  furthestProgress: 'Furthest progress Autosave',
};

interface CampaignGroup {
  readonly campaignId: string;
  /** The latest Turn among its Campaign saves. */
  readonly turn: number;
  /** When its most recent Campaign save was last written, as an ISO 8601 UTC time. */
  readonly writtenAt: string;
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
    writtenAt: list.reduce((latest, save) => (save.writtenAt > latest ? save.writtenAt : latest), ''),
    saves: list,
  }));
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

  // VIS, Main menu Artboard: the Campaign saves grouped by Campaign. MENU, Layout: the card of the Campaign of the
  // most recent Campaign save takes the Accent edge.
  const campaigns = groupByCampaign(saves);
  const likely = campaigns.reduce<CampaignGroup | null>(
    (best, group) => (best === null || group.writtenAt > best.writtenAt ? group : best),
    null,
  );

  // MENU, Layout: with a close control, the Escape key does what Resume does for the Campaign the Player left.
  const left = campaigns.find((group) => group.campaignId === snapshot.leftCampaign) ?? null;
  useEffect(() => {
    if (left === null) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !typingIn(event.target)) {
        event.preventDefault();
        playSound(SOUND.back);
        resume(left);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  return (
    <main className="menu">
      {/* MENU, Layout: the close control sits at the upper right corner of the Main menu's content. */}
      {left === null ? null : (
        <CloseControl
          testId="menu-close"
          title="Back to the Campaign (Esc)"
          onClose={() => {
            resume(left);
          }}
        />
      )}
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
                          // GUI, Main menu: deleting cannot be undone, so the Player confirms it first.
                          if (
                            confirmOrGoBack(
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
                  <Grid widths={['200px', '96px', '160px']}>
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
                            title={`Turn ${save.turn}, ${save.actions} Player actions in it`}
                          >
                            T{save.turn} A{save.actions}
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
                                  // GUI, Main menu: deleting cannot be undone, so the Player confirms it first.
                                  if (
                                    confirmOrGoBack(
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
                  </Grid>
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

          <MenuSettingsPanel snapshot={snapshot} />
        </div>
      </div>
    </main>
  );
}
