/**
 * Applying one Player action to Campaign state: an action other than Advance turn, or Advance turn itself. The Game
 * rules and the Prologue both play through these two functions.
 */
import { produce } from 'immer';
import { detach } from '../kernel/values.ts';
import type { GdrCatalog } from '../gdr/index.ts';
import { applyGameAction } from './actions/actions.ts';
import { seededRandom, type Random } from './random.ts';
import { reject, type Rejection } from './result.ts';
import type { ActionRecord } from './rules.ts';
import type { CampaignState, CurrentWorldState } from './state/types.ts';
import { applyAdvanceTurn, type ProcessingOrder } from './turn/advance.ts';

/**
 * Where the random outcomes of one action come from: by default, from the Campaign seed through the generator state in
 * Campaign state; a Random, which replaces them; or a function that wraps the seeded source of the World state the
 * action changes, e.g. to fix some named outcomes and leave every other one to the Campaign seed.
 */
export type RandomSource = Random | ((seeded: Random) => Random) | null;

function resolveRandom(source: RandomSource, world: CurrentWorldState): Random | null {
  return typeof source === 'function' ? source(seededRandom(world.rng, world.randomOverrides)) : source;
}

/**
 * Applies one action other than Advance turn; a rejection discards every change. `random` replaces the random
 * outcomes derived from the Campaign seed, or wraps them.
 */
export function applyActionTo(
  state: CampaignState,
  record: ActionRecord,
  gdrs: GdrCatalog,
  random: RandomSource = null,
): CampaignState | Rejection {
  let rejection: Rejection | null = null;
  const next = produce(state, (draft) => {
    rejection = applyGameAction(
      draft.world.current,
      record,
      gdrs,
      resolveRandom(random, draft.world.current),
    );
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
 * Applies Advance turn atomically. `random` replaces the random outcomes derived from the Campaign seed, or wraps
 * them, and `order` sets the order in which Campaign instances are processed within a step; `order` is for tests.
 */
export function advanceTurnOf(
  state: CampaignState,
  gdrs: GdrCatalog,
  random: RandomSource = null,
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
      resolveRandom(random, draft.world.current) ??
        seededRandom(draft.world.current.rng, draft.world.current.randomOverrides),
      order,
    );
  });
}
