/**
 * CSCR, Globe devastation controls: the Devastation slider, its "Follow Panic" button, and the three effect
 * checkboxes, at the top left corner of the Globe stage, drawn as the globe's own controls are. The Campaign screen
 * shows them only while the setting Globe devastation controls shown is on, Dev mode is enabled, and no Detail view
 * covers the Globe stage.
 */
import type { CSSProperties } from 'react';
import { DEVASTATION_EFFECTS } from '../globe/globe.js';
import {
  followPanic,
  setDevastationByHand,
  setDevastationEffect,
  useHeldDevastation,
  type GlobeDevastation,
} from '../globe-devastation.ts';
import { sliderFill } from '../slider.ts';

/** `shown` is the devastation the globe shows, which the slider shows too. */
export function GlobeDevastationControls({ shown }: { shown: GlobeDevastation }) {
  const held = useHeldDevastation();
  const percent = Math.round(shown.percent);
  return (
    <div
      className="globe-devastation"
      role="group"
      aria-label="Globe devastation"
      data-testid="globe-devastation"
    >
      <div className="globe-devastation-level">
        <label htmlFor="globe-devastation-level">Devastation</label>
        <span className="slider" style={{ '--fill': sliderFill(percent, 0, 100) } as CSSProperties}>
          <input
            id="globe-devastation-level"
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            data-testid="globe-devastation-level"
            onChange={(event) => {
              setDevastationByHand(Number(event.target.value));
            }}
          />
        </span>
        <span className="figure" data-testid="globe-devastation-shown">
          {percent}%
        </span>
        <button
          type="button"
          className="globe-devastation-follow"
          data-testid="globe-devastation-follow"
          disabled={held.byHand === null}
          title={held.byHand === null ? 'The globe follows Panic.' : undefined}
          onClick={followPanic}
        >
          Follow Panic
        </button>
      </div>
      {DEVASTATION_EFFECTS.map(({ name, label, about }) => (
        <label key={name} className="inline" title={about}>
          <input
            type="checkbox"
            data-testid={`globe-devastation-${name}`}
            checked={held.effects[name]}
            onChange={(event) => {
              setDevastationEffect(name, event.target.checked);
            }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
