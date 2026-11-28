/**
 * AVIEW, Memorial: the Killed by and Mission site columns of a Terminated Agent. Pure presentation; no gameplay rule.
 */
import { enemyLabels, type LabelledEnemy } from './enemy-labels.ts';

/** A Mission site as the Memorial names it: its Instance ID, its Archetype's `name`, and its list of Enemies. */
export interface MemorialSite {
  readonly id: string;
  readonly name: string;
  readonly enemies: readonly LabelledEnemy[];
}

/**
 * The Mission site column: the Mission site's Instance ID, which its link opens (GUI, Links in tables), its Archetype
 * `name`, and "#" with the number that ends its Instance ID.
 */
export interface MemorialMissionSite {
  readonly id: string;
  readonly name: string;
  /** E.g. "#75" for mission-site-75. */
  readonly number: string;
}

export interface MemorialDeath {
  /** The Enemy label of the Enemy its Killed by references, e.g. "init-2". */
  readonly killedBy: string;
  readonly missionSite: MemorialMissionSite;
}

/** "#" followed by the number that ends an Instance ID, e.g. "#75" for mission-site-75. */
export function instanceNumber(id: string): string {
  const digits = /\d+$/.exec(id)?.[0];
  return digits === undefined ? id : `#${digits}`;
}

/**
 * AVIEW, Memorial, Killed by and Mission site: for a Killed Agent, the Enemy by its Enemy label and the Mission site by
 * its `name` and number, e.g. "init-2" and "Apprehend member #5"; null for a Dismissed Agent, whose cells are empty.
 */
export function memorialDeath(
  killedBy: { readonly enemy: string; readonly missionSite: string } | null,
  sites: readonly MemorialSite[],
): MemorialDeath | null {
  if (killedBy === null) {
    return null;
  }
  const site = sites.find((item) => item.id === killedBy.missionSite);
  // GUI, Enemy labels: an Enemy label is unique only within its Mission site, so the Mission site is named beside it.
  const label = site === undefined ? undefined : enemyLabels(site.enemies).get(killedBy.enemy);
  return {
    killedBy: label ?? killedBy.enemy,
    missionSite: {
      id: killedBy.missionSite,
      name: site?.name ?? '',
      number: instanceNumber(killedBy.missionSite),
    },
  };
}
