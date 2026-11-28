import { buildGdrCatalog } from './catalog.ts';
import { RAW_GDR_FILES } from './generated/raw-gdrs.ts';
import type { GdrCatalog } from './types.ts';

export { buildGdrCatalog, COMBAT_GDR_VALUE_NAMES, withCombatGdrValues, type RawGdrFile } from './catalog.ts';
export { RAW_GDR_FILES };
export { TUTORIAL_ANCHORS, type TutorialAnchor } from './tutorial-bubbles.ts';
export { MECHANICS_SECTIONS } from './compendium-articles.ts';
export type * from './types.ts';

let bootstrap: GdrCatalog | null = null;

/** The catalog of the GDRs this Game build supplies. Reports a data defect when they are invalid. */
export function bootstrapGdrCatalog(): GdrCatalog {
  bootstrap ??= buildGdrCatalog(RAW_GDR_FILES);
  return bootstrap;
}
