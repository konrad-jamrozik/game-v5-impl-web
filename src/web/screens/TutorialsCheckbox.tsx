/**
 * TUTOR, Tutorials settings: the checkbox that shows and sets Tutorials on, a setting of Global configuration, so that
 * turning it off reaches every new Campaign. The Special event of campaign_start labels it "Tutorial" and the Settings
 * panel "Tutorials enabled"; both show the same value. It follows a click at once, so that closing the welcome right
 * after clearing it skips the Tutorial intro.
 */
import { setSetting, type Snapshot } from '../store.ts';

export function TutorialsCheckbox(props: { snapshot: Snapshot; label: string; testId: string }) {
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
          void setSetting('tutorialsOn', event.target.checked);
        }}
      />
      {props.label}
    </label>
  );
}
