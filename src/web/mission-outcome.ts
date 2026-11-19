/**
 * MVIEW, Final state and Concluded Mission site: what a Mission site in a final state shows, read from the History
 * entry of the Turn it reached that state in, never from the participants' current values. Pure presentation.
 */
import type { ConsequenceRecord, HistoryEntry, HistoryParticipant } from '../engine/index.ts';

/** What the History keeps of one resolved Mission. */
export type HistoryMission = HistoryEntry['report']['missions'][number];

/** The final state a Mission site reached, as the Missions View writes it, and its tone. */
export interface FinalState {
  readonly text: string;
  readonly tone: 'good' | 'bad' | 'accent' | 'muted';
}

/** MISSION, Turn report: the History record of the Mission resolved at `site`, if its Combat was fought. */
export function historyMission(entries: readonly HistoryEntry[], site: string): HistoryMission | null {
  for (const entry of entries) {
    const found = entry.report.missions.find((mission) => mission.missionSite === site);
    if (found !== undefined) {
      return found;
    }
  }
  return null;
}

/**
 * MVIEW, Final state: "Won" for a Won Mission; the Combat outcome of a Lost Mission, "Retreated" or "Wiped"; "Expired"
 * and "Cancelled" for a Mission site that never had one. Null for a Mission site not in a final state.
 */
export function finalState(lifecycle: string, mission: HistoryMission | null): FinalState | null {
  switch (lifecycle) {
    case 'Concluded':
      if (mission === null) {
        return { text: 'Concluded', tone: 'muted' };
      }
      return mission.result === 'Won'
        ? { text: 'Won', tone: 'good' }
        : { text: mission.combatOutcome, tone: 'bad' };
    case 'Expired':
      return { text: 'Expired', tone: 'accent' };
    case 'Cancelled':
      return { text: 'Cancelled', tone: 'muted' };
    default:
      return null;
  }
}

/** The CSS class of a FinalState's tone. */
export function toneClass(tone: FinalState['tone']): string {
  return { good: 'tone-good', bad: 'tone-bad', accent: 'tone-accent', muted: 'muted' }[tone];
}

/**
 * MVIEW, Selected Mission site: the Consequences that applied to a Mission site in a final state, from its History
 * entry; null when nothing applied, e.g. for a Cancelled Mission site.
 */
export function appliedConsequence(
  entries: readonly HistoryEntry[],
  site: string,
  mission: HistoryMission | null,
): ConsequenceRecord | null {
  if (mission !== null) {
    return mission.consequence;
  }
  for (const entry of entries) {
    const found = entry.report.expiredConsequences.find((item) => item.missionSite === site);
    if (found !== undefined) {
      return found.consequence;
    }
  }
  return null;
}

/** MVIEW, Concluded Mission site: the Condition column, "Killed" for a dead Agent and "Dead" for a dead Enemy. */
export function conditionText(participant: HistoryParticipant): string {
  switch (participant.condition) {
    case 'dead':
      return participant.side === 'agent' ? 'Killed' : 'Dead';
    case 'incapacitated':
      return 'Incapacitated';
    default:
      return '';
  }
}

/** MVIEW, Concluded Mission site: a dead participant's row in Danger, an Incapacitated one's in Warning. */
export function participantRowClass(participant: HistoryParticipant): string {
  switch (participant.condition) {
    case 'dead':
      return 'tone-bad';
    case 'incapacitated':
      return 'tone-warning';
    default:
      return '';
  }
}
