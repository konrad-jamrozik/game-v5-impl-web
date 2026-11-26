/**
 * CORE, Game build ID: the text that tells one Game build from another, e.g. "2026-11-25 PST #48 ec8d48c". It is
 * the PST date of the commit the Game build is made from, that commit's number among the commits of that date in its
 * history, and its short hash; "dev" when the Game build knew no commit. No version number and no hash of the game
 * data is part of it.
 */

/** The commit a Game build was made from: its date in PST, its number among that day's commits, and its full SHA. */
export interface BuildInfo {
  /** YYYY-MM-DD in PST. */
  readonly date: string;
  /** 1 for the first commit of that PST day, counting the commits the build's history holds. */
  readonly number: number;
  readonly sha: string;
}

/**
 * The commit the Game build was made from. `vite.config.ts` replaces it with what git reports, for the web build and
 * the tests; it is undeclared when Node runs the source directly, e.g. the CLI.
 */
declare const __BUILD_INFO__: BuildInfo | null | undefined;

/** PST is UTC−8 all year, so a date never shifts with daylight saving time. */
const PST_OFFSET_MS = -8 * 60 * 60 * 1000;

/** The PST date, YYYY-MM-DD, of an instant given as an ISO 8601 date-time. */
export function pstDate(isoDateTime: string): string {
  return new Date(Date.parse(isoDateTime) + PST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The BuildInfo of a commit from its SHA and the commit dates of its history, newest first, the commit's own
 * first; null for an empty history. Its number counts the commits of the history on its PST date.
 */
export function buildInfo(sha: string, commitDates: readonly string[]): BuildInfo | null {
  const [own] = commitDates;
  if (own === undefined) {
    return null;
  }
  const date = pstDate(own);
  return { date, number: commitDates.filter((item) => pstDate(item) === date).length, sha };
}

/** E.g. "2026-11-23 PST #4 6b30ad3"; "dev" when the Game build knew no commit. */
export function gameBuildId(info: BuildInfo | null): string {
  return info === null ? 'dev' : `${info.date} PST #${info.number} ${info.sha.slice(0, 7)}`;
}

/** The commit this Game build was made from; null when it knew none. */
export const BUILD_INFO: BuildInfo | null = typeof __BUILD_INFO__ === 'undefined' ? null : __BUILD_INFO__;

/** This Game build's Game build ID. */
export const GAME_BUILD = gameBuildId(BUILD_INFO);
