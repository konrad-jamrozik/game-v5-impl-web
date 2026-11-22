/**
 * PAPI, Action results, from the caller's side: applying the changes a Player action returned to the results of both
 * World state queries from before it gives exactly what both queries return after it, so a caller that makes many
 * Player actions in a row need not query the whole Current world state again after each one.
 */
import type {
  CollectionChanges,
  CurrentLiveWorldStateView,
  CurrentRetiredWorldStateView,
  WorldStateChanges,
} from '../engine/player-api.ts';

/** The results of both World state queries. */
export interface WorldStateViews {
  readonly live: CurrentLiveWorldStateView;
  readonly retired: CurrentRetiredWorldStateView;
}

function applyCollection<T extends { readonly id: string }>(
  items: readonly T[],
  changes: CollectionChanges<T> | undefined,
): readonly T[] {
  if (changes === undefined) {
    return items;
  }
  const changed = new Map(changes.changed.map((item) => [item.id, item]));
  if (changes.order === undefined) {
    return items.map((item) => changed.get(item.id) ?? item);
  }
  // The elements kept are found among the old ones, every other one among the changed ones.
  const old = new Map(items.map((item) => [item.id, item]));
  return changes.order.map((id) => {
    const item = changed.get(id) ?? old.get(id);
    if (item === undefined) {
      throw new Error(`Action results name ${id} but neither return nor held it.`);
    }
    return item;
  });
}

/** Both World state views after a Player action, from both before it and the changes it returned. */
export function applyWorldStateChanges(views: WorldStateViews, changes: WorldStateChanges): WorldStateViews {
  const { live, retired } = changes;
  return {
    live: {
      ...views.live,
      ...(live.turn === undefined ? {} : { turn: live.turn }),
      ...(live.panicHundredths === undefined ? {} : { panicHundredths: live.panicHundredths }),
      ...(live.panicLimit === undefined ? {} : { panicLimit: live.panicLimit }),
      ...(live.ending === undefined ? {} : { ending: live.ending }),
      agency: live.agency,
      agents: applyCollection(views.live.agents, live.agents),
      investigations: applyCollection(views.live.investigations, live.investigations),
      missionSites: applyCollection(views.live.missionSites, live.missionSites),
      missions: applyCollection(views.live.missions, live.missions),
      factions: applyCollection(views.live.factions, live.factions),
    },
    retired: {
      ...views.retired,
      leads: applyCollection(views.retired.leads, retired.leads),
      agents: applyCollection(views.retired.agents, retired.agents),
      investigations: applyCollection(views.retired.investigations, retired.investigations),
      missionSites: applyCollection(views.retired.missionSites, retired.missionSites),
      missions: applyCollection(views.retired.missions, retired.missions),
    },
  };
}
