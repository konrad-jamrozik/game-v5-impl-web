import { buildGdrCatalog } from './catalog.ts';
import { GDR_HASH, PACKAGE_VERSION, RAW_GDR_FILES } from './generated/raw-gdrs.ts';
import type { GdrCatalog } from './types.ts';

export { buildGdrCatalog, COMBAT_GDR_VALUE_NAMES, withCombatGdrValues, type RawGdrFile } from './catalog.ts';
export { GDR_HASH, PACKAGE_VERSION, RAW_GDR_FILES };
export type * from './types.ts';

/** Identifies the Game build: the package version and a hash of its GDRs. */
export const GAME_BUILD = `${PACKAGE_VERSION}+${GDR_HASH}`;

let bootstrap: GdrCatalog | null = null;

/** The catalog of the GDRs this Game build supplies. Reports a data defect when they are invalid. */
export function bootstrapGdrCatalog(): GdrCatalog {
  bootstrap ??= buildGdrCatalog(RAW_GDR_FILES);
  return bootstrap;
}
