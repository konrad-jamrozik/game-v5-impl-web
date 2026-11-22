import { describe, expect, it } from 'vite-plus/test';
import { hiddenByChecks } from '../../src/web/agent-selection.ts';
import { combatShare } from '../../src/web/combat-share.ts';

describe('AVIEW, Row filters: the Hide checkboxes', () => {
  const resting = { assignment: { kind: 'Standby' }, exhaustion: 30 } as const;
  const recovering = { assignment: { kind: 'Recovery' }, exhaustion: 0 } as const;
  const tired = { assignment: { kind: 'Training' }, exhaustion: 31 } as const;

  it('hides nothing while both are unchecked', () => {
    const none = { hideRecovering: false, hideExhausted: false };
    expect([resting, recovering, tired].some((agent) => hiddenByChecks(agent, none, 30))).toBe(false);
  });

  it('Hide recovering hides every Agent whose Assignment is Recovery', () => {
    const checks = { hideRecovering: true, hideExhausted: false };
    expect(hiddenByChecks(recovering, checks, 30)).toBe(true);
    expect(hiddenByChecks(tired, checks, 30)).toBe(false);
  });

  it('Hide with exhaustion > N hides only an exhaustion above exhaustion_free_points', () => {
    const checks = { hideRecovering: false, hideExhausted: true };
    expect(hiddenByChecks(resting, checks, 30)).toBe(false);
    expect(hiddenByChecks(tired, checks, 30)).toBe(true);
    expect(hiddenByChecks(recovering, checks, 30)).toBe(false);
  });
});

describe('MVIEW, Deployment: the share of the Enemies Combat rating', () => {
  it('is a whole percentage rounded down', () => {
    expect(combatShare(1063, 1134)?.percent).toBe(93);
    expect(combatShare(1099, 1000)?.percent).toBe(109);
  });

  it('takes the colour of its band', () => {
    expect(combatShare(94, 100)?.tone).toBe('tone-bad');
    expect(combatShare(95, 100)?.tone).toBe('tone-accent');
    expect(combatShare(99, 100)?.tone).toBe('tone-accent');
    expect(combatShare(100, 100)?.tone).toBe('tone-warning');
    expect(combatShare(104, 100)?.tone).toBe('tone-warning');
    expect(combatShare(105, 100)?.tone).toBe('tone-good');
    expect(combatShare(1099, 1000)?.tone).toBe('tone-good');
    expect(combatShare(110, 100)?.tone).toBe('tone-good-bright');
  });

  it('is 0% in Danger while no Agent is checked', () => {
    expect(combatShare(0, 300)).toEqual({ percent: 0, tone: 'tone-bad' });
  });

  it('is left out while the Enemies Combat rating is 0', () => {
    expect(combatShare(300, 0)).toBeNull();
  });
});
