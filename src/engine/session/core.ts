import {
  CHOSEN_SEED_LENGTH,
  EngineDefect,
  deepEqual,
  detach,
  isPermittedSeed,
  seedFromNumbers,
} from '../../kernel/index.ts';
import {
  fail,
  isRejection,
  ok,
  type AutosaveFailure,
  type ErrorCode,
  type Rejection,
  type Result,
} from '../result.ts';
import type { ActionRecord, GameRules, ShellState } from '../rules.ts';
import {
  SAVE_SIZE_LIMIT_BYTES,
  decodeSave,
  encodeSave,
  lineOfSave,
  utf8ByteLength,
} from '../saves/encoding.ts';
import type { GameStorage, SaveHeader, SaveKind } from '../saves/storage.ts';
import {
  ancestorStamps,
  commitAdvanceTurn,
  commitEntry,
  currentStamp,
  currentState,
  fromSaved,
  newCampaignRuntime,
  toSaved,
  undoneCount,
  type CampaignRuntime,
  type SavedCampaign,
} from '../timeline/campaign-runtime.ts';
import {
  GlobalConfiguration,
  type GlobalConfigurationReport,
  type SettingValue,
} from './global-configuration.ts';

/** A kind of engine API caller; see ENG, Principals and access. */
export type Principal =
  | { readonly kind: 'controller' }
  | { readonly kind: 'autopilot'; readonly engagementId: string };

export const CONTROLLER: Principal = { kind: 'controller' };

/**
 * AUTO, Autopilot limits: `singleAction` and `turnActions` withhold the Advance turn the Autopilot AI requests, and
 * `turnAdvancements` commits it.
 */
export type AutopilotLimit =
  | { readonly kind: 'singleAction' }
  | { readonly kind: 'turnActions' }
  | { readonly kind: 'turnAdvancements'; readonly count: number };

export type DisengagementReason =
  | 'limitReached'
  | 'advanceTurnWithheld'
  | 'disengagedByController'
  | 'campaignEnded'
  | 'aiFailed';

/** AUTO, Autopilot progress. */
export interface AutopilotProgress {
  /** The committed Player actions other than Advance turn. */
  readonly playerActions: number;
  /** The committed Advance turn actions. */
  readonly turnAdvancements: number;
}

export interface DisengagementResult {
  readonly engagementId: string;
  readonly reason: DisengagementReason;
  readonly limitReached: boolean;
  readonly progress: AutopilotProgress;
  /** For AI failed: what went wrong, without any hidden value. */
  readonly detail: string | null;
}

export interface AutopilotStatus {
  readonly engagementId: string;
  readonly autopilotAiId: string;
  readonly limit: AutopilotLimit;
  readonly progress: AutopilotProgress;
  readonly status: 'active' | 'ended';
  readonly disengagement: DisengagementResult | null;
}

/** An Autopilot AI as the engine runs it: one call makes it play some more through its Principal. */
export interface AutopilotAiRunner {
  readonly id: string;
  readonly name: string;
  /** Plays on: makes queries and commits at least one Player action, or fails. */
  step(principal: Principal): Promise<void> | void;
}

export interface EngineEnvironment {
  readonly storage: GameStorage;
  /** Supplies Independent identifiers, e.g. random UUIDs. */
  newId(): string;
  /** Supplies whole numbers for a Campaign seed the engine chooses; exempt from Determinism. */
  randomNumbers(count: number): number[];
  /** Lets the host run between two steps of an Autopilot AI, e.g. to handle a disengage request. */
  yieldToHost?(): Promise<void>;
  /**
   * The current time in milliseconds since the Unix epoch, recorded as the time a Campaign save was last written;
   * defaults to the system clock. It is not Campaign state, so gameplay never consults it; see SAVES.
   */
  now?(): number;
  /** Overrides the Save size limit; for tests only. */
  saveSizeLimitBytes?: number;
}

interface Engagement {
  readonly id: string;
  readonly ai: AutopilotAiRunner;
  readonly limit: AutopilotLimit;
  playerActions: number;
  turnAdvancements: number;
  /** The Player actions committed since this Autopilot engagement began or last advanced the Turn. */
  actionsThisTurn: number;
  status: 'active' | 'ended';
  result: DisengagementResult | null;
  /** The Disengagement Autosave, when it could not be written; see SAVES, Autosaves. */
  readonly disengagementFailures: AutosaveFailure[];
  callsInStep: number;
  resolveDone: (result: DisengagementResult) => void;
  readonly done: Promise<DisengagementResult>;
}

/** An Autopilot AI that makes this many engine calls in one step without committing an action has failed. */
const CALL_BUDGET_PER_STEP = 100_000;

/** An Autopilot AI that commits this many Player actions in one Turn without requesting Advance turn has failed. */
const ACTION_BUDGET_PER_TURN = 10_000;

export interface SessionStatus {
  readonly hasCurrentCampaign: boolean;
  readonly campaignId: string | null;
  /** The Campaign seed of the Current campaign, in a form `create` accepts. Never Player-visible. */
  readonly campaignSeed: string | null;
  readonly turn: number | null;
  readonly campaignEnded: boolean;
  readonly devMode: boolean;
  readonly autopilot: {
    readonly engagementId: string;
    readonly autopilotAiId: string;
  } | null;
}

export interface SaveListEntry {
  readonly saveId: string;
  readonly campaignId: string;
  readonly isAutosave: boolean;
  readonly autosaveKind:
    | 'current'
    | 'turnEnd'
    | 'autopilot'
    | 'engagement'
    | 'disengagement'
    | 'furthestProgress'
    | null;
  readonly turn: number;
  /**
   * SAVES, Listing Campaign saves: the number of Player actions that lead from the start of that Turn to the saved
   * World state, not counting Advance turn or any Undone action.
   */
  readonly actions: number;
  /** When the Campaign save was last written, as an ISO 8601 UTC time; see SAVES, Listing Campaign saves. */
  readonly writtenAt: string;
}

export interface TimelineStatus {
  readonly timelineEntries: number;
  readonly undoneActions: number;
  readonly canUndoAction: boolean;
  readonly canRedoAction: boolean;
}

export interface AutosaveTarget {
  readonly saveId: string;
  readonly autosaveKind: 'turnEnd' | 'autopilot' | 'engagement' | 'disengagement' | 'furthestProgress';
  readonly turn: number;
  /**
   * TIMELINE, Autosave navigation, Crossing an Autopilot engagement: whether the call undoes or redoes at once the
   * Player actions of an Autopilot engagement between its start and its earliest Autopilot Autosave.
   */
  readonly crossesAutopilotEngagement: boolean;
}

export interface AutosaveStatus {
  readonly undoToAutosave: AutosaveTarget | null;
  readonly redoToAutosave: AutosaveTarget | null;
}

export interface PresetListEntry {
  readonly preset: string;
  readonly name: string;
  readonly isGameBuildDefault: boolean;
  readonly isSelected: boolean;
  readonly hasPresetEdits: boolean;
}

export interface PresetValueReport {
  readonly key: string;
  readonly name: string;
  readonly presetValue: number;
  readonly presetEdit: number | null;
  readonly permitted: string;
  readonly adjustableDuringPlay: boolean;
}

export interface SetupReport {
  readonly preset: string;
  readonly values: Readonly<Record<string, number>>;
}

export interface CommitOutcome {
  /** False when the action had no effect and so was not a Player action, or when it was withheld. */
  readonly committed: boolean;
  /**
   * True for an Advance turn that an Autopilot AI requested and the engine withheld under its Autopilot limit; see
   * AUTO, Autopilot limits. It is neither a Player action nor a rejected action.
   */
  readonly withheld?: true;
  /** For a Player API action other than Advance turn, what it changed; see PAPI, Action results. */
  readonly changes?: unknown;
}

/** A Campaign state as a Campaign save stores it, so that values a JSON text cannot hold do not count. */
function asStored(state: unknown): unknown {
  return JSON.parse(JSON.stringify(state)) as unknown;
}

function autosaveKindOf(kind: SaveKind): SaveListEntry['autosaveKind'] {
  switch (kind) {
    case 'currentAutosave':
      return 'current';
    case 'turnEndAutosave':
      return 'turnEnd';
    case 'autopilotAutosave':
      return 'autopilot';
    case 'engagementAutosave':
      return 'engagement';
    case 'disengagementAutosave':
      return 'disengagement';
    case 'furthestProgressAutosave':
      return 'furthestProgress';
    case 'manual':
      return null;
  }
}

/** SAVES, Limits: the Global configuration setting that bounds the Autosaves of one Turn-end kind. */
function limitSettingOf(
  kind: 'turnEndAutosave' | 'autopilotAutosave',
): 'autosaveLimit' | 'autopilotAutosaveLimit' {
  return kind === 'turnEndAutosave' ? 'autosaveLimit' : 'autopilotAutosaveLimit';
}

function describeSave(header: Pick<SaveHeader, 'kind' | 'turn' | 'saveId'>): string {
  switch (header.kind) {
    case 'currentAutosave':
      return `the Current Autosave (Turn ${header.turn})`;
    case 'turnEndAutosave':
      return `the Turn-end Autosave of Turn ${header.turn}`;
    case 'autopilotAutosave':
      return `the Autopilot Autosave of Turn ${header.turn}`;
    case 'engagementAutosave':
      return `the Engagement Autosave (Turn ${header.turn})`;
    case 'disengagementAutosave':
      return `the Disengagement Autosave (Turn ${header.turn})`;
    case 'furthestProgressAutosave':
      return `the Furthest progress Autosave (Turn ${header.turn})`;
    case 'manual':
      return `Campaign save ${header.saveId} (Turn ${header.turn})`;
  }
}

/**
 * The engine subsystems of the Foundation family over one Session: Campaign lifecycle, Saves, Timeline,
 * Configuration, Autopilot, and Developer access. Every call passes the access check that implements the Principal
 * access matrix of ENG, API hierarchy. Operations that change anything run one at a time.
 */
export class EngineCore<S extends ShellState> {
  private readonly env: EngineEnvironment;
  private readonly rules: GameRules<S>;
  private readonly ais: readonly AutopilotAiRunner[];
  private readonly globalConfiguration = new GlobalConfiguration();
  private headers = new Map<string, SaveHeader>();
  private readonly lineCache = new Map<string, { stamp: string; line: string[] }>();

  private campaign: CampaignRuntime<S> | null = null;
  private devMode = false;
  private engagement: Engagement | null = null;
  private readonly endedEngagements = new Map<string, AutopilotStatus>();
  private readonly endedFailures = new Map<string, readonly AutosaveFailure[]>();
  /** The Disengagement Autosave being written; every operation waits for it before it starts. */
  private pendingAutosave: Promise<void> = Promise.resolve();
  private selectedPreset: string;
  private readonly presetEdits = new Map<string, Map<string, number>>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  private constructor(env: EngineEnvironment, rules: GameRules<S>, ais: readonly AutopilotAiRunner[]) {
    this.env = env;
    this.rules = rules;
    this.ais = ais;
    this.selectedPreset = rules.defaultPresetId;
  }

  /** Starts a Session at the Main menu: no Current campaign and Dev mode disabled. */
  static async start<S extends ShellState>(
    env: EngineEnvironment,
    rules: GameRules<S>,
    ais: readonly AutopilotAiRunner[],
  ): Promise<EngineCore<S>> {
    const core = new EngineCore(env, rules, ais);
    let text: string | null;
    try {
      text = await env.storage.readGlobalConfiguration();
    } catch {
      text = null;
    }
    core.globalConfiguration.load(text);
    try {
      await core.refreshHeaders();
    } catch {
      // Game storage is unavailable; listing reports it when asked.
    }
    return core;
  }

  // ---------------------------------------------------------------------------------------------
  // Change notification, for adapters

  /** Calls the listener after anything a query could report has changed. Returns a function that stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A number that changes whenever anything a query could report has changed. */
  getRevision(): number {
    return this.revision;
  }

  private changed(): void {
    this.revision += 1;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Serialization and access

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const guarded = async (): Promise<T> => {
      await this.pendingAutosave;
      return operation();
    };
    const run = this.queue.then(guarded, guarded);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private activeEngagement(): Engagement | null {
    return this.engagement !== null && this.engagement.status === 'active' ? this.engagement : null;
  }

  /** Session API: the Session controller only; most operations are unavailable during an Autopilot engagement. */
  private checkSession(
    principal: Principal,
    options: { needsCampaign: boolean; duringAutopilot: boolean },
  ): Result<never> | null {
    if (principal.kind !== 'controller') {
      return fail('unauthorized', 'Session API is unavailable to an Autopilot AI.');
    }
    if (!options.duringAutopilot && this.activeEngagement() !== null) {
      return fail('autopilot_active', 'This operation is unavailable while Autopilot is engaged.');
    }
    if (options.needsCampaign && this.campaign === null) {
      return fail('no_current_campaign', 'There is no Current campaign.');
    }
    return null;
  }

  /** Player API: see the Principal access matrix. */
  private checkPlayer(principal: Principal, mutation: boolean): Result<never> | null {
    if (principal.kind === 'autopilot') {
      const engagement = this.activeEngagement();
      if (engagement === null || engagement.id !== principal.engagementId) {
        return fail('engagement_ended', 'This Autopilot engagement has ended.');
      }
      if (this.budgetExhausted(engagement)) {
        return fail('engagement_ended', 'The Autopilot AI exhausted its execution budget.');
      }
      if (this.campaign === null) {
        return fail('no_current_campaign', 'There is no Current campaign.');
      }
      return null;
    }
    if (this.campaign === null) {
      return fail('no_current_campaign', 'There is no Current campaign.');
    }
    if (mutation && this.activeEngagement() !== null) {
      return fail('autopilot_active', 'Player API actions are unavailable while Autopilot is engaged.');
    }
    return null;
  }

  /**
   * Counts one engine call of the active Autopilot AI against its execution budget. Exhausting the
   * budget disengages Autopilot as AI failed, so that an Autopilot AI cannot repeat invalid actions indefinitely.
   */
  private budgetExhausted(engagement: Engagement): boolean {
    engagement.callsInStep += 1;
    if (engagement.callsInStep <= CALL_BUDGET_PER_STEP) {
      return false;
    }
    void this.endEngagement(engagement, 'aiFailed', 'The Autopilot AI exhausted its execution budget.');
    return true;
  }

  /** Developer API: the Session controller, a Current campaign, Dev mode enabled, and no Autopilot engagement. */
  private checkDeveloper(principal: Principal): Result<never> | null {
    if (principal.kind !== 'controller') {
      return fail('unauthorized', 'Developer API is unavailable to an Autopilot AI.');
    }
    if (this.campaign === null) {
      return fail('no_current_campaign', 'There is no Current campaign.');
    }
    if (this.activeEngagement() !== null) {
      return fail('autopilot_active', 'Developer API is unavailable while Autopilot is engaged.');
    }
    if (!this.devMode) {
      return fail('dev_mode_disabled', 'Developer API is available only while Dev mode is enabled.');
    }
    return null;
  }

  private requireCampaign(): CampaignRuntime<S> {
    if (this.campaign === null) {
      throw new EngineDefect('No Current campaign after the access check');
    }
    return this.campaign;
  }

  private defectResult(error: unknown): Result<never> {
    const message = error instanceof Error ? error.message : String(error);
    return fail('engine_defect', `Engine defect: ${message}`);
  }

  // ---------------------------------------------------------------------------------------------
  // Session status; see LIFE, Session lifecycle

  getStatus(principal: Principal): Result<SessionStatus> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: true });
    if (denied) {
      return denied;
    }
    const campaign = this.campaign;
    const state = campaign === null ? null : currentState(campaign);
    const engagement = this.activeEngagement();
    return ok({
      hasCurrentCampaign: campaign !== null,
      campaignId: campaign?.campaignId ?? null,
      campaignSeed: state?.world.current.seed ?? null,
      turn: state?.world.current.turn ?? null,
      campaignEnded: state === null ? false : this.rules.isEnded(state),
      devMode: this.devMode,
      autopilot:
        engagement === null ? null : { engagementId: engagement.id, autopilotAiId: engagement.ai.id },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Global configuration; see CONFIG, Global configuration

  getGlobalConfiguration(principal: Principal): Result<GlobalConfigurationReport> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: true });
    return denied ?? ok(this.globalConfiguration.report());
  }

  setGlobalSetting(principal: Principal, setting: string, value: unknown): Promise<Result<null>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: true });
      if (denied) {
        return denied;
      }
      const descriptor = this.globalConfiguration.descriptor(setting);
      if (descriptor === null) {
        return fail('invalid_input', `There is no Global configuration setting "${setting}".`);
      }
      if (!descriptor.isPermitted(value)) {
        return fail(
          'invalid_input',
          `${descriptor.name} does not permit that value: ${descriptor.permitted}.`,
        );
      }
      const before = this.globalConfiguration.encode();
      this.globalConfiguration.set(setting, value);
      return this.persistGlobalConfiguration(before);
    });
  }

  resetGlobalSetting(principal: Principal, setting: string): Promise<Result<null>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: true });
      if (denied) {
        return denied;
      }
      if (this.globalConfiguration.descriptor(setting) === null) {
        return fail('invalid_input', `There is no Global configuration setting "${setting}".`);
      }
      const before = this.globalConfiguration.encode();
      this.globalConfiguration.reset(setting);
      return this.persistGlobalConfiguration(before);
    });
  }

  private async persistGlobalConfiguration(before: string): Promise<Result<null>> {
    try {
      await this.env.storage.writeGlobalConfiguration(this.globalConfiguration.encode());
    } catch {
      this.globalConfiguration.load(before);
      return fail('unwritable_campaign_save', 'Global configuration could not be written to Game storage.');
    }
    this.changed();
    return ok(null);
  }

  /** SAVES, Limits: the Autosave limit counts Turn-end Autosaves, the Autopilot Autosave limit Autopilot Autosaves. */
  private autosaveLimit(setting: 'autosaveLimit' | 'autopilotAutosaveLimit'): number {
    const value = this.globalConfiguration.effective(setting);
    return typeof value === 'number' ? value : 5;
  }

  globalSetting(setting: string): SettingValue {
    return this.globalConfiguration.effective(setting);
  }

  // ---------------------------------------------------------------------------------------------
  // New-Campaign setup; see CONFIG, Preset selection and edits

  private preset(id: unknown) {
    return this.rules.presets.find((preset) => preset.id === id) ?? null;
  }

  listPresets(principal: Principal): Result<PresetListEntry[]> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    return ok(
      this.rules.presets.map((preset) => ({
        preset: preset.id,
        name: preset.name,
        isGameBuildDefault: preset.id === this.rules.defaultPresetId,
        isSelected: preset.id === this.selectedPreset,
        hasPresetEdits: (this.presetEdits.get(preset.id)?.size ?? 0) > 0,
      })),
    );
  }

  getPreset(principal: Principal, presetId: string): Result<PresetValueReport[]> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    const preset = this.preset(presetId);
    if (preset === null) {
      return fail('invalid_input', `The Game build supplies no Campaign configuration preset "${presetId}".`);
    }
    const edits = this.presetEdits.get(preset.id);
    return ok(
      this.rules.configurationValues.map((descriptor) => ({
        key: descriptor.key,
        name: descriptor.name,
        presetValue: preset.values[descriptor.key] ?? 0,
        presetEdit: edits?.get(descriptor.key) ?? null,
        permitted: descriptor.permitted,
        adjustableDuringPlay: descriptor.adjustable,
      })),
    );
  }

  private resolveSetup(): SetupReport {
    const preset = this.preset(this.selectedPreset);
    if (preset === null) {
      throw new EngineDefect(`The selected preset ${this.selectedPreset} does not exist`);
    }
    const edits = this.presetEdits.get(preset.id);
    const values: Record<string, number> = {};
    for (const descriptor of this.rules.configurationValues) {
      const value = edits?.get(descriptor.key) ?? preset.values[descriptor.key];
      if (value === undefined) {
        throw new EngineDefect(`Preset ${preset.id} supplies no value for ${descriptor.key}`);
      }
      values[descriptor.key] = value;
    }
    return { preset: preset.id, values };
  }

  getSetup(principal: Principal): Result<SetupReport> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
    return denied ?? ok(this.resolveSetup());
  }

  selectPreset(principal: Principal, presetId: string): Result<null> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    const preset = this.preset(presetId);
    if (preset === null) {
      return fail('invalid_input', `The Game build supplies no Campaign configuration preset "${presetId}".`);
    }
    this.selectedPreset = preset.id;
    this.changed();
    return ok(null);
  }

  setPresetEdit(principal: Principal, presetId: string, edit: { key: string; value: unknown }): Result<null> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    const preset = this.preset(presetId);
    if (preset === null) {
      return fail('invalid_input', `The Game build supplies no Campaign configuration preset "${presetId}".`);
    }
    const descriptor = this.rules.configurationValues.find((item) => item.key === edit.key);
    if (descriptor === undefined) {
      return fail('invalid_input', `There is no Campaign configuration value "${edit.key}".`);
    }
    if (!descriptor.isPermitted(edit.value)) {
      return fail('invalid_input', `${descriptor.name} does not permit that value: ${descriptor.permitted}.`);
    }
    let edits = this.presetEdits.get(preset.id);
    if (edits === undefined) {
      edits = new Map();
      this.presetEdits.set(preset.id, edits);
    }
    edits.set(descriptor.key, edit.value);
    this.changed();
    return ok(null);
  }

  removePresetEdit(principal: Principal, presetId: string, key: string): Result<null> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    const preset = this.preset(presetId);
    if (preset === null) {
      return fail('invalid_input', `The Game build supplies no Campaign configuration preset "${presetId}".`);
    }
    if (!this.rules.configurationValues.some((item) => item.key === key)) {
      return fail('invalid_input', `There is no Campaign configuration value "${key}".`);
    }
    this.presetEdits.get(preset.id)?.delete(key);
    this.changed();
    return ok(null);
  }

  // ---------------------------------------------------------------------------------------------
  // Changing Campaign configuration during play; see CONFIG, Changing Campaign configuration during play

  /**
   * `session.campaignConfiguration.set(values)`: validates the whole request first, so an invalid one changes nothing.
   * It is not a Player action: it adds no Timeline entry and moves no Timeline pointer, and the change stays in force
   * through undo, redo, and Autosave navigation until the next change or a load.
   */
  setCampaignConfiguration(principal: Principal, values: unknown): Promise<Result<null>> {
    return this.runExclusive(async () => {
      const checked = this.checkCampaignConfiguration(principal, values);
      if (!checked.ok) {
        return checked;
      }
      const campaign = this.requireCampaign();
      const changed = checked.value.filter(([key, value]) => campaign.configuration[key] !== value);
      if (changed.length === 0) {
        return ok(null);
      }
      campaign.configuration = { ...campaign.configuration, ...Object.fromEntries(changed) };
      const failures: AutosaveFailure[] = [];
      await this.writeCurrentAutosave(failures);
      this.changed();
      return ok(null, failures);
    });
  }

  /** The requested values, or why the request is invalid; nothing is changed either way. */
  private checkCampaignConfiguration(principal: Principal, values: unknown): Result<[string, number][]> {
    const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      return fail('invalid_input', 'A change of Campaign configuration names values by their keys.');
    }
    const requested: [string, number][] = [];
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      const descriptor = this.rules.configurationValues.find((item) => item.key === key);
      if (descriptor === undefined) {
        return fail('invalid_input', `There is no Campaign configuration value "${key}".`);
      }
      if (!descriptor.adjustable) {
        return fail('invalid_input', `${descriptor.name} is fixed after Campaign creation.`);
      }
      if (!descriptor.isPermitted(value)) {
        return fail(
          'invalid_input',
          `${descriptor.name} does not permit that value: ${descriptor.permitted}.`,
        );
      }
      requested.push([key, value]);
    }
    return ok(requested);
  }

  /** The Current world state under the Campaign configuration in force, which the Game rules read. */
  private present(campaign: CampaignRuntime<S>): S {
    return this.rules.withConfiguration(currentState(campaign), campaign.configuration);
  }

  // ---------------------------------------------------------------------------------------------
  // Campaign selection; see LIFE, Campaign selection

  createCampaign(principal: Principal, options: { seed?: unknown } = {}): Promise<Result<null>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      let seed: string;
      if (options.seed === undefined || options.seed === null) {
        seed = seedFromNumbers(this.env.randomNumbers(CHOSEN_SEED_LENGTH));
      } else if (isPermittedSeed(options.seed)) {
        seed = options.seed;
      } else {
        return fail(
          'invalid_input',
          'A Campaign seed is 1 to 64 printable ASCII characters, i.e. characters from the space to the tilde.',
        );
      }
      let state: S;
      try {
        state = this.rules.createCampaign({ configuration: this.resolveSetup().values, seed });
        const violations = this.rules.checkInvariants(state);
        if (violations.length > 0) {
          throw new EngineDefect(violations.join('; '));
        }
      } catch (error) {
        return this.defectResult(error);
      }
      this.campaign = newCampaignRuntime(this.env.newId(), state, this.env.newId());
      this.devMode = false;
      this.presetEdits.clear();
      this.selectedPreset = this.rules.defaultPresetId;
      const failures: AutosaveFailure[] = [];
      await this.writeCurrentAutosave(failures);
      this.changed();
      return ok(null, failures);
    });
  }

  closeCampaign(principal: Principal): Promise<Result<null>> {
    return this.runExclusive(() => {
      const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: false });
      if (denied) {
        return Promise.resolve(denied);
      }
      this.campaign = null;
      this.devMode = false;
      this.changed();
      return Promise.resolve(ok(null));
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Saves; see SAVES

  private async refreshHeaders(): Promise<void> {
    const headers = await this.env.storage.listSaveHeaders();
    this.headers = new Map(headers.map((header) => [header.saveId, header]));
  }

  listSaves(principal: Principal): Promise<Result<SaveListEntry[]>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      try {
        await this.refreshHeaders();
      } catch {
        return fail(
          'unreadable_campaign_save',
          'Game storage is unavailable, so Campaign saves cannot be listed.',
        );
      }
      const entries = [...this.headers.values()].map((header) => ({
        saveId: header.saveId,
        campaignId: header.campaignId,
        isAutosave: header.kind !== 'manual',
        autosaveKind: autosaveKindOf(header.kind),
        turn: header.turn,
        // A header written before the count was kept reports none; such a Campaign save is of an earlier Game build.
        actions: header.actions ?? 0,
        writtenAt: header.writtenAt,
      }));
      entries.sort((a, b) =>
        a.campaignId === b.campaignId
          ? a.turn - b.turn || a.saveId.localeCompare(b.saveId)
          : a.campaignId.localeCompare(b.campaignId),
      );
      return ok(entries);
    });
  }

  /** SAVES, Deleting Campaign saves: one Campaign save, whatever its kind. */
  deleteSaveById(principal: Principal, saveId: string): Promise<Result<null>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      if (typeof saveId !== 'string') {
        return fail('invalid_input', 'A Campaign save is named by its Campaign save ID.');
      }
      return this.deleteSaves((header) => header.saveId === saveId, `Campaign save ${saveId}`);
    });
  }

  /** SAVES, Deleting Campaign saves: every Campaign save of one Campaign, including its Autosaves. */
  deleteCampaignSaves(principal: Principal, campaignId: string): Promise<Result<null>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      if (typeof campaignId !== 'string') {
        return fail('invalid_input', 'A Campaign is named by its Campaign ID.');
      }
      return this.deleteSaves((header) => header.campaignId === campaignId, `Campaign ${campaignId}`);
    });
  }

  /**
   * Deletes the matching Campaign saves, or none: each body is read first, and a deletion that Game storage refuses
   * writes back the Campaign saves already deleted, so a failed delete deletes no Campaign save.
   */
  private async deleteSaves(matches: (header: SaveHeader) => boolean, name: string): Promise<Result<null>> {
    try {
      await this.refreshHeaders();
    } catch {
      return fail('undeletable_campaign_save', `Could not delete ${name}: Game storage is unavailable.`);
    }
    const targets = [...this.headers.values()].filter(matches);
    if (targets.length === 0) {
      return fail('unknown_campaign_save', `Could not delete ${name}: it does not exist.`);
    }
    if (this.campaign !== null && targets.some((header) => header.campaignId === this.campaign?.campaignId)) {
      return fail(
        'current_campaign',
        `Could not delete ${name}: it belongs to the Current campaign; close it first.`,
      );
    }
    const bodies: { header: SaveHeader; body: string | null }[] = [];
    try {
      for (const header of targets) {
        bodies.push({ header, body: await this.env.storage.readSave(header.saveId) });
      }
    } catch {
      return fail('undeletable_campaign_save', `Could not delete ${name}: Game storage is unavailable.`);
    }
    const deleted: { header: SaveHeader; body: string | null }[] = [];
    for (const target of bodies) {
      try {
        await this.env.storage.deleteSave(target.header.saveId);
        deleted.push(target);
      } catch {
        for (const restored of deleted) {
          if (restored.body !== null) {
            await this.env.storage.writeSave(restored.header, restored.body).catch(() => undefined);
          }
        }
        return fail(
          'undeletable_campaign_save',
          `Could not delete ${name}: Game storage refused the deletion.`,
        );
      }
    }
    for (const header of targets) {
      this.headers.delete(header.saveId);
      this.lineCache.delete(header.saveId);
    }
    this.changed();
    return ok(null);
  }

  private headerFor(campaign: CampaignRuntime<S>, saveId: string, kind: SaveKind): SaveHeader {
    return {
      saveId,
      campaignId: campaign.campaignId,
      kind,
      turn: currentState(campaign).world.current.turn,
      // The Timeline entries before the position are the Turn's actions that are not Undone; only Player actions count.
      actions: campaign.entries.slice(0, campaign.position).filter((entry) => entry.surface === 'player')
        .length,
      gameBuild: this.rules.gameBuild,
      stamp: currentStamp(campaign),
      writtenAt: new Date(this.env.now?.() ?? Date.now()).toISOString(),
    };
  }

  /** Writes one Campaign save, or returns the Save reason. */
  private async writeSave(
    header: SaveHeader,
    saved: SavedCampaign<S>,
  ): Promise<{ code: 'save_size_limit_exceeded' | 'unwritable_campaign_save'; message: string } | null> {
    const body = encodeSave(header, saved);
    const limit = this.env.saveSizeLimitBytes ?? SAVE_SIZE_LIMIT_BYTES;
    // A UTF-16 code unit takes at most 3 bytes in UTF-8, so only a text longer than a third of the limit needs counting.
    if (body.length * 3 > limit && utf8ByteLength(body) > limit) {
      return {
        code: 'save_size_limit_exceeded',
        message: `Could not write ${describeSave(header)}: it would exceed the Save size limit.`,
      };
    }
    try {
      await this.env.storage.writeSave(header, body);
    } catch {
      return {
        code: 'unwritable_campaign_save',
        message: `Could not write ${describeSave(header)}: Game storage refused the write.`,
      };
    }
    this.headers.set(header.saveId, header);
    this.lineCache.delete(header.saveId);
    return null;
  }

  private async deleteSave(saveId: string): Promise<void> {
    this.headers.delete(saveId);
    this.lineCache.delete(saveId);
    try {
      await this.env.storage.deleteSave(saveId);
    } catch {
      // A Campaign save that cannot be removed stays in Game storage; nothing depends on its removal.
    }
  }

  private autosaveId(campaignId: string, kind: Exclude<SaveKind, 'manual'>, turn: number): string {
    switch (kind) {
      case 'currentAutosave':
        return `${campaignId}.current`;
      // SAVES, Autosaves, One Autosave for each Turn end: a Turn-end Autosave and an Autopilot Autosave of one Turn
      // share one Campaign save ID, so writing either replaces the other.
      case 'turnEndAutosave':
      case 'autopilotAutosave':
        return `${campaignId}.turn-end.${turn}`;
      case 'engagementAutosave':
        return `${campaignId}.engagement`;
      case 'disengagementAutosave':
        return `${campaignId}.disengagement`;
      case 'furthestProgressAutosave':
        return `${campaignId}.furthest-progress`;
    }
  }

  /**
   * Writes an Autosave. When it cannot be written, the Autosave it would have replaced is removed and the failure
   * is reported in the result of the operation that caused it; see SAVES, Autosaves.
   */
  private async writeAutosave(
    kind:
      | 'currentAutosave'
      | 'turnEndAutosave'
      | 'autopilotAutosave'
      | 'engagementAutosave'
      | 'disengagementAutosave',
    header: SaveHeader,
    saved: SavedCampaign<S>,
    failures: AutosaveFailure[],
  ): Promise<void> {
    const failure = await this.writeSave(header, saved);
    if (failure !== null) {
      await this.deleteSave(header.saveId);
      const autosave = autosaveKindOf(kind);
      if (autosave === null || autosave === 'furthestProgress') {
        throw new EngineDefect(`${kind} is not an Autosave written under SAVES, Autosaves`);
      }
      failures.push({
        autosave,
        code: failure.code,
        message: failure.message,
      });
    }
  }

  private async writeCurrentAutosave(failures: AutosaveFailure[]): Promise<void> {
    const campaign = this.requireCampaign();
    const turn = currentState(campaign).world.current.turn;
    const header = this.headerFor(
      campaign,
      this.autosaveId(campaign.campaignId, 'currentAutosave', turn),
      'currentAutosave',
    );
    await this.writeAutosave('currentAutosave', header, toSaved(campaign), failures);
  }

  /** Removes the Autosaves of abandoned play before a new action commits; see TIMELINE, Autosave navigation. */
  private async removeAbandonedAutosaves(campaign: CampaignRuntime<S>): Promise<void> {
    const ancestors = new Set(ancestorStamps(campaign));
    for (const header of [...this.headers.values()]) {
      if (
        header.campaignId === campaign.campaignId &&
        header.kind !== 'manual' &&
        !ancestors.has(header.stamp)
      ) {
        await this.deleteSave(header.saveId);
      }
    }
  }

  /**
   * SAVES, Saving: writes a new Campaign save, or replaces the Campaign save written by `save()` that holds an equal
   * place in play.
   */
  save(principal: Principal): Promise<Result<{ saveId: string }>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      const campaign = this.requireCampaign();
      const saveId = (await this.equalSave(campaign)) ?? this.env.newId();
      const failure = await this.writeSave(this.headerFor(campaign, saveId, 'manual'), toSaved(campaign));
      if (failure !== null) {
        return fail(failure.code, failure.message);
      }
      this.changed();
      return ok({ saveId });
    });
  }

  /**
   * The Campaign save that `save()` wrote of this Campaign and that holds an equal place in play, if any: an equal
   * saved World state, History, and Turn report; see SAVES, Saving. Equal World states belong to the same
   * Turn, so only Campaign saves of the current Turn are compared. A Campaign save holding the very same Committed
   * state, i.e. the same stamp, is equal without reading it; any other is read and compared value by value. A
   * Campaign save that cannot be read or loaded is not equal.
   */
  private async equalSave(campaign: CampaignRuntime<S>): Promise<string | null> {
    try {
      await this.refreshHeaders();
    } catch {
      // Compare with the Campaign saves already known.
    }
    const state = currentState(campaign);
    const here = currentStamp(campaign);
    const candidates = [...this.headers.values()]
      .filter(
        (header) =>
          header.kind === 'manual' &&
          header.campaignId === campaign.campaignId &&
          header.gameBuild === this.rules.gameBuild &&
          header.turn === state.world.current.turn,
      )
      .sort(
        (a, b) => Number(b.stamp === here) - Number(a.stamp === here) || a.saveId.localeCompare(b.saveId),
      );
    for (const header of candidates) {
      if (header.stamp === here) {
        return header.saveId;
      }
      const loaded = await this.readCampaign(header.saveId);
      if (
        !('ok' in loaded) &&
        deepEqual(
          asStored(this.rules.placeInPlay(currentState(loaded.campaign))),
          asStored(this.rules.placeInPlay(state)),
        )
      ) {
        return header.saveId;
      }
    }
    return null;
  }

  /** Reads and rebuilds the Campaign a Campaign save holds, or gives the Load reason. */
  private async readCampaign(saveId: string): Promise<{ campaign: CampaignRuntime<S> } | Result<never>> {
    const known = this.headers.get(saveId);
    const name = known ? describeSave(known) : `Campaign save ${saveId}`;
    let body: string | null;
    try {
      body = await this.env.storage.readSave(saveId);
    } catch {
      return fail('unreadable_campaign_save', `Could not read ${name}: Game storage is unavailable.`);
    }
    if (body === null) {
      return fail('unreadable_campaign_save', `Could not read ${name}: it no longer exists.`);
    }
    const decoded = decodeSave(body, this.rules.gameBuild, (value): value is S =>
      this.rules.isCampaignState(value),
    );
    if (decoded === 'incompatible_game_build') {
      return fail('incompatible_game_build', `Could not load ${name}: a different Game build wrote it.`);
    }
    // A body stored under another Campaign save ID is not the Campaign save that was asked for.
    if (decoded === 'corrupt_campaign_save' || decoded.saveId !== saveId) {
      return fail(
        'corrupt_campaign_save',
        `Could not load ${name}: its contents are not a valid Campaign save.`,
      );
    }
    try {
      const campaign = fromSaved(decoded.campaignId, decoded.saved, this.rules);
      if (isRejection(campaign)) {
        return fail(
          'corrupt_campaign_save',
          `Could not load ${name}: its contents are not a valid Campaign save.`,
        );
      }
      for (const state of campaign.states) {
        if (this.rules.checkInvariants(state).length > 0) {
          return fail(
            'corrupt_campaign_save',
            `Could not load ${name}: its contents are not a valid Campaign save.`,
          );
        }
      }
      return { campaign };
    } catch {
      return fail(
        'corrupt_campaign_save',
        `Could not load ${name}: its contents are not a valid Campaign save.`,
      );
    }
  }

  load(principal: Principal, saveId: string): Promise<Result<null>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      if (typeof saveId !== 'string') {
        return fail('invalid_input', 'A Campaign save is named by its Campaign save ID.');
      }
      const loaded = await this.readCampaign(saveId);
      if ('ok' in loaded) {
        return loaded;
      }
      this.campaign = loaded.campaign;
      this.devMode = false;
      const failures: AutosaveFailure[] = [];
      await this.writeCurrentAutosave(failures);
      this.changed();
      return ok(null, failures);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Timeline: Action navigation; see TIMELINE, Action navigation

  getTimelineStatus(principal: Principal): Result<TimelineStatus> {
    const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: true });
    if (denied) {
      return denied;
    }
    const campaign = this.requireCampaign();
    const active = this.activeEngagement() !== null;
    return ok({
      timelineEntries: campaign.entries.length,
      undoneActions: undoneCount(campaign),
      canUndoAction: !active && campaign.position > 0,
      canRedoAction: !active && undoneCount(campaign) > 0,
    });
  }

  private navigate(
    principal: Principal,
    target: (campaign: CampaignRuntime<S>) => number,
  ): Promise<Result<null>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      const campaign = this.requireCampaign();
      const position = target(campaign);
      if (position === campaign.position || position < 0 || position > campaign.entries.length) {
        return fail('no_target', 'This navigation operation has no target.');
      }
      campaign.position = position;
      const failures: AutosaveFailure[] = [];
      await this.writeCurrentAutosave(failures);
      this.changed();
      return ok(null, failures);
    });
  }

  undoAction(principal: Principal): Promise<Result<null>> {
    return this.navigate(principal, (campaign) => campaign.position - 1);
  }

  redoAction(principal: Principal): Promise<Result<null>> {
    return this.navigate(principal, (campaign) => campaign.position + 1);
  }

  undoAllActions(principal: Principal): Promise<Result<null>> {
    return this.navigate(principal, () => 0);
  }

  redoAllActions(principal: Principal): Promise<Result<null>> {
    return this.navigate(principal, (campaign) => campaign.entries.length);
  }

  // ---------------------------------------------------------------------------------------------
  // Timeline: Autosave navigation; see TIMELINE, Autosave navigation

  private async lineOf(header: SaveHeader): Promise<string[] | null> {
    const cached = this.lineCache.get(header.saveId);
    if (cached?.stamp === header.stamp) {
      return cached.line;
    }
    let body: string | null;
    try {
      body = await this.env.storage.readSave(header.saveId);
    } catch {
      return null;
    }
    const line = body === null ? null : lineOfSave(body);
    if (line !== null) {
      this.lineCache.set(header.saveId, { stamp: header.stamp, line });
    }
    return line;
  }

  private async autosaveTargets(campaign: CampaignRuntime<S>): Promise<{
    earlier: SaveHeader | null;
    later: SaveHeader | null;
    laterReturn: boolean;
    undoCrossesEngagement: boolean;
    redoCrossesEngagement: boolean;
  }> {
    const ancestors = ancestorStamps(campaign);
    const here = currentStamp(campaign);
    let earlier: SaveHeader | null = null;
    let earlierIndex = -1;
    let later: SaveHeader | null = null;
    let laterLength = Number.POSITIVE_INFINITY;
    let laterReturn = false;
    /** The World states that the Engagement Autosaves of the Campaign hold. */
    const engaged = new Set<string>();
    for (const header of this.headers.values()) {
      if (header.campaignId === campaign.campaignId && header.kind === 'engagementAutosave') {
        engaged.add(header.stamp);
      }
      if (
        header.campaignId !== campaign.campaignId ||
        header.kind === 'manual' ||
        header.kind === 'currentAutosave' ||
        header.stamp === here
      ) {
        continue;
      }
      const index = ancestors.lastIndexOf(header.stamp);
      if (index >= 0) {
        // Of two targets holding the same World state, the Furthest progress Autosave is loaded; see TIMELINE, Autosave
        // navigation, Equal targets.
        if (index > earlierIndex || (index === earlierIndex && header.kind === 'furthestProgressAutosave')) {
          earlier = header;
          earlierIndex = index;
        }
        continue;
      }
      const line = await this.lineOf(header);
      if (line !== null && line.includes(here)) {
        if (header.kind === 'furthestProgressAutosave') {
          laterReturn = true;
        }
        // Of two targets holding the same World state, the Furthest progress Autosave is loaded; see TIMELINE, Autosave
        // navigation, Equal targets.
        if (
          line.length < laterLength ||
          (line.length === laterLength && header.kind === 'furthestProgressAutosave')
        ) {
          later = header;
          laterLength = line.length;
        }
      }
    }
    // TIMELINE, Autosave navigation, Crossing an Autopilot engagement: `undoToAutosave()` crosses one when it loads
    // the World state the Engagement Autosave holds, and `redoToAutosave()` when that is the Current world state.
    return {
      earlier,
      later,
      laterReturn,
      undoCrossesEngagement: earlier !== null && engaged.has(earlier.stamp),
      redoCrossesEngagement: later !== null && engaged.has(here),
    };
  }

  private toTarget(header: SaveHeader | null, crossesAutopilotEngagement: boolean): AutosaveTarget | null {
    if (header === null) {
      return null;
    }
    const kind = autosaveKindOf(header.kind);
    if (kind === null || kind === 'current') {
      return null;
    }
    return { saveId: header.saveId, autosaveKind: kind, turn: header.turn, crossesAutopilotEngagement };
  }

  getAutosaveStatus(principal: Principal): Promise<Result<AutosaveStatus>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: true });
      if (denied) {
        return denied;
      }
      if (this.activeEngagement() !== null) {
        return ok({ undoToAutosave: null, redoToAutosave: null });
      }
      const targets = await this.autosaveTargets(this.requireCampaign());
      return ok({
        undoToAutosave: this.toTarget(targets.earlier, targets.undoCrossesEngagement),
        redoToAutosave: this.toTarget(targets.later, targets.redoCrossesEngagement),
      });
    });
  }

  undoToAutosave(principal: Principal): Promise<Result<AutosaveTarget>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      const campaign = this.requireCampaign();
      const targets = await this.autosaveTargets(campaign);
      const target = this.toTarget(targets.earlier, targets.undoCrossesEngagement);
      if (targets.earlier === null || target === null) {
        return fail('no_target', 'There is no earlier Autosave to go back to.');
      }
      if (!targets.laterReturn) {
        const turn = currentState(campaign).world.current.turn;
        const header = this.headerFor(
          campaign,
          this.autosaveId(campaign.campaignId, 'furthestProgressAutosave', turn),
          'furthestProgressAutosave',
        );
        const failure = await this.writeSave(header, toSaved(campaign));
        if (failure !== null) {
          return fail(failure.code, failure.message);
        }
      }
      const loaded = await this.readCampaign(targets.earlier.saveId);
      if ('ok' in loaded) {
        return loaded;
      }
      // TIMELINE, Autosave navigation, Loading a target: the Campaign configuration of the Session takes precedence.
      loaded.campaign.configuration = campaign.configuration;
      this.campaign = loaded.campaign;
      const failures: AutosaveFailure[] = [];
      await this.writeCurrentAutosave(failures);
      this.changed();
      return ok(target, failures);
    });
  }

  redoToAutosave(principal: Principal): Promise<Result<AutosaveTarget>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      const campaign = this.requireCampaign();
      const targets = await this.autosaveTargets(campaign);
      const target = this.toTarget(targets.later, targets.redoCrossesEngagement);
      if (targets.later === null || target === null) {
        return fail('no_target', 'There is no later Autosave to go forward to.');
      }
      const loaded = await this.readCampaign(targets.later.saveId);
      if ('ok' in loaded) {
        return loaded;
      }
      // TIMELINE, Autosave navigation, Loading a target: the Campaign configuration of the Session takes precedence.
      loaded.campaign.configuration = campaign.configuration;
      this.campaign = loaded.campaign;
      if (targets.later.kind === 'furthestProgressAutosave') {
        await this.deleteSave(targets.later.saveId);
      }
      const failures: AutosaveFailure[] = [];
      await this.writeCurrentAutosave(failures);
      this.changed();
      return ok(target, failures);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Dev mode; see DEV, Dev mode

  enableDevMode(principal: Principal): Result<null> {
    const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    this.devMode = true;
    this.changed();
    return ok(null);
  }

  disableDevMode(principal: Principal): Result<null> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    this.devMode = false;
    this.changed();
    return ok(null);
  }

  // ---------------------------------------------------------------------------------------------
  // Player API and Developer API

  playerQuery(principal: Principal, query: string, args: unknown = null): Result<unknown> {
    const denied = this.checkPlayer(principal, false);
    if (denied) {
      return denied;
    }
    const state = this.present(this.requireCampaign());
    try {
      switch (query) {
        case 'currentLiveWorldState':
          return ok(this.rules.currentLiveWorldStateView(state));
        case 'currentRetiredWorldState':
          return ok(this.rules.currentRetiredWorldStateView(state));
        case 'campaignConfiguration':
          return ok(this.rules.campaignConfigurationView(state));
        case 'turnReport':
          return ok(this.rules.turnReportView(state));
        case 'history':
          return ok(this.rules.historyView(state));
        case 'availableActions':
          return ok(this.rules.availableActionsView(state));
        default:
          if (this.rules.extraPlayerQuery === undefined) {
            return fail('invalid_input', 'There is no such query.');
          }
          {
            const value = this.rules.extraPlayerQuery(state, query, args);
            // A query whose input breaks a precondition is rejected, as an action is; e.g. a non-Serving Agent.
            return isRejection(value) ? fail(value.code, value.message, value.reason) : ok(value);
          }
      }
    } catch (error) {
      return this.defectResult(error);
    }
  }

  /**
   * DEV, Developer tools: a `developer.tools` operation the rules supply, e.g. `fightCombat`. It has the access of
   * Developer API, reads the Current world state, and changes no Campaign state: no Timeline entry, no autosave, and
   * no random outcome of the Current campaign.
   */
  /**
   * COMBAT, Detached Combat without a Current campaign: a `session.combatSimulator` operation, available to the
   * Session controller with or without a Current campaign and whatever the Dev mode setting is.
   */
  combatSimulatorTool(principal: Principal, tool: string, args: unknown): Result<unknown> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: true });
    if (denied) {
      return denied;
    }
    if (this.rules.combatSimulatorTool === undefined) {
      return fail('invalid_input', 'There is no such operation.');
    }
    try {
      const value = this.rules.combatSimulatorTool(tool, detach(args));
      return isRejection(value) ? fail(value.code, value.message, value.reason) : ok(value);
    } catch (error) {
      return this.defectResult(error);
    }
  }

  developerTool(principal: Principal, tool: string, args: unknown): Result<unknown> {
    const denied = this.checkDeveloper(principal);
    if (denied) {
      return denied;
    }
    if (this.rules.developerTool === undefined) {
      return fail('invalid_input', 'There is no such tool.');
    }
    const state = this.present(this.requireCampaign());
    try {
      const value = this.rules.developerTool(state, tool, detach(args));
      return isRejection(value) ? fail(value.code, value.message, value.reason) : ok(value);
    } catch (error) {
      return this.defectResult(error);
    }
  }

  /**
   * A `developer.queries` operation: `getCampaignState()` by default, otherwise the named one the rules supply, e.g.
   * `initiativeOperationLevels`, which reads the Game build of the Current campaign and no Campaign state, or
   * `revealedCompendium`, which reads the Current world state.
   */
  developerQuery(principal: Principal, query = 'campaignState'): Result<unknown> {
    const denied = this.checkDeveloper(principal);
    if (denied) {
      return denied;
    }
    try {
      if (query !== 'campaignState') {
        if (this.rules.extraDeveloperQuery === undefined) {
          return fail('invalid_input', 'There is no such query.');
        }
        return ok(this.rules.extraDeveloperQuery(this.present(this.requireCampaign()), query));
      }
      const campaign = this.requireCampaign();
      return ok(
        this.rules.inspect({
          states: campaign.states,
          entries: campaign.entries,
          position: campaign.position,
          configuration: campaign.configuration,
        }),
      );
    } catch (error) {
      return this.defectResult(error);
    }
  }

  /**
   * PAPI, Action preview: whether the engine would accept this `player.actions` operation from this Principal in the
   * Current world state, and the rejection it would give otherwise. It tries the action on the present state, keeps
   * nothing, and is not a Player action, so it agrees with making the action at once.
   */
  previewAction(
    principal: Principal,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Result<{
    readonly available: boolean;
    readonly reason: string | null;
    readonly message: string | null;
  }> {
    const queryDenied = this.checkPlayer(principal, false);
    if (queryDenied) {
      return queryDenied;
    }
    const denied = this.checkPlayer(principal, true);
    if (denied && !denied.ok) {
      return ok({
        available: false,
        reason: denied.error.reason ?? denied.error.code,
        message: denied.error.message,
      });
    }
    const state = this.present(this.requireCampaign());
    try {
      const next =
        name === 'advanceTurn'
          ? this.rules.advanceTurn(state)
          : this.rules.applyAction(state, { surface: 'player', name, args: detach(args) });
      return ok(
        isRejection(next)
          ? { available: false, reason: next.reason, message: next.message }
          : { available: true, reason: null, message: null },
      );
    } catch (error) {
      return this.defectResult(error);
    }
  }

  /** Commits one Player API or Developer API action other than Advance turn as one Timeline entry. */
  commitAction(principal: Principal, record: ActionRecord): Promise<Result<CommitOutcome>> {
    return this.runExclusive(async () => {
      const denied =
        record.surface === 'player' ? this.checkPlayer(principal, true) : this.checkDeveloper(principal);
      if (denied) {
        return denied;
      }
      const campaign = this.requireCampaign();
      const state = this.present(campaign);
      // The Campaign configuration is kept with the Timeline entry when a change made it differ; see SCHEMA, Replay.
      const entry: ActionRecord = {
        surface: record.surface,
        name: record.name,
        args: detach(record.args),
        ...(state === currentState(campaign) ? {} : { configuration: campaign.configuration }),
      };
      let next: S | Rejection;
      try {
        next = this.rules.applyAction(state, entry);
        if (!isRejection(next) && next !== state) {
          const violations = this.rules.checkInvariants(next);
          if (violations.length > 0) {
            throw new EngineDefect(violations.join('; '));
          }
        }
      } catch (error) {
        return this.defectResult(error);
      }
      if (isRejection(next)) {
        return fail(next.code, next.message, next.reason);
      }
      // PAPI, Action results: a Player API action returns what it changed; an action with no effect changed nothing.
      const changes = (after: S) =>
        record.surface === 'player' ? { changes: this.rules.worldStateChanges(state, after) } : {};
      if (next === state) {
        return ok({ committed: false, ...changes(state) });
      }
      await this.removeAbandonedAutosaves(campaign);
      commitEntry(campaign, entry, next, this.env.newId());
      const failures: AutosaveFailure[] = [];
      await this.writeCurrentAutosave(failures);
      await this.afterCommit(principal, false, failures);
      this.changed();
      return ok({ committed: true, ...changes(next) }, failures);
    });
  }

  /** Commits Advance turn: one Player action that the Timeline does not record. */
  advanceTurn(principal: Principal): Promise<Result<CommitOutcome>> {
    return this.runExclusive(async () => {
      const denied = this.checkPlayer(principal, true);
      if (denied) {
        return denied;
      }
      const campaign = this.requireCampaign();
      const state = this.present(campaign);
      let next: S | Rejection;
      try {
        next = this.rules.advanceTurn(state);
        if (!isRejection(next)) {
          const violations = this.rules.checkInvariants(next);
          if (violations.length > 0) {
            throw new EngineDefect(violations.join('; '));
          }
        }
      } catch (error) {
        return this.defectResult(error);
      }
      if (isRejection(next)) {
        return fail(next.code, next.message, next.reason);
      }
      // AUTO, Autopilot limits: under `singleAction` and `turnActions` the engine withholds an Advance turn that it
      // would commit, changes nothing, and ends the Autopilot engagement with the reason Advance turn withheld.
      const engagement = this.activeEngagement();
      if (
        principal.kind === 'autopilot' &&
        engagement !== null &&
        (engagement.limit.kind === 'singleAction' || engagement.limit.kind === 'turnActions')
      ) {
        await this.endEngagement(engagement, 'advanceTurnWithheld');
        return ok({ committed: false, withheld: true }, [...engagement.disengagementFailures]);
      }
      await this.removeAbandonedAutosaves(campaign);
      const endedTurn = state.world.current.turn;
      // SAVES, Autosaves, Autopilot engagements: a Turn an Autopilot AI ends gets an Autopilot Autosave instead of a
      // Turn-end Autosave, so the Turns it plays never displace those the player played.
      const kind = this.activeEngagement() === null ? 'turnEndAutosave' : 'autopilotAutosave';
      const turnEndHeader = this.headerFor(
        campaign,
        this.autosaveId(campaign.campaignId, kind, endedTurn),
        kind,
      );
      // The Autosave holds the Timeline as it is at the Turn-end state, including its Undone actions.
      const turnEnd = toSaved(campaign);
      campaign.entries.length = campaign.position;
      campaign.states.length = campaign.position + 1;
      campaign.stamps.length = campaign.position + 1;
      commitAdvanceTurn(campaign, next, this.env.newId());
      const failures: AutosaveFailure[] = [];
      if (this.autosaveLimit(limitSettingOf(kind)) > 0) {
        await this.writeAutosave(kind, turnEndHeader, turnEnd, failures);
      }
      await this.pruneTurnEndAutosaves(campaign.campaignId, kind);
      await this.writeCurrentAutosave(failures);
      await this.afterCommit(principal, true, failures);
      this.changed();
      return ok({ committed: true }, failures);
    });
  }

  /**
   * SAVES, Autosaves: removes the Autosaves of one kind, earliest Turn first, until no more remain than its limit; the
   * Autosave limit counts only Turn-end Autosaves and the Autopilot Autosave limit only Autopilot Autosaves.
   */
  private async pruneTurnEndAutosaves(
    campaignId: string,
    kind: 'turnEndAutosave' | 'autopilotAutosave',
  ): Promise<void> {
    const turnEnds = [...this.headers.values()]
      .filter((header) => header.campaignId === campaignId && header.kind === kind)
      .sort((a, b) => a.turn - b.turn);
    const limit = this.autosaveLimit(limitSettingOf(kind));
    while (turnEnds.length > limit) {
      const earliest = turnEnds.shift();
      if (earliest) {
        await this.deleteSave(earliest.saveId);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Autopilot; see AUTO

  listAutopilotAis(principal: Principal): Result<{ autopilotAiId: string; name: string }[]> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: false });
    if (denied) {
      return denied;
    }
    return ok(this.ais.map((ai) => ({ autopilotAiId: ai.id, name: ai.name })));
  }

  private parseLimit(limit: unknown): AutopilotLimit | null {
    if (typeof limit !== 'object' || limit === null) {
      return null;
    }
    const { kind, count } = limit as { kind?: unknown; count?: unknown };
    if (kind === 'singleAction' || kind === 'turnActions') {
      return count === undefined ? { kind } : null;
    }
    if (
      kind === 'turnAdvancements' &&
      typeof count === 'number' &&
      Number.isSafeInteger(count) &&
      count > 0
    ) {
      return { kind, count };
    }
    return null;
  }

  engage(
    principal: Principal,
    autopilotAiId: string,
    limit: unknown,
  ): Promise<Result<{ engagementId: string }>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: true, duringAutopilot: false });
      if (denied) {
        return denied;
      }
      const parsed = this.parseLimit(limit);
      if (parsed === null) {
        return fail('invalid_input', 'That is not an Autopilot limit.');
      }
      const ai = this.ais.find((item) => item.id === autopilotAiId);
      if (ai === undefined) {
        return fail('invalid_input', 'That Autopilot AI is not available.');
      }
      const campaign = this.requireCampaign();
      const failures: AutosaveFailure[] = [];
      const turn = currentState(campaign).world.current.turn;
      const header = this.headerFor(
        campaign,
        this.autosaveId(campaign.campaignId, 'engagementAutosave', turn),
        'engagementAutosave',
      );
      await this.writeAutosave('engagementAutosave', header, toSaved(campaign), failures);
      await this.writeCurrentAutosave(failures);
      let resolveDone: (result: DisengagementResult) => void = () => undefined;
      const done = new Promise<DisengagementResult>((resolve) => {
        resolveDone = resolve;
      });
      const engagement: Engagement = {
        id: this.env.newId(),
        ai,
        limit: parsed,
        playerActions: 0,
        turnAdvancements: 0,
        actionsThisTurn: 0,
        status: 'active',
        result: null,
        disengagementFailures: [],
        callsInStep: 0,
        resolveDone,
        done,
      };
      this.engagement = engagement;
      this.changed();
      void this.runEngagement(engagement);
      return ok({ engagementId: engagement.id }, failures);
    });
  }

  private statusOf(engagement: Engagement): AutopilotStatus {
    return {
      engagementId: engagement.id,
      autopilotAiId: engagement.ai.id,
      limit: engagement.limit,
      progress: { playerActions: engagement.playerActions, turnAdvancements: engagement.turnAdvancements },
      status: engagement.status,
      disengagement: engagement.result,
    };
  }

  /**
   * Ends the Autopilot engagement and writes the Disengagement Autosave of the World state it ended in; see
   * SAVES, Autosaves. The World state is captured at once; the returned promise settles when the Autosave is
   * written, and the next operation waits for it, so that a caller that cannot wait still sees it written.
   */
  private endEngagement(
    engagement: Engagement,
    reason: DisengagementReason,
    detail: string | null = null,
  ): Promise<void> {
    if (engagement.status !== 'active') {
      return this.pendingAutosave;
    }
    engagement.status = 'ended';
    const result: DisengagementResult = {
      engagementId: engagement.id,
      reason,
      limitReached: reason === 'limitReached',
      progress: { playerActions: engagement.playerActions, turnAdvancements: engagement.turnAdvancements },
      detail,
    };
    engagement.result = result;
    this.endedEngagements.set(engagement.id, this.statusOf(engagement));
    this.engagement = null;
    const written = this.writeDisengagementAutosave(engagement.disengagementFailures).then(() => {
      this.endedFailures.set(engagement.id, engagement.disengagementFailures);
      engagement.resolveDone(result);
      this.changed();
    });
    this.pendingAutosave = written.catch(() => undefined);
    this.changed();
    return written;
  }

  private async writeDisengagementAutosave(failures: AutosaveFailure[]): Promise<void> {
    const campaign = this.campaign;
    if (campaign === null) {
      return;
    }
    const turn = currentState(campaign).world.current.turn;
    const header = this.headerFor(
      campaign,
      this.autosaveId(campaign.campaignId, 'disengagementAutosave', turn),
      'disengagementAutosave',
    );
    await this.writeAutosave('disengagementAutosave', header, toSaved(campaign), failures);
  }

  /**
   * Counts a committed action toward the Autopilot limit and ends the Autopilot engagement when it is due. A
   * Disengagement Autosave that cannot be written is reported in the result of the action that caused it.
   */
  private async afterCommit(
    principal: Principal,
    advancedTurn: boolean,
    failures: AutosaveFailure[],
  ): Promise<void> {
    const engagement = this.activeEngagement();
    if (engagement === null || principal.kind !== 'autopilot') {
      return;
    }
    if (advancedTurn) {
      engagement.turnAdvancements += 1;
      engagement.actionsThisTurn = 0;
    } else {
      engagement.playerActions += 1;
      engagement.actionsThisTurn += 1;
    }
    engagement.callsInStep = 0;
    const limit = engagement.limit;
    // Advance turn under `singleAction` is withheld before it commits, so every action counted here is another one.
    const reached =
      limit.kind === 'singleAction' ||
      (limit.kind === 'turnAdvancements' && engagement.turnAdvancements >= limit.count);
    if (reached) {
      await this.endEngagement(engagement, 'limitReached');
    } else if (this.campaign !== null && this.rules.isEnded(currentState(this.campaign))) {
      await this.endEngagement(engagement, 'campaignEnded');
    } else if (engagement.actionsThisTurn >= ACTION_BUDGET_PER_TURN) {
      // An Autopilot AI that never requests Advance turn exhausts its execution budget.
      await this.endEngagement(
        engagement,
        'aiFailed',
        `The Autopilot AI made ${ACTION_BUDGET_PER_TURN} Player actions in one Turn without requesting Advance turn.`,
      );
    } else {
      return;
    }
    failures.push(...engagement.disengagementFailures);
  }

  private async runEngagement(engagement: Engagement): Promise<void> {
    const principal: Principal = { kind: 'autopilot', engagementId: engagement.id };
    while (engagement.status === 'active') {
      if (this.campaign !== null && this.rules.isEnded(currentState(this.campaign))) {
        await this.runExclusive(() => this.endEngagement(engagement, 'campaignEnded'));
        break;
      }
      const before = engagement.playerActions + engagement.turnAdvancements;
      engagement.callsInStep = 0;
      try {
        await engagement.ai.step(principal);
      } catch (error) {
        const detail =
          error instanceof EngineDefect
            ? 'The Autopilot AI met an engine defect.'
            : 'The Autopilot AI reported an error.';
        await this.runExclusive(() => this.endEngagement(engagement, 'aiFailed', detail));
        break;
      }
      if (engagement.status !== 'active') {
        break;
      }
      if (engagement.playerActions + engagement.turnAdvancements === before) {
        await this.runExclusive(() =>
          this.endEngagement(engagement, 'aiFailed', 'The Autopilot AI produced no valid action.'),
        );
        break;
      }
      await (this.env.yieldToHost?.() ?? Promise.resolve());
    }
  }

  getAutopilotStatus(principal: Principal, engagementId: string): Result<AutopilotStatus> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: true });
    if (denied) {
      return denied;
    }
    const active = this.activeEngagement();
    if (active !== null && active.id === engagementId) {
      return ok(this.statusOf(active));
    }
    const ended = this.endedEngagements.get(engagementId);
    return ended
      ? ok(ended)
      : fail('invalid_input', 'There is no such Autopilot engagement in this Session.');
  }

  disengage(principal: Principal, engagementId: string): Promise<Result<DisengagementResult>> {
    return this.runExclusive(async () => {
      const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: true });
      if (denied) {
        return denied;
      }
      const active = this.activeEngagement();
      if (active !== null && active.id === engagementId) {
        await this.endEngagement(active, 'disengagedByController');
        return active.result
          ? ok(active.result, active.disengagementFailures)
          : fail('engine_defect', 'No disengagement result.');
      }
      const ended = this.endedEngagements.get(engagementId);
      if (ended?.disengagement) {
        return ok(ended.disengagement, this.endedFailures.get(engagementId) ?? []);
      }
      return fail('invalid_input', 'There is no such Autopilot engagement in this Session.');
    });
  }

  /** Resolves when the Autopilot engagement has ended; for adapters that wait for disengagement. */
  whenDisengaged(principal: Principal, engagementId: string): Promise<Result<DisengagementResult>> {
    const denied = this.checkSession(principal, { needsCampaign: false, duringAutopilot: true });
    if (denied) {
      return Promise.resolve(denied);
    }
    const active = this.activeEngagement();
    if (active !== null && active.id === engagementId) {
      return active.done.then((result) => ok(result, active.disengagementFailures));
    }
    const ended = this.endedEngagements.get(engagementId);
    const disengagement = ended?.disengagement;
    if (disengagement) {
      return this.pendingAutosave.then(() => ok(disengagement, this.endedFailures.get(engagementId) ?? []));
    }
    return Promise.resolve(fail('invalid_input', 'There is no such Autopilot engagement in this Session.'));
  }
}

export type { ErrorCode };
