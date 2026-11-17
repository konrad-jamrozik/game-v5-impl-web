/**
 * MUSIC: the rules of playing the Soundtrack that need no browser: Track titles, the playing order in rounds, the fade
 * factor, and the gain. The browser player in music-player.ts applies them to an audio element.
 */

/** MUSIC, Fades: the length of the fade in at the start and the fade out at the end of a Track, in seconds. */
export const TRACK_FADE_SECONDS = 3;

/** MUSIC, Fades: the rate of the fades when Music on changes; a full fade takes 1 second. */
export const TOGGLE_FADE_PER_SECOND = 1;

/**
 * MUSIC, Soundtrack: the file name without its extension, with each underscore replaced by a space, so a file name may
 * write its spaces either way.
 */
export function trackTitle(fileName: string): string {
  const base = fileName.slice(fileName.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).replaceAll('_', ' ');
}

/**
 * MUSIC, Playing order: one round, every Track exactly once in a uniformly random order whose first Track is not
 * `previousLast` when there are two or more Tracks. `random` returns a number in [0, 1).
 */
export function drawRound<T>(tracks: readonly T[], previousLast: T | null, random: () => number): T[] {
  const candidates =
    tracks.length >= 2 && previousLast !== null ? tracks.filter((t) => t !== previousLast) : tracks;
  if (candidates.length === 0) {
    return [];
  }
  // Choosing the first Track uniformly among the permitted ones and shuffling the rest uniformly makes every
  // permitted order equally likely.
  const first = candidates[Math.floor(random() * candidates.length)] as T;
  const rest = tracks.filter((t) => t !== first);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j] as T, rest[i] as T];
  }
  return [first, ...rest];
}

/**
 * MUSIC, Fades: the fade factor that the Track's own fades give at `position` seconds into a Track of `duration`
 * seconds. A Track shorter than twice the fade length fades in over its first half and out over its second half.
 * An unknown duration gives no fade out.
 */
export function trackFade(position: number, duration: number): number {
  const known = Number.isFinite(duration) && duration > 0;
  const length = known ? Math.min(TRACK_FADE_SECONDS, duration / 2) : TRACK_FADE_SECONDS;
  const fadeIn = position / length;
  const fadeOut = known ? (duration - position) / length : 1;
  return clamp01(Math.min(fadeIn, fadeOut));
}

/**
 * MUSIC, Fades: moves the fade of Music on toward `target` (0 or 1) by `seconds` of time. Starting from the current
 * value of f makes a fade's duration shrink in proportion to the distance left.
 */
export function stepToggleFade(current: number, target: 0 | 1, seconds: number): number {
  const step = TOGGLE_FADE_PER_SECOND * seconds;
  return target === 1 ? Math.min(1, current + step) : Math.max(0, current - step);
}

/** MUSIC, Loudness: gain = f × (v / 100)², without rounding. */
export function gain(fade: number, volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return clamp01(fade) * v * v;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
