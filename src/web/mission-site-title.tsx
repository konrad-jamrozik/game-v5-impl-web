/** GUI, Mission site titles: the name in Text, and its Faction, kind, and number in Text muted. */
import type { MissionSiteTitle } from './mission-gains.ts';

export function MissionSiteTitleView(props: { title: MissionSiteTitle; className?: string }) {
  return (
    <span className={props.className}>
      {props.title.name}
      {props.title.details === '' ? null : <span className="muted small"> · {props.title.details}</span>}
    </span>
  );
}
