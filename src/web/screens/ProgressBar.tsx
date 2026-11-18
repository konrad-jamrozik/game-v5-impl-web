/** GUI, Progress bar, styled under VIS, Progress bars. The geometry comes from `progress-bar.ts`. */
import type { CSSProperties } from 'react';
import { progressPoints } from '../format.ts';
import { fillColour, rangeLabels, type ProgressBarModel } from '../progress-bar.ts';

/** The Required progress and its range are whole progress points, e.g. 6. */
const whole = (hundredths: number) => String(hundredths / 100);

const pct = (value: number) => `${Math.round(value * 10000) / 100}%`;

function span(from: number, to: number, extra: CSSProperties = {}): CSSProperties {
  return { left: pct(from), width: pct(Math.max(0, to - from)), ...extra };
}

export function ProgressBar(props: {
  model: ProgressBarModel;
  /** VIS, Progress bars: 8 px tall in a panel row, 10 px in a dialog. */
  size: 'row' | 'dialog';
  testId?: string;
}) {
  const { model } = props;
  const className = `pbar pbar-${props.size}`;

  if (model.kind === 'unscaled') {
    return (
      <div className={className} data-testid={props.testId}>
        <div className="pbar-track pbar-unscaled" role="img" aria-label={`Progress bar: ${model.caption}`}>
          <span className="pbar-stub" style={{ width: pct(model.stubShare) }} />
        </div>
        <Caption text={model.caption} accent={false} gain={model.projectedGain} />
      </div>
    );
  }

  const shown = rangeLabels(model);
  const label =
    model.kind === 'completed'
      ? `Completed at ${progressPoints(model.final)}, required ${whole(model.requiredProgress)}`
      : `Progress against required ${whole(model.requiredProgress)} to ${whole(model.rangeMax)}` +
        (model.caption === null ? '' : `, ${model.caption}`);
  return (
    <div className={className} data-testid={props.testId}>
      {model.kind === 'completed' ? (
        <div className="pbar-above">
          <span className="pbar-gain-label" style={{ left: pct((model.beforeShare + model.finalShare) / 2) }}>
            +{progressPoints(model.gain)}
          </span>
        </div>
      ) : null}
      <div className="pbar-track" role="img" aria-label={label}>
        <span className="pbar-zone" style={{ left: pct(model.tickShare) }} />
        {model.kind === 'completed' ? (
          <>
            <span
              className="pbar-fill"
              style={span(0, model.beforeShare, { background: fillColour(model.colourShare) })}
            />
            <span className="pbar-gain" style={span(model.beforeShare, model.finalShare)} />
          </>
        ) : (
          <>
            <span
              className="pbar-fill"
              style={span(0, model.fillShare, { background: fillColour(model.colourShare) })}
            />
            {model.preview === null ? null : (
              <span className="pbar-preview" style={span(model.preview.from, model.preview.to)} />
            )}
          </>
        )}
        <span className="pbar-tick" style={{ left: pct(model.tickShare) }} />
        {model.kind === 'completed' ? (
          <span className="pbar-check" style={{ left: pct(model.finalShare) }} aria-hidden="true">
            ✓
          </span>
        ) : null}
      </div>
      <div className="pbar-scale">
        {model.kind === 'completed' ? (
          <span className="pbar-axis" style={{ left: pct(model.beforeShare) }}>
            {progressPoints(model.before)}
          </span>
        ) : null}
        {shown.requiredProgress ? (
          <span className="pbar-axis" style={{ left: pct(model.tickShare) }}>
            {whole(model.requiredProgress)}
          </span>
        ) : null}
        {shown.rangeMax ? <span className="pbar-axis pbar-axis-end">{whole(model.rangeMax)}</span> : null}
        {model.kind === 'completed' ? (
          <span className="pbar-axis pbar-final" style={{ left: pct(model.finalShare) }}>
            {progressPoints(model.final)}
          </span>
        ) : null}
      </div>
      {model.kind === 'scaled' && (model.caption !== null || model.projectedGain !== null) ? (
        <Caption text={model.caption ?? ''} accent={model.caption !== null} gain={model.projectedGain} />
      ) : null}
    </div>
  );
}

function Caption(props: { text: string; accent: boolean; gain: number | null }) {
  return (
    <div className="pbar-caption">
      <span className={props.accent ? 'tone-accent' : 'muted'}>{props.text}</span>
      {props.gain === null ? null : (
        <span>
          <span className="figure tone-good">+{progressPoints(props.gain)}</span>
          <span className="muted"> / turn</span>
        </span>
      )}
    </div>
  );
}
