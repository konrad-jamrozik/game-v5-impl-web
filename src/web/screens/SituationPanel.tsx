/**
 * SITP: the compact Situation panel in the Side panel of the Campaign screen. Each item is one line, and selecting
 * it opens the Detail view that details it, with that item selected.
 */
import type { ReactNode } from 'react';
import type { CurrentLiveWorldStateView, LeadView, MissionSiteView } from '../../engine/index.ts';
import { WarningTriangle } from '../condition.tsx';
import { GROUP_TITLES, situationGroups, type MissionSiteRow, type SituationGroup } from '../situation.ts';
import { ProgressCircle } from './ProgressCircle.tsx';

/** SITP, Mission site urgency: the prohibition icon, a circle crossed by a diagonal, outlined in Danger. */
function ProhibitionIcon() {
  return (
    <svg className="prohibition-icon" width="14" height="14" viewBox="0 0 18 18" role="img" aria-label="Lost">
      <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.7 3.7 14.3 14.3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** SITP, Mission site urgency: the line of one Mission site, by how it stands out. */
function missionSiteLine({ site, urgency }: MissionSiteRow): {
  rowClass: string;
  glyph: ReactNode;
  value: string;
} {
  switch (urgency) {
    case 'next':
      return {
        rowClass: ' sit-row-next',
        glyph: <WarningTriangle />,
        value: `${site.turnsUntilExpiration} T left`,
      };
    case 'lost':
      return { rowClass: ' sit-row-lost', glyph: <ProhibitionIcon />, value: site.lifecycle };
    case 'other':
      return { rowClass: '', glyph: null, value: `${site.turnsUntilExpiration} T left` };
  }
}

/** The Detail view a selected item opens, and the item it selects there. */
export type SituationTarget =
  | { readonly kind: 'lead'; readonly lead: string }
  | { readonly kind: 'missionSite'; readonly missionSite: string }
  | { readonly kind: 'agents' };

const TONES = { next: ' tone-accent', plain: '', muted: ' muted' } as const;

export function SituationPanel(props: {
  state: CurrentLiveWorldStateView;
  leads: readonly LeadView[];
  /** SITP, Groups: the Mission sites that became Expired or Cancelled in the most recent Advance turn. */
  lost: readonly MissionSiteView[];
  onShow: (target: SituationTarget) => void;
}) {
  const { state } = props;
  const groups = situationGroups(state, props.leads, props.lost);
  return (
    <section className="situation" data-testid="situation" aria-label="Situation">
      <header className="section-head">
        <h3>Situation</h3>
        <span className="label">Turn {state.turn}</span>
      </header>
      {groups.length === 0 ? (
        <p className="muted" data-testid="situation-quiet">
          Nothing needs attention.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="sit-group" data-testid={`situation-${group.id}`}>
            <div className="sit-group-head">
              <span className="label">{GROUP_TITLES[group.id]}</span>
              <span className="figure tone-accent">{group.count}</span>
            </div>
            <GroupRows group={group} onShow={props.onShow} />
          </div>
        ))
      )}
    </section>
  );
}

function Row(props: {
  testId: string;
  name: string;
  glyph?: ReactNode;
  value?: ReactNode;
  valueClass?: string;
  rowClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sit-row${props.rowClass ?? ''}`}
      data-testid={props.testId}
      title={props.name}
      onClick={props.onClick}
    >
      <span className="sit-name">{props.name}</span>
      <span className="sit-glyph">{props.glyph}</span>
      <span className={`sit-value${props.valueClass ?? ''}`}>{props.value}</span>
    </button>
  );
}

function GroupRows(props: { group: SituationGroup; onShow: (target: SituationTarget) => void }) {
  const { group, onShow } = props;
  switch (group.id) {
    case 'missionSites':
      return group.rows.map((row) => {
        const line = missionSiteLine(row);
        return (
          <Row
            key={row.site.id}
            testId={`situation-row-${row.site.id}`}
            name={row.site.name}
            glyph={line.glyph}
            value={line.value}
            rowClass={line.rowClass}
            onClick={() => {
              // SITP: a lost Mission site opens the Missions View with its toggle on Concluded (MVIEW).
              onShow({ kind: 'missionSite', missionSite: row.site.id });
            }}
          />
        );
      });
    case 'investigations':
      return group.rows.map(({ investigation, circle, estimate }) => (
        <Row
          key={investigation.id}
          testId={`situation-row-${investigation.id}`}
          name={investigation.leadName}
          glyph={<ProgressCircle model={circle} />}
          value={<span data-testid={`eta-${investigation.lead}`}>{estimate.text}</span>}
          valueClass={TONES[estimate.tone]}
          onClick={() => {
            onShow({ kind: 'lead', lead: investigation.lead });
          }}
        />
      ));
    case 'agents': {
      const parts: ReactNode[] = [];
      if (group.standby > 0) {
        parts.push(
          <span key="standby">
            <span className="figure strong">{group.standby}</span> on Standby
          </span>,
        );
      }
      if (group.trainingFree > 0) {
        parts.push(
          <span key="training">
            <span className="figure strong">{group.trainingFree}</span> Training place
            {group.trainingFree === 1 ? '' : 's'} free
          </span>,
        );
      }
      return (
        <button
          type="button"
          className="sit-row sit-agents"
          data-testid="situation-row-agents"
          onClick={() => {
            onShow({ kind: 'agents' });
          }}
        >
          <span className="sit-name secondary">
            {parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}
          </span>
        </button>
      );
    }
  }
}
