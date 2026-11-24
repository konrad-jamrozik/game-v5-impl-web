/** Tests of the Contracting cap: ECON, Contracting cap and Caps on assigning Agents, and LEAD, Contracting cap growth. */
import { describe, expect, it } from 'vite-plus/test';
import { contractingCap } from '../../src/engine/mechanics/economy/economy.ts';
import { initiativeLevelsWon, leadInitiativeOperationLevel } from '../../src/engine/mechanics/leads/leads.ts';
import type { CampaignState, CurrentWorldState } from '../../src/engine/state/types.ts';
import {
  availableActionsView,
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
} from '../../src/engine/views/views.ts';
import {
  act,
  addMissionSite,
  advance,
  agentIds,
  expectRejected,
  gdrs,
  newCampaign,
  tweak,
  winning,
  withAgents,
  useExampleCatalog,
} from '../helpers/game.ts';

useExampleCatalog();
const { economy } = gdrs;
const LEAD = 'contracting_opportunities';
const agency = (state: CampaignState) => currentLiveWorldStateView(state, gdrs).agency;

/** A World state's Missions, Mission sites, and Investigations, holding one Won Mission at a site of each given Lead. */
function wonAt(leads: readonly string[]): Parameters<typeof initiativeLevelsWon>[0] {
  const world = { missions: {}, missionSites: {}, investigations: {} } as unknown as Pick<
    CurrentWorldState,
    'missions' | 'missionSites' | 'investigations'
  >;
  leads.forEach((lead, index) => {
    world.investigations[`investigation-${index}`] = { constants: { lead } } as never;
    world.missionSites[`mission-site-${index}`] = {
      constants: { origin: { kind: 'Investigation', investigation: `investigation-${index}` } },
    } as never;
    world.missions[`mission-${index}`] = {
      constants: { missionSite: `mission-site-${index}` },
      state: { lifecycle: 'Won' },
    } as never;
  });
  return world;
}

describe('ECON: Contracting cap', () => {
  it('is 0 until Contracting is unlocked, so no Agent can be assigned to Contracting', () => {
    const state = newCampaign({ contractingUnlocked: false });
    expect(agency(state)).toMatchObject({ contractingUnlocked: false, contractingCap: 0 });
    const [a1] = agentIds(state) as [string];
    expectRejected(state, 'assignAgents', { agents: [a1], assignment: 'Contracting' }, 'contracting_cap');
    // The Training cap is unaffected.
    expect(act(state, 'assignAgents', { agents: [a1], assignment: 'Training' })).toBeDefined();
  });

  it('opens at base_contracting_cap when the Lead that unlocks Contracting is completed', () => {
    let state = newCampaign({ contractingUnlocked: false, firstLead: false });
    expect(state.world.current.discoveredLeads).toContain(LEAD);
    const [a1] = agentIds(state) as [string];
    state = tweak(state, (world) => {
      world.randomOverrides.push({ outcome: `investigation.requiredProgress.${LEAD}`, value: 3 });
    });
    state = act(state, 'startInvestigation', { lead: LEAD, agents: [a1] });
    for (let turn = 0; turn < 10 && !state.world.current.agency.state.contractingUnlocked; turn += 1) {
      state = advance(state);
    }
    expect(agency(state)).toMatchObject({
      contractingUnlocked: true,
      contractingCap: economy.baseContractingCap,
    });
    // Completed once, the Lead is Archived; it has no Faction and creates no Mission site.
    expect(currentRetiredWorldStateView(state, gdrs).leads.find((lead) => lead.id === LEAD)).toMatchObject({
      status: 'Archived',
      unlocksContracting: true,
    });
  });

  it('rejects, as a whole, an order to Contracting that would exceed the cap', () => {
    const state = withAgents(newCampaign(), economy.baseContractingCap + 1);
    const ids = agentIds(state);
    expect(ids.length).toBeGreaterThan(economy.baseContractingCap);
    expectRejected(
      state,
      'assignAgents',
      { agents: ids.slice(0, economy.baseContractingCap + 1), assignment: 'Contracting' },
      'contracting_cap',
    );
    const filled = act(state, 'assignAgents', {
      agents: ids.slice(0, economy.baseContractingCap),
      assignment: 'Contracting',
    });
    expect(agency(filled)).toMatchObject({ contractingAgents: economy.baseContractingCap });
    expect(availableActionsView(filled, gdrs).assignAgents.contractingPlacesLeft).toBe(0);
  });

  it('grows by contracting_cap_per_initiative_level for the first win at each Initiative operation level only', () => {
    const member = 'locate_red_dawn_member';
    const safehouse = 'locate_red_dawn_safehouse';
    expect(leadInitiativeOperationLevel(member, gdrs)).toBe(1);
    expect(leadInitiativeOperationLevel(safehouse, gdrs)).toBe(2);
    expect(initiativeLevelsWon(wonAt([]), gdrs)).toBe(0);
    // A second win at a level already counted adds nothing.
    expect(initiativeLevelsWon(wonAt([member, member]), gdrs)).toBe(1);
    expect(initiativeLevelsWon(wonAt([member, safehouse]), gdrs)).toBe(2);
    const per = economy.contractingCapPerInitiativeLevel;
    expect(contractingCap(economy, true, 2)).toBe(economy.baseContractingCap + 2 * per);
    // Levels won before Contracting is unlocked raise nothing while it is locked.
    expect(contractingCap(economy, false, 2)).toBe(0);
  });

  it('Turn report: the first Won Mission at a level brings the rise, a second at that level and a locked cap none', () => {
    const member = 'locate_red_dawn_member';
    const archetype = gdrs.leads.find((lead) => lead.id === member)!.onCompletion.createMissionSite!;
    // Each win sends four newly hired Agents, so that Agents still away from an earlier win play no part.
    const win = (start: CampaignState) => {
      const site = addMissionSite(withAgents(start, agentIds(start).length + 4), archetype, { lead: member });
      const deployed = act(site.state, 'deployAgents', {
        missionSite: site.site,
        agents: agentIds(site.state).slice(-4),
      });
      const after = advance(deployed, winning(deployed, site.site));
      return {
        state: after,
        rises: after.world.history.turnReport!.missions.map((m) => m.contractingCapRise),
      };
    };
    const first = win(newCampaign());
    expect(first.rises).toEqual([economy.contractingCapPerInitiativeLevel]);
    expect(agency(first.state).contractingCap).toBe(
      economy.baseContractingCap + economy.contractingCapPerInitiativeLevel,
    );
    // A second win at the level already counted brings no rise.
    expect(win(first.state).rises).toEqual([0]);
    // While Contracting is locked, the first win brings no rise either.
    expect(win(newCampaign({ contractingUnlocked: false })).rises).toEqual([0]);
  });
});
