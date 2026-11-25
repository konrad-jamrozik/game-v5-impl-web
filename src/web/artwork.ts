/**
 * VIS, Background artwork: the image each Detail view draws faintly behind its content, and how faintly, as the
 * BackgroundArtwork GDRs give them; VIS, Artwork tuning: the values the Game designer tunes, kept across Sessions.
 * PLACE, Artwork in an Implementation: a GDR's image path names a file of the Spec repo, and the Game build serves
 * this Implementation's copy of that file, kept at the same path in assets/images/.
 */
import type { GameDataView } from '../engine/index.ts';
import { detailViewName } from './artwork-names.ts';
import { tuningsFrom, type Tuning } from './artwork-tuning.ts';
import type { DetailViewId } from './screens/DetailView.tsx';
import { resetSetting, setSetting, settingValue, snapshot, useSnapshot } from './store.ts';

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

/** VIS, Artwork tuning, Image: every image file in assets/images/, by its path relative to the repository root. */
export const IMAGE_PATHS: readonly string[] = Object.keys(FILES)
  .map((key) => key.slice('../../'.length))
  .sort();

export type { Tuning } from './artwork-tuning.ts';

/** Sets the tuned values of the BackgroundArtwork with this identifier. */
export function tune(artwork: BackgroundArtwork, change: Partial<Tuning>): void {
  const tunings = tuningsFrom(settingValue(snapshot().configuration, 'artworkTuning'));
  const next = Object.fromEntries(tunings);
  next[artwork.id] = { ...tuningOf(artwork, tunings), ...change };
  void setSetting('artworkTuning', JSON.stringify(next));
}

/** VIS, Artwork tuning, Reset: returns every row to the values of its GDR. */
export function resetTuning(): void {
  void resetSetting('artworkTuning');
}

function tuningOf(artwork: BackgroundArtwork, from: ReadonlyMap<string, Tuning>): Tuning {
  return from.get(artwork.id) ?? { opacityPct: artwork.opacityPct, image: artwork.image };
}

export function useTunings(): ReadonlyMap<string, Tuning> {
  return tuningsFrom(settingValue(useSnapshot().configuration, 'artworkTuning'));
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
