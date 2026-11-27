/**
 * GLOBE, Globe in the user interface: the one component the Implementation writes for the globe. It mounts the copy
 * of the Spec repo's globe in `src/web/globe/` in an element that fills the Globe stage and hides it while a Detail
 * view covers the Globe stage. GLOBE, Shown only when seen: the globe is mounted once in the Session, in a host element
 * of its own; leaving the Campaign screen hides it and takes its host out of the page, and coming back puts the same
 * host into the new Globe stage, so the globe neither loads its maps nor builds its scene again. Everything else, e.g.
 * loading three.js and the maps on first show, the controls, the messages, and recovery from failures, is done by the
 * copied files.
 */
import { useEffect, useRef } from 'react';
import { mountGlobe, type GlobeHandle, type GlobeTilt } from '../globe/globe.js';
import { setGlobeTilt, useGlobeTilt } from '../globe-tilt.ts';
import '../globe/globe.css';

interface KeptGlobe {
  readonly host: HTMLDivElement;
  readonly handle: GlobeHandle;
}

/** The globe of the Session and the element it is mounted in, made the first time a Globe stage is shown. */
let kept: KeptGlobe | null = null;

/** Places the globe of the Session in `stage`, mounting it there the first time with the kept Globe tilt. */
function placeGlobe(stage: HTMLElement, tilt: GlobeTilt): KeptGlobe {
  if (kept === null) {
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.inset = '0';
    stage.append(host);
    // VIS, Detail views and navigation: the Globe stage has a Background fill.
    const background = getComputedStyle(stage).getPropertyValue('--background').trim() || '#0d0d0b';
    kept = {
      host,
      handle: mountGlobe(host, { mapBase: './globe/', background, tilt, onTiltChange: setGlobeTilt }),
    };
  } else {
    stage.append(kept.host);
  }
  return kept;
}

/** `covered` is true while a Detail view covers the Globe stage. */
export function Globe({ covered }: { covered: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeHandle | null>(null);
  const tilt = useGlobeTilt();
  const tiltAtMount = useRef(tilt);
  useEffect(() => {
    if (element.current === null) {
      return;
    }
    const { host, handle } = placeGlobe(element.current, tiltAtMount.current);
    globe.current = handle;
    return () => {
      // GLOBE, Shown only when seen: leaving the Campaign screen hides the globe, so that it stops drawing.
      handle.setVisible(false);
      host.remove();
      globe.current = null;
    };
  }, []);
  useEffect(() => {
    globe.current?.setVisible(!covered);
  }, [covered]);
  // GLOBE, Nothing from the game: a Globe tilt changed elsewhere, e.g. reset, reaches the globe already shown.
  useEffect(() => {
    globe.current?.setTilt(tilt);
  }, [tilt]);
  return <div ref={element} data-testid="globe" style={{ position: 'absolute', inset: 0 }} />;
}
