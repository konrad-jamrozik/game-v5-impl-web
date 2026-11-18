/**
 * Campaign creation: the initial Campaign state. Which Campaign instances it contains is the same for every new
 * Campaign; see DOM, Initial Campaign state. Equal inputs give equal initial Campaign state; see DETERM, Determinism.
 */
import { must, seedRng } from '../../kernel/index.ts';
import type { GdrCatalog } from '../../gdr/index.ts';
import { createAgent } from '../mechanics/agents/agents.ts';
import { createFaction } from '../mechanics/factions/factions.ts';
import { seededRandom } from '../random.ts';
import { newInstanceId } from '../turn/advance.ts';
import { summarize } from './summary.ts';
import type { CampaignState, CurrentWorldState } from './types.ts';

export function createCampaignState(
  configuration: { startingMoney: number; startingFunding: number },
  seed: string,
  gdrs: GdrCatalog,
): CampaignState {
  const world: CurrentWorldState = {
    seed,
    rng: seedRng(seed),
    nextInstanceNumbers: {},
    randomOverrides: [],
    turn: 1,
    panic: 0,
    ending: null,
    endingReasons: [],
    endingTurn: null,
    // ECON, Agency creation.
    agency: {
      id: 'agency-0',
      archetype: gdrs.agencyArchetype.id,
      constants: {},
      state: {
        money: configuration.startingMoney,
        funding: configuration.startingFunding,
        acquisitions: Object.fromEntries(gdrs.upgrades.map((upgrade) => [upgrade.id, 0])),
      },
    },
    agents: {},
    factions: {},
    investigations: {},
    missionSites: {},
    missions: {},
    enemies: {},
    // LEAD, Lead progression: an empty set of Recorded wins for every Lead.
  };
  const agency = { ...world.agency, id: newInstanceId(world, 'agency') };
  world.agency = agency;

  // AGENT, Initial roster.
  const weapon = must(gdrs.weapons.get(gdrs.agentArchetype.weapon), 'Weapon of the AgentArchetype');
  for (let i = 0; i < gdrs.agentParameters.initialRosterSize; i += 1) {
    const agent = createAgent({
      id: newInstanceId(world, 'agent'),
      agencyId: agency.id,
      turn: world.turn,
      initialRoster: true,
      archetype: gdrs.agentArchetype,
      weapon,
      weaponDamageBonus: 0,
      baseHealthBonus: 0,
    });
    world.agents[agent.id] = agent;
  }

  // FACTION, Initial Factions: exactly one Faction for each FactionArchetype.
  const random = seededRandom(world.rng, world.randomOverrides);
  for (const archetype of gdrs.factionArchetypes) {
    const faction = createFaction(
      newInstanceId(world, 'faction'),
      archetype,
      (id) => must(gdrs.factionActivityLevels.get(id), `FactionActivityLevel ${id}`),
      random,
    );
    world.factions[faction.id] = faction;
  }

  return {
    configuration: {
      startingMoney: configuration.startingMoney,
      startingFunding: configuration.startingFunding,
    },
    world: {
      current: world,
      history: {
        turnReport: null,
        historyEntries: [],
        currentTurnStart: summarize(world),
        // WHIST, Action record: empty in the Turn-start state.
        currentActions: [],
        // ECON, Turn series of money: Money at the start of turn for the first Turn.
        moneyAtStartOfTurn: [{ turn: 1, value: configuration.startingMoney }],
        moneyAtEndOfTurn: [],
      },
    },
  };
}
