import type { GdrCatalog } from '../../gdr/index.ts';
import { agentCombatantValues, effectiveSkill } from '../mechanics/agents/agents.ts';
import { agencyCaps, agentUpgradeBonus } from '../mechanics/economy/economy.ts';
import {
  isServing,
  type AgentActivityCounts,
  type AgentState,
  type CurrentWorldState,
  type StateSummary,
} from './types.ts';

/**
 * The reduced form of one World state that a History entry keeps; see DEC-016. It also holds the Serving Agents by
 * activity and their effective skills, which AGENT, Turn report, requires of the Turn-end state, and the Agency caps,
 * which ECON, Turn report, requires of the Turn-start state; every summary holds all of them, so the Turn-start and
 * Turn-end summaries share one shape.
 */
export function summarize(world: CurrentWorldState, gdrs: GdrCatalog): StateSummary {
  const serving = Object.values(world.agents).filter((agent) => isServing(agent.state));
  const bonus = agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
  const activity: Record<keyof AgentActivityCounts, number> = {
    standby: 0,
    training: 0,
    contracting: 0,
    investigating: 0,
    deployed: 0,
    recovering: 0,
    inTransit: 0,
  };
  for (const agent of serving) {
    activity[activityOf(agent.state)] += 1;
  }
  const caps = agencyCaps(gdrs.economy, gdrs.upgrades, world.agency.state.acquisitions);
  return {
    money: world.agency.state.money,
    funding: world.agency.state.funding,
    panicHundredths: world.panicHundredths,
    servingAgents: serving.length,
    activeInvestigations: Object.values(world.investigations).filter(
      (investigation) => investigation.state.lifecycle === 'Active',
    ).length,
    activeMissionSites: Object.values(world.missionSites).filter((site) => site.state.lifecycle === 'Active')
      .length,
    agentActivity: activity,
    effectiveSkills: serving.map((agent) =>
      effectiveSkill(agentCombatantValues(agent.state, bonus), gdrs.agentParameters),
    ),
    caps: { agentCap: caps.agentCap, transportCap: caps.transportCap, trainingCap: caps.trainingCap },
  };
}

/**
 * AGENT, Turn report: an Agent In transit counts as In transit, a Recovering Agent as Recovering, and every other
 * Serving Agent by the Assignment it is At assignment on.
 */
function activityOf(agent: AgentState): keyof AgentActivityCounts {
  if (agent.status === 'InTransit') {
    return 'inTransit';
  }
  if (agent.status === 'Recovering') {
    return 'recovering';
  }
  switch (agent.assignment?.kind) {
    case 'Training':
      return 'training';
    case 'Contracting':
      return 'contracting';
    case 'Investigation':
      return 'investigating';
    case 'Deployed':
      return 'deployed';
    default:
      return 'standby';
  }
}
