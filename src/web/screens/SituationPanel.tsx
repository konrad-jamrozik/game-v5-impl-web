/**
 * SITP: the compact Situation panel in the Side panel of the Campaign screen. Each item is one line, and selecting
 * it opens the Detail view that details it, with that item selected.
 */
import type { ReactNode } from 'react';
import type { CurrentLiveWorldStateView, LeadView } from '../../engine/index.ts';
import { GROUP_TITLES, SOON_EXPIRING_TURNS, situationGroups, type SituationGroup } from '../situation.ts';
import { ProgressCircle } from './ProgressCircle.tsx';

/** The Detail view a selected item opens, and the item it selects there. */
export type SituationTarget =
  | { readonly kind: 'lead'; readonly lead: string }
  | { readonly kind: 'missionSite'; readonly missionSite: string }
  | { readonly kind: 'agents' };

const TONES = { next: ' tone-accent', plain: '', muted: ' muted' } as const;

export function SituationPanel(props: {
  state: CurrentLiveWorldStateView;
  leads: readonly LeadView[];
  onShow: (target: SituationTarget) => void;
}) {
  const { state } = props;
  const groups = situationGroups(state, props.leads);
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
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="sit-row"
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
      return group.rows.map((site) => (
        <Row
          key={site.id}
          testId={`situation-row-${site.id}`}
          name={site.name}
          value={`${site.turnsUntilExpiration} T left`}
          valueClass={site.turnsUntilExpiration <= SOON_EXPIRING_TURNS ? ' tone-accent' : ''}
          onClick={() => {
            onShow({ kind: 'missionSite', missionSite: site.id });
          }}
        />
      ));
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
