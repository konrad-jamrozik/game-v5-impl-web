/**
 * MENU, Layout: the build label in the Main menu's header, the Game build ID after the word "build", e.g.
 * "build 2026-11-23 PST #4 6b30ad3", which links to its commit. Pure presentation; no gameplay rule.
 */
import { gameBuildId, type BuildInfo } from '../engine/index.ts';

const REPOSITORY = 'https://github.com/konrad-jamrozik/game-v5-impl-web';

/** E.g. "build 2026-11-23 PST #4 6b30ad3"; "build dev" when the Game build knew no commit. */
export function buildLabel(info: BuildInfo | null): string {
  return `build ${gameBuildId(info)}`;
}

/** The commit's page in the Implementation repo; null when the Game build knew no commit. */
export function buildCommitUrl(info: BuildInfo | null): string | null {
  return info === null ? null : `${REPOSITORY}/commit/${info.sha}`;
}
