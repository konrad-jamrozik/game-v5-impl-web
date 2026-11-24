/**
 * CSIM: the Combat simulator. The Teams pane at the left sets up the Agents' side and the Enemies' side, and the Combat
 * replay to its right shows the Detached Combat last fought between them. It has no Campaign and saves nothing.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CombatSimulatorContent } from '../../engine/index.ts';
import { buildReplay } from '../combat-replay.ts';
import {
  FIRST_SEED,
  VALUE_FIELDS,
  agentRowsOfTeam,
  enemyRow,
  enemyRowsOfSite,
  newAgentRow,
  replaySourceOf,
  reportOf,
  seedFrom,
  setupOf,
  withArmor,
  withWeapon,
  type AgentRow,
  type EnemyRow,
  type RowValues,
} from '../combat-simulator.ts';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { theEngine } from '../store.ts';
import { Button, CloseControl, typingIn } from '../ui.tsx';
import { CombatReplay } from './CombatReplay.tsx';

/** The Combat last fought, with the rows it was fought on, which the Combat replay keeps drawing while rows are edited. */
interface Fought {
  readonly number: number;
  readonly report: ReturnType<typeof reportOf>;
  readonly agents: readonly AgentRow[];
  readonly enemies: readonly EnemyRow[];
  readonly seed: string;
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
            aria-label={`${field.title} of ${props.side} ${props.index + 1}`}
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

  // CSIM, Teams: the Combat simulator opens with the first DetachedCombatTeam against the first MissionSiteArchetype.
  const firstTeam = content?.teams[0]?.id ?? '';
  const firstSite = content?.missionSiteArchetypes[0]?.id ?? '';
  const [team, setTeam] = useState(firstTeam);
  const [site, setSite] = useState(firstSite);
  const [agents, setAgents] = useState<readonly AgentRow[]>(() =>
    content === null ? [] : agentRowsOfTeam(content, firstTeam),
  );
  const [enemies, setEnemies] = useState<readonly EnemyRow[]>(() =>
    content === null ? [] : enemyRowsOfSite(content, firstSite),
  );
  const [seed, setSeed] = useState(FIRST_SEED);
  const [fought, setFought] = useState<Fought | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // CSIM, Opening the Combat simulator: the Escape key shows the Main menu again.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !typingIn(event.target)) {
        event.preventDefault();
        playSound(SOUND.back);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const replay = useMemo(
    () =>
      fought === null || content === null
        ? null
        : buildReplay(fought.report, replaySourceOf(content, fought.agents, fought.enemies, fought.seed)),
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

  /** CSIM, Fighting the Combat: a rejected setup shows its reason, and the Combat replay keeps the Combat it shows. */
  const fight = (withSeed: string) => {
    const result = session.combatSimulator.fightCombat(setupOf(agents, enemies, withSeed));
    if (!result.ok) {
      setProblem(result.error.message);
      return;
    }
    setProblem(null);
    setFought({
      number: (fought?.number ?? 0) + 1,
      report: reportOf(result.value.combatReport),
      agents,
      enemies,
      seed: withSeed,
    });
  };

  const setAgent = (index: number, row: AgentRow) => {
    setAgents(agents.map((item, at) => (at === index ? row : item)));
  };
  const setEnemy = (index: number, row: EnemyRow) => {
    setEnemies(enemies.map((item, at) => (at === index ? row : item)));
  };

  return (
    <main className="simulator" data-testid="combat-simulator">
      <CloseControl testId="simulator-close" title="Back to the Main menu (Esc)" onClose={onClose} />
      <header className="simulator-head">
        <h1>Combat simulator</h1>
        <p className="secondary">
          Set up two teams, press Fight, and watch the Combat. Nothing here belongs to a Campaign or is saved.
        </p>
      </header>

      <div className="simulator-columns">
        <section className="pane simulator-teams" aria-label="Teams">
          <div className="simulator-fight">
            <label className="field">
              <span>Seed</span>
              <input
                data-testid="sim-seed"
                value={seed}
                onChange={(event) => {
                  setSeed(event.target.value);
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
              tooltip="Fight the same teams with a new seed, chosen at random"
              onClick={() => {
                const next = seedFrom(Math.random());
                setSeed(next);
                fight(next);
              }}
            >
              New seed
            </Button>
          </div>
          {problem === null ? null : (
            <p className="warning-text" data-testid="sim-problem">
              {problem}
            </p>
          )}

          <div className="simulator-side">
            <header className="simulator-side-head">
              <h3>
                Agents <span className="figure muted">{agents.length}</span>
              </h3>
              <select
                aria-label="Agents' side preset"
                data-testid="sim-team"
                value={team}
                onChange={(event) => {
                  playSound(SOUND.select);
                  setTeam(event.target.value);
                  setAgents(agentRowsOfTeam(content, event.target.value));
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
                      <td className="figure muted">{index + 1}</td>
                      <td>
                        <select
                          aria-label={`Weapon of agent ${index + 1}`}
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
                          aria-label={`Armor of agent ${index + 1}`}
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
                          aria-label={`Remove agent ${index + 1}`}
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
                Enemies <span className="figure muted">{enemies.length}</span>
              </h3>
              <select
                aria-label="Enemies' side preset"
                data-testid="sim-site"
                value={site}
                onChange={(event) => {
                  playSound(SOUND.select);
                  setSite(event.target.value);
                  setEnemies(enemyRowsOfSite(content, event.target.value));
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
                      <td className="figure muted">{index + 1}</td>
                      <td colSpan={2}>
                        <select
                          aria-label={`EnemyArchetype of enemy ${index + 1}`}
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
                          aria-label={`Remove enemy ${index + 1}`}
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
        </section>

        <div className="simulator-replay">
          {fought === null || replay === null ? (
            <p className="muted" data-testid="sim-empty">
              Press Fight to have the two teams fight a Combat and watch it here.
            </p>
          ) : (
            <CombatReplay
              combat={fought.report}
              replay={replay}
              combatKey={fought.number}
              armorScale={Math.max(1, ...content.armors.map((armor) => armor.armor))}
            />
          )}
        </div>
      </div>
    </main>
  );
}
