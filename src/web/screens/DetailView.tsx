/**
 * CSCR, Detail views; VIS, Detail views and navigation: the frame every Detail view shares. It covers the Globe stage
 * inset by 16 px, with its title on the left, its buttons in one row on the right ending 8 px before the close
 * control, and the close control ending that row as one of its controls under VIS, Close controls. While the View
 * trail is not empty, the Back control is the last button of the row. A Detail view taller than the Globe stage scrolls
 * inside, keeping its title row in view.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useArtwork } from '../artwork.ts';
import { usePlace } from '../place.tsx';
import { Button, CloseControl } from '../ui.tsx';

export type DetailViewId =
  | 'missions'
  | 'leads'
  | 'agents'
  | 'upgrades'
  | 'report'
  | 'history'
  | 'charts'
  | 'compendium';

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
  const place = usePlace();
  const body = useRef<HTMLDivElement>(null);
  const titleKey = typeof props.title === 'string' ? props.title : '';
  const mounted = useRef(false);
  // CSCR, View trail, Go back: a place shown again keeps the scroll position it was left at; something shown one
  // step away in place of the content starts at the top.
  useLayoutEffect(() => {
    if (body.current !== null) {
      body.current.scrollTop = mounted.current ? 0 : place.restoredScrollTop;
    }
    mounted.current = true;
  }, [titleKey, place.restoredScrollTop]);
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
        <h2>
          {props.title}
          {props.aside === undefined ? null : <span className="detail-aside">{props.aside}</span>}
        </h2>
        <div className="detail-actions">
          {props.actions}
          {/* VIS, Detail view: the Back control is the last button of the row, 8 px before the close control. */}
          {place.back === null ? null : (
            <Button testId="view-back" sound={place.back.toSummary ? 'main' : 'back'} onClick={place.back.go}>
              {place.back.label}
            </Button>
          )}
        </div>
        <CloseControl
          testId="close-view"
          sound={place.closeShowsSummary ? 'main' : 'back'}
          onClose={props.onClose}
        />
      </header>
      <div className="detail-body" ref={body}>
        {props.children}
      </div>
    </section>
  );
}
