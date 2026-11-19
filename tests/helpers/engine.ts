/** Helpers for tests that play through the public engine API. */
import { createBasicAutopilotAi } from '../../src/ai/index.ts';
import {
  MemoryStorage,
  createEngine,
  type AutopilotAi,
  type AutopilotLimit,
  type CampaignState,
  type DisengagementResult,
  type Engine,
  type Result,
} from '../../src/engine/index.ts';
import type { RawGdrFile } from '../../src/gdr/index.ts';

export function ok<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

export function errorCode(result: Result<unknown>): string {
  return result.ok ? 'ok' : result.error.code;
}

export interface TestEngine {
  engine: Engine;
  storage: MemoryStorage;
  /** Starts a new Session over the same Game storage. */
  restart(): Promise<Engine>;
}

let counter = 0;

export async function startEngine(
  options: {
    storage?: MemoryStorage;
    autopilotAis?: AutopilotAi[];
    gdrFiles?: readonly RawGdrFile[];
    saveSizeLimitBytes?: number;
  } = {},
): Promise<TestEngine> {
  const storage = options.storage ?? new MemoryStorage();
  const make = () =>
    createEngine(
      {
        storage,
        newId: () => {
          counter += 1;
          return `id-${counter}`;
        },
        randomNumbers: (count) => Array.from({ length: count }, (_, i) => counter * 17 + i * 5),
        ...(options.saveSizeLimitBytes === undefined
          ? {}
          : { saveSizeLimitBytes: options.saveSizeLimitBytes }),
      },
      {
        autopilotAis: options.autopilotAis ?? [createBasicAutopilotAi()],
        ...(options.gdrFiles === undefined ? {} : { gdrFiles: options.gdrFiles }),
      },
    );
  const test: TestEngine = {
    engine: await make(),
    storage,
    async restart() {
      test.engine = await make();
      return test.engine;
    },
  };
  return test;
}

/** Full Campaign state through Developer API, in its inspection form. */
export function inspect(engine: Engine): any {
  const devMode = ok(engine.session.getStatus()).devMode;
  if (!devMode) {
    ok(engine.session.developer.enable());
  }
  const state = ok(engine.developer.queries.getCampaignState());
  if (!devMode) {
    ok(engine.session.developer.disable());
  }
  return state;
}

/** The World state of the current Committed state, i.e. the one the Timeline pointer is on, from full inspection. */
export function currentWorld(state: any): any {
  const pointer = state.timelinePointer as number;
  return pointer === 0
    ? state.timeline.turnStartState
    : state.timeline.timelineEntries[pointer - 1].worldState;
}

/** The Live world state of the current Committed state, through Developer API. */
export function liveWorld(engine: Engine): any {
  return currentWorld(inspect(engine)).liveWorldState;
}

/** Engages Autopilot and waits for disengagement. */
export async function autopilot(
  engine: Engine,
  limit: AutopilotLimit,
  autopilotAiId = 'basic',
): Promise<DisengagementResult> {
  const { engagementId } = ok(await engine.session.autopilot.engage(autopilotAiId, limit));
  return ok(await engine.session.autopilot.whenDisengaged(engagementId));
}

export type { CampaignState };
