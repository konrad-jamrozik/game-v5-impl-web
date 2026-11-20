/**
 * The Game rules of the Mechanics family, assembled behind the GameRules seam that the engine subsystems use.
 */
import { produce } from 'immer';
import { detach } from '../kernel/values.ts';
import { GAME_BUILD, type GdrCatalog } from '../gdr/index.ts';
import { applyGameAction } from './actions/actions.ts';
import { detachedCombat, detachedCombatBatch } from './mechanics/combat/detached-combat.ts';
import { seededRandom, type Random } from './random.ts';
import { reject, type Rejection } from './result.ts';
import type { ActionRecord, ConfigurationValueDescriptor, GameRules } from './rules.ts';
import { createCampaignState } from './state/create.ts';
import { checkInvariants } from './state/invariants.ts';
import type { CampaignState } from './state/types.ts';
import { applyAdvanceTurn, type ProcessingOrder } from './turn/advance.ts';
import {
  articleForTermView,
  availableActionsView,
  compendiumArticlesView,
  campaignConfigurationView,
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  estimateTeamProgressGain,
  gameDataView,
  historyView,
  initiativeOperationLevelsView,
  inspectCampaignState,
  placeInPlay,
  previewDeployment,
  revealedCompendiumView,
  revealedLeadsView,
  turnReportView,
} from './views/views.ts';

function isWholeAtLeastZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** ECON, Campaign configuration values: both are fixed after creation. */
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
];

/**
 * Applies one action other than Advance turn; a rejection discards every change. `random` replaces the random
 * outcomes derived from the Campaign seed; it is for tests.
 */
export function applyActionTo(
  state: CampaignState,
  record: ActionRecord,
  gdrs: GdrCatalog,
  random: Random | null = null,
): CampaignState | Rejection {
  let rejection: Rejection | null = null;
  const next = produce(state, (draft) => {
    rejection = applyGameAction(draft.world.current, record, gdrs, random);
  });
  if (rejection !== null) {
    return rejection;
  }
  // An action with no effect is not a Player action, so it adds nothing to the Action record.
  if (next === state) {
    return state;
  }
  // WHIST, Action record, and ECON, Money in the Action record: every Player action other than Advance turn, including
  // a Player cheat action, adds its item to the end of the current Turn's Action record.
  return produce(next, (draft) => {
    draft.world.history.currentActions.push({
      operation: record.name,
      args: detach(record.args),
      moneyChange: next.world.current.agency.state.money - state.world.current.agency.state.money,
    });
  });
}

/**
 * Applies Advance turn atomically. `random` replaces the random outcomes derived from the Campaign seed, and
 * `order` the order in which Campaign instances are processed within a step; both are for tests.
 */
export function advanceTurnOf(
  state: CampaignState,
  gdrs: GdrCatalog,
  random: Random | null = null,
  order?: ProcessingOrder,
): CampaignState | Rejection {
  // ENDING, After a Campaign ending.
  if (state.world.current.ending !== null) {
    return reject(
      'campaign_ended',
      `The Campaign has ended in ${state.world.current.ending}.`,
      'campaign_ended',
    );
  }
  return produce(state, (draft) => {
    applyAdvanceTurn(
      draft,
      state,
      gdrs,
      random ?? seededRandom(draft.world.current.rng, draft.world.current.randomOverrides),
      order,
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createGameRules(gdrs: GdrCatalog): GameRules<CampaignState> {
  return {
    gameBuild: GAME_BUILD,
    presets: gdrs.campaignConfigurations.map((preset) => ({
      id: preset.id,
      name: preset.name,
      values: { startingMoney: preset.startingMoney, startingFunding: preset.startingFunding },
    })),
    defaultPresetId: gdrs.configurationParameters.defaultPreset,
    configurationValues: CONFIGURATION_VALUES,

    createCampaign: ({ configuration, seed }) =>
      createCampaignState(
        {
          startingMoney: configuration['startingMoney'] ?? 0,
          startingFunding: configuration['startingFunding'] ?? 0,
        },
        seed,
        gdrs,
      ),
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
    campaignConfigurationView: (state) => campaignConfigurationView(state),
    turnReportView: (state) => turnReportView(state),
    historyView: (state) => historyView(state),
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
  };
}
