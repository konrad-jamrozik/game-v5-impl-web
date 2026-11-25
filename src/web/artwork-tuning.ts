/**
 * VIS, Artwork tuning: tuned values are the Global configuration setting Artwork tuning, a JSON object of tuned values
 * by BackgroundArtwork ID, kept in every later Session until reset. These rules need no browser.
 */

/** VIS, Artwork tuning: the tuned values of one BackgroundArtwork. */
export interface Tuning {
  readonly opacityPct: number;
  readonly image: string;
}

let parsedFrom: unknown = undefined;
let parsed: ReadonlyMap<string, Tuning> = new Map();

/** The tuned values the stored text of Artwork tuning holds; the same map for the same text. */
export function tuningsFrom(stored: unknown): ReadonlyMap<string, Tuning> {
  if (stored === parsedFrom) {
    return parsed;
  }
  let next = new Map<string, Tuning>();
  try {
    const value: unknown = typeof stored === 'string' ? JSON.parse(stored) : null;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      next = new Map(Object.entries(value as Record<string, Tuning>));
    }
  } catch {
    next = new Map();
  }
  parsedFrom = stored;
  parsed = next;
  return parsed;
}
