/**
 * TUTOR, Tutorial bubbles and Tutorial notes: a golden "?" beside one Tutorial anchor, and the small note it opens.
 *
 * A bubble stands just outside the top right corner of what its anchor names, so that it covers no value or label and
 * changes no layout: it is drawn in a layer over the whole window, fixed to the window at the place of its anchor,
 * which it follows as the anchor moves. It is shown only while its anchor is shown, i.e. while the anchor's middle is
 * not covered by anything but the Tutorial layer, e.g. not under a dialog's Scrim. The bubble of the Tutorial intro
 * stands in the line of its heading instead.
 *
 * A Tutorial note never blocks play: it has no Scrim, and only one is open at a time.
 */
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { TutorialAnchor } from '../../engine/index.ts';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { setSetting, useSnapshot } from '../store.ts';
import {
  bubbleLook,
  bubbleOf,
  bubbleShown,
  bubbleText,
  expiryText,
  progressWithOpened,
  turnsLeft,
  tutorialSettings,
} from '../tutorials.ts';
import { CloseControl } from '../ui.tsx';

/** TUTOR, Tutorial notes, Compendium link: how a note opens an article in the Compendium View, where one can. */
export const TutorialLinks = createContext<{ readonly openArticle: (article: string) => void } | null>(null);

/** TUTOR, Tutorial notes: the bubble whose note is open; only one is open at a time. */
let openNote: string | null = null;
const noteListeners = new Set<() => void>();

function setOpenNote(bubble: string | null): void {
  if (openNote !== bubble) {
    openNote = bubble;
    for (const listener of noteListeners) {
      listener();
    }
  }
}

function useOpenNote(): string | null {
  return useSyncExternalStore(
    (listener) => {
      noteListeners.add(listener);
      return () => {
        noteListeners.delete(listener);
      };
    },
    () => openNote,
  );
}

/** TUTOR, Showing a bubble: the bubble is a circle 24 px across. */
const SIZE = 24;
/** TUTOR, Tutorial notes: the note is 320 px wide. */
const NOTE_WIDTH = 320;
/** How far the note stands from its bubble, room for its arrow, and how far it keeps from the window's edges. */
const GAP = 10;
const MARGIN = 8;

interface Box {
  readonly left: number;
  readonly top: number;
}

interface NotePlace extends Box {
  /** The side of the note its arrow is on, toward the bubble. */
  readonly side: 'top' | 'bottom' | 'right';
  /** Where along that side the arrow points, from the note's left or top edge. */
  readonly arrow: number;
}

/**
 * The element a bubble's anchor names: the button the bubble is in, or else the element it is in. Its box is a
 * button's border box, and for anything else the box of its content, e.g. the text of a heading that is wider than it.
 */
function anchorBox(marker: HTMLElement): DOMRect | null {
  const parent = marker.parentElement;
  if (parent === null) {
    return null;
  }
  const button = parent.closest('button');
  const anchor = button ?? parent;
  let box: DOMRect;
  if (button !== null) {
    box = button.getBoundingClientRect();
  } else {
    const range = document.createRange();
    range.selectNodeContents(anchor);
    box = range.getBoundingClientRect();
  }
  if (box.width === 0 && box.height === 0) {
    return null;
  }
  // The anchor is shown while what stands at its middle, apart from the Tutorial layer, is the anchor itself.
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const top = document
    .elementsFromPoint(x, y)
    .find((element) => element.closest('.tutorial-layer') === null && element !== marker);
  return top !== undefined && (top === anchor || anchor.contains(top)) ? box : null;
}

/**
 * Just outside the top right corner of the anchor, diagonally, so that it touches the anchor only at that corner and
 * covers none of its value or label; kept inside the window.
 */
function bubbleBox(anchor: DOMRect): Box {
  return {
    left: Math.max(2, Math.min(window.innerWidth - SIZE - 2, anchor.right - 4)),
    top: Math.max(2, anchor.top - SIZE + 4),
  };
}

/**
 * TUTOR, Tutorial notes: the note beside its bubble, where it fits on the screen: to the left of a bubble near the
 * right edge of the window, below it when there is room, and above it otherwise, its arrow pointing at the bubble.
 */
function notePlace(bubble: Box, height: number): NotePlace {
  const width = window.innerWidth;
  const bottom = window.innerHeight;
  const middleX = bubble.left + SIZE / 2;
  const middleY = bubble.top + SIZE / 2;
  const clampTop = (top: number) => Math.max(MARGIN, Math.min(bottom - height - MARGIN, top));
  if (
    width - bubble.left - SIZE < NOTE_WIDTH + GAP &&
    bubble.left - GAP - NOTE_WIDTH >= MARGIN &&
    bubble.top > 120
  ) {
    const top = clampTop(middleY - 26);
    return { left: bubble.left - GAP - NOTE_WIDTH, top, side: 'right', arrow: middleY - top };
  }
  const left = Math.max(MARGIN, Math.min(width - NOTE_WIDTH - MARGIN, middleX - 28));
  const below = bubble.top + SIZE + GAP;
  if (below + height <= bottom - MARGIN || bubble.top - GAP - height < MARGIN) {
    return { left, top: below, side: 'top', arrow: middleX - left };
  }
  return { left, top: bubble.top - GAP - height, side: 'bottom', arrow: middleX - left };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  return a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top);
}

/**
 * TUTOR, Tutorial bubbles: the bubble of one Tutorial anchor, placed as a child of what the anchor names. It shows
 * nothing when the Game build supplies no bubble for the anchor or the bubble is not shown.
 */
export function TutorialBubble(props: { anchor: TutorialAnchor; inline?: boolean }) {
  const snapshot = useSnapshot();
  const settings = tutorialSettings(snapshot.configuration);
  const bubble = bubbleOf(snapshot.tutorialBubbles, props.anchor);
  const shown = bubble !== null && bubbleShown(bubble, settings, snapshot.revealed);
  const inline = props.inline === true;
  const id = bubble?.id ?? null;
  const open = useOpenNote() === id && id !== null && shown;

  const marker = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Box | null>(null);
  const [noteAt, setNoteAt] = useState<NotePlace | null>(null);

  // The bubble follows its anchor, and the note its bubble, from frame to frame, and each is hidden while what it
  // stands beside is not shown.
  useEffect(() => {
    if (!shown) {
      setPlace(null);
      return undefined;
    }
    let frame = 0;
    let lastPlace: Box | null = null;
    let lastNote: NotePlace | null = null;
    const tick = () => {
      let next: Box | null;
      if (inline) {
        const own = button.current?.getBoundingClientRect();
        next = own === undefined ? null : { left: own.left, top: own.top };
      } else {
        const box = marker.current === null ? null : anchorBox(marker.current);
        next = box === null ? null : bubbleBox(box);
      }
      if (!sameBox(next, lastPlace)) {
        lastPlace = next;
        setPlace(next);
      }
      const height = note.current?.offsetHeight;
      const nextNote = next === null || height === undefined ? null : notePlace(next, height);
      if (
        !sameBox(nextNote, lastNote) ||
        nextNote?.side !== lastNote?.side ||
        nextNote?.arrow !== lastNote?.arrow
      ) {
        lastNote = nextNote;
        setNoteAt(nextNote);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [shown, inline]);

  // TUTOR, Tutorial notes: the note closes when its anchor is no longer shown, e.g. because a Detail view covers it.
  const anchorShown = place !== null;
  useEffect(() => {
    if (open && !anchorShown && !inline) {
      setOpenNote(null);
    }
  }, [open, anchorShown, inline]);
  useEffect(
    () => () => {
      if (id !== null && openNote === id) {
        setOpenNote(null);
      }
    },
    [id],
  );

  // TUTOR, Tutorial notes: a click anywhere outside the note closes it, and so does the Escape key, which then
  // reaches nothing else, e.g. it does not also close the Detail view the note stands over.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (note.current?.contains(target) === true || button.current?.contains(target) === true) {
        return;
      }
      setOpenNote(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        playSound(SOUND.back);
        setOpenNote(null);
      }
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const links = use(TutorialLinks);
  // The marker finds the anchor, the element it is in, and takes no room in it.
  const markerSpan = <span ref={marker} className="tutorial-marker" hidden style={{ display: 'none' }} />;
  if (bubble === null || !shown) {
    return inline ? null : markerSpan;
  }
  const look = bubbleLook(bubble.id, settings);
  // TUTOR, Tutorial notes, Header row: opening a bubble records it, so its note always says when it disappears.
  const left = turnsLeft(bubble.id, settings) ?? settings.lifetime;
  const article =
    bubble.article === null ? undefined : snapshot.articles?.find((item) => item.id === bubble.article);

  const bubbleButton = (
    <button
      ref={button}
      type="button"
      className={`tutorial-bubble tutorial-bubble-${look}${inline ? ' tutorial-bubble-inline' : ''}`}
      aria-label={`Tutorial: ${bubble.title}`}
      aria-expanded={open}
      data-testid={`tutorial-bubble-${props.anchor}`}
      data-look={look}
      style={inline || place === null ? undefined : { left: place.left, top: place.top }}
      onClick={(event) => {
        // What the anchor names, e.g. a button or a sortable column heading, takes no click of its bubble.
        event.stopPropagation();
        if (open) {
          setOpenNote(null);
          return;
        }
        setOpenNote(bubble.id);
        // TUTOR, Tutorial notes: a bubble not yet in Tutorial progress is added with the current Player Turn count.
        const progress = progressWithOpened(bubble.id, settings);
        if (progress !== null) {
          void setSetting('tutorialProgress', progress);
        }
      }}
    >
      ?
    </button>
  );

  const noteStyle: CSSProperties =
    noteAt === null
      ? { visibility: 'hidden', left: 0, top: 0 }
      : ({ left: noteAt.left, top: noteAt.top, '--arrow': `${noteAt.arrow}px` } as CSSProperties);

  return (
    <>
      {inline ? bubbleButton : markerSpan}
      {createPortal(
        <div className="tutorial-layer">
          {inline || place === null ? null : bubbleButton}
          {open ? (
            <div
              ref={note}
              className={`tutorial-note tutorial-note-arrow-${noteAt?.side ?? 'top'}`}
              role="dialog"
              aria-labelledby={`tutorial-note-title-${bubble.id}`}
              data-testid="tutorial-note"
              data-bubble={bubble.id}
              style={noteStyle}
              onClick={(event) => {
                // What the anchor names takes no click inside the note either.
                event.stopPropagation();
              }}
            >
              <div className="tutorial-note-head">
                <span className="tutorial-eyebrow">
                  <span className="tutorial-eyebrow-mark" aria-hidden="true">
                    ?
                  </span>
                  Tutorial
                </span>
                <span className="tutorial-note-expiry" data-testid="tutorial-note-expiry">
                  {expiryText(left)}
                </span>
                <CloseControl
                  testId="tutorial-note-close"
                  onClose={() => {
                    setOpenNote(null);
                  }}
                />
              </div>
              <div className="tutorial-note-title" id={`tutorial-note-title-${bubble.id}`}>
                {bubble.title}
              </div>
              <p className="tutorial-note-text" data-testid="tutorial-note-text">
                {bubbleText(bubble)}
              </p>
              {article === undefined || links === null ? null : (
                <button
                  type="button"
                  className="tutorial-note-link"
                  data-testid="tutorial-note-link"
                  data-article={article.id}
                  onClick={() => {
                    setOpenNote(null);
                    links.openArticle(article.id);
                  }}
                >
                  {article.title} in the Compendium ›
                </button>
              )}
            </div>
          ) : null}
        </div>,
        document.body,
      )}
    </>
  );
}
