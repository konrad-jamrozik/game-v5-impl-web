/**
 * TSUM, Tutorials: the checkbox that shows and sets Tutorials on, a setting of Global configuration, so that turning
 * it off reaches every new Campaign. The Special event of campaign_start labels it "Tutorial" and the Settings panel
 * "Tutorials enabled"; both show the same value.
 */
import { act, theEngine, type Snapshot } from '../store.ts';

export function TutorialsCheckbox(props: { snapshot: Snapshot; label: string; testId: string }) {
  const { session } = theEngine();
  const on =
    props.snapshot.configuration.settings.find((item) => item.setting === 'tutorialsOn')?.effectiveValue !==
    false;
  return (
    <label className="check-label">
      <input
        type="checkbox"
        data-testid={props.testId}
        checked={on}
        onChange={(event) => {
          act(() => session.globalConfiguration.set('tutorialsOn', event.target.checked));
        }}
      />
      {props.label}
    </label>
  );
}
