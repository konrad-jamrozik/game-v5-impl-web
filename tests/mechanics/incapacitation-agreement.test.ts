/**
 * REUSE, Rules read by other rules, Agreement test: precondition 9 of MISSION, Deploying Agents rejects exactly the
 * Agents that COMBAT, Combat start sets Incapacitated with the same values, because both call the one implementation
 * of COMBAT, Incapacitation condition. Also AGENT, Start-work gate: an Agent with health lost is not Fit to start work.
 */
import { describe, expect, it } from 'vite-plus/test';
import { isFitForWork } from '../../src/engine/mechanics/agents/agents.ts';
import { agentCombatantState, fightCombat } from '../../src/engine/mechanics/combat/combat.ts';
import { agentUpgradeBonus } from '../../src/engine/mechanics/economy/economy.ts';
import { seededRandom } from '../../src/engine/random.ts';
import { isRejection } from '../../src/engine/result.ts';
import { seedRng } from '../../src/kernel/index.ts';
import {
  addMissionSite,
  agent,
  agentIds,
  combatEnemy,
  gdrs,
  newCampaign,
  setCurrentHealth,
  tryAct,
  tweak,
  withAgents,
} from '../helpers/game.ts';

describe('REUSE: the incapacitation condition read by deployAgents', () => {
  it('deployAgents rejects exactly the Agents that Combat start sets Incapacitated', () => {
    const p = gdrs.agentParameters;
    const free = p.exhaustionFreePoints;
    // Both sides of the exhaustion clause and of the skill clause, e.g. base skill 0 meets the skill clause at once.
    const exhaustions = [0, free, free + 1, p.exhaustionIncapacitation - 1, p.exhaustionIncapacitation];
    const skills = [0, 0.5, 1, 100];
    const enemyArchetype = [...gdrs.enemyArchetypes.keys()][0]!;
    let rejected = 0;
    let accepted = 0;
    for (const exhaustion of exhaustions) {
      for (const skill of skills) {
        const base = withAgents(newCampaign({ money: 2000 }), 1);
        const [a1] = agentIds(base) as [string];
        const created = addMissionSite(base, 'apprehend_member');
        const state = tweak(created.state, (world) => {
          world.agents[a1]!.state.exactExhaustionHundredths = exhaustion * 100;
          world.agents[a1]!.state.skillHundredths = Math.round(skill * 100);
        });
        const result = tryAct(state, 'deployAgents', { missionSite: created.site, agents: [a1] });
        const deployRejects = isRejection(result) && result.reason === 'agents_incapacitated';
        if (isRejection(result) && !deployRejects) {
          throw new Error(`Unexpected rejection: ${result.reason}`);
        }

        const world = state.world.current;
        const bonus = agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
        const outputs = fightCombat(
          {
            agents: [{ id: a1, state: agentCombatantState(agent(state, a1).state, bonus) }],
            enemies: [combatEnemy('e1', enemyArchetype)],
            combat: gdrs.combatParameters,
            agentParameters: gdrs.agentParameters,
          },
          seededRandom(seedRng(`agreement ${exhaustion} ${skill}`), []),
        );
        const incapacitatedAtStart = outputs.report.participants.find((item) => item.id === a1)!.start
          .incapacitated;

        expect({ exhaustion, skill, deployRejects }).toEqual({
          exhaustion,
          skill,
          deployRejects: incapacitatedAtStart,
        });
        if (deployRejects) {
          rejected += 1;
        } else {
          accepted += 1;
        }
      }
    }
    // Both outcomes occur, so the test covers both sides of the condition.
    expect(rejected).toBeGreaterThan(0);
    expect(accepted).toBeGreaterThan(0);
  });

  it('an Agent with health lost is not Fit to start work, whatever its exhaustion', () => {
    const base = withAgents(newCampaign({ money: 2000 }), 1);
    const [a1] = agentIds(base) as [string];
    const state = tweak(base, (world) => {
      setCurrentHealth(world.agents[a1]!.state, 1000);
    });
    const hurt = agent(state, a1).state;
    expect(hurt.healthLostHundredths).toBeGreaterThan(0);
    expect(isFitForWork(hurt)).toBe(false);
    expect(isFitForWork(agent(base, a1).state)).toBe(true);
    const result = tryAct(state, 'assignAgents', { agents: [a1], assignment: 'Contracting' });
    expect(isRejection(result) ? result.reason : 'accepted').toBe('agents_not_fit_for_work');
  });
});
