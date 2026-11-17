/**
 * The public engine API: the four namespaces `session`, `player`, `developer`, and `autopilotMemory` of ENG, API
 * hierarchy. Every user interface is an adapter over this API and implements no gameplay rule of its own.
 */
import { bootstrapGdrCatalog, buildGdrCatalog, GAME_BUILD, type RawGdrFile } from '../gdr/index.ts';
import { createGameRules } from './game-rules.ts';
import type {
  ActionAvailability,
  AutopilotAi,
  AutopilotMemoryApi,
  AvailableActionsView,
  CurrentStateView,
  DeploymentPreview,
  EncyclopediaArticleView,
  GameDataView,
  HistoryView,
  PlayerApi,
  ProgressLossPreview,
} from './player-api.ts';
import type { Result } from './result.ts';
import {
  CONTROLLER,
  EngineCore,
  type AutopilotLimit,
  type AutopilotStatus,
  type AutosaveStatus,
  type AutosaveTarget,
  type CommitOutcome,
  type DisengagementResult,
  type EngineEnvironment,
  type PresetListEntry,
  type PresetValueReport,
  type Principal,
  type SaveListEntry,
  type SessionStatus,
  type SetupReport,
  type TimelineStatus,
} from './session/core.ts';
import type { GlobalConfigurationReport, SettingValue } from './session/global-configuration.ts';
import type { CampaignState, TurnReport } from './state/types.ts';

export type * from './player-api.ts';
export type {
  AutopilotLimit,
  AutopilotProgress,
  AutopilotStatus,
  AutosaveStatus,
  AutosaveTarget,
  DisengagementReason,
  DisengagementResult,
  EngineEnvironment,
  PresetListEntry,
  PresetValueReport,
  SaveListEntry,
  SessionStatus,
  SetupReport,
  TimelineStatus,
} from './session/core.ts';
export type {
  GlobalConfigurationReport,
  SettingReport,
  SettingValue,
} from './session/global-configuration.ts';
export type { AutosaveFailure, EngineError, ErrorCode } from './result.ts';
export type { GameStorage, SaveHeader, SaveKind } from './saves/storage.ts';
export { MemoryStorage } from './saves/storage.ts';
export type * from './state/types.ts';
export { GAME_BUILD };

export interface Engine {
  /** Session API: for the Session controller. */
  readonly session: {
    getStatus(): Result<SessionStatus>;
    readonly globalConfiguration: {
      get(): Result<GlobalConfigurationReport>;
      set(setting: string, value: SettingValue): Promise<Result<null>>;
      reset(setting: string): Promise<Result<null>>;
    };
    readonly campaign: {
      /** Creates a Campaign from the new-Campaign setup. `seed` supplies the Campaign seed. */
      create(options?: { seed?: string }): Promise<Result<null>>;
      close(): Promise<Result<null>>;
    };
    readonly saves: {
      list(): Promise<Result<SaveListEntry[]>>;
      load(save: string): Promise<Result<null>>;
      /** Writes a new Campaign save, or replaces the one `save()` wrote that holds an equal Committed state. */
      save(): Promise<Result<{ saveId: string }>>;
      delete(save: string): Promise<Result<null>>;
      deleteCampaign(campaign: string): Promise<Result<null>>;
    };
    readonly newCampaignSetup: {
      listPresets(): Result<PresetListEntry[]>;
      getPreset(preset: string): Result<PresetValueReport[]>;
      getSetup(): Result<SetupReport>;
      selectPreset(preset: string): Result<null>;
      setPresetEdit(preset: string, value: { key: string; value: number }): Result<null>;
      removePresetEdit(preset: string, key: string): Result<null>;
    };
    readonly timeline: {
      getStatus(): Result<TimelineStatus>;
      undoAction(): Promise<Result<null>>;
      redoAction(): Promise<Result<null>>;
      undoAllActions(): Promise<Result<null>>;
      redoAllActions(): Promise<Result<null>>;
      getAutosaveStatus(): Promise<Result<AutosaveStatus>>;
      undoToAutosave(): Promise<Result<AutosaveTarget>>;
      redoToAutosave(): Promise<Result<AutosaveTarget>>;
    };
    readonly developer: {
      enable(): Result<null>;
      disable(): Result<null>;
    };
    readonly autopilot: {
      listAutopilotAis(): Result<{ autopilotAiId: string; name: string; wroteAutopilotMemory: boolean }[]>;
      engage(autopilotAiId: string, limit: AutopilotLimit): Promise<Result<{ engagementId: string }>>;
      getStatus(engagementId: string): Result<AutopilotStatus>;
      disengage(engagementId: string): Promise<Result<DisengagementResult>>;
      /** Resolves when the Autopilot engagement has ended. */
      whenDisengaged(engagementId: string): Promise<Result<DisengagementResult>>;
    };
  };
  /** Player API, as the Session controller holds it. */
  readonly player: PlayerApi;
  /** Developer API: available only while Dev mode is enabled. */
  readonly developer: {
    readonly queries: {
      /** Campaign state in full, including World history and hidden values. */
      getCampaignState(): Result<unknown>;
    };
    readonly actions: {
      addMoney(amount: number): Promise<Result<CommitOutcome>>;
      addAgents(count: number): Promise<Result<CommitOutcome>>;
      /** Fixes the value a named random outcome takes when it is next decided. */
      overrideRandomOutcome(
        outcome: string,
        value: number | boolean | string,
      ): Promise<Result<CommitOutcome>>;
    };
  };
  /** Autopilot memory API, as the Session controller holds it: always unavailable. */
  readonly autopilotMemory: AutopilotMemoryApi;
  /** Calls the listener after anything a query could report has changed. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** A number that changes whenever anything a query could report has changed. */
  getRevision(): number;
}

function playerApi(core: EngineCore<CampaignState>, principal: Principal): PlayerApi {
  const act = (name: string, args: Record<string, unknown>) =>
    core.commitAction(principal, { surface: 'player', name, args });
  return {
    queries: {
      getCurrentState: () => core.playerQuery(principal, 'currentState') as Result<CurrentStateView>,
      getTurnReport: () => core.playerQuery(principal, 'turnReport') as Result<TurnReport | null>,
      getHistory: () => core.playerQuery(principal, 'history') as Result<HistoryView>,
      getAvailableActions: () =>
        core.playerQuery(principal, 'availableActions') as Result<AvailableActionsView>,
      getGameData: () => core.playerQuery(principal, 'gameData') as Result<GameDataView>,
      getEncyclopediaArticles: () =>
        core.playerQuery(principal, 'encyclopediaArticles') as Result<readonly EncyclopediaArticleView[]>,
      previewDeployment: (missionSite, agents) =>
        core.playerQuery(principal, 'previewDeployment', {
          missionSite,
          agents,
        }) as Result<DeploymentPreview>,
      previewProgressLoss: (agents) =>
        core.playerQuery(principal, 'previewProgressLoss', { agents: [...agents] }) as Result<
          readonly ProgressLossPreview[]
        >,
      previewAssignAgents: (agents, assignment) =>
        core.playerQuery(principal, 'previewAssignAgents', {
          agents: [...agents],
          assignment,
        }) as Result<ActionAvailability>,
    },
    actions: {
      assignAgents: (agents, assignment) => act('assignAgents', { agents: [...agents], assignment }),
      hireAgent: () => act('hireAgent', {}),
      dismissAgents: (agents) => act('dismissAgents', { agents: [...agents] }),
      purchaseUpgrade: (upgrade) => act('purchaseUpgrade', { upgrade }),
      startInvestigation: (lead, agents) => act('startInvestigation', { lead, agents: [...agents] }),
      assignAgentsToInvestigation: (investigation, agents) =>
        act('assignAgentsToInvestigation', { investigation, agents: [...agents] }),
      deployAgents: (missionSite, agents) => act('deployAgents', { missionSite, agents: [...agents] }),
      advanceTurn: () => core.advanceTurn(principal),
    },
  };
}

function memoryApi(core: EngineCore<CampaignState>, principal: Principal): AutopilotMemoryApi {
  return {
    read: () => core.readAutopilotMemory(principal),
    write: (memory) => core.writeAutopilotMemory(principal, memory),
  };
}

export interface EngineOptions {
  /** The Autopilot AIs this Game build offers. */
  readonly autopilotAis?: readonly AutopilotAi[];
  /** Replaces the GDRs of the Game build; for tests of GDR validation and of rules with test GDRs. */
  readonly gdrFiles?: readonly RawGdrFile[];
}

/**
 * Starts a Session over the given Game storage. A Game build whose GDRs are defective reports the data defect here,
 * and no Campaign is created from it.
 */
export async function createEngine(env: EngineEnvironment, options: EngineOptions = {}): Promise<Engine> {
  const gdrs = options.gdrFiles === undefined ? bootstrapGdrCatalog() : buildGdrCatalog(options.gdrFiles);
  const rules = createGameRules(gdrs);
  const holder: { core: EngineCore<CampaignState> | null } = { core: null };
  const runners = (options.autopilotAis ?? []).map((ai) => ({
    id: ai.id,
    name: ai.name,
    // The Autopilot AI receives a narrowed API bound to its own Autopilot engagement, never the engine.
    step: (principal: Principal) => {
      const core = holder.core;
      if (core === null) {
        throw new Error('The engine has not started');
      }
      return ai.step({ player: playerApi(core, principal), autopilotMemory: memoryApi(core, principal) });
    },
  }));
  const core = await EngineCore.start(env, rules, runners);
  holder.core = core;
  const developerAction = (name: string, args: Record<string, unknown>) =>
    core.commitAction(CONTROLLER, { surface: 'developer', name, args });

  return {
    session: {
      getStatus: () => core.getStatus(CONTROLLER),
      globalConfiguration: {
        get: () => core.getGlobalConfiguration(CONTROLLER),
        set: (setting, value) => core.setGlobalSetting(CONTROLLER, setting, value),
        reset: (setting) => core.resetGlobalSetting(CONTROLLER, setting),
      },
      campaign: {
        create: (createOptions = {}) => core.createCampaign(CONTROLLER, createOptions),
        close: () => core.closeCampaign(CONTROLLER),
      },
      saves: {
        list: () => core.listSaves(CONTROLLER),
        load: (save) => core.load(CONTROLLER, save),
        save: () => core.save(CONTROLLER),
        delete: (save) => core.deleteSaveById(CONTROLLER, save),
        deleteCampaign: (campaign) => core.deleteCampaignSaves(CONTROLLER, campaign),
      },
      newCampaignSetup: {
        listPresets: () => core.listPresets(CONTROLLER),
        getPreset: (preset) => core.getPreset(CONTROLLER, preset),
        getSetup: () => core.getSetup(CONTROLLER),
        selectPreset: (preset) => core.selectPreset(CONTROLLER, preset),
        setPresetEdit: (preset, value) => core.setPresetEdit(CONTROLLER, preset, value),
        removePresetEdit: (preset, key) => core.removePresetEdit(CONTROLLER, preset, key),
      },
      timeline: {
        getStatus: () => core.getTimelineStatus(CONTROLLER),
        undoAction: () => core.undoAction(CONTROLLER),
        redoAction: () => core.redoAction(CONTROLLER),
        undoAllActions: () => core.undoAllActions(CONTROLLER),
        redoAllActions: () => core.redoAllActions(CONTROLLER),
        getAutosaveStatus: () => core.getAutosaveStatus(CONTROLLER),
        undoToAutosave: () => core.undoToAutosave(CONTROLLER),
        redoToAutosave: () => core.redoToAutosave(CONTROLLER),
      },
      developer: {
        enable: () => core.enableDevMode(CONTROLLER),
        disable: () => core.disableDevMode(CONTROLLER),
      },
      autopilot: {
        listAutopilotAis: () => core.listAutopilotAis(CONTROLLER),
        engage: (autopilotAiId, limit) => core.engage(CONTROLLER, autopilotAiId, limit),
        getStatus: (engagementId) => core.getAutopilotStatus(CONTROLLER, engagementId),
        disengage: (engagementId) => core.disengage(CONTROLLER, engagementId),
        whenDisengaged: (engagementId) => core.whenDisengaged(CONTROLLER, engagementId),
      },
    },
    player: playerApi(core, CONTROLLER),
    developer: {
      queries: { getCampaignState: () => core.developerQuery(CONTROLLER) },
      actions: {
        addMoney: (amount) => developerAction('addMoney', { amount }),
        addAgents: (count) => developerAction('addAgents', { count }),
        overrideRandomOutcome: (outcome, value) =>
          developerAction('overrideRandomOutcome', { outcome, value }),
      },
    },
    autopilotMemory: memoryApi(core, CONTROLLER),
    subscribe: (listener) => core.subscribe(listener),
    getRevision: () => core.getRevision(),
  };
}
