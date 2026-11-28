/**
 * The public engine API: the three namespaces `session`, `player`, and `developer` of ENG, API hierarchy. Every user
 * interface is an adapter over this API and implements no gameplay rule of its own.
 */
import { bootstrapGdrCatalog, buildGdrCatalog, type RawGdrFile } from '../gdr/index.ts';
import { BUILD_INFO, GAME_BUILD } from './game-build.ts';
import { createGameRules } from './game-rules.ts';
import type {
  ActionOutcome,
  AutopilotAi,
  AvailableActionsView,
  CompendiumArticleView,
  CampaignConfigurationView,
  CurrentLiveWorldStateView,
  CurrentRetiredWorldStateView,
  DeploymentPreview,
  GameDataView,
  CombatSimulatorContent,
  HistoryView,
  LeadView,
  PlayerApi,
  TutorialBubbleView,
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
  type CreateCampaignReport,
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
import type { InitiativeOperationLevelsView, RevealedCompendiumView } from './views/views.ts';
import type {
  DetachedCombatBatchResult,
  DetachedCombatBatchStop,
  DetachedCombatRatings,
  DetachedCombatResult,
  DetachedCombatSetup,
} from './mechanics/combat/detached-combat.ts';

export type * from './player-api.ts';
export type {
  DetachedAgentEntry,
  DetachedCombatBatchResult,
  DetachedCombatBatchStop,
  DetachedCombatParticipant,
  DetachedCombatRatings,
  DetachedCombatResult,
  DetachedCombatSetup,
  DetachedEnemyEntry,
  DetachedExplicitEntry,
} from './mechanics/combat/detached-combat.ts';
export type { FoughtCombatReport } from './mechanics/combat/combat.ts';
export {
  decodeCombatSetupSeed,
  encodeCombatSetupSeed,
  isCombatSetupSeedText,
  setupOfCombatSetup,
  type CombatSetup,
  type SetupCombatant,
} from './mechanics/combat/combat-setup-seed.ts';
export type {
  InitiativeOperationLevelEntry,
  InitiativeOperationLevelsView,
  RevealedArticleView,
  RevealedCompendiumView,
} from './views/views.ts';
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
  CreateCampaignReport,
} from './session/core.ts';
export {
  decodeCampaignSetupSeed,
  isCampaignSetupSeedText,
  type CampaignSetup,
  type CampaignSetupSeed,
} from './session/campaign-setup-seed.ts';
export type {
  GlobalConfigurationReport,
  SettingReport,
  SettingValue,
} from './session/global-configuration.ts';
export type { AutosaveFailure, EngineError, ErrorCode } from './result.ts';
export type { GameStorage, SaveHeader, SaveKind } from './saves/storage.ts';
export { MemoryStorage } from './saves/storage.ts';
export type * from './state/types.ts';
export { BUILD_INFO, GAME_BUILD };
export { gameBuildId } from './game-build.ts';
/** GUI, Digit grouping: shared with every user interface, so that each groups digits as the Compendium texts do. */
export { groupDigitString } from '../kernel/index.ts';
/** TUTOR, Tutorial anchors: the anchors the GUI offers, which the TutorialBubble GDRs are checked against. */
export { TUTORIAL_ANCHORS, type TutorialAnchor } from '../gdr/index.ts';
export type { BuildInfo } from './game-build.ts';

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
      /**
       * LIFE, Campaign selection, Create; CONFIG, Campaign setup seed: `seed` takes a Campaign seed or a Campaign setup
       * seed, and `setupSeed` a Campaign setup seed; one created from a Campaign setup seed reports whether its Game
       * build differs. `campaignName` supplies the Campaign name; see SAVES, Identifiers.
       */
      create(options?: {
        seed?: string;
        setupSeed?: string;
        campaignName?: string;
      }): Promise<Result<CreateCampaignReport | null>>;
      close(): Promise<Result<null>>;
    };
    readonly saves: {
      list(): Promise<Result<SaveListEntry[]>>;
      load(save: string): Promise<Result<null>>;
      /** Writes a new Campaign save, or replaces the one `save()` wrote that holds an equal place in play. */
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
    readonly campaignConfiguration: {
      /**
       * CONFIG, Changing Campaign configuration during play: changes the named values of the Current campaign's
       * Campaign configuration, by key; not a Player action.
       */
      set(values: Readonly<Record<string, number>>): Promise<Result<null>>;
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
      listAutopilotAis(): Result<{ autopilotAiId: string; name: string }[]>;
      engage(autopilotAiId: string, limit: AutopilotLimit): Promise<Result<{ engagementId: string }>>;
      getStatus(engagementId: string): Result<AutopilotStatus>;
      disengage(engagementId: string): Promise<Result<DisengagementResult>>;
      /** Resolves when the Autopilot engagement has ended. */
      whenDisengaged(engagementId: string): Promise<Result<DisengagementResult>>;
    };
    /** COMBAT, Detached Combat without a Current campaign: what the Combat simulator (CSIM) reads and fights. */
    readonly combatSimulator: {
      getContent(): Result<CombatSimulatorContent>;
      fightCombat(setup: DetachedCombatSetup): Result<DetachedCombatResult>;
      rateSides(setup: DetachedCombatSetup): Result<DetachedCombatRatings>;
    };
  };
  /** Player API, as the Session controller holds it. */
  readonly player: PlayerApi;
  /** Developer API: available only while Dev mode is enabled. */
  readonly developer: {
    readonly queries: {
      /** Campaign state in full, including the Timeline, the History, and hidden values. */
      getCampaignState(): Result<unknown>;
      /**
       * LEAD, Reading Initiative operation levels: the level of every Lead and of every MissionSiteArchetype of kind
       * initiative of the Game build of the Current campaign, discovered or not; reads no Campaign state.
       */
      getInitiativeOperationLevels(): Result<InitiativeOperationLevelsView>;
      /**
       * COMP, Revealed Compendium: every Compendium article resolved as though every article were Player-visible,
       * with whether each is Player-visible in the Current world state, and the Article term lookup over every article.
       */
      getRevealedCompendium(): Result<RevealedCompendiumView>;
      /**
       * DEV, Revealed presentation: every Lead of the Game build, each as though discovered and Assessed;
       * whether it can be investigated now still follows the Current world state.
       */
      getRevealedLeads(): Result<readonly LeadView[]>;
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
    /** DEV, Developer tools: run one part of the Game rules on inputs the caller supplies; they change nothing. */
    readonly tools: {
      /**
       * COMBAT, Detached Combat: fights one Combat on the setup's Combatants and GDR values, with random outcomes
       * derived from its Detached seed alone, by the same procedure as the Mission resolution step, and returns its
       * Combat report and each participant's final values. It changes no Campaign state.
       */
      fightCombat(setup: DetachedCombatSetup): Result<DetachedCombatResult>;
      /**
       * COMBAT, Batch of Detached Combats: fights `count` Detached Combats on one setup, Combat `i` with the Detached
       * seed `<seed>#<i>`, each with the Combat report turned off, and returns each Combat's summary in order and the
       * totals over the batch. `fightCombat` with the Detached seed `<seed>#<i>` shows Combat `i` in full. With `stop`, the batch ends after the Combat at which the number Won reaches `stop.won` or
       * the number not Won reaches `stop.notWon`. It changes no Campaign state.
       */
      fightCombatBatch(
        setup: DetachedCombatSetup,
        count: number,
        stop?: DetachedCombatBatchStop,
      ): Result<DetachedCombatBatchResult>;
    };
  };
  /** Calls the listener after anything a query could report has changed. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** A number that changes whenever anything a query could report has changed. */
  getRevision(): number;
}

function playerApi(core: EngineCore<CampaignState>, principal: Principal): PlayerApi {
  // PAPI, Action results: the core returns the changes of every Player API action, so the outcome is an ActionOutcome.
  const act = (name: string, args: Record<string, unknown>) =>
    core.commitAction(principal, { surface: 'player', name, args }) as Promise<Result<ActionOutcome>>;
  return {
    queries: {
      getCurrentLiveWorldState: () =>
        core.playerQuery(principal, 'currentLiveWorldState') as Result<CurrentLiveWorldStateView>,
      getCurrentRetiredWorldState: () =>
        core.playerQuery(principal, 'currentRetiredWorldState') as Result<CurrentRetiredWorldStateView>,
      getCampaignConfiguration: () =>
        core.playerQuery(principal, 'campaignConfiguration') as Result<CampaignConfigurationView>,
      getTurnReport: () => core.playerQuery(principal, 'turnReport') as Result<TurnReport | null>,
      getHistory: () => core.playerQuery(principal, 'history') as Result<HistoryView>,
      getAvailableActions: () =>
        core.playerQuery(principal, 'availableActions') as Result<AvailableActionsView>,
      getGameData: () => core.playerQuery(principal, 'gameData') as Result<GameDataView>,
      getCompendiumArticles: () =>
        core.playerQuery(principal, 'compendiumArticles') as Result<readonly CompendiumArticleView[]>,
      getArticleForTerm: (text) =>
        core.playerQuery(principal, 'articleForTerm', { text }) as Result<string | null>,
      getTutorialBubbles: () =>
        core.playerQuery(principal, 'tutorialBubbles') as Result<readonly TutorialBubbleView[]>,
      previewDeployment: (missionSite, agents) =>
        core.playerQuery(principal, 'previewDeployment', {
          missionSite,
          agents,
        }) as Result<DeploymentPreview>,
      estimateTeamProgressGain: (agents) =>
        core.playerQuery(principal, 'estimateTeamProgressGain', { agents: [...agents] }) as Result<number>,
      previewAction: (action) => core.previewAction(principal, action.name, action.args),
    },
    actions: {
      assignAgents: (agents, assignment) => act('assignAgents', { agents: [...agents], assignment }),
      hireAgents: (count) => act('hireAgents', { count }),
      dismissAgents: (agents) => act('dismissAgents', { agents: [...agents] }),
      purchaseUpgrade: (upgrade) => act('purchaseUpgrade', { upgrade }),
      equipAgent: (agent, equipment) => act('equipAgent', { agent, equipment }),
      equipAgents: (changes) =>
        act('equipAgents', {
          changes: changes.map((change) => ({ agent: change.agent, equipment: change.equipment })),
        }),
      buyItems: (items) => act('buyItems', { items: items.map((item) => ({ ...item })) }),
      sellItems: (items, takeEquipped) =>
        act('sellItems', { items: items.map((item) => ({ ...item })), takeEquipped }),
      startInvestigation: (lead, agents) => act('startInvestigation', { lead, agents: [...agents] }),
      assignAgentsToInvestigation: (investigation, agents) =>
        act('assignAgentsToInvestigation', { investigation, agents: [...agents] }),
      deployAgents: (missionSite, agents) => act('deployAgents', { missionSite, agents: [...agents] }),
      advanceTurn: () => core.advanceTurn(principal),
    },
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
      return ai.step({ player: playerApi(core, principal) });
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
      campaignConfiguration: {
        set: (values) => core.setCampaignConfiguration(CONTROLLER, values),
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
      combatSimulator: {
        getContent: () =>
          core.combatSimulatorTool(CONTROLLER, 'getContent', null) as Result<CombatSimulatorContent>,
        fightCombat: (setup) =>
          core.combatSimulatorTool(CONTROLLER, 'fightCombat', setup) as Result<DetachedCombatResult>,
        rateSides: (setup) =>
          core.combatSimulatorTool(CONTROLLER, 'rateSides', setup) as Result<DetachedCombatRatings>,
      },
    },
    player: playerApi(core, CONTROLLER),
    developer: {
      queries: {
        getCampaignState: () => core.developerQuery(CONTROLLER),
        getInitiativeOperationLevels: () =>
          core.developerQuery(
            CONTROLLER,
            'initiativeOperationLevels',
          ) as Result<InitiativeOperationLevelsView>,
        getRevealedCompendium: () =>
          core.developerQuery(CONTROLLER, 'revealedCompendium') as Result<RevealedCompendiumView>,
        getRevealedLeads: () =>
          core.developerQuery(CONTROLLER, 'revealedLeads') as Result<readonly LeadView[]>,
      },
      actions: {
        addMoney: (amount) => developerAction('addMoney', { amount }),
        addAgents: (count) => developerAction('addAgents', { count }),
        overrideRandomOutcome: (outcome, value) =>
          developerAction('overrideRandomOutcome', { outcome, value }),
      },
      tools: {
        fightCombat: (setup) =>
          core.developerTool(CONTROLLER, 'fightCombat', setup) as Result<DetachedCombatResult>,
        fightCombatBatch: (setup, count, stop) =>
          core.developerTool(CONTROLLER, 'fightCombatBatch', {
            setup,
            count,
            stop,
          }) as Result<DetachedCombatBatchResult>,
      },
    },
    subscribe: (listener) => core.subscribe(listener),
    getRevision: () => core.getRevision(),
  };
}
