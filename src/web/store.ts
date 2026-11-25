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
  type CompendiumArticleView,
  type CurrentLiveWorldStateView,
  type CurrentRetiredWorldStateView,
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
import { canReveal, revealInEffect } from './reveal.ts';

export interface Notice {
  readonly id: number;
  readonly kind: 'info' | 'error' | 'warning';
  readonly text: string;
  /** Dismissed, but keeping its place so that the notices below it do not move. */
  readonly dismissed: boolean;
}

export interface Snapshot {
  readonly key: string;
  readonly status: SessionStatus;
  readonly configuration: GlobalConfigurationReport;
  /** Absent without a Current campaign. */
  readonly state: CurrentLiveWorldStateView | null;
  /** Absent without a Current campaign. */
  readonly retired: CurrentRetiredWorldStateView | null;
  readonly actions: AvailableActionsView | null;
  readonly report: TurnReport | null;
  readonly history: HistoryView | null;
  readonly gameData: GameDataView | null;
  /**
   * COMP: the Player-visible Compendium articles, in their resolved form; under Revealed presentation, the Revealed
   * Compendium (COMPV).
   */
  readonly articles: readonly CompendiumArticleView[] | null;
  /**
   * GUI, Reveal hidden content: whether its checkbox is checked. `revealed` says whether the GUI presents the Current
   * campaign under Revealed presentation now, which it does not while Autopilot is engaged; `retired.leads` and
   * `articles` then hold the revealed values, read through `developer.queries`.
   */
  readonly revealHiddenContent: boolean;
  readonly revealed: boolean;
  /**
   * COMP, Revealed Compendium: the Article term lookup over every article, by Article term in lower case, while
   * `revealed`; otherwise null, and the Article term lookup is Player API's.
   */
  readonly revealedTerms: Readonly<Record<string, string>> | null;
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
/**
 * GUI, Developer tools, Kept across Sessions: the Dev mode on setting as the GUI last acted on it, so that turning it
 * off, by its checkbox or by Reset in Changed settings, disables Dev mode; null before the first look.
 */
let lastDevModeOn: boolean | null = null;
/**
 * The choice of the "Dev mode" and "Reveal hidden content" checkboxes while Global configuration stores it, so that each
 * checkbox follows a click at once; null while none is being stored.
 */
let devModeChoice: boolean | null = null;
let revealChoice: boolean | null = null;
const listeners = new Set<() => void>();

/** Whether the boolean Global configuration setting `setting` is on. */
function settingOn(configuration: GlobalConfigurationReport | null, setting: string): boolean {
  return configuration?.settings.find((item) => item.setting === setting)?.effectiveValue === true;
}

/**
 * GUI, Reveal hidden content: checks or clears the checkbox, which stores Reveal hidden content on in Global
 * configuration. It can change only while Dev mode is enabled and Autopilot is not engaged; it changes no Campaign
 * state and adds no Timeline entry.
 */
export async function setRevealHiddenContent(on: boolean): Promise<void> {
  const status = engine === null ? null : valueOf(engine.session.getStatus());
  if (status === null || !canReveal(status)) {
    return;
  }
  revealChoice = on;
  changed();
  await run(() => theEngine().session.globalConfiguration.set('revealHiddenContentOn', on));
  revealChoice = null;
  changed();
}

/**
 * GUI, Developer tools, Gated by Dev mode: the "Dev mode" checkbox enables or disables Dev mode at once and stores Dev
 * mode on in Global configuration; should the store fail, Dev mode follows the stored setting again.
 */
export async function setDevMode(on: boolean): Promise<void> {
  devModeChoice = on;
  syncDevMode();
  changed();
  await run(() => theEngine().session.globalConfiguration.set('devModeOn', on));
  devModeChoice = null;
  syncDevMode();
  changed();
}

/**
 * GUI, Developer tools, Kept across Sessions: while Dev mode on is on, enables Dev mode whenever a Campaign is current
 * and Dev mode is disabled, e.g. after a create or a load, which disable it, and in a new Session; once it is turned
 * off, disables Dev mode. Dev mode cannot change while Autopilot is engaged, so this waits for the engagement to end.
 */
function syncDevMode(): void {
  if (engine === null) {
    return;
  }
  const status = valueOf(engine.session.getStatus());
  if (status === null || status.autopilot !== null) {
    return;
  }
  const on = devModeChoice ?? settingOn(valueOf(engine.session.globalConfiguration.get()), 'devModeOn');
  const turnedOff = (lastDevModeOn === true || devModeChoice === false) && !on;
  lastDevModeOn = on;
  if (!status.hasCurrentCampaign) {
    return;
  }
  if (on && !status.devMode) {
    engine.session.developer.enable();
  } else if (turnedOff && status.devMode) {
    engine.session.developer.disable();
  }
}

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

/** The most notices shown at once, counting the places of dismissed ones that are kept. */
const MAX_NOTICES = 4;

/**
 * Shows a notice. So that no notice on the screen ever moves, a new one takes the place of the topmost dismissed
 * one, and otherwise goes below the others; only when every place is taken by a notice still shown does the oldest
 * make room.
 */
export function notify(kind: Notice['kind'], text: string): void {
  const notice: Notice = { id: nextNoticeId, kind, text, dismissed: false };
  nextNoticeId += 1;
  const free = notices.findIndex((shown) => shown.dismissed);
  notices =
    free === -1
      ? [...notices.slice(-(MAX_NOTICES - 1)), notice]
      : notices.map((shown, index) => (index === free ? notice : shown));
  changed();
}

/**
 * Dismisses a notice. It keeps its place, unseen, while any notice is still shown, so that the notices below it never
 * move up; once none is, all their places are freed.
 */
export function dismissNotice(id: number): void {
  const marked = notices.map((notice) => (notice.id === id ? { ...notice, dismissed: true } : notice));
  notices = marked.every((notice) => notice.dismissed) ? [] : marked;
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
  // GUI, Developer tools, Kept across Sessions: Dev mode follows Dev mode on, which Global configuration keeps.
  lastDevModeOn = null;
  devModeChoice = null;
  revealChoice = null;
  engine.subscribe(() => {
    syncDevMode();
    changed();
  });
  syncDevMode();
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
  // GUI, Developer tools, Kept across Sessions: Reveal hidden content is on exactly while its setting is.
  const revealHiddenContent = revealChoice ?? settingOn(configuration, 'revealHiddenContentOn');
  // DEV, Revealed presentation, Read through Developer API: every revealed value comes from `developer.queries`.
  const revealed = revealInEffect(revealHiddenContent, status);
  const compendium = revealed ? valueOf(game.developer.queries.getRevealedCompendium()) : null;
  const revealedLeads = revealed ? valueOf(game.developer.queries.getRevealedLeads()) : null;
  const retired = has ? valueOf(game.player.queries.getCurrentRetiredWorldState()) : null;
  cached = {
    key,
    status,
    configuration,
    state: has ? valueOf(game.player.queries.getCurrentLiveWorldState()) : null,
    retired: retired === null || revealedLeads === null ? retired : { ...retired, leads: revealedLeads },
    actions: has ? valueOf(game.player.queries.getAvailableActions()) : null,
    report: has ? valueOf(game.player.queries.getTurnReport()) : null,
    history: has ? valueOf(game.player.queries.getHistory()) : null,
    gameData: has ? valueOf(game.player.queries.getGameData()) : null,
    articles:
      compendium !== null
        ? compendium.articles
        : has
          ? valueOf(game.player.queries.getCompendiumArticles())
          : null,
    revealHiddenContent,
    revealed,
    revealedTerms: compendium?.terms ?? null,
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
