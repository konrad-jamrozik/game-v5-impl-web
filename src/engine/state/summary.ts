import type { CurrentWorldState, StateSummary } from './types.ts';

/** The reduced form of one Committed state that a History entry keeps; see DEC-016. */
export function summarize(world: CurrentWorldState): StateSummary {
  return {
    money: world.agency.state.money,
    funding: world.agency.state.funding,
    panic: world.panic,
    servingAgents: Object.values(world.agents).filter((agent) => agent.state.lifecycle === 'Serving').length,
    activeInvestigations: Object.values(world.investigations).filter(
      (investigation) => investigation.state.lifecycle === 'Active',
    ).length,
    activeMissionSites: Object.values(world.missionSites).filter((site) => site.state.lifecycle === 'Active')
      .length,
  };
}
