/** GUI, Warning on deploying tired Agents. */
import { describe, expect, it } from 'vite-plus/test';
import { currentLiveWorldStateView } from '../../src/engine/views/views.ts';
import { tiredDeploymentMessage } from '../../src/web/tired-deployment.ts';
import { agentIds, gdrs, newCampaign, tweak } from '../helpers/game.ts';

describe('GUI: Warning on deploying tired Agents', () => {
  const base = newCampaign();
  const [a1, a2, a3] = agentIds(base) as [string, string, string];
  const state = tweak(base, (world) => {
    world.agents[a1]!.state.exactExhaustionHundredths = 1900;
    world.agents[a2]!.state.exactExhaustionHundredths = 2000;
    world.agents[a3]!.state.exactExhaustionHundredths = 4700;
  });
  const view = currentLiveWorldStateView(state, gdrs);

  it('gives no warning for a team whose every Agent has exhaustion below 20', () => {
    expect(tiredDeploymentMessage(view, [a1])).toBeNull();
  });

  it('names each Agent with exhaustion of 20 or more, with its exhaustion and effective skill', () => {
    // AGENT, Effective skill, at full health: round down(skill × penalty factor / 100), with the penalty factor
    // max(0, 100 − skill_penalty_pct_per_exhaustion × max(0, exhaustion − exhaustion_free_points)).
    const { exhaustionFreePoints, skillPenaltyPctPerExhaustion } = gdrs.agentParameters;
    const effectiveSkill = (id: string, exhaustion: number) => {
      const penalty = Math.max(
        0,
        100 - skillPenaltyPctPerExhaustion * Math.max(0, exhaustion - exhaustionFreePoints),
      );
      return Math.floor((state.world.current.agents[id]!.state.skillHundredths * penalty) / 10_000);
    };
    // GUI, Agent shown by name: the warning names each Agent by its Agent name.
    const name = (id: string) => view.agents.find((agent) => agent.id === id)!.name;
    const message = tiredDeploymentMessage(view, [a1, a2, a3])!;
    expect(message).toContain(`- ${name(a2)}: exhaustion 20, effective skill ${effectiveSkill(a2, 20)}`);
    expect(message).toContain(`- ${name(a3)}: exhaustion 47, effective skill ${effectiveSkill(a3, 47)}`);
    expect(message).not.toContain(`- ${name(a1)}:`);
    expect(message).toContain('Deploy anyway?');
  });
});
