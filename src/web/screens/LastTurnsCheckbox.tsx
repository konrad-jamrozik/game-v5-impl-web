/** VIS, Charts: the "Last 100 Turns" checkbox at the right end of a chart's title row, before its legend or value. */
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';

export function LastTurnsCheckbox(props: { chart: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="chart-last-turns">
      <input
        type="checkbox"
        checked={props.on}
        data-testid={`last-turns-${props.chart}`}
        onChange={(event) => {
          playSound(SOUND.select);
          props.onChange(event.target.checked);
        }}
      />
      Last 100 Turns
    </label>
  );
}
