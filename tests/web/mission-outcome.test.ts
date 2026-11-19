/** Tests of MVIEW, Final state and Concluded Mission site: what a finished Mission site shows from its History entry. */
import { describe, expect, it } from 'vitest';
import type { ConsequenceRecord, HistoryEntry, HistoryParticipant } from '../../src/engine/index.ts';
import {
  appliedConsequence,
  conditionText,
  finalState,
  historyMission,
  participantRowClass,
  type HistoryMission,
} from '../../src/web/mission-outcome.ts';

const none: ConsequenceRecord = {
  money: 0,
  fundingChange: 0,
  panicIncrease: 0,
  panicReduction: 0,
  eliminatedFaction: null,
};

function mission(
  site: string,
  result: 'Won' | 'Lost',
  outcome: HistoryMission['combatOutcome'],
): HistoryMission {
  return {
    mission: `mission-${site}`,
    missionSite: site,
    missionSiteArchetype: 'raid_safehouse',
    kind: 'Initiative',
    result,
    combatOutcome: outcome,
    combatRounds: 3,
    killed: [],
    wounded: [],
    unharmed: [],
    participants: [],
    ratingsStart: { agents: 296, enemies: 240 },
    ratingsEnd: { agents: 88, enemies: 0 },
    consequence: { ...none, money: 100 },
  };
}

function entry(
  missions: HistoryMission[],
  expired: { missionSite: string; consequence: ConsequenceRecord }[],
) {
  return { report: { missions, expiredConsequences: expired } } as unknown as HistoryEntry;
}

function participant(
  side: 'agent' | 'enemy',
  condition: HistoryParticipant['condition'],
): HistoryParticipant {
  return {
    id: 'x',
    side,
    startHealthHundredths: 3000,
    startEffectiveSkill: 100,
    endHealthHundredths: 0,
    endEffectiveSkill: 0,
    condition,
  };
}

describe('MVIEW, Final state', () => {
  it('shows Won for a Won Mission and the Combat outcome of a Lost one, never Concluded', () => {
    expect(finalState('Concluded', mission('s', 'Won', 'Prevailed'))).toEqual({ text: 'Won', tone: 'good' });
    expect(finalState('Concluded', mission('s', 'Lost', 'Retreated'))).toEqual({
      text: 'Retreated',
      tone: 'bad',
    });
    expect(finalState('Concluded', mission('s', 'Lost', 'Wiped'))).toEqual({ text: 'Wiped', tone: 'bad' });
    expect(finalState('Expired', null)).toEqual({ text: 'Expired', tone: 'accent' });
    expect(finalState('Cancelled', null)).toEqual({ text: 'Cancelled', tone: 'muted' });
    expect(finalState('Active', null)).toBeNull();
  });
});

describe('MVIEW, Selected Mission site: Consequences that applied', () => {
  const won = mission('mission-site-3', 'Won', 'Prevailed');
  const expiredPanic = { ...none, panicIncrease: 3 };
  const entries = [
    entry([won], []),
    entry([], [{ missionSite: 'mission-site-4', consequence: expiredPanic }]),
  ];

  it('reads a Mission site in a final state from its History entry', () => {
    expect(historyMission(entries, 'mission-site-3')).toBe(won);
    expect(appliedConsequence(entries, 'mission-site-3', won)).toEqual({ ...none, money: 100 });
    expect(appliedConsequence(entries, 'mission-site-4', null)).toEqual(expiredPanic);
    // A Cancelled Mission site never had a Consequence applied.
    expect(appliedConsequence(entries, 'mission-site-5', null)).toBeNull();
  });
});

describe('MVIEW, Concluded Mission site', () => {
  it('names a dead Agent Killed and a dead Enemy Dead, in Danger, and an Incapacitated one in Warning', () => {
    expect(conditionText(participant('agent', 'dead'))).toBe('Killed');
    expect(conditionText(participant('enemy', 'dead'))).toBe('Dead');
    expect(conditionText(participant('enemy', 'incapacitated'))).toBe('Incapacitated');
    expect(conditionText(participant('agent', 'ableToFight'))).toBe('');
    expect(participantRowClass(participant('enemy', 'dead'))).toBe('tone-bad');
    expect(participantRowClass(participant('agent', 'incapacitated'))).toBe('tone-warning');
    expect(participantRowClass(participant('agent', 'ableToFight'))).toBe('');
  });
});
