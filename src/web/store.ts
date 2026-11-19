/**
 * The bridge between React and the engine. The engine is the only owner of game state; this module caches the
 * results of its queries for one revision so that every component renders the same World state, and it reports
 * the outcome of each operation as a notice. It implements no gameplay rule.
 */
import { useSyncExternalStore } from 'react';
import { AUTOPILOT_AIS } from '../ai/index.ts';
import {
  createEngine,
  type AutopilotStatus,
  type AvailableActionsView,
  type CurrentStateView,
  type EncyclopediaArticleView,
  type Engine,
  type GameDataView,
  type GameStorage,
  type GlobalConfigurationReport,
  type HistoryView,
  type Result,
  type SessionStatus,
  type TimelineStatus,
  type TurnReport,
} from '../engine/index.ts';

export interface Notice {
  readonly id: number;
  readonly kind: 'info' | 'error' | 'warning';
  readonly text: string;
}

export interface Snapshot {
  readonly key: string;
  readonly status: SessionStatus;
  readonly configuration: GlobalConfigurationReport;
  /** Absent without a Current campaign. */
  readonly state: CurrentStateView | null;
  readonly actions: AvailableActionsView | null;
  readonly report: TurnReport | null;
  readonly history: HistoryView | null;
  readonly gameData: GameDataView | null;
  /** COMP: the Player-visible Encyclopedia articles. */
  readonly articles: readonly EncyclopediaArticleView[] | null;
  readonly timeline: TimelineStatus | null;
  readonly autopilot: AutopilotStatus | null;
  readonly notices: readonly Notice[];
  /** True while an operation of the Session controller is running. */
  readonly busy: boolean;
  /**
   * MENU, Layout: the Campaign the Player left from the Campaign screen to reach the Main menu, which its close button
   * resumes; absent for a Main menu reached otherwise.
   */
  readonly leftCampaign: string | null;
}

const RESUME_KEY = 'game-v5-impl-web.campaign';

let engine: Engine | null = null;
let localRevision = 0;
let cached: Snapshot | null = null;
let notices: Notice[] = [];
let nextNoticeId = 1;
let pending = 0;
let lastEngagementId: string | null = null;
let leftCampaign: string | null = null;
const listeners = new Set<() => void>();

/** MENU, Layout: leaves the Current campaign for the Main menu from the Campaign screen, which then offers to close. */
export async function leaveCampaign(): Promise<void> {
  const campaignId = theEngine().session.getStatus();
  const left = campaignId.ok ? campaignId.value.campaignId : null;
  // `close()` succeeds with the value null, which `run` also returns on failure, so success is read from the Result.
  let closed = false;
  await run(async () => {
    const result = await theEngine().session.campaign.close();
    closed = result.ok;
    return result;
  });
  if (closed) {
    leftCampaign = left;
    changed();
  }
}

function changed(): void {
  localRevision += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function theEngine(): Engine {
  if (engine === null) {
    throw new Error('The engine has not started');
  }
  return engine;
}

function valueOf<T>(result: Result<T>): T | null {
  return result.ok ? result.value : null;
}

function remember(campaignId: string | null): void {
  try {
    if (campaignId === null) {
      sessionStorage.removeItem(RESUME_KEY);
    } else {
      sessionStorage.setItem(RESUME_KEY, campaignId);
    }
  } catch {
    // Without session storage a reload returns to the Main menu, where Continue loads the Current Autosave.
  }
}

export function notify(kind: Notice['kind'], text: string): void {
  notices = [...notices.slice(-3), { id: nextNoticeId, kind, text }];
  nextNoticeId += 1;
  changed();
}

export function dismissNotice(id: number): void {
  notices = notices.filter((notice) => notice.id !== id);
  changed();
}

/** Starts the Session, and after a reload continues the Campaign that was being played from its Current Autosave. */
export async function boot(storage: GameStorage): Promise<void> {
  engine = await createEngine(
    {
      storage,
      newId: () => crypto.randomUUID(),
      randomNumbers: (count) => Array.from(crypto.getRandomValues(new Uint32Array(count))),
      yieldToHost: () => new Promise((resolve) => setTimeout(resolve, 0)),
    },
    { autopilotAis: [...AUTOPILOT_AIS] },
  );
  engine.subscribe(changed);
  let resume: string | null = null;
  try {
    resume = sessionStorage.getItem(RESUME_KEY);
  } catch {
    resume = null;
  }
  if (resume !== null) {
    const saves = valueOf(await engine.session.saves.list()) ?? [];
    const current = saves.find((save) => save.campaignId === resume && save.autosaveKind === 'current');
    if (current !== undefined) {
      const loaded = await engine.session.saves.load(current.saveId);
      if (!loaded.ok) {
        notify('error', `The Campaign could not be continued: ${loaded.error.message}`);
      }
    }
  }
  changed();
}

export function snapshot(): Snapshot {
  const game = theEngine();
  const key = `${game.getRevision()}.${localRevision}`;
  if (cached?.key === key) {
    return cached;
  }
  const status = valueOf(game.session.getStatus());
  if (status === null) {
    throw new Error('The Session status is unavailable');
  }
  const configuration = valueOf(game.session.globalConfiguration.get()) ?? { settings: [], problems: [] };
  const has = status.hasCurrentCampaign;
  if (has) {
    leftCampaign = null;
  }
  if (status.autopilot !== null) {
    lastEngagementId = status.autopilot.engagementId;
  }
  cached = {
    key,
    status,
    configuration,
    state: has ? valueOf(game.player.queries.getCurrentState()) : null,
    actions: has ? valueOf(game.player.queries.getAvailableActions()) : null,
    report: has ? valueOf(game.player.queries.getTurnReport()) : null,
    history: has ? valueOf(game.player.queries.getHistory()) : null,
    gameData: has ? valueOf(game.player.queries.getGameData()) : null,
    articles: has ? valueOf(game.player.queries.getEncyclopediaArticles()) : null,
    timeline: has ? valueOf(game.session.timeline.getStatus()) : null,
    autopilot:
      has && lastEngagementId !== null ? valueOf(game.session.autopilot.getStatus(lastEngagementId)) : null,
    notices,
    busy: pending > 0,
    leftCampaign,
  };
  remember(status.campaignId);
  return cached;
}

export function useSnapshot(): Snapshot {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, snapshot);
}

/**
 * Runs one engine API operation and reports its outcome: a failure as an error notice with the engine's own
 * message, an Autosave that could not be written as a warning. Returns the value, or null when it failed.
 */
export async function run<T>(
  operation: () => Promise<Result<T>> | Result<T>,
  success?: string,
): Promise<T | null> {
  pending += 1;
  changed();
  try {
    const result = await operation();
    if (!result.ok) {
      notify('error', result.error.message);
      return null;
    }
    for (const failure of result.autosaveFailures) {
      notify('warning', failure.message);
    }
    if (success !== undefined) {
      notify('info', success);
    }
    return result.value;
  } catch (error) {
    notify('error', error instanceof Error ? error.message : 'The operation failed.');
    return null;
  } finally {
    pending -= 1;
    changed();
  }
}

/** `run` for an event handler: starts the operation and returns nothing. */
export function act<T>(operation: () => Promise<Result<T>> | Result<T>, success?: string): void {
  void run(operation, success);
}
