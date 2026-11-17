/**
 * GUI, Situation panel: always in view at the top of the Campaign screen's left column, it lists the work under way
 * and the work waiting for the Player. Selecting a row shows that item where the Campaign screen details it; see
 * DEC-041.
 */
import type { CurrentStateView } from '../../engine/index.ts';
import { progressPoints } from '../format.ts';
import { progressBar } from '../progress-bar.ts';
import {
  GROUP_TITLES,
  SOON_EXPIRING_TURNS,
  rangeText,
  situationGroups,
  type SituationGroup,
} from '../situation.ts';
import { ProgressBar } from './ProgressBar.tsx';

/** Where the Campaign screen details a selected row. */
export type SituationTarget =
  | { readonly kind: 'lead'; readonly lead: string }
  | { readonly kind: 'missionSite'; readonly missionSite: string }
  | { readonly kind: 'agency' }
  | { readonly kind: 'agents'; readonly agents: readonly string[] };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function SituationPanel(props: {
  state: CurrentStateView;
  assessmentThresholdPct: number;
  onShow: (target: SituationTarget) => void;
}) {
  const { state } = props;
  const groups = situationGroups(state);
  return (
    <section className="situation" data-testid="situation">
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
            {group.id === 'training' ? (
              <button
                type="button"
                className="sit-group-head sit-row"
                data-testid="situation-row-training"
                onClick={() => {
                  props.onShow({ kind: 'agency' });
                }}
              >
                <span className="label">{GROUP_TITLES[group.id]}</span>
                <span className="figure tone-accent">
                  {group.count} / {group.cap}
                </span>
              </button>
            ) : (
              <div className="sit-group-head">
                <span className="label">{GROUP_TITLES[group.id]}</span>
                <span className="figure tone-accent">{group.count}</span>
              </div>
            )}
            <GroupRows group={group} {...props} />
          </div>
        ))
      )}
    </section>
  );
}

function GroupRows(props: {
  group: SituationGroup;
  assessmentThresholdPct: number;
  onShow: (target: SituationTarget) => void;
}) {
  const { group, onShow } = props;
  switch (group.id) {
    case 'investigations':
      return group.rows.map((row) => {
        const { investigation, lead } = row;
        const range = rangeText(lead);
        return (
          <button
            key={investigation.id}
            type="button"
            className="sit-row"
            data-testid={`situation-row-${investigation.id}`}
            onClick={() => {
              onShow({ kind: 'lead', lead: investigation.lead });
            }}
          >
            <span className="sit-line">
              <span>{investigation.leadName}</span>
              <span className="figure">
                {progressPoints(investigation.progress)}
                <span className="muted"> / {range ?? '?'}</span>
              </span>
            </span>
            <ProgressBar
              size="row"
              model={progressBar(
                lead ?? { requiredProgress: 'unknown', requiredProgressRange: 'unknown' },
                investigation.progress,
                investigation.projectedProgressGain,
                props.assessmentThresholdPct,
              )}
            />
            <span className="sit-sub">
              {plural(row.teamSize, 'Agent')}
              {row.inTransit > 0 ? ` · ${row.inTransit} In transit` : ''} · {plural(row.turns, 'turn')}
            </span>
          </button>
        );
      });
    case 'leads':
      return group.rows.map((lead) => (
        <button
          key={lead.id}
          type="button"
          className="sit-row"
          data-testid={`situation-row-${lead.id}`}
          onClick={() => {
            onShow({ kind: 'lead', lead: lead.id });
          }}
        >
          <span className="sit-line">
            <span>{lead.name}</span>
            <span className="muted small">{`required ${rangeText(lead) ?? 'unknown'}`}</span>
          </span>
        </button>
      ));
    case 'missionSites':
      return group.rows.map(({ site, factionName }) => (
        <button
          key={site.id}
          type="button"
          className="sit-row"
          data-testid={`situation-row-${site.id}`}
          onClick={() => {
            onShow({ kind: 'missionSite', missionSite: site.id });
          }}
        >
          <span className="sit-line">
            <span>{site.name}</span>
            <span
              className={`figure${site.turnsUntilExpiration <= SOON_EXPIRING_TURNS ? ' tone-accent' : ''}`}
            >
              {plural(site.turnsUntilExpiration, 'turn')}
            </span>
          </span>
          <span className="sit-sub">
            {site.kind} · {factionName}
          </span>
        </button>
      ));
    case 'training':
      // The group head is the row: selecting it shows the Training cap.
      return null;
    case 'standby':
      return (
        <button
          type="button"
          className="sit-row"
          data-testid="situation-row-standby"
          onClick={() => {
            onShow({ kind: 'agents', agents: group.agents });
          }}
        >
          <span className="figure secondary small">{group.agents.join(' · ')}</span>
        </button>
      );
  }
}
