/**
 * TSUM, Tutorials: the checkbox that shows and sets the Current campaign's Tutorials, a Campaign configuration value
 * adjustable during play. The Special event of campaign_start labels it "Tutorial" and the Settings panel "Tutorials
 * enabled"; both show the same value.
 */
import { act, theEngine, type Snapshot } from '../store.ts';

export function TutorialsCheckbox(props: { snapshot: Snapshot; label: string; testId: string }) {
  const { session } = theEngine();
  return (
    <label className="check-label">
      <input
        type="checkbox"
        data-testid={props.testId}
        checked={props.snapshot.tutorials !== false}
        disabled={props.snapshot.tutorials === null}
        onChange={(event) => {
          act(() => session.campaignConfiguration.set({ tutorials: event.target.checked ? 1 : 0 }));
        }}
      />
      {props.label}
    </label>
  );
}
