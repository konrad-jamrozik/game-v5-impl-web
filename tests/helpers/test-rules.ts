/**
 * A tiny set of game rules for testing the engine subsystems of the Foundation family on their own, without the
 * Mechanics. The acceptance examples of Configuration use two presets, Standard and Hard, which these rules supply.
 */
import { produce } from 'immer';
import { seedRng, uniformInt, type RngState } from '../../src/kernel/index.ts';
import { isRejection, reject, type Rejection } from '../../src/engine/result.ts';
import type { ActionRecord, GameRules } from '../../src/engine/rules.ts';
import { MemoryStorage } from '../../src/engine/saves/storage.ts';
import {
  CONTROLLER,
  EngineCore,
  type AutopilotAiRunner,
  type EngineEnvironment,
  type Principal,
} from '../../src/engine/session/core.ts';

export interface TestState {
  configuration: { startingMoney: number; multiplier: number };
  world: {
    current: {
      seed: string;
      rng: RngState;
      turn: number;
      money: number;
      nextId: number;
      agents: string[];
      ended: boolean;
      hidden: number;
    };
    history: { reports: { turn: number; roll: number }[] };
  };
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export const testRules: GameRules<TestState> = {
  gameBuild: 'test-build',
  presets: [
    { id: 'standard', name: 'Standard', values: { startingMoney: 100, multiplier: 1 } },
    { id: 'hard', name: 'Hard', values: { startingMoney: 60, multiplier: 2 } },
  ],
  defaultPresetId: 'standard',
  configurationValues: [
    {
      key: 'startingMoney',
      name: 'Starting money',
      adjustable: false,
      permitted: 'A whole number from 0 to 1000',
      isPermitted: (value): value is number => isWhole(value) && value >= 0 && value <= 1000,
    },
    {
      key: 'multiplier',
      name: 'Investigation difficulty multiplier',
      adjustable: true,
      permitted: 'A whole number from 1 to 5',
      isPermitted: (value): value is number => isWhole(value) && value >= 1 && value <= 5,
    },
  ],

  createCampaign({ configuration, seed }) {
    const rng = seedRng(seed);
    const hidden = uniformInt(rng, 1, 1000);
    return {
      configuration: {
        startingMoney: configuration['startingMoney'] ?? 0,
        multiplier: configuration['multiplier'] ?? 1,
      },
      world: {
        current: {
          seed,
          rng,
          turn: 1,
          money: configuration['startingMoney'] ?? 0,
          nextId: 1,
          agents: [],
          ended: false,
          hidden,
        },
        history: { reports: [] },
      },
    };
  },

  applyAction(state, record: ActionRecord): TestState | Rejection {
    const args = (record.args ?? {}) as { amount?: unknown };
    let rejection: Rejection | null = null;
    const next = produce(state, (draft) => {
      const current = draft.world.current;
      switch (`${record.surface}.${record.name}`) {
        case 'player.gain':
          if (!isWhole(args.amount) || args.amount < 0) {
            rejection = reject('invalid_amount', 'The amount must be a nonnegative whole number.');
            return;
          }
          current.money += args.amount;
          return;
        case 'player.spend':
          if (!isWhole(args.amount) || args.amount > current.money) {
            rejection = reject('not_enough_money', 'The Agency does not have enough money.');
            return;
          }
          current.money -= args.amount;
          return;
        case 'player.roll':
          current.money += uniformInt(current.rng, 1, 100);
          return;
        case 'player.hire':
          current.agents.push(`agent-${current.nextId}`);
          current.nextId += 1;
          return;
        case 'player.end':
          current.ended = true;
          return;
        case 'developer.addMoney':
          if (!isWhole(args.amount) || args.amount <= 0) {
            rejection = reject('invalid_amount', 'The amount must be a positive whole number.');
            return;
          }
          current.money += args.amount;
          return;
        default:
          rejection = reject('unknown_action', 'There is no such action.');
      }
    });
    return rejection ?? next;
  },

  advanceTurn(state) {
    if (state.world.current.ended) {
      return reject('campaign_ended', 'The Campaign has ended.', 'campaign_ended');
    }
    return produce(state, (draft) => {
      const roll = uniformInt(draft.world.current.rng, 1, 100);
      draft.world.history.reports.push({ turn: draft.world.current.turn, roll });
      draft.world.current.money += roll;
      draft.world.current.turn += 1;
    });
  },

  checkInvariants(state) {
    return state.world.current.money < 0 ? ['money is negative'] : [];
  },

  isEnded: (state) => state.world.current.ended,

  isCampaignState(value): value is TestState {
    const candidate = value as Partial<TestState> | null;
    return (
      typeof candidate === 'object' &&
      candidate !== null &&
      typeof candidate.configuration === 'object' &&
      typeof candidate.world?.current?.seed === 'string' &&
      isWhole(candidate.world.current.turn) &&
      isWhole(candidate.world.current.money) &&
      Array.isArray(candidate.world.history?.reports)
    );
  },

  currentStateView: (state) => ({
    turn: state.world.current.turn,
    money: state.world.current.money,
    agents: [...state.world.current.agents],
    configuration: { ...state.configuration },
  }),
  turnReportView: (state) => {
    const report = state.world.history.reports.at(-1);
    return report ? { ...report } : null;
  },
  historyView: (state) => state.world.history.reports.map((report) => ({ turn: report.turn })),
  availableActionsView: () => ['gain', 'spend', 'roll', 'hire', 'advanceTurn'],
  // The current Committed state under the Campaign configuration in force, so that tests can read it whole.
  inspect: ({ states, position, configuration }) => {
    const state = states[position];
    if (state === undefined) {
      throw new Error('The Timeline has no Committed state at its pointer');
    }
    return structuredClone({
      ...state,
      configuration: { ...state.configuration, ...configuration } as TestState['configuration'],
    });
  },
  placeInPlay: (state) => ({ world: state.world }),
  withConfiguration: (state, configuration) =>
    Object.entries(configuration).every(
      ([key, value]) => state.configuration[key as keyof TestState['configuration']] === value,
    )
      ? state
      : produce(state, (draft) => {
          draft.configuration = { ...state.configuration, ...configuration } as TestState['configuration'];
        }),
};

export interface Harness {
  core: EngineCore<TestState>;
  storage: MemoryStorage;
  env: EngineEnvironment;
  /** Starts a new Session over the same Game storage. */
  restart(): Promise<EngineCore<TestState>>;
  act(name: string, args?: unknown): ReturnType<EngineCore<TestState>['commitAction']>;
  cheat(name: string, args?: unknown): ReturnType<EngineCore<TestState>['commitAction']>;
  state(): TestState;
  view(): { turn: number; money: number; agents: string[] };
}

let idCounter = 0;

export async function startHarness(
  options: {
    ais?: AutopilotAiRunner[];
    storage?: MemoryStorage;
    saveSizeLimitBytes?: number;
    now?: () => number;
  } = {},
): Promise<Harness> {
  const storage = options.storage ?? new MemoryStorage();
  const env: EngineEnvironment = {
    storage,
    newId: () => {
      idCounter += 1;
      return `id-${idCounter}`;
    },
    randomNumbers: (count) => Array.from({ length: count }, (_, i) => idCounter * 31 + i * 7),
    ...(options.saveSizeLimitBytes === undefined ? {} : { saveSizeLimitBytes: options.saveSizeLimitBytes }),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
  const harness: Harness = {
    core: await EngineCore.start(env, testRules, options.ais ?? []),
    storage,
    env,
    async restart() {
      harness.core = await EngineCore.start(env, testRules, options.ais ?? []);
      return harness.core;
    },
    act: (name, args = {}) => harness.core.commitAction(CONTROLLER, { surface: 'player', name, args }),
    cheat: (name, args = {}) => harness.core.commitAction(CONTROLLER, { surface: 'developer', name, args }),
    state() {
      harness.core.enableDevMode(CONTROLLER);
      const result = harness.core.developerQuery(CONTROLLER);
      harness.core.disableDevMode(CONTROLLER);
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value as TestState;
    },
    view() {
      const result = harness.core.playerQuery(CONTROLLER, 'currentState');
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value as { turn: number; money: number; agents: string[] };
    },
  };
  return harness;
}

/** Unwraps a successful result, or fails the test with the error. */
export function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) {
    throw new Error(`Expected success, got: ${result.error.message}`);
  }
  return result.value;
}

/** A scripted Autopilot AI for tests: each step runs the next script function, or the last one again. */
export function scriptedAi(
  id: string,
  getCore: () => EngineCore<TestState>,
  script: ((api: {
    principal: Principal;
    core: EngineCore<TestState>;
    act(name: string, args?: unknown): Promise<unknown>;
    advance(): Promise<unknown>;
  }) => Promise<void> | void)[],
): AutopilotAiRunner {
  let index = 0;
  return {
    id,
    name: `Test AI ${id}`,
    async step(principal) {
      const core = getCore();
      const run = script[Math.min(index, script.length - 1)];
      index += 1;
      if (run === undefined) {
        throw new Error('The scripted Autopilot AI has no script');
      }
      await run({
        principal,
        core,
        act: (name, args = {}) => core.commitAction(principal, { surface: 'player', name, args }),
        advance: () => core.advanceTurn(principal),
      });
    },
  };
}

export { CONTROLLER, isRejection };
