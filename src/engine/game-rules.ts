/**
 * The Game rules of the Mechanics family, assembled behind the GameRules seam that the engine subsystems use.
 */
import { produce } from 'immer';
import type { GdrCatalog } from '../gdr/index.ts';
import { GAME_BUILD } from './game-build.ts';
import {
  detachedCombat,
  detachedCombatBatch,
  detachedCombatRatings,
} from './mechanics/combat/detached-combat.ts';
import { advanceTurnOf, applyActionTo } from './play.ts';
import { playPrologue } from './prologue/prologue.ts';
import type { ConfigurationValueDescriptor, GameRules } from './rules.ts';
import { createCampaignState } from './state/create.ts';
import { checkInvariants } from './state/invariants.ts';
import type { CampaignState } from './state/types.ts';
import {
  articleForTermView,
  availableActionsView,
  compendiumArticlesView,
  campaignConfigurationView,
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  estimateTeamProgressGain,
  gameDataView,
  combatSimulatorContentView,
  historyView,
  initiativeOperationLevelsView,
  inspectCampaignState,
  placeInPlay,
  previewDeployment,
  revealedCompendiumView,
  revealedLeadsView,
  turnReportView,
  worldStateChanges,
} from './views/views.ts';

function isWholeAtLeastZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export { advanceTurnOf, applyActionTo };

/** ECON, Campaign configuration values, and TURN, Prologue, fixed after creation; TSUM, Tutorials, adjustable. */
const CONFIGURATION_VALUES: readonly ConfigurationValueDescriptor[] = [
  {
    key: 'startingMoney',
    name: 'Starting money',
    adjustable: false,
    permitted: 'A whole number of money of at least 0',
    isPermitted: isWholeAtLeastZero,
  },
  {
    key: 'startingFunding',
    name: 'Starting funding',
    adjustable: false,
    permitted: 'A whole number of money of at least 0',
    isPermitted: isWholeAtLeastZero,
  },
  {
    key: 'prologue',
    name: 'Prologue',
    adjustable: false,
    permitted: '0 or 1',
    isPermitted: (value) => value === 0 || value === 1,
  },
  {
    // TSUM, Tutorials: true or false, kept as 1 or 0; adjustable during play, and read by no rule yet.
    key: 'tutorials',
    name: 'Tutorials',
    adjustable: true,
    permitted: '1 (on) or 0 (off)',
    isPermitted: (value) => value === 0 || value === 1,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createGameRules(gdrs: GdrCatalog): GameRules<CampaignState> {
  return {
    gameBuild: GAME_BUILD,
    presets: gdrs.campaignConfigurations.map((preset) => ({
      id: preset.id,
      name: preset.name,
      values: {
        startingMoney: preset.startingMoney,
        startingFunding: preset.startingFunding,
        prologue: preset.prologue,
        tutorials: preset.tutorials,
      },
    })),
    defaultPresetId: gdrs.configurationParameters.defaultPreset,
    configurationValues: CONFIGURATION_VALUES,

    createCampaign: ({ configuration, seed, setup }) => {
      const prologue = configuration['prologue'] ?? 0;
      const initial = createCampaignState(
        {
          startingMoney: configuration['startingMoney'] ?? 0,
          startingFunding: configuration['startingFunding'] ?? 0,
          prologue,
          tutorials: configuration['tutorials'] ?? 1,
        },
        seed,
        gdrs,
      );
      // TURN, Prologue: with 1, campaign creation continues from the initial Campaign state.
      const created = prologue === 1 ? playPrologue(initial, gdrs) : initial;
      // CONFIG, Campaign setup seed: the Campaign records the setup it was created with.
      return setup === undefined ? created : { ...created, setup };
    },
    setupOf: (state) => state.setup ?? null,
    applyAction: (state, record) => applyActionTo(state, record, gdrs),
    advanceTurn: (state) => advanceTurnOf(state, gdrs),
    checkInvariants: (state) => checkInvariants(state, gdrs),
    isEnded: (state) => state.world.current.ending !== null,

    isCampaignState(value): value is CampaignState {
      if (!isRecord(value) || !isRecord(value['configuration']) || !isRecord(value['world'])) {
        return false;
      }
      const { current, history } = value['world'];
      if (!isRecord(current) || !isRecord(history)) {
        return false;
      }
      return (
        typeof current['seed'] === 'string' &&
        typeof current['turn'] === 'number' &&
        typeof current['panicHundredths'] === 'number' &&
        isRecord(current['rng']) &&
        isRecord(current['agency']) &&
        ['agents', 'factions', 'investigations', 'missionSites', 'missions', 'enemies'].every((key) =>
          isRecord(current[key]),
        ) &&
        Array.isArray(current['randomOverrides']) &&
        Array.isArray(current['endingReasons']) &&
        Array.isArray(history['historyEntries']) &&
        Array.isArray(history['moneyAtStartOfTurn']) &&
        Array.isArray(history['moneyAtEndOfTurn']) &&
        isRecord(history['currentTurnStart']) &&
        Array.isArray(history['currentActions'])
      );
    },

    currentLiveWorldStateView: (state) => currentLiveWorldStateView(state, gdrs),
    currentRetiredWorldStateView: (state) => currentRetiredWorldStateView(state, gdrs),
    worldStateChanges: (before, after) => worldStateChanges(before, after, gdrs),
    campaignConfigurationView: (state) => campaignConfigurationView(state),
    turnReportView: (state) => turnReportView(state),
    historyView: (state) => historyView(state, gdrs),
    availableActionsView: (state) => availableActionsView(state, gdrs),
    inspect: (timeline) => inspectCampaignState(timeline),
    placeInPlay: (state) => placeInPlay(state),
    withConfiguration(state, configuration) {
      const same =
        Object.keys(configuration).length === Object.keys(state.configuration).length &&
        Object.entries(configuration).every(([key, value]) => state.configuration[key] === value);
      return same
        ? state
        : produce(state, (draft) => {
            draft.configuration = { ...state.configuration, ...configuration };
          });
    },
    extraPlayerQuery(state, query, args) {
      if (query === 'gameData') {
        return gameDataView(gdrs);
      }
      if (query === 'compendiumArticles') {
        return compendiumArticlesView(state, gdrs);
      }
      if (query === 'articleForTerm' && isRecord(args)) {
        return articleForTermView(state, gdrs, args['text']);
      }
      if (query === 'previewDeployment' && isRecord(args)) {
        return previewDeployment(state, gdrs, args['missionSite'], args['agents']);
      }
      if (query === 'estimateTeamProgressGain' && isRecord(args)) {
        return estimateTeamProgressGain(state, gdrs, args['agents']);
      }
      throw new Error(`There is no query ${query}`);
    },
    extraDeveloperQuery(state, query) {
      if (query === 'initiativeOperationLevels') {
        return initiativeOperationLevelsView(gdrs);
      }
      if (query === 'revealedCompendium') {
        return revealedCompendiumView(state, gdrs);
      }
      if (query === 'revealedLeads') {
        return revealedLeadsView(state, gdrs);
      }
      throw new Error(`There is no developer query ${query}`);
    },
    developerTool(state, tool, args) {
      if (tool === 'fightCombat') {
        return detachedCombat(state.world.current, gdrs, args);
      }
      if (tool === 'fightCombatBatch') {
        const { setup, count, stop } = (args ?? {}) as { setup?: unknown; count?: unknown; stop?: unknown };
        return detachedCombatBatch(state.world.current, gdrs, setup, count, stop);
      }
      throw new Error(`There is no developer tool ${tool}`);
    },
    combatSimulatorTool(tool, args) {
      if (tool === 'getContent') {
        return combatSimulatorContentView(gdrs);
      }
      if (tool === 'fightCombat') {
        return detachedCombat(null, gdrs, args);
      }
      if (tool === 'rateSides') {
        return detachedCombatRatings(gdrs, args);
      }
      throw new Error(`There is no Combat simulator operation ${tool}`);
    },
  };
}
