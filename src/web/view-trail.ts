/**
 * CSCR, View trail: the places that the Player came through to reach the one shown, most recent last, which the Escape
 * key and the Back control retrace. Pure presentation; no gameplay rule.
 */

/** CSCR, View trail: the id of the place that the Turn summary is, together with the place it was shown over. */
export const TURN_SUMMARY = 'summary';

/**
 * One place: an open Detail view together with what it shows one step away in place of its content, its selected
 * item, its filters, the lists the Player expanded, and its scroll position. `memo` holds what the Detail view keeps
 * for itself, under the keys it chose, e.g. its row filter or the Combat report it shows.
 */
export interface Place<Id extends string = string> {
  readonly id: Id;
  /** The item a Follow from another Detail view selected in it, e.g. a Lead. */
  readonly item: string | null;
  readonly memo: Readonly<Record<string, unknown>>;
  readonly scrollTop: number;
  /** What the Back control names when it returns here, e.g. "Turn report" or "Combat report". */
  readonly name: string;
  /** The Turn summary's place only: the place it was shown over, or null when it was shown over the globe. */
  readonly under?: Place<Id> | null;
}

/**
 * CSCR, View trail: the Turn summary as a place, shown over `under`, with the Summary event it showed in its memo
 * (TSUM, Showing and dismissing).
 */
export function turnSummaryPlace<Id extends string>(
  under: Place<Id> | null,
  index = 0,
): Place<Id | typeof TURN_SUMMARY> {
  return { id: TURN_SUMMARY, item: null, memo: { index }, scrollTop: 0, name: 'Turn summary', under };
}

/**
 * CSCR, View trail, From the Turn summary: opening a Detail view from the Turn summary empties the View trail, which
 * then holds the Turn summary as its only place.
 */
export function fromTurnSummary<Id extends string>(
  under: Place<Id> | null,
  index = 0,
): ViewTrail<Id | typeof TURN_SUMMARY> {
  return [turnSummaryPlace(under, index)];
}

/**
 * CSCR, View trail, Close: the Turn summary's place when the first place of the View trail is the Turn summary, so
 * that closing shows it again over the place it was shown over; null when closing shows the globe.
 */
export function closeReturnsTo<Id extends string>(trail: ViewTrail<Id>): Place<Id> | null {
  const first = trail[0];
  return first?.id === TURN_SUMMARY ? first : null;
}

export type ViewTrail<Id extends string = string> = readonly Place<Id>[];

/** CSCR, View trail, Follow: the place the Player leaves is added to the end. */
export function follow<Id extends string>(trail: ViewTrail<Id>, left: Place<Id>): ViewTrail<Id> {
  return [...trail, left];
}

/** CSCR, View trail, Go back: the last place leaves the View trail and is shown again; null when it is empty. */
export function goBack<Id extends string>(
  trail: ViewTrail<Id>,
): { readonly place: Place<Id>; readonly trail: ViewTrail<Id> } | null {
  const place = trail.at(-1);
  return place === undefined ? null : { place, trail: trail.slice(0, -1) };
}

/** CSCR, View trail: the label of the Back control, shown only while the View trail is not empty. */
export function backLabel(trail: ViewTrail): string | null {
  const place = trail.at(-1);
  return place === undefined ? null : `‹ ${place.name}`;
}
