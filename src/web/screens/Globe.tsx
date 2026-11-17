/**
 * GLOBE, Globe in the user interface: the one component the Implementation writes for the globe. It mounts the copy
 * of the Spec repo's globe in `src/web/globe/` in an element that fills the Globe stage, hides it while a Detail view
 * covers the Globe stage, and removes it with the Campaign screen. Everything else, e.g. loading three.js and the maps
 * on first show, the controls, the messages, and recovery from failures, is done by the copied files.
 */
import { useEffect, useRef } from 'react';
import { mountGlobe, type GlobeHandle } from '../globe/globe.js';
import '../globe/globe.css';

/** `covered` is true while a Detail view covers the Globe stage. */
export function Globe({ covered }: { covered: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeHandle | null>(null);
  useEffect(() => {
    if (element.current === null) {
      return;
    }
    // VIS, Detail views and navigation: the Globe stage has a Background fill.
    const background = getComputedStyle(element.current).getPropertyValue('--background').trim() || '#0d0d0b';
    globe.current = mountGlobe(element.current, { mapBase: './globe/', background });
    return () => {
      globe.current?.dispose();
      globe.current = null;
    };
  }, []);
  useEffect(() => {
    globe.current?.setVisible(!covered);
  }, [covered]);
  return <div ref={element} data-testid="globe" style={{ position: 'absolute', inset: 0 }} />;
}
