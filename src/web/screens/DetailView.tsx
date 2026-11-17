/**
 * CSCR, Detail views; VIS, Detail views and navigation: the frame every Detail view shares. It covers the Globe stage
 * inset by 16 px, with its title on the left and its buttons, then its close control, in one row on the right. A
 * Detail view taller than the Globe stage scrolls inside, keeping its title row in view.
 */
import type { ReactNode } from 'react';
import { useArtwork } from '../artwork.ts';

export type DetailViewId =
  'missions' | 'leads' | 'agents' | 'upgrades' | 'report' | 'history' | 'charts' | 'compendium';

/** CSCR, Detail views: the two groups, in this order; the list is exhaustive. */
export const DETAIL_VIEW_GROUPS: readonly {
  readonly name: string;
  readonly views: readonly { readonly id: DetailViewId; readonly name: string }[];
}[] = [
  {
    name: 'Operations',
    views: [
      { id: 'missions', name: 'Missions' },
      { id: 'leads', name: 'Leads' },
      { id: 'agents', name: 'Agents' },
      { id: 'upgrades', name: 'Upgrades' },
    ],
  },
  {
    name: 'Records',
    views: [
      { id: 'report', name: 'Turn report' },
      { id: 'history', name: 'History' },
      { id: 'charts', name: 'Charts' },
      { id: 'compendium', name: 'Compendium' },
    ],
  },
];

export const DETAIL_VIEWS = DETAIL_VIEW_GROUPS.flatMap((group) => group.views);

export function DetailView(props: {
  id: DetailViewId;
  title: ReactNode;
  /** Text after the title in the Figure style, e.g. counts against caps. */
  aside?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const artwork = useArtwork(props.id);
  return (
    <section
      className={artwork === null ? 'detail-view' : 'detail-view with-artwork'}
      data-testid={`view-${props.id}`}
      aria-label={props.id}
    >
      {artwork === null ? null : (
        // VIS, Background artwork: decoration only, drawn between the Surface fill and the content; an image that
        // cannot be loaded leaves the Detail view as it would be without it.
        <div
          className="detail-artwork"
          aria-hidden="true"
          data-testid="background-artwork"
          style={{ backgroundImage: `url("${artwork.url}")`, opacity: artwork.opacity }}
        />
      )}
      <header className="detail-head">
        <h3>
          {props.title}
          {props.aside === undefined ? null : <span className="detail-aside">{props.aside}</span>}
        </h3>
        <div className="detail-actions">
          {props.actions}
          <button
            type="button"
            className="btn btn-plain detail-close"
            aria-label="Close"
            title="Close (Esc)"
            data-testid="close-view"
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>
      </header>
      <div className="detail-body">{props.children}</div>
    </section>
  );
}
