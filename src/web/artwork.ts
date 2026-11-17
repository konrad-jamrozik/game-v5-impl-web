/**
 * VIS, Background artwork: the image each Detail view draws faintly behind its content, and how faintly, as the
 * BackgroundArtwork GDRs give them; VIS, Artwork tuning: the values the Game designer tunes for the Session.
 * PLACE, Artwork in an Implementation: a GDR's image path names a file of the Spec repo, and the Game build serves
 * this Implementation's copy of that file, kept at the same path in assets/images/.
 */
import { useSyncExternalStore } from 'react';
import type { GameDataView } from '../engine/index.ts';
import { detailViewName } from './artwork-names.ts';
import type { DetailViewId } from './screens/DetailView.tsx';
import { useSnapshot } from './store.ts';

const FILES = import.meta.glob<string>('../../assets/images/*.{png,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type BackgroundArtwork = GameDataView['backgroundArtworks'][number];

/** The URL of this Implementation's copy of the image a GDR path names, or null when it holds no copy. */
export function imageUrl(path: string): string | null {
  return FILES[`../../${path}`] ?? null;
}

/** VIS, Artwork tuning: the tuned values of one BackgroundArtwork. */
export interface Tuning {
  readonly opacityPct: number;
  readonly image: string;
}

// VIS, Artwork tuning: tuned values are part of the Session, never saved, and last until the page is left.
let tunings: ReadonlyMap<string, Tuning> = new Map();
const listeners = new Set<() => void>();

function changed(next: ReadonlyMap<string, Tuning>): void {
  tunings = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Sets the tuned values of the BackgroundArtwork with this identifier. */
export function tune(artwork: BackgroundArtwork, change: Partial<Tuning>): void {
  const next = new Map(tunings);
  next.set(artwork.id, { ...tuningOf(artwork, tunings), ...change });
  changed(next);
}

/** VIS, Artwork tuning, Reset: returns every row to the values of its GDR. */
export function resetTuning(): void {
  changed(new Map());
}

function tuningOf(artwork: BackgroundArtwork, from: ReadonlyMap<string, Tuning>): Tuning {
  return from.get(artwork.id) ?? { opacityPct: artwork.opacityPct, image: artwork.image };
}

export function useTunings(): ReadonlyMap<string, Tuning> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => tunings,
  );
}

/** The values a BackgroundArtwork is shown with now: its tuned values, or those of its GDR. */
export function shownTuning(artwork: BackgroundArtwork, from: ReadonlyMap<string, Tuning>): Tuning {
  return tuningOf(artwork, from);
}

/** The Background artwork a Detail view draws now, or null when no BackgroundArtwork GDR names it. */
export function useArtwork(view: DetailViewId): { readonly url: string; readonly opacity: number } | null {
  const snapshot = useSnapshot();
  const current = useTunings();
  const artwork = snapshot.gameData?.backgroundArtworks.find(
    (item) => item.detailView === detailViewName(view),
  );
  if (artwork === undefined) {
    return null;
  }
  const shown = shownTuning(artwork, current);
  const url = imageUrl(shown.image);
  return url === null ? null : { url, opacity: shown.opacityPct / 100 };
}
