/**
 * CSIM: the Combat simulator. The Teams pane sets up the Agents' side and the Enemies' side, and the Combat replay of
 * the Detached Combat last fought between them covers it once Fight is pressed. It has no Campaign and saves nothing but
 * its setup, in Global configuration.
 */
import { useEffect, useMemo, useState } from 'react';
import { GAME_BUILD, type CombatSimulatorContent } from '../../engine/index.ts';
import { CopySetupSeedButton } from '../copy-setup-seed.tsx';
import { groupDigits } from '../format.ts';
import { buildReplay } from '../combat-replay.ts';
import {
  FIRST_SEED,
  VALUE_FIELDS,
  agentRowsOfTeam,
  encodeSetup,
  enemyRow,
  enemyRowsOfSite,
  newAgentRow,
  replaySourceOf,
  rowsOfSetupSeed,
  setupSeedOf,
  reportOf,
  seedFrom,
  setupOf,
  storedSetup,
  withArmor,
  withWeapon,
  type AgentRow,
  type EnemyRow,
  type RowValues,
  type SimulatorSetup,
} from '../combat-simulator.ts';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { setSetting, settingValue, theEngine, useSnapshot } from '../store.ts';
import { Button, CloseControl, typingIn } from '../ui.tsx';
import { CombatReplay } from './CombatReplay.tsx';

/** The Combat last fought, with the rows it was fought on, which the Combat replay keeps drawing while rows are edited. */
interface Fought {
  readonly number: number;
  readonly report: ReturnType<typeof reportOf>;
  readonly agents: readonly AgentRow[];
  readonly enemies: readonly EnemyRow[];
  readonly seed: string;
  /** The rounds at hand a Combat setup seed set, or none for no limit. */
  readonly ammo: Readonly<Record<string, number>> | null;
}

/** CSIM, Teams: the fields of one row, one for each value of an explicit entry of a Detached Combat. */
function ValueFields(props: {
  side: 'agent' | 'enemy';
  index: number;
  values: RowValues;
  onChange: (values: RowValues) => void;
}) {
  return (
    <>
      {VALUE_FIELDS.map((field) => (
        <td key={field.key}>
          <input
            className="simulator-number"
            type="number"
            min={0}
            aria-label={`${field.title} of ${props.side} ${groupDigits(props.index + 1)}`}
            data-testid={`sim-${props.side}-${props.index + 1}-${field.key}`}
            value={props.values[field.key]}
            onChange={(event) => {
              props.onChange({ ...props.values, [field.key]: event.target.value });
            }}
          />
        </td>
      ))}
    </>
  );
}

function ValueHeads() {
  return (
    <>
      {VALUE_FIELDS.map((field) => (
        <th key={field.key} title={field.title}>
          {field.label}
        </th>
      ))}
    </>
  );
}

export function CombatSimulator({ onClose }: { onClose: () => void }) {
  const { session } = theEngine();
  const content = useMemo<CombatSimulatorContent | null>(() => {
    const result = session.combatSimulator.getContent();
    return result.ok ? result.value : null;
  }, [session]);

  // CSIM, Teams: the Combat simulator opens with its setup as the Game designer last left it, the Global configuration
  // setting Combat simulator setup.
  const configuration = useSnapshot().configuration;
  const [opening] = useState<SimulatorSetup | null>(() =>
    content === null ? null : storedSetup(content, settingValue(configuration, 'combatSimulatorSetup')),
  );
  const [team, setTeam] = useState(opening?.team ?? '');
  const [site, setSite] = useState(opening?.site ?? '');
  const [agents, setAgents] = useState<readonly AgentRow[]>(opening?.agents ?? []);
  const [enemies, setEnemies] = useState<readonly EnemyRow[]>(opening?.enemies ?? []);
  const [seed, setSeed] = useState(opening?.seed ?? FIRST_SEED);
  // CSIM, Fighting the Combat, Seed: the rounds at hand a pasted Combat setup seed set, until a preset replaces the rows.
  const [ammo, setAmmo] = useState<Readonly<Record<string, number>> | null>(null);
  // CSIM, Teams: every change to the rows, the presets, or the Seed field stores the setup.
  const encoded = encodeSetup({ team, site, agents, enemies, seed });
  const [kept, setKept] = useState(() => (opening === null ? encoded : encodeSetup(opening)));
  useEffect(() => {
    if (content !== null && encoded !== kept) {
      setKept(encoded);
      void setSetting('combatSimulatorSetup', encoded);
    }
  }, [content, encoded, kept]);
  const [fought, setFought] = useState<Fought | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // CSIM, Layout: whether the Combat replay of the Combat last fought covers the screen in place of the Teams pane.
  const [replayShown, setReplayShown] = useState(false);

  // CSIM, Opening the Combat simulator: the Escape key shows the Main menu again, or, while the Combat replay is
  // shown, closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !typingIn(event.target)) {
        event.preventDefault();
        playSound(SOUND.back);
        if (replayShown) {
          setReplayShown(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, replayShown]);

  const replay = useMemo(
    () =>
      fought === null || content === null
        ? null
        : buildReplay(
            fought.report,
            replaySourceOf(content, fought.agents, fought.enemies, fought.seed, fought.ammo !== null),
          ),
    [fought, content],
  );

  if (content === null) {
    return (
      <main className="simulator">
        <CloseControl testId="simulator-close" onClose={onClose} />
        <p className="warning-text">The Combat simulator could not read the Game build.</p>
      </main>
    );
  }

  // CSIM, Teams, Combat ratings: of the two sides as the rows give them now, or none while the setup is rejected.
  const rated = session.combatSimulator.rateSides(setupOf(agents, enemies, FIRST_SEED));
  const ratings = rated.ok ? rated.value : null;

  /** CSIM, Fighting the Combat: a rejected setup shows its reason and no Combat replay. */
  const fight = (withSeed: string) => {
    const result = session.combatSimulator.fightCombat(setupOf(agents, enemies, withSeed, ammo));
    if (!result.ok) {
      setProblem(result.error.message);
      return;
    }
    setProblem(null);
    setReplayShown(true);
    setFought({
      number: (fought?.number ?? 0) + 1,
      report: reportOf(result.value.combatReport),
      agents,
      enemies,
      seed: withSeed,
      ammo,
    });
  };

  const setAgent = (index: number, row: AgentRow) => {
    setAgents(agents.map((item, at) => (at === index ? row : item)));
  };
  const setEnemy = (index: number, row: EnemyRow) => {
    setEnemies(enemies.map((item, at) => (at === index ? row : item)));
  };

  if (replayShown && fought !== null && replay !== null) {
    // CSIM, Layout, and CRPLAY, Whole screen: the Combat replay covers the Teams pane; its close control shows the
    // Teams pane again, with its rows as they were.
    return (
      <main className="simulator" data-testid="combat-simulator">
        <div className="replay-whole-screen">
          <section className="detail-view" data-testid="sim-replay-view" aria-label="Combat replay">
            <header className="detail-head">
              <div className="detail-title">
                <h2>
                  Combat replay
                  <span className="detail-aside">
                    {/* CSIM, Fighting the Combat: the Combat outcome and its Combat rounds, as a Combat report gives them. */}
                    {groupDigits(fought.agents.length)} Agents vs {groupDigits(fought.enemies.length)} Enemies
                    ·{' '}
                    <span
                      className={fought.report.outcome === 'Won' ? 'tone-good' : 'tone-bad'}
                      data-testid="sim-replay-outcome"
                    >
                      {fought.report.outcome}
                    </span>{' '}
                    in {groupDigits(fought.report.rounds)} {fought.report.rounds === 1 ? 'round' : 'rounds'} ·
                    seed {fought.seed}
                  </span>
                </h2>
              </div>
              <CopySetupSeedButton
                seed={setupSeedOf(fought.agents, fought.enemies, fought.seed, fought.ammo, GAME_BUILD)}
              />
              <CloseControl
                testId="sim-replay-close"
                title="Back to the teams"
                onClose={() => {
                  setReplayShown(false);
                }}
              />
            </header>
            <div className="detail-body">
              <CombatReplay
                combat={fought.report}
                replay={replay}
                combatKey={fought.number}
                armorScale={Math.max(1, ...content.armors.map((armor) => armor.armor))}
              />
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="simulator" data-testid="combat-simulator">
      <CloseControl testId="simulator-close" title="Back to the Main menu" onClose={onClose} />
      <header className="simulator-head">
        <h1>Combat simulator</h1>
        <p className="secondary">
          Set up two teams, press Fight, and watch the Combat. Nothing here belongs to a Campaign or is saved.
        </p>
      </header>

      <div className="simulator-columns">
        <section className="pane simulator-teams" aria-label="Teams">
          {/* CSIM, Combat ratings of the teams: on the row of the Fight controls, to their right. */}
          <div className="simulator-top">
            <div className="simulator-fight">
              <label className="field">
                <span>Seed</span>
                <input
                  data-testid="sim-seed"
                  value={seed}
                  onChange={(event) => {
                    // CSIM, Fighting the Combat, Seed: a Combat setup seed sets both teams, the rounds at hand, and the
                    // Detached seed, so that Fight fights the Combat it was taken from.
                    const pasted = rowsOfSetupSeed(content, event.target.value);
                    if (pasted === null) {
                      setSeed(event.target.value);
                      return;
                    }
                    setAgents(pasted.agents);
                    setEnemies(pasted.enemies);
                    setAmmo(pasted.ammo);
                    setSeed(pasted.seed);
                    setProblem(
                      pasted.gameBuild === GAME_BUILD
                        ? null
                        : `This Combat setup seed is from the Game build ${pasted.gameBuild}, so the Combat may differ.`,
                    );
                  }}
                />
              </label>
              <Button
                kind="primary"
                testId="sim-fight"
                onClick={() => {
                  fight(seed);
                }}
              >
                Fight
              </Button>
              <Button
                testId="sim-new-seed"
                tooltip="Put a new seed, chosen at random, into the field; Fight then shows the teams fighting another way"
                onClick={() => {
                  // CSIM, Fighting the Combat, New seed: it changes the seed and fights nothing.
                  setSeed(seedFrom(Math.random()));
                }}
              >
                New seed
              </Button>
            </div>

            <div className="simulator-ratings" data-testid="sim-ratings">
              <span className="label">Combat rating</span>
              {ratings === null ? (
                <span className="muted">None: the setup is not valid</span>
              ) : (
                <>
                  <span>
                    Agents{' '}
                    <span className="figure tone-good" data-testid="sim-rating-agents">
                      {groupDigits(ratings.agents)}
                    </span>
                  </span>
                  <span>
                    Enemies{' '}
                    <span className="figure tone-bad" data-testid="sim-rating-enemies">
                      {groupDigits(ratings.enemies)}
                    </span>
                  </span>
                  <span>
                    Agents / Enemies{' '}
                    <span className="figure" data-testid="sim-rating-ratio">
                      {ratings.enemies === 0
                        ? '—'
                        : `${groupDigits(Math.round((100 * ratings.agents) / ratings.enemies))}%`}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
          {problem === null ? null : (
            <p className="warning-text" data-testid="sim-problem">
              {problem}
            </p>
          )}

          {/* CSIM, Teams: the Enemies' side stands to the right of the Agents' side. */}
          <div className="simulator-sides">
            <div className="simulator-side">
              <header className="simulator-side-head">
                <h3>
                  Agents <span className="figure muted">{groupDigits(agents.length)}</span>
                </h3>
                <select
                  aria-label="Agents' side preset"
                  data-testid="sim-team"
                  value={team}
                  onChange={(event) => {
                    playSound(SOUND.select);
                    setTeam(event.target.value);
                    setAgents(agentRowsOfTeam(content, event.target.value));
                    setAmmo(null);
                  }}
                >
                  {content.teams.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <Button
                  testId="sim-add-agent"
                  sound="select"
                  onClick={() => {
                    setAgents([...agents, agents[agents.length - 1] ?? newAgentRow(content)]);
                  }}
                >
                  Add
                </Button>
              </header>
              <div className="simulator-rows" data-testid="sim-agents">
                <table className="simulator-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Weapon</th>
                      <th>Armor</th>
                      <ValueHeads />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((row, index) => (
                      <tr key={index}>
                        <td className="figure muted">{groupDigits(index + 1)}</td>
                        <td>
                          <select
                            aria-label={`Weapon of agent ${groupDigits(index + 1)}`}
                            data-testid={`sim-agent-${index + 1}-weapon`}
                            value={row.weapon}
                            onChange={(event) => {
                              setAgent(index, withWeapon(content, row, event.target.value));
                            }}
                          >
                            {content.weapons.map((weapon) => (
                              <option key={weapon.id} value={weapon.id}>
                                {weapon.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            aria-label={`Armor of agent ${groupDigits(index + 1)}`}
                            data-testid={`sim-agent-${index + 1}-armor-item`}
                            value={row.armorItem}
                            onChange={(event) => {
                              setAgent(index, withArmor(content, row, event.target.value));
                            }}
                          >
                            {content.armors.map((armor) => (
                              <option key={armor.id} value={armor.id}>
                                {armor.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <ValueFields
                          side="agent"
                          index={index}
                          values={row.values}
                          onChange={(values) => {
                            setAgent(index, { ...row, values });
                          }}
                        />
                        <td>
                          <button
                            type="button"
                            className="btn btn-plain simulator-remove"
                            aria-label={`Remove agent ${groupDigits(index + 1)}`}
                            title="Remove"
                            data-sound="select"
                            onClick={() => {
                              setAgents(agents.filter((_, at) => at !== index));
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="simulator-side">
              <header className="simulator-side-head">
                <h3>
                  Enemies <span className="figure muted">{groupDigits(enemies.length)}</span>
                </h3>
                <select
                  aria-label="Enemies' side preset"
                  data-testid="sim-site"
                  value={site}
                  onChange={(event) => {
                    playSound(SOUND.select);
                    setSite(event.target.value);
                    setEnemies(enemyRowsOfSite(content, event.target.value));
                    setAmmo(null);
                  }}
                >
                  {content.missionSiteArchetypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <Button
                  testId="sim-add-enemy"
                  sound="select"
                  onClick={() => {
                    setEnemies([
                      ...enemies,
                      enemies[enemies.length - 1] ?? enemyRow(content, content.enemyArchetypes[0]?.id ?? ''),
                    ]);
                  }}
                >
                  Add
                </Button>
              </header>
              <div className="simulator-rows" data-testid="sim-enemies">
                <table className="simulator-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th colSpan={2}>EnemyArchetype</th>
                      <ValueHeads />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {enemies.map((row, index) => (
                      <tr key={index}>
                        <td className="figure muted">{groupDigits(index + 1)}</td>
                        <td colSpan={2}>
                          <select
                            aria-label={`EnemyArchetype of enemy ${groupDigits(index + 1)}`}
                            data-testid={`sim-enemy-${index + 1}-archetype`}
                            value={row.archetype}
                            onChange={(event) => {
                              setEnemy(index, enemyRow(content, event.target.value));
                            }}
                          >
                            {content.enemyArchetypes.map((archetype) => (
                              <option key={archetype.id} value={archetype.id}>
                                {archetype.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <ValueFields
                          side="enemy"
                          index={index}
                          values={row.values}
                          onChange={(values) => {
                            setEnemy(index, { ...row, values });
                          }}
                        />
                        <td>
                          <button
                            type="button"
                            className="btn btn-plain simulator-remove"
                            aria-label={`Remove enemy ${groupDigits(index + 1)}`}
                            title="Remove"
                            data-sound="select"
                            onClick={() => {
                              setEnemies(enemies.filter((_, at) => at !== index));
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
