/**
 * VIS, Background artwork: the image each Detail view draws faintly behind its content; the table is exhaustive.
 * PLACE, Artwork in an Implementation: the images are the copy in assets/images/, served by the Game build.
 */
import type { DetailViewId } from './screens/DetailView.tsx';

const FILES = import.meta.glob<string>('../../assets/images/*.{png,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** VIS, Background artwork: which Detail view shows which image. */
const ARTWORK: Partial<Record<DetailViewId, string>> = {
  missions: 'v03ai-nano21-command-center.jpg',
  agents: 'chatgpt-agents-i2.png',
};

/** The URL of a Detail view's Background artwork, or null when it shows none. */
export function artworkUrl(view: DetailViewId): string | null {
  const file = ARTWORK[view];
  return file === undefined ? null : (FILES[`../../assets/images/${file}`] ?? null);
}
