/**
 * TSUM, Groups: the dialog shown once after an Advance turn the Player requested through the GUI, when it did
 * something listed; styled under VIS, Dialogs. The content comes from `turn-summary.ts`.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Consequences } from '../consequences.tsx';
import { progressPoints } from '../format.ts';
import { completedProgressBar } from '../progress-bar.ts';
import { SOON_EXPIRING_TURNS } from '../situation.ts';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import type { TurnSummaryModel } from '../turn-summary.ts';
import { ProgressBar } from './ProgressBar.tsx';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function Group(props: { title: string; count: number; testId: string; children: ReactNode }) {
  return (
    <section className="sit-group" data-testid={props.testId}>
      <div className="sit-group-head">
        <span className="label">{props.title}</span>
        <span className="figure tone-accent">{props.count}</span>
      </div>
      {props.children}
    </section>
  );
}

/**
 * TSUM, Mission cards: a number of Agents, in its tone only when above 0. The card names no Agent: the Combat report
 * names each participant.
 */
function AgentCount({ count, tone }: { count: number; tone: string }) {
  return <span className={`figure${count > 0 ? ` ${tone}` : ''}`}>{count}</span>;
}

export function TurnSummary(props: {
  model: TurnSummaryModel;
  currentTurn: number;
  onDismiss: () => void;
  onOpenReport: () => void;
  /** TSUM, Mission cards: the Combat report button opens that Mission's Combat report in the Turn Report View. */
  onOpenCombat: (mission: string) => void;
  /** TSUM, Mission site links: a new or Expired Mission site item opens the Missions View with it selected. */
  onOpenSite: (missionSite: string) => void;
  /** TSUM, Groups: the line of an Investigation that unlocked Contracting opens the Agents View. */
  onOpenAgents: () => void;
}) {
  const { model } = props;
  const dismiss = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dismiss.current?.focus();
  }, []);
  return (
    <div className="scrim">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="turn-summary-title"
        data-testid="turn-summary"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            playSound(SOUND.back);
            props.onDismiss();
          }
          // The Campaign screen's shortcuts do not reach the screen behind the dialog.
          event.stopPropagation();
        }}
      >
        <header className="dialog-head">
          <h2 id="turn-summary-title">Turn {model.turn} summary</h2>
          <span className="muted small">Now Turn {props.currentTurn}</span>
        </header>
        <div className="dialog-body">
          {model.missions.length === 0 ? null : (
            <Group title="Missions" count={model.missions.length} testId="summary-missions">
              {model.missions.map((mission) => (
                <article key={mission.mission} className="dialog-card">
                  <div className="sit-line">
                    <span>
                      {mission.name}{' '}
                      <span className="muted small">
                        · {mission.kind}
                        {mission.factionName === '' ? '' : ` · ${mission.factionName}`}
                      </span>
                    </span>
                    <span className={`label ${mission.result === 'Won' ? 'tone-good' : 'tone-bad'}`}>
                      {/* TSUM, Groups: a Won Mission says "Won" alone, as its Combat outcome is Won too. */}
                      {mission.result === 'Won' ? 'Won' : `Lost · ${mission.combatOutcome}`}
                    </span>
                  </div>
                  <dl className="summary-facts">
                    <div>
                      <dt className="label">Team sent</dt>
                      <dd className="figure">{mission.teamSent}</dd>
                    </div>
                    <div>
                      <dt className="label">Killed</dt>
                      <dd>
                        <AgentCount count={mission.killed} tone="tone-bad" />
                      </dd>
                    </div>
                    <div>
                      <dt className="label">To Recovery</dt>
                      <dd>
                        <AgentCount count={mission.toRecovery} tone="tone-accent" />
                      </dd>
                    </div>
                    <div>
                      <dt className="label">Enemies dead</dt>
                      <dd className="figure">
                        {mission.enemiesDead} / {mission.enemiesPresent}
                      </dd>
                    </div>
                  </dl>
                  <div className="sit-line">
                    <Consequences consequence={mission.consequence} label="Consequences" className="small" />
                    <button
                      type="button"
                      className="btn btn-plain"
                      data-testid={`summary-combat-${mission.mission}`}
                      onClick={() => {
                        props.onOpenCombat(mission.mission);
                      }}
                    >
                      Combat report
                    </button>
                  </div>
                </article>
              ))}
            </Group>
          )}
          {model.investigations.length === 0 ? null : (
            <Group
              title="Investigations completed"
              count={model.investigations.length}
              testId="summary-investigations"
            >
              {model.investigations.map((item) => (
                <div key={item.investigation} className="dialog-row">
                  <div className="sit-line">
                    <span>
                      {item.leadName}{' '}
                      <span className="muted small">
                        · after {plural(item.turns, 'turn')}
                        {item.createdMissionSiteName === null
                          ? ''
                          : ` · created Mission site ${item.createdMissionSiteName}`}
                      </span>
                    </span>
                    <span className="figure">
                      {progressPoints(item.finalProgress)}
                      {item.range === null ? null : (
                        <span className="muted">
                          {' '}
                          / {item.range.min}–{item.range.max}
                        </span>
                      )}
                    </span>
                  </div>
                  {item.requiredProgress === null || item.range === null ? null : (
                    <ProgressBar
                      size="dialog"
                      testId={`summary-bar-${item.investigation}`}
                      model={completedProgressBar(
                        item.requiredProgress,
                        item.range.max,
                        item.finalProgress,
                        item.gain,
                      )}
                    />
                  )}
                  {item.unlocksContracting ? (
                    <button
                      type="button"
                      className="link-row summary-unlock tone-good"
                      data-testid={`summary-unlock-contracting-${item.investigation}`}
                      onClick={props.onOpenAgents}
                    >
                      Contracting unlocked:{' '}
                      <span className="link-name">assign Agents to it in the Agents View</span>
                    </button>
                  ) : null}
                </div>
              ))}
            </Group>
          )}
          {model.newSites.length === 0 ? null : (
            <Group title="New Mission sites" count={model.newSites.length} testId="summary-new-sites">
              {model.newSites.map((site) => (
                <button
                  key={site.missionSite}
                  type="button"
                  className="dialog-row link-row summary-site-link"
                  data-testid={`summary-site-${site.missionSite}`}
                  onClick={() => {
                    props.onOpenSite(site.missionSite);
                  }}
                >
                  <div className="sit-line">
                    <span className="link-name">{site.name}</span>
                    <span
                      className={`figure${site.turnsUntilExpiration <= SOON_EXPIRING_TURNS ? ' tone-accent' : ''}`}
                    >
                      {plural(site.turnsUntilExpiration, 'turn')}
                    </span>
                  </div>
                  <span className="sit-sub">
                    {site.kind} · {site.origin} · {site.enemies} {site.enemies === 1 ? 'Enemy' : 'Enemies'}
                  </span>
                </button>
              ))}
            </Group>
          )}
          {model.expiredSites.length === 0 ? null : (
            <Group
              title="Expired Mission sites"
              count={model.expiredSites.length}
              testId="summary-expired-sites"
            >
              {model.expiredSites.map((site) => (
                <button
                  key={site.missionSite}
                  type="button"
                  className="dialog-row link-row summary-site-link"
                  data-testid={`summary-site-${site.missionSite}`}
                  onClick={() => {
                    props.onOpenSite(site.missionSite);
                  }}
                >
                  <div className="sit-line">
                    <span className="link-name">{site.name}</span>
                    <Consequences consequence={site.consequence} label="Consequences" className="small" />
                  </div>
                  <span className="sit-sub">{site.kind}</span>
                </button>
              ))}
            </Group>
          )}
          {model.leads.length === 0 ? null : (
            <Group title="Leads discovered" count={model.leads.length} testId="summary-leads">
              {/* TSUM, Groups: a discovered Lead is never an Assessed Lead yet, so only its name is shown. */}
              {model.leads.map((lead) => (
                <div key={lead.id} className="dialog-row sit-line">
                  <span>{lead.name}</span>
                </div>
              ))}
            </Group>
          )}
          {model.interrupted.length === 0 ? null : (
            <Group
              title="Investigations interrupted"
              count={model.interrupted.length}
              testId="summary-interrupted"
            >
              {model.interrupted.map((item) => (
                <div key={item.investigation} className="dialog-row sit-line">
                  <span>{item.leadName}</span>
                </div>
              ))}
            </Group>
          )}
        </div>
        <footer className="dialog-actions">
          <button
            type="button"
            className="btn btn-plain"
            data-testid="turn-summary-report"
            onClick={props.onOpenReport}
          >
            Open Turn report
          </button>
          <button
            ref={dismiss}
            type="button"
            className="btn btn-primary"
            data-testid="turn-summary-continue"
            data-sound="back"
            onClick={props.onDismiss}
          >
            Continue
          </button>
        </footer>
      </div>
    </div>
  );
}
