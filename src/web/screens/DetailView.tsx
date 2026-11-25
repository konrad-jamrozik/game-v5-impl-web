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
  | 'armory'
  | 'storage'
  | 'acquisitions'
  | 'upgrades'
  | 'report'
  | 'history'
  | 'charts'
  | 'compendium';

/**
 * CSCR, Detail views: the groups, in this order; the list is exhaustive. CSCR, Navigation: the Side panel's navigation
 * shows each group's name over its buttons.
 */
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
      { id: 'armory', name: 'Armory' },
      { id: 'storage', name: 'Storage' },
      { id: 'upgrades', name: 'Upgrades' },
      { id: 'acquisitions', name: 'Acquisitions' },
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

/**
 * CSCR, Keyboard shortcuts: the number key that opens or closes a Detail view, by its place in the order of the
 * navigation: 1 to 9, then 0 for the tenth; null for a later one.
 */
export function numberKeyOf(id: DetailViewId): string | null {
  const index = DETAIL_VIEWS.findIndex((view) => view.id === id);
  return index < 0 || index > 9 ? null : String((index + 1) % 10);
}

/** The Detail view a number key opens or closes, or undefined when the key is none of theirs. */
export function detailViewOfKey(key: string): DetailViewId | undefined {
  return DETAIL_VIEWS.find((view) => numberKeyOf(view.id) === key)?.id;
}

export function DetailView(props: {
  id: DetailViewId;
  title: ReactNode;
  /** Text after the title in the Figure style, e.g. counts against caps. */
  aside?: ReactNode;
  /**
   * The text of `aside` when it is not a string: an aside too long for the title's row ends in "…", and the pointer
   * resting on it shows this in full.
   */
  asideText?: string;
  /**
   * Controls right after the title and its aside, beside what they switch or reopen, e.g. the Concluded toggle of the
   * Missions View (MVIEW) or the Turn summary button of the Turn Report View (TRVIEW).
   */
  lead?: ReactNode;
  /**
   * VIS, Detail views and navigation: the one exception to the Back control's place. The Back control stands after
   * the title, in the place of the button of the same name it replaces, e.g. "‹ Turn summary" in place of the Turn
   * summary button (TRVIEW, Turn summary button).
   */
  backInLead?: boolean;
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
  const backControl =
    place.back === null ? null : (
      <Button testId="view-back" sound={place.back.toSummary ? 'main' : 'back'} onClick={place.back.go}>
        {place.back.label}
      </Button>
    );
  const backInLead = backControl !== null && props.backInLead === true;
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
        <div className="detail-title">
          <h2>
            {props.title}
            {props.aside === undefined ? null : (
              <span
                className="detail-aside"
                title={typeof props.aside === 'string' ? props.aside : props.asideText}
              >
                {props.aside}
              </span>
            )}
          </h2>
          {backInLead ? (
            <div className="detail-lead">{backControl}</div>
          ) : props.lead === undefined ? null : (
            <div className="detail-lead">{props.lead}</div>
          )}
        </div>
        {props.actions === undefined ? null : <div className="detail-actions">{props.actions}</div>}
        {/* VIS, Detail views and navigation: the Back control is the last button of the row, 8 px before the close
            control, and both always sit on the title's line. */}
        {backControl === null || backInLead ? null : <div className="detail-back">{backControl}</div>}
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
