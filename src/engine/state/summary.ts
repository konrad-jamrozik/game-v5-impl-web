import { isServing, type CurrentWorldState, type StateSummary } from './types.ts';

/** The reduced form of one World state that a History entry keeps; see DEC-016. */
export function summarize(world: CurrentWorldState): StateSummary {
  return {
    money: world.agency.state.money,
    funding: world.agency.state.funding,
    panicHundredths: world.panicHundredths,
    servingAgents: Object.values(world.agents).filter((agent) => isServing(agent.state)).length,
    activeInvestigations: Object.values(world.investigations).filter(
      (investigation) => investigation.state.lifecycle === 'Active',
    ).length,
    activeMissionSites: Object.values(world.missionSites).filter((site) => site.state.lifecycle === 'Active')
      .length,
  };
}
