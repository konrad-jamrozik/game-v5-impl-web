/**
 * GUI, Ranks: a Rank as the GUI shows it in text, its `name` followed by its Rank insignia, drawn as the Combat replay
 * draws it beside a figure: chevrons one above the other, bars and stars side by side.
 */
import type { Rank, RankInsignia } from './rank.ts';

const HEIGHT = 14;

function starPath(cx: number, cy: number, outer: number): string {
  const points: string[] = [];
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outer : outer * 0.42;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    points.push(
      `${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`,
    );
  }
  return `M${points.join('L')}Z`;
}

/** GUI, Ranks: the Rank insignia in the colour of the text around it. */
export function RankInsigniaIcon(props: { insignia: RankInsignia }) {
  const { kind, count } = props.insignia;
  const label = `${count} ${kind}${count === 1 ? '' : 's'}`;
  if (kind === 'chevron') {
    const pitch = 4;
    const rise = 3.5;
    const top = (HEIGHT - rise - (count - 1) * pitch) / 2;
    const d = Array.from({ length: count }, (_, k) => {
      const y = top + k * pitch;
      return `M1.5 ${y + rise}L6 ${y}L10.5 ${y + rise}`;
    }).join('');
    return (
      <svg
        className="rank-insignia"
        width="12"
        height={HEIGHT}
        viewBox={`0 0 12 ${HEIGHT}`}
        role="img"
        aria-label={label}
      >
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
      </svg>
    );
  }
  if (kind === 'bar') {
    const width = count * 3 + (count - 1) * 2.5 + 2;
    return (
      <svg
        className="rank-insignia"
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={label}
      >
        {Array.from({ length: count }, (_, k) => (
          <rect key={k} x={1 + k * 5.5} y={2} width={3} height={HEIGHT - 4} fill="currentColor" />
        ))}
      </svg>
    );
  }
  const width = count * 11;
  return (
    <svg
      className="rank-insignia"
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={label}
    >
      <path
        d={Array.from({ length: count }, (_, k) => starPath(5.5 + k * 11, HEIGHT / 2 + 0.5, 5.5)).join('')}
        fill="currentColor"
      />
    </svg>
  );
}

/** GUI, Ranks: the Rank's `name` followed by its Rank insignia, or the `name` alone for a Rank without one. */
export function RankText(props: { rank: Rank; abbreviated?: boolean }) {
  const { rank } = props;
  // GUI, Ranks: a table shows the `abbreviation` in place of the `name`, with the `name` in its tooltip.
  const abbreviated = props.abbreviated === true;
  return (
    <span className="rank-text" title={abbreviated ? rank.name : undefined}>
      {abbreviated ? rank.abbreviation : rank.name}
      {rank.insignia === null ? null : <RankInsigniaIcon insignia={rank.insignia} />}
    </span>
  );
}
