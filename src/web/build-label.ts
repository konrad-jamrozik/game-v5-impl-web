/**
 * The build label on the Main menu, e.g. "build 2026-11-23 PST #4 6b30ad3", which links to its commit. The build
 * reads the commit and its history from git; this module turns them into the label. Pure presentation; no gameplay
 * rule.
 */

/** The commit a build was made from: its date in PST, its number among that day's commits, and its full SHA. */
export interface BuildInfo {
  /** YYYY-MM-DD in PST. */
  readonly date: string;
  /** 1 for the first commit of that PST day, counting the commits the build's history holds. */
  readonly number: number;
  readonly sha: string;
}

const REPOSITORY = 'https://github.com/konrad-jamrozik/game-v5-impl-web';

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

/** E.g. "build 2026-11-23 PST #4 6b30ad3"; "build dev" when the build knew no commit. */
export function buildLabel(info: BuildInfo | null): string {
  return info === null ? 'build dev' : `build ${info.date} PST #${info.number} ${info.sha.slice(0, 7)}`;
}

/** The commit's page in the Implementation repo; null when the build knew no commit. */
export function buildCommitUrl(info: BuildInfo | null): string | null {
  return info === null ? null : `${REPOSITORY}/commit/${info.sha}`;
}
