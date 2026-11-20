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
    const message = tiredDeploymentMessage(view, [a1, a2, a3])!;
    expect(message).toContain(`${a2}: exhaustion 20, effective skill 100`);
    expect(message).toContain(`${a3}: exhaustion 47, effective skill 83`);
    expect(message).not.toContain(`${a1}:`);
    expect(message).toContain('Deploy anyway?');
  });
});
