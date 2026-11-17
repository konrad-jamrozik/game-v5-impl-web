/**
 * The game behavior of the Mechanics family, assembled behind the GameRules seam that the engine subsystems use.
 */
import { produce } from 'immer';
import { GAME_BUILD, type GdrCatalog } from '../gdr/index.ts';
import { applyGameAction } from './actions/actions.ts';
import { seededRandom, type Random } from './random.ts';
import { reject, type Rejection } from './result.ts';
import type { ActionRecord, ConfigurationValueDescriptor, GameRules } from './rules.ts';
import { createCampaignState } from './state/create.ts';
import { checkInvariants } from './state/invariants.ts';
import type { CampaignState } from './state/types.ts';
import { applyAdvanceTurn, type ProcessingOrder } from './turn/advance.ts';
import {
  availableActionsView,
  currentStateView,
  encyclopediaArticlesView,
  gameDataView,
  historyView,
  inspectCampaignState,
  previewDeployment,
  previewProgressLoss,
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
  return rejection ?? next;
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
      name: preset.id,
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
        isRecord(history['currentTurnStart'])
      );
    },

    currentStateView: (state) => currentStateView(state, gdrs),
    turnReportView: (state) => turnReportView(state),
    historyView: (state) => historyView(state, gdrs),
    availableActionsView: (state) => availableActionsView(state, gdrs),
    inspect: (state) => inspectCampaignState(state),
    extraPlayerQuery(state, query, args) {
      if (query === 'gameData') {
        return gameDataView(gdrs);
      }
      if (query === 'encyclopediaArticles') {
        return encyclopediaArticlesView(state, gdrs);
      }
      if (query === 'previewDeployment' && isRecord(args)) {
        return previewDeployment(state, gdrs, args['missionSite'], args['agents']);
      }
      if (query === 'previewProgressLoss' && isRecord(args)) {
        return previewProgressLoss(state, gdrs, args['agents']);
      }
      throw new Error(`There is no query ${query}`);
    },
  };
}
