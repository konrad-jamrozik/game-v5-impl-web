/**
 * GLOBE, Globe in the user interface: the one component that owns the globe. It fills the Globe stage of the Campaign
 * screen, takes its size from it, loads three.js, the ported scene, and the maps only when the globe is first shown,
 * draws only while it is in view, and releases everything when it is removed. It imports nothing from the engine and
 * keeps nothing of what it shows. A failure shows a short message in its place and costs the Player nothing else.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GlobeMaps, GlobeScene } from '../globe/globe-scene.ts';

/** GLOBE, Relative map addresses: relative to the Game build, so that the globe also loads under GitHub Pages. */
const MAPS: GlobeMaps = {
  day: './globe/earth-day.webp',
  night: './globe/earth-night-lights.webp',
  normalWater: './globe/earth-normal-water.jpg',
  clouds: './globe/earth-clouds.webp',
};

type GlobeState = 'idle' | 'loading' | 'shown' | 'unavailable' | 'failed' | 'lost';

const MESSAGES: Partial<Record<GlobeState, string>> = {
  loading: 'Loading the globe…',
  unavailable: 'The globe needs WebGL 2, which this browser does not offer.',
  failed: 'The globe could not load its maps. It tries again the next time it is shown.',
  lost: 'The globe was interrupted. It starts again the next time it is shown.',
};

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const onChange = () => {
      setVisible(document.visibilityState !== 'hidden');
    };
    document.addEventListener('visibilitychange', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
    };
  }, []);
  return visible;
}

/** `covered` is true while a Detail view covers the Globe stage. */
export function Globe({ covered }: { covered: boolean }): ReactNode {
  const pageVisible = usePageVisible();
  const inView = !covered && pageVisible;
  const [state, setState] = useState<GlobeState>('idle');
  /** A new canvas for each start, because a canvas whose graphics context was lost cannot be drawn on again. */
  const [attempt, setAttempt] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<GlobeScene | null>(null);
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

  // GLOBE, Edge cases: showing the globe again after a failure or a lost context is the retry.
  const retryable = state === 'failed' || state === 'lost';
  useEffect(() => {
    if (inView && retryable) {
      setAttempt((n) => n + 1);
      setState('idle');
    }
  }, [inView, retryable]);

  // GLOBE, Load on first show: nothing is fetched before the globe is first in view.
  const started = useRef(-1);
  const live = useRef(true);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!inView || state !== 'idle' || started.current === attempt || canvas === null) {
      return;
    }
    started.current = attempt;
    const mine = attempt;
    setState('loading');
    void (async () => {
      try {
        const { createGlobeScene } = await import('../globe/globe-scene.ts');
        // VIS, Detail views and navigation: the Globe stage has a Background fill.
        const background = getComputedStyle(canvas).getPropertyValue('--background').trim() || '#0d0d0b';
        const scene = await createGlobeScene(canvas, MAPS, background, () => {
          sceneRef.current?.dispose();
          sceneRef.current = null;
          setState('lost');
        });
        if (!live.current || started.current !== mine) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        scene.setRunning(inViewRef.current);
        setState('shown');
      } catch (error) {
        if (!live.current) {
          return;
        }
        console.error(error);
        const reason = (error as { reason?: unknown }).reason;
        setState(reason === 'webgl' ? 'unavailable' : 'failed');
      }
    })();
  }, [inView, state, attempt]);

  // GLOBE, Draw only while visible.
  useEffect(() => {
    sceneRef.current?.setRunning(inView);
  }, [inView, state]);

  // GLOBE, Owned lifetime: everything is released when the component is removed.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const message = MESSAGES[state];
  return (
    <div className="globe" data-testid="globe" data-state={state} data-running={state === 'shown' && inView}>
      <canvas
        key={attempt}
        ref={canvasRef}
        className="globe-canvas"
        role="img"
        aria-label="Rotating globe of the Earth built from NASA satellite imagery, with clouds, an atmosphere glow, a day and night side, and city lights at night"
      />
      {message === undefined ? null : (
        <p className="globe-message" role="status">
          {message}
        </p>
      )}
      {covered ? null : <p className="globe-credit">Imagery: NASA Blue Marble and Earth at Night</p>}
    </div>
  );
}
