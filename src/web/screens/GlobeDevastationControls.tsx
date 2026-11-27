/**
 * CSCR, Globe devastation controls: the Devastation slider and the three effect checkboxes, at the top left corner of
 * the Globe stage, drawn as the globe's own controls are. The Campaign screen shows them only while the setting Globe
 * devastation controls shown is on, Dev mode is enabled, and no Detail view covers the Globe stage.
 */
import type { CSSProperties } from 'react';
import { DEVASTATION_EFFECTS } from '../globe/globe.js';
import { setDevastationEffect, setDevastationPercent, useHeldDevastation } from '../globe-devastation.ts';
import { sliderFill } from '../slider.ts';

export function GlobeDevastationControls() {
  const held = useHeldDevastation();
  return (
    <div
      className="globe-devastation"
      role="group"
      aria-label="Globe devastation"
      data-testid="globe-devastation"
    >
      <label className="globe-devastation-level">
        <span>Devastation</span>
        <span className="slider" style={{ '--fill': sliderFill(held.percent, 0, 100) } as CSSProperties}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={held.percent}
            data-testid="globe-devastation-level"
            onChange={(event) => {
              setDevastationPercent(Number(event.target.value));
            }}
          />
        </span>
        <span className="figure" data-testid="globe-devastation-shown">
          {held.percent}%
        </span>
      </label>
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
