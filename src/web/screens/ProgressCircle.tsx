/**
 * VIS, Progress circles: an 18 px circle on its text line. The track is a 1.5 px Border ring and the fill a sector
 * from the top, clockwise, coloured as the Fill of Progress bars; a full circle is an Accent disc with a check, and
 * the circle of a Lead that is not an Assessed Lead is a dashed Accent dim ring with a question mark.
 */
import type { ProgressCircleModel } from '../completion.ts';
import { fillColour } from '../progress-bar.ts';

const SIZE = 18;
const CENTRE = SIZE / 2;
const RADIUS = 8.25;

function sector(share: number): string {
  const angle = Math.min(share, 0.9999) * 2 * Math.PI;
  const x = CENTRE + RADIUS * Math.sin(angle);
  const y = CENTRE - RADIUS * Math.cos(angle);
  const large = share > 0.5 ? 1 : 0;
  return `M ${CENTRE} ${CENTRE} L ${CENTRE} ${CENTRE - RADIUS} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
}

export function ProgressCircle({ model }: { model: ProgressCircleModel }) {
  if (model.kind === 'unknown') {
    return (
      <svg
        className="pcircle"
        width={SIZE}
        height={SIZE}
        viewBox="0 0 18 18"
        role="img"
        aria-label="Not yet assessed"
      >
        <circle className="pcircle-unknown" cx={CENTRE} cy={CENTRE} r={RADIUS} />
        <text className="pcircle-mark" x={CENTRE} y="12.2" textAnchor="middle">
          ?
        </text>
      </svg>
    );
  }
  if (model.kind === 'full') {
    return (
      <svg
        className="pcircle"
        width={SIZE}
        height={SIZE}
        viewBox="0 0 18 18"
        role="img"
        aria-label="Required progress reached"
      >
        <circle className="pcircle-full" cx={CENTRE} cy={CENTRE} r={CENTRE} />
        <path className="pcircle-check" d="M5.2 9.3 L7.9 11.8 L12.8 6.4" />
      </svg>
    );
  }
  const percent = Math.round(model.share * 100);
  return (
    <svg
      className="pcircle"
      width={SIZE}
      height={SIZE}
      viewBox="0 0 18 18"
      role="img"
      aria-label={`${percent} percent of required progress`}
    >
      {model.share > 0 ? <path d={sector(model.share)} fill={fillColour(model.share)} /> : null}
      <circle className="pcircle-track" cx={CENTRE} cy={CENTRE} r={RADIUS} />
    </svg>
  );
}
