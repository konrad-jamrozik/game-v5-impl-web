/**
 * TSUM: the dialog shown once after an Advance turn the Player requested through the GUI, when it did something the
 * Player must know. It shows one Summary event at a time under its Event art (TSUM, Layout), and the Player steps
 * through them (TSUM, Stepping through events). The content comes from `turn-summary.ts`.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Consequences, GainLineText, toneClass } from '../consequences.tsx';
import { groupDigits, progressPoints } from '../format.ts';
import type { GainLine } from '../mission-gains.ts';
import { completedProgressBar } from '../progress-bar.ts';
import { SOON_EXPIRING_TURNS } from '../situation.ts';
import { playSound } from '../sound-player.ts';
import { SOUND } from '../sounds.ts';
import { summaryEvents, type SummaryEvent, type TurnSummaryModel } from '../turn-summary.ts';
import { withShortcut } from '../ui.tsx';
import { ProgressBar } from './ProgressBar.tsx';

const plural = (count: number, word: string) => `${groupDigits(count)} ${word}${count === 1 ? '' : 's'}`;

/** TSUM, Summary events: the name and the colour token of each kind; a Mission's colour follows its outcome. */
function kindOf(event: SummaryEvent): {
  readonly label: string;
  readonly color: string;
  readonly group: string;
} {
  switch (event.kind) {
    case 'mission':
      return {
        label: 'Mission',
        color: event.mission.result === 'Won' ? 'var(--accent)' : 'var(--danger)',
        group: 'mission',
      };
    case 'investigation':
      return { label: 'Investigation completed', color: 'var(--investigation)', group: event.kind };
    case 'lead':
      return { label: 'Lead discovered', color: 'var(--notice)', group: event.kind };
    case 'site':
      return { label: 'New Mission site', color: 'var(--warning)', group: event.kind };
    case 'expired':
      return { label: 'Expired Mission site', color: 'var(--danger-deep)', group: event.kind };
    case 'interrupted':
      return { label: 'Investigation interrupted', color: 'var(--text-muted)', group: event.kind };
  }
}

/** The drawing of the Event art placeholder for each kind, in a 100 × 100 box. */
const GLYPHS: Record<SummaryEvent['kind'], ReactNode> = {
  mission: (
    <>
      <circle cx="50" cy="50" r="30" />
      <circle cx="50" cy="50" r="12" />
      <path d="M50 8v22M50 70v22M8 50h22M70 50h22" />
    </>
  ),
  investigation: (
    <>
      <circle cx="42" cy="42" r="24" />
      <path d="M60 60l26 26" />
    </>
  ),
  lead: (
    <>
      <path d="M26 14h36l14 14v58H26z" />
      <path d="M62 14v14h14M36 46h30M36 58h30M36 70h18" />
    </>
  ),
  site: (
    <>
      <path d="M50 90S22 58 22 38a28 28 0 0 1 56 0c0 20-28 52-28 52z" />
      <circle cx="50" cy="38" r="10" />
    </>
  ),
  expired: (
    <path d="M30 12h40M30 88h40M34 12c0 22 32 26 32 38S34 66 34 88M66 12c0 22-32 26-32 38s32 16 32 38" />
  ),
  interrupted: (
    <>
      <circle cx="50" cy="50" r="36" />
      <path d="M42 34v32M58 34v32" />
    </>
  ),
};

/** The tag beside the kind, the title, and the meta line of a Summary event (TSUM, Summary events). */
function heading(event: SummaryEvent): { tag: string | null; title: string; meta: string } {
  switch (event.kind) {
    case 'mission': {
      const { mission } = event;
      return {
        tag: mission.result === 'Won' ? 'Won' : `Lost · ${mission.combatOutcome}`,
        title: mission.title.name,
        meta: [mission.title.details, `${plural(mission.deployed, 'Agent')} deployed`]
          .filter((part) => part !== '')
          .join(' · '),
      };
    }
    case 'investigation':
      return {
        tag: `After ${plural(event.investigation.turns, 'Turn')}`,
        title: event.investigation.leadName,
        meta:
          event.investigation.createdMissionSiteName === null
            ? ''
            : `Created the Mission site ${event.investigation.createdMissionSiteName}`,
      };
    case 'lead':
      return {
        tag: event.lead.fromMission === null ? null : `From ${event.lead.fromMission}`,
        title: event.lead.name,
        meta: event.lead.faction ?? '',
      };
    case 'site':
      return {
        tag: event.site.kind,
        title: event.site.name,
        meta: [event.site.faction, event.site.origin].filter((part) => part !== '').join(' · '),
      };
    case 'expired':
      return { tag: event.site.kind, title: event.site.name, meta: event.site.faction };
    case 'interrupted':
      return { tag: 'Interrupted', title: event.item.leadName, meta: '' };
  }
}

function Block(props: { title: string; testId?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section
      className={`summary-block${props.wide === true ? ' summary-block-wide' : ''}`}
      data-testid={props.testId}
    >
      <div className="sit-group-head">
        <span className="label">{props.title}</span>
      </div>
      {props.children}
    </section>
  );
}

function Lines(props: { lines: readonly (GainLine & { readonly label?: string })[]; testId: string }) {
  return props.lines.map((line, index) => (
    <div
      key={line.label ?? index}
      className={`summary-line ${line.parts === undefined ? toneClass(line) : 'muted'}`}
      data-testid={`${props.testId}-${line.label?.toLowerCase() ?? index}`}
    >
      {line.label === undefined ? <GainLineText line={line} /> : `${line.label}: ${line.text}`}
    </div>
  ));
}

function LinkButton(props: { testId: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="summary-go" data-testid={props.testId} onClick={props.onClick}>
      {props.children} ›
    </button>
  );
}

interface Links {
  readonly onOpenReplay: (mission: string) => void;
  readonly onOpenSite: (missionSite: string) => void;
  readonly onOpenAgents: () => void;
  readonly onOpenLeads: (lead: string) => void;
}

/** TSUM, Summary events: the details of one Summary event, in blocks side by side. */
function Details(props: { event: SummaryEvent; links: Links }) {
  const { event, links } = props;
  switch (event.kind) {
    case 'mission': {
      const { mission } = event;
      return (
        <div className="summary-blocks" data-testid={`summary-mission-${mission.mission}`}>
          <Block title="Consequences" testId="summary-consequences">
            {mission.consequences.length === 0 ? (
              <div className="summary-line muted">None</div>
            ) : (
              <Lines lines={mission.consequences} testId="summary-consequences" />
            )}
          </Block>
          {mission.equipment.length === 0 ? null : (
            <Block title="Equipment" testId="summary-equipment">
              <Lines lines={mission.equipment} testId="summary-equipment" />
            </Block>
          )}
          <Block title="Agents" testId="summary-agents">
            <div className="summary-line">{plural(mission.deployed, 'Agent')} deployed</div>
            {mission.killed.length === 0 ? null : (
              <div className="summary-line tone-bad">Killed: {mission.killed.join(', ')}</div>
            )}
            {mission.wounded === 0 ? null : (
              <div className="summary-line muted">{groupDigits(mission.wounded)} sent to Recovery</div>
            )}
            <LinkButton
              testId={`summary-replay-${mission.mission}`}
              onClick={() => {
                links.onOpenReplay(mission.mission);
              }}
            >
              Watch Combat replay
            </LinkButton>
          </Block>
          {mission.leads.length === 0 ? null : (
            <Block title="Leads discovered" testId="summary-mission-leads">
              {mission.leads.map((name) => (
                <div key={name} className="summary-line tone-notice">
                  {name}
                </div>
              ))}
            </Block>
          )}
        </div>
      );
    }
    case 'investigation': {
      const item = event.investigation;
      return (
        <div className="summary-stack">
          <div className="sit-line">
            <span className="muted">Investigation progress</span>
            <span className="figure">
              {progressPoints(item.finalProgress)}
              {item.range === null ? null : (
                <span className="muted">
                  {' '}
                  / {groupDigits(item.range.min)}–{groupDigits(item.range.max)}
                </span>
              )}
              <span className="tone-good"> · +{progressPoints(item.gain)} this Turn</span>
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
          <div className="summary-blocks">
            {item.createdMissionSite === null ? null : (
              <Block title="Created">
                <LinkButton
                  testId={`summary-site-${item.createdMissionSite}`}
                  onClick={() => {
                    if (item.createdMissionSite !== null) {
                      links.onOpenSite(item.createdMissionSite);
                    }
                  }}
                >
                  {item.createdMissionSiteName}
                </LinkButton>
              </Block>
            )}
            {item.unlocksContracting ? (
              <Block title="Contracting" wide>
                <button
                  type="button"
                  className="link-row summary-unlock tone-good"
                  data-testid={`summary-unlock-contracting-${item.investigation}`}
                  onClick={links.onOpenAgents}
                >
                  Contracting unlocked:{' '}
                  <span className="link-name">assign Agents to it in the Agents View</span>
                </button>
              </Block>
            ) : null}
          </div>
        </div>
      );
    }
    case 'lead':
      return (
        <div className="summary-blocks">
          <Block title="Briefing" wide>
            <p className="summary-prose">{event.lead.description}</p>
          </Block>
          <Block title="Next step">
            <div className="summary-line muted">Assign Agents to investigate it.</div>
            <LinkButton
              testId={`summary-lead-${event.lead.id}`}
              onClick={() => {
                links.onOpenLeads(event.lead.id);
              }}
            >
              Open in Leads View
            </LinkButton>
          </Block>
        </div>
      );
    case 'site': {
      const { site } = event;
      return (
        <div className="summary-blocks">
          <Block title="Expires in">
            <div className="summary-line">
              <span
                className={`figure summary-big${site.turnsUntilExpiration <= SOON_EXPIRING_TURNS ? ' tone-accent' : ''}`}
              >
                {groupDigits(site.turnsUntilExpiration)}
              </span>{' '}
              {site.turnsUntilExpiration === 1 ? 'Turn' : 'Turns'}
            </div>
          </Block>
          <Block title="Enemies">
            <div className="summary-line">
              <span className="figure summary-big">{groupDigits(site.enemies)}</span>{' '}
              <span className="muted">· Combat rating {groupDigits(site.enemiesCombatRating)}</span>
            </div>
          </Block>
          <Block title="If won">
            {site.rewards.length === 0 ? (
              <div className="summary-line muted">None</div>
            ) : (
              <Lines lines={site.rewards} testId="summary-rewards" />
            )}
          </Block>
          <Block title="If not won">
            {site.penalties.length === 0 ? (
              <div className="summary-line muted">None</div>
            ) : (
              <Lines lines={site.penalties} testId="summary-penalties" />
            )}
          </Block>
          <Block title="Deploy">
            <LinkButton
              testId={`summary-site-${site.missionSite}`}
              onClick={() => {
                links.onOpenSite(site.missionSite);
              }}
            >
              Open in Missions View
            </LinkButton>
          </Block>
        </div>
      );
    }
    case 'expired':
      return (
        <div className="summary-blocks">
          <Block title="Consequences">
            <div className="summary-line">
              <Consequences consequence={event.site.consequence} />
            </div>
          </Block>
          <Block title="Mission site">
            <LinkButton
              testId={`summary-site-${event.site.missionSite}`}
              onClick={() => {
                links.onOpenSite(event.site.missionSite);
              }}
            >
              Open in Missions View
            </LinkButton>
          </Block>
        </div>
      );
    case 'interrupted':
      return (
        <div className="summary-blocks">
          <Block title="Why" wide>
            <div className="summary-line muted">Its Lead can no longer be investigated.</div>
          </Block>
        </div>
      );
  }
}

export function TurnSummary(
  props: Links & {
    model: TurnSummaryModel;
    currentTurn: number;
    /** TSUM, Stepping through events: the Summary event shown, which the Campaign screen keeps for the View trail. */
    index: number;
    onIndexChange: (index: number) => void;
    onDismiss: () => void;
    onOpenReport: () => void;
  },
) {
  const { model } = props;
  const events = summaryEvents(model);
  const last = events.length - 1;
  const index = Math.min(Math.max(props.index, 0), Math.max(last, 0));
  const event = events[index];
  const seen = useRef(new Set<number>());
  seen.current.add(index);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  const go = (next: number) => {
    if (next >= 0 && next <= last && next !== index) {
      props.onIndexChange(next);
    }
  };
  if (event === undefined) {
    return null;
  }
  const kind = kindOf(event);
  const head = heading(event);
  // Consecutive dots of one kind group together, with a wider gap between kinds.
  const groups: { group: string; items: { event: SummaryEvent; at: number }[] }[] = [];
  events.forEach((item, at) => {
    const group = kindOf(item).group;
    const current = groups.at(-1);
    if (current?.group === group) {
      current.items.push({ event: item, at });
    } else {
      groups.push({ group, items: [{ event: item, at }] });
    }
  });
  return (
    <div className="scrim">
      <div
        ref={dialog}
        tabIndex={-1}
        className="dialog summary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="turn-summary-title"
        data-testid="turn-summary"
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === 'Escape') {
            playSound(SOUND.back);
            props.onDismiss();
          } else if (keyEvent.key === 'ArrowRight') {
            keyEvent.preventDefault();
            go(index + 1);
          } else if (keyEvent.key === 'ArrowLeft') {
            keyEvent.preventDefault();
            go(index - 1);
          } else if (keyEvent.key === 'Enter' && keyEvent.target === dialog.current) {
            // TSUM, Stepping through events: Enter shows the next Summary event, and on the last does what Continue does.
            keyEvent.preventDefault();
            if (index === last) {
              playSound(SOUND.back);
              props.onDismiss();
            } else {
              go(index + 1);
            }
          }
          // The Campaign screen's shortcuts do not reach the screen behind the dialog.
          keyEvent.stopPropagation();
        }}
      >
        <div className="summary-art" data-testid="summary-art" style={{ ['--kind' as string]: kind.color }}>
          <div className="summary-art-wash" />
          <svg
            className="summary-art-glyph"
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            {GLYPHS[event.kind]}
          </svg>
          <header className="summary-art-head">
            <h2 id="turn-summary-title">Turn {groupDigits(model.turn)} summary</h2>
            <span className="muted small">Now Turn {groupDigits(props.currentTurn)}</span>
          </header>
          <div className="summary-art-shade" />
          <div className="summary-caption">
            <div className="summary-eyebrow" data-testid="summary-kind">
              <span className="summary-pip" />
              <span>{kind.label}</span>
              {head.tag === null ? null : <span className="summary-tag">{head.tag}</span>}
            </div>
            <h3 className="summary-title" data-testid="summary-title">
              {head.title}
            </h3>
            {head.meta === '' ? null : <div className="summary-meta">{head.meta}</div>}
          </div>
        </div>
        <div className="summary-details" key={event.key}>
          <Details event={event} links={props} />
        </div>
        <footer className="summary-controls">
          <div className="summary-controls-left">
            <button
              type="button"
              className="btn btn-plain"
              data-testid="turn-summary-report"
              onClick={props.onOpenReport}
            >
              Open Turn report
            </button>
          </div>
          <div className="summary-pager">
            <button
              type="button"
              className="btn summary-arrow"
              data-testid="summary-prev"
              aria-label="Previous event"
              title={withShortcut('Previous event', '←')}
              disabled={index === 0}
              onClick={() => {
                go(index - 1);
              }}
            >
              ‹
            </button>
            <div className="summary-dots" data-testid="summary-dots">
              {groups.map((group) => (
                <div key={`${group.group}-${group.items[0]?.at ?? 0}`} className="summary-dot-group">
                  {group.items.map(({ event: item, at }) => {
                    const itemKind = kindOf(item);
                    const name = `${itemKind.label}: ${heading(item).title}`;
                    return (
                      <button
                        key={`${item.kind}-${item.key}`}
                        type="button"
                        className={`summary-dot${at === index ? ' summary-dot-on' : seen.current.has(at) ? ' summary-dot-seen' : ''}`}
                        style={{ ['--kind' as string]: itemKind.color }}
                        data-testid={`summary-dot-${at}`}
                        aria-label={name}
                        aria-current={at === index ? 'step' : undefined}
                        title={name}
                        onClick={() => {
                          go(at);
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <span className="figure muted small summary-count" data-testid="summary-count">
              {groupDigits(index + 1)} / {groupDigits(events.length)}
            </span>
            <button
              type="button"
              className="btn summary-arrow"
              data-testid="summary-next"
              aria-label="Next event"
              title={withShortcut('Next event', '→')}
              disabled={index === last}
              onClick={() => {
                go(index + 1);
              }}
            >
              ›
            </button>
          </div>
          <div className="summary-controls-right">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="turn-summary-continue"
              // VIS, Buttons: the Escape key dismisses the Turn summary as Continue does.
              title={withShortcut(undefined, 'Esc')}
              data-sound="back"
              onClick={props.onDismiss}
            >
              Continue
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
