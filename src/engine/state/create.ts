/**
 * Campaign creation: the initial Campaign state. Which Campaign instances it contains is the same for every new
 * Campaign; see DOM, Initial Campaign state. Equal inputs give equal initial Campaign state; see DETERM, Determinism.
 */
import { must, seedRng } from '../../kernel/index.ts';
import type { GdrCatalog } from '../../gdr/index.ts';
import { createAgent, drawAgentName } from '../mechanics/agents/agents.ts';
import { createFaction } from '../mechanics/factions/factions.ts';
import { discoverLeads } from '../mechanics/leads/leads.ts';
import { seededRandom } from '../random.ts';
import { newInstanceId } from '../turn/advance.ts';
import { summarize } from './summary.ts';
import type { CampaignState, CurrentWorldState } from './types.ts';

export function createCampaignState(
  configuration: { startingMoney: number; startingFunding: number; prologue?: number; tutorials?: number },
  seed: string,
  gdrs: GdrCatalog,
): CampaignState {
  const world: CurrentWorldState = {
    seed,
    rng: seedRng(seed),
    nextInstanceNumbers: {},
    randomOverrides: [],
    turn: 1,
    panicHundredths: 0,
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
        // ECON, Agency creation: Contracting is not unlocked.
        contractingUnlocked: false,
        // EQUIP, Storage: the rounds starting_ammo lists and no Item.
        storage: { ...gdrs.equipment.startingAmmo },
      },
    },
    agents: {},
    factions: {},
    investigations: {},
    missionSites: {},
    missions: {},
    enemies: {},
    // LEAD, Lead discovery: filled below, once the Factions exist.
    discoveredLeads: [],
  };
  const agency = { ...world.agency, id: newInstanceId(world, 'agency') };
  world.agency = agency;

  // AGENT, Initial roster.
  const weapon = must(gdrs.weapons.get(gdrs.agentArchetype.weapon), 'Weapon of the AgentArchetype');
  const armor = must(gdrs.armors.get(gdrs.agentArchetype.armor), 'Armor of the AgentArchetype');
  for (let i = 0; i < gdrs.agentParameters.initialRosterSize; i += 1) {
    const id = newInstanceId(world, 'agent');
    const agent = createAgent({
      id,
      agencyId: agency.id,
      turn: world.turn,
      initialRoster: true,
      archetype: gdrs.agentArchetype,
      weapon,
      armor,
      name: drawAgentName({
        campaignSeed: seed,
        id,
        nameLists: gdrs.nameLists,
        femaleNamePercent: gdrs.agentParameters.femaleNamePercent,
        overrides: [],
      }),
    });
    world.agents[agent.id] = agent;
  }

  // FACTION, Initial Factions: exactly one Faction for each FactionArchetype, created in the authored order of the
  // FactionArchetypes, which GDR, GDR authoring format preserves, so the first takes the Instance ID `faction-1`.
  // Every Faction starts by entering the first level, the one FactionActivityLevel whose `lasts_turns` is
  // `per_faction`, under FACTION, FactionActivityLevel.
  const random = seededRandom(world.rng, world.randomOverrides);
  const firstLevel = must(
    [...gdrs.factionActivityLevels.values()].find((level) => level.lastsTurns === 'per_faction'),
    'the first FactionActivityLevel',
  );
  for (const archetype of gdrs.factionArchetypes) {
    const faction = createFaction(
      newInstanceId(world, 'faction'),
      archetype,
      firstLevel,
      (id) => must(gdrs.factionActivityLevels.get(id), `FactionActivityLevel ${id}`),
      random,
    );
    world.factions[faction.id] = faction;
  }

  // LEAD, Lead discovery: `discovered_when` is evaluated for every Lead in the initial Campaign state; a Lead without it
  // is in the set from campaign creation.
  discoverLeads(world, gdrs.leads);

  return {
    configuration: {
      startingMoney: configuration.startingMoney,
      startingFunding: configuration.startingFunding,
      // TURN, Prologue: the value is kept as configured; the Prologue itself runs after this initial Campaign state.
      prologue: configuration.prologue ?? 0,
      // TSUM, Tutorials: on unless the configuration turns it off.
      tutorials: configuration.tutorials ?? 1,
    },
    world: {
      current: world,
      history: {
        turnReport: null,
        historyEntries: [],
        currentTurnStart: summarize(world, gdrs),
        // WHIST, Action record: empty in the Turn-start state.
        currentActions: [],
        // ECON, Turn series of money: Money at the start of turn for the first Turn.
        moneyAtStartOfTurn: [{ turn: 1, value: configuration.startingMoney }],
        moneyAtEndOfTurn: [],
      },
    },
  };
}
