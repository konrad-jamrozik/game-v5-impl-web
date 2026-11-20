/**
 * SITP: the compact Situation panel in the Side panel of the Campaign screen. Each item is one line, and selecting
 * it opens the Detail view that details it, with that item selected.
 */
import type { ReactNode } from 'react';
import type { CurrentLiveWorldStateView, HistoryView, LeadView } from '../../engine/index.ts';
import {
  GROUP_TITLES,
  SOON_EXPIRING_TURNS,
  leadDiscoveryTurns,
  situationGroups,
  type SituationGroup,
} from '../situation.ts';
import { ProgressCircle } from './ProgressCircle.tsx';

/** The Detail view a selected item opens, and the item it selects there. */
export type SituationTarget =
  | { readonly kind: 'lead'; readonly lead: string }
  /** The Leads View with its default selection. */
  | { readonly kind: 'leads' }
  | { readonly kind: 'missionSite'; readonly missionSite: string }
  | { readonly kind: 'agents' };

const TONES = { next: ' tone-accent', plain: '', muted: ' muted' } as const;

export function SituationPanel(props: {
  state: CurrentLiveWorldStateView;
  leads: readonly LeadView[];
  /** The History, whose entries record the Turn in which each Lead was discovered (SITP, Leads shown). */
  history: Pick<HistoryView, 'entries'> | null;
  onShow: (target: SituationTarget) => void;
}) {
  const { state } = props;
  const groups = situationGroups(state, props.leads, leadDiscoveryTurns(props.history));
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
    case 'leads':
      return [
        ...group.rows.map((lead) => (
          <Row
            key={lead.id}
            testId={`situation-row-${lead.id}`}
            name={lead.name}
            onClick={() => {
              onShow({ kind: 'lead', lead: lead.id });
            }}
          />
        )),
        // SITP, Leads shown: the line saying how many Leads the group does not show, in Text muted; it opens the
        // Leads View with its default selection.
        group.more > 0 ? (
          <button
            key="more"
            type="button"
            className="sit-row"
            data-testid="situation-row-more-leads"
            onClick={() => {
              onShow({ kind: 'leads' });
            }}
          >
            <span className="sit-name muted">
              {group.more} more lead{group.more === 1 ? '' : 's'}
            </span>
          </button>
        ) : null,
      ];
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
