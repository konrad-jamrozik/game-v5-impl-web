/** Tests of the Contracting cap: ECON, Contracting cap and Caps on assigning Agents, and LEAD, Contracting cap growth. */
import { describe, expect, it } from 'vite-plus/test';
import { contractingCap } from '../../src/engine/mechanics/economy/economy.ts';
import {
  contractingCapGrowth,
  leadInitiativeOperationLevel,
} from '../../src/engine/mechanics/leads/leads.ts';
import type { CampaignState, CurrentWorldState } from '../../src/engine/state/types.ts';
import {
  availableActionsView,
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
} from '../../src/engine/views/views.ts';
import { bootstrapGdrCatalog, type GdrCatalog } from '../../src/gdr/index.ts';
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

/**
 * A World state's Missions, Mission sites, and Investigations, holding one Won Mission at a site of each given Lead,
 * in order, against the given Faction.
 */
function wonAt(
  wins: readonly (readonly [lead: string, faction: string])[],
): Parameters<typeof contractingCapGrowth>[0] {
  const world = { missions: {}, missionSites: {}, investigations: {} } as unknown as Pick<
    CurrentWorldState,
    'missions' | 'missionSites' | 'investigations'
  >;
  wins.forEach(([lead, targetFaction], index) => {
    world.investigations[`investigation-${index}`] = { constants: { lead } } as never;
    world.missionSites[`mission-site-${index}`] = {
      constants: {
        origin: { kind: 'Investigation', investigation: `investigation-${index}` },
        targetFaction,
      },
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

  it('grows at each Initiative operation level by one entry for each distinct Faction Won against there', () => {
    const member = 'locate_red_dawn_member';
    const safehouse = 'locate_red_dawn_safehouse';
    expect(leadInitiativeOperationLevel(member, gdrs)).toBe(1);
    expect(leadInitiativeOperationLevel(safehouse, gdrs)).toBe(2);
    const [r1 = 0, r2 = 0, r3 = 0] = economy.contractingCapPerInitiativeLevel;
    expect(contractingCapGrowth(wonAt([]), gdrs)).toBe(0);
    expect(contractingCapGrowth(wonAt([[member, 'f1']]), gdrs)).toBe(r1);
    // A second win against the same Faction at a level adds nothing.
    expect(
      contractingCapGrowth(
        wonAt([
          [member, 'f1'],
          [member, 'f1'],
        ]),
        gdrs,
      ),
    ).toBe(r1);
    // A second and a third Faction at that level bring the second and the third entry, a fourth nothing.
    expect(
      contractingCapGrowth(
        wonAt([
          [member, 'f1'],
          [member, 'f2'],
        ]),
        gdrs,
      ),
    ).toBe(r1 + r2);
    expect(
      contractingCapGrowth(
        wonAt([
          [member, 'f1'],
          [member, 'f2'],
          [member, 'f3'],
          [member, 'f4'],
        ]),
        gdrs,
      ),
    ).toBe(r1 + r2 + r3 + (economy.contractingCapPerInitiativeLevel[3] ?? 0));
    // Each level counts its own Factions.
    expect(
      contractingCapGrowth(
        wonAt([
          [member, 'f1'],
          [member, 'f2'],
          [safehouse, 'f1'],
        ]),
        gdrs,
      ),
    ).toBe(r1 + r2 + r1);
    expect(contractingCap(economy, true, 7)).toBe(economy.baseContractingCap + 7);
    // Wins before Contracting is unlocked raise nothing while it is locked.
    expect(contractingCap(economy, false, 7)).toBe(0);
  });

  it('Turn report: the first Won Mission against each Faction at a level brings its rise, a second against it and a locked cap none', () => {
    const member = 'locate_red_dawn_member';
    const [r1 = 0] = economy.contractingCapPerInitiativeLevel;
    // Each win sends four newly hired Agents, so that Agents still away from an earlier win play no part.
    const win = (start: CampaignState, faction = 0, catalog: GdrCatalog = gdrs, lead = member) => {
      const site = addMissionSite(
        withAgents(start, agentIds(start).length + 4, catalog),
        catalog.leads.find((item) => item.id === lead)!.onCompletion.createMissionSite!,
        { lead, faction, catalog },
      );
      const deployed = act(
        site.state,
        'deployAgents',
        { missionSite: site.site, agents: agentIds(site.state).slice(-4) },
        'player',
        catalog,
      );
      const after = advance(deployed, winning(deployed, site.site), catalog);
      return {
        state: after,
        rises: after.world.history.turnReport!.missions.map((m) => m.contractingCapRise),
      };
    };
    const first = win(newCampaign());
    expect(first.rises).toEqual([r1]);
    expect(agency(first.state).contractingCap).toBe(economy.baseContractingCap + r1);
    expect(agency(first.state).contractingCapGrowth).toBe(r1);
    // A second win against the Faction already counted at the level brings no rise.
    expect(win(first.state).rises).toEqual([0]);
    // A win against another Faction at that level brings the second entry. The test Game build holds Red Dawn alone,
    // so this part plays the Game build, whose second Faction is Exalt.
    const full = bootstrapGdrCatalog();
    const exalt = Object.values(newCampaign({ catalog: full }).world.current.factions).findIndex(
      (faction) => faction.archetype === 'exalt',
    );
    const redDawn = win(newCampaign({ catalog: full }), 0, full);
    const second = win(redDawn.state, exalt, full, 'locate_exalt_member');
    const [f1 = 0, f2 = 0] = full.economy.contractingCapPerInitiativeLevel;
    expect(redDawn.rises).toEqual([f1]);
    expect(second.rises).toEqual([f2]);
    expect(currentLiveWorldStateView(second.state, full).agency.contractingCap).toBe(
      full.economy.baseContractingCap + f1 + f2,
    );
    // While Contracting is locked, the first win brings no rise either.
    expect(win(newCampaign({ contractingUnlocked: false })).rises).toEqual([0]);
  });
});
