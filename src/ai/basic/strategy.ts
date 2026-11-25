/**
 * BASICAI: the values the Basic Autopilot AI derives again on every Player action from Player-visible information,
 * i.e. the Threat, the Next rungs, the Strike goal and the Strike team, and the Leads worth investigating.
 */
import type {
  AgentView,
  CurrentLiveWorldStateView,
  CurrentRetiredWorldStateView,
  GameDataView,
  LeadView,
} from '../../engine/player-api.ts';
import { byAgentOrder, planEquipment, statOf, type EquipmentPlan } from './equipping.ts';
import {
  memberWeight,
  ratingParameters,
  restedMember,
  sideRating,
  type RatedMember,
  type RatingParameters,
} from './rating.ts';
import {
  agentsNeeded,
  meetsRequiredShare,
  requiredRatingSharePct,
  type BasicAiThresholds,
} from './tuning.ts';

/** The Combat rating of some Enemies and how many they are. */
export interface Opposition {
  readonly combatRating: number;
  readonly enemies: number;
  /** The MissionSiteArchetype they stand at. */
  readonly archetype: string;
}

/**
 * BASICAI, Glossary, Threat: the strongest Creation Combat rating among the Response Mission sites created in the last
 * Threat window Turns; while there is none, the strongest MissionSiteArchetype of kind `response` serving the lowest
 * Faction operation level.
 */
export function threat(
  live: CurrentLiveWorldStateView,
  retired: CurrentRetiredWorldStateView,
  data: GameDataView,
  windowTurns: number,
): Opposition | null {
  const recent = [...retired.missionSites, ...live.missionSites]
    .filter((site) => site.kind === 'Response' && site.turnCreated >= live.turn - windowTurns)
    .sort((a, b) => b.creationCombatRating - a.creationCombatRating || a.id.localeCompare(b.id));
  const strongest = recent[0];
  if (strongest !== undefined) {
    return {
      combatRating: strongest.creationCombatRating,
      enemies: strongest.enemies.length,
      archetype: strongest.archetype,
    };
  }
  const responses = data.missionSiteArchetypes.filter((item) => item.kind === 'response');
  const lowest = Math.min(...responses.map((item) => item.operationLevel ?? Infinity));
  const fallback = responses
    .filter((item) => (item.operationLevel ?? Infinity) === lowest)
    .sort((a, b) => b.enemiesCombatRating - a.enemiesCombatRating)[0];
  return fallback === undefined ? null : opposition(fallback);
}

const opposition = (archetype: GameDataView['missionSiteArchetypes'][number]): Opposition => ({
  combatRating: archetype.enemiesCombatRating,
  enemies: archetype.enemies.reduce((sum, entry) => sum + entry.count, 0),
  archetype: archetype.id,
});

/** The MissionSiteArchetypes at which a Mission against each Faction is Won, by Faction ID. */
export function wonAgainst(retired: CurrentRetiredWorldStateView): Map<string, Set<string>> {
  const siteOf = new Map(retired.missionSites.map((site) => [site.id, site]));
  const won = new Map<string, Set<string>>();
  for (const mission of retired.missions) {
    const site = siteOf.get(mission.missionSite);
    if (mission.lifecycle === 'Won' && site !== undefined) {
      const set = won.get(site.targetFaction) ?? new Set<string>();
      set.add(site.archetype);
      won.set(site.targetFaction, set);
    }
  }
  return won;
}

/**
 * BASICAI, Glossary, Next rung of each Faction that is not Eliminated: the MissionSiteArchetype of kind `initiative`
 * with the weakest Combat rating of its Enemies that is stronger than every one at which a Mission against that
 * Faction is Won. A Faction that has Won every rung has none.
 */
export function nextRungs(
  live: CurrentLiveWorldStateView,
  data: GameDataView,
  won: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, Opposition> {
  const ratingOfArchetype = new Map(
    data.missionSiteArchetypes.map((item) => [item.id, item.enemiesCombatRating]),
  );
  const ladder = data.missionSiteArchetypes
    .filter((item) => item.kind === 'initiative')
    .sort((a, b) => a.enemiesCombatRating - b.enemiesCombatRating);
  const rungs = new Map<string, Opposition>();
  for (const faction of live.factions) {
    if (faction.eliminated) {
      continue;
    }
    const top = Math.max(
      -1,
      ...[...(won.get(faction.id) ?? [])].map((id) => ratingOfArchetype.get(id) ?? -1),
    );
    const next = ladder.find((item) => item.enemiesCombatRating > top);
    if (next !== undefined) {
      rungs.set(faction.id, opposition(next));
    }
  }
  return rungs;
}

/** What the Basic Autopilot AI derives from one World state. */
export interface Plan {
  /** Serving Agents in Agent order. */
  readonly order: readonly AgentView[];
  readonly storage: EquipmentPlan;
  readonly buying: EquipmentPlan;
  readonly unlimited: EquipmentPlan;
  readonly rating: RatingParameters;
  readonly threat: Opposition | null;
  readonly rungs: ReadonlyMap<string, Opposition>;
  readonly won: ReadonlyMap<string, ReadonlySet<string>>;
  /** The Strike goal, as a Combat rating, and the Enemies it is set by. */
  readonly goal: { readonly combatRating: number; readonly enemies: number } | null;
  /** Eligible Agents in Agent order, rested and in the kit of the Equipping plan. */
  readonly eligible: readonly { readonly agent: AgentView; readonly member: RatedMember }[];
  readonly strike: readonly AgentView[];
  /** BASICAI, Glossary, Strike team size: the Agents the Strike goal asks for, at most the Transport cap. */
  readonly strikeWanted: number;
  readonly strikeIds: ReadonlySet<string>;
  readonly strikeRating: number;
  /** BASICAI, Glossary, Strength gap. */
  readonly gap: boolean;
}

/** The Agent rested, in the kit a plan gives it. */
export function plannedMember(
  agent: AgentView,
  plan: EquipmentPlan,
  data: CurrentLiveWorldStateView,
): RatedMember {
  const kit = plan.kit.get(agent.id);
  const equipment = data.agency.equipment;
  return restedMember(
    agent,
    kit === undefined ? agent.baseWeaponDamage : statOf(equipment, kit.weapon),
    kit === undefined ? agent.effectiveArmor : statOf(equipment, kit.armor),
  );
}

export function makePlan(
  live: CurrentLiveWorldStateView,
  retired: CurrentRetiredWorldStateView,
  data: GameDataView,
  t: BasicAiThresholds,
): Plan {
  const order = [...live.agents].sort(byAgentOrder);
  const equipment = live.agency.equipment;
  const storage = planEquipment(order, equipment, 'storage');
  const rating = ratingParameters(data);
  const found = threat(live, retired, data, t.threatWindowTurns);
  const won = wonAgainst(retired);
  const rungs = nextRungs(live, data, won);
  const weakest = [...rungs.values()].sort((a, b) => a.combatRating - b.combatRating)[0];
  const setter = [found, weakest]
    .filter((item): item is Opposition => item !== null && item !== undefined)
    .sort((a, b) => b.combatRating - a.combatRating)[0];
  const goal =
    setter === undefined
      ? null
      : { combatRating: Math.ceil((setter.combatRating * t.combatMarginPct) / 100), enemies: setter.enemies };
  const eligible = order
    .filter((agent) => agent.assignment?.kind !== 'Investigation')
    .map((agent) => ({ agent, member: plannedMember(agent, storage, live) }));
  // BASICAI, Glossary, Strike team: the first Eligible Agents, as few as reach the Strike goal, at most the Transport
  // cap; the Strike team size is that many, or the Transport cap when even it falls short. The Strike team is never
  // more than the Roster size less the Contracting cap and one Investigation team, so that the Agency keeps its income.
  const most = Math.min(live.agency.transportCap, eligible.length);
  const needed = goal === null ? 1 : agentsNeeded(goal.enemies, t.enemiesPerAgent);
  let wanted = live.agency.transportCap;
  let sum = 0;
  for (const [index, item] of eligible.slice(0, most).entries()) {
    const k = index + 1;
    sum += memberWeight(item.member, rating);
    if (goal !== null && k >= needed && sideRating(k, sum, rating) >= goal.combatRating) {
      wanted = k;
      break;
    }
  }
  const room = Math.max(0, live.agency.servingAgents - live.agency.contractingCap - t.researchTeamSize);
  const size = Math.min(wanted, most, room);
  const strike = eligible.slice(0, size).map((item) => item.agent);
  const strikeRating = sideRating(
    size,
    eligible.slice(0, size).reduce((total, item) => total + memberWeight(item.member, rating), 0),
    rating,
  );
  return {
    order,
    storage,
    buying: planEquipment(order, equipment, 'buying'),
    unlimited: planEquipment(order, equipment, 'unlimited'),
    rating,
    threat: found,
    rungs,
    won,
    goal,
    eligible,
    strike,
    strikeWanted: wanted,
    strikeIds: new Set(strike.map((agent) => agent.id)),
    strikeRating,
    gap: goal !== null && (strikeRating < goal.combatRating || size < needed),
  };
}

/**
 * BASICAI, Choosing Leads: whether the Strike team, as its Rested rating stands with the whole Transport cap, would be a
 * Winning team for the Enemies of a MissionSiteArchetype.
 */
export function strikeCanWin(
  plan: Plan,
  live: CurrentLiveWorldStateView,
  retired: CurrentRetiredWorldStateView,
  data: GameDataView,
  t: BasicAiThresholds,
  archetypeId: string,
): boolean {
  const archetype = data.missionSiteArchetypes.find((item) => item.id === archetypeId);
  if (archetype === undefined) {
    return false;
  }
  const team = plan.eligible.slice(0, live.agency.transportCap);
  const enemies = archetype.enemies.reduce((sum, entry) => sum + entry.count, 0);
  if (team.length < agentsNeeded(enemies, t.enemiesPerAgent)) {
    return false;
  }
  const rating = sideRating(
    team.length,
    team.reduce((sum, item) => sum + memberWeight(item.member, plan.rating), 0),
    plan.rating,
  );
  const required = requiredRatingSharePct(
    t,
    [...retired.missionSites, ...live.missionSites],
    retired.missions,
    archetypeId,
  );
  return meetsRequiredShare(rating, archetype.enemiesCombatRating, required);
}

/**
 * BASICAI, Choosing Leads: the Leads that qualify for a new Investigation now, in the order they are tried: those that
 * create no Mission site, then the Next rungs, then the farms.
 */
export function leadsToInvestigate(
  plan: Plan,
  live: CurrentLiveWorldStateView,
  retired: CurrentRetiredWorldStateView,
  data: GameDataView,
  t: BasicAiThresholds,
): LeadView[] {
  const open = retired.leads
    .map((lead, index) => ({ lead, index }))
    .filter(({ lead }) => lead.canBeInvestigatedNow && lead.activeInvestigation === null);
  const level = (lead: LeadView) => lead.initiativeOperationLevel ?? Infinity;
  const rank = (lead: LeadView) =>
    lead.winsCampaign ? 0 : lead.unlocksContracting ? 1 : lead.eliminatesFaction ? 2 : 3;
  const plain = open
    .filter(({ lead }) => lead.createsMissionSite === null)
    .sort((a, b) => rank(a.lead) - rank(b.lead) || level(a.lead) - level(b.lead) || a.index - b.index)
    .map(({ lead }) => lead);
  // One Mission site at a time: no other Lead that creates one while one is investigated or an Initiative one is Active.
  const leadOf = new Map(retired.leads.map((lead) => [lead.id, lead]));
  const busy =
    live.investigations.some(
      (investigation) => (leadOf.get(investigation.lead)?.createsMissionSite ?? null) !== null,
    ) || live.missionSites.some((site) => site.kind === 'Initiative' && site.lifecycle === 'Active');
  if (busy) {
    return plain;
  }
  const siteLeads = open
    .map(({ lead, index }) => ({
      lead,
      index,
      faction: lead.faction ?? '',
      site: lead.createsMissionSite ?? '',
    }))
    .filter(
      ({ faction, site }) =>
        site !== '' && faction !== '' && strikeCanWin(plan, live, retired, data, t, site),
    );
  const rungs = siteLeads
    .filter(({ faction, site }) => plan.rungs.get(faction)?.archetype === site)
    .sort((a, b) => level(a.lead) - level(b.lead) || a.index - b.index)
    .map(({ lead }) => lead);
  const farms = siteLeads
    .filter(({ faction, site }) => plan.won.get(faction)?.has(site) === true)
    .sort((a, b) => level(b.lead) - level(a.lead) || a.index - b.index)
    .map(({ lead }) => lead);
  const farming = rungs.length === 0 || live.panicHundredths >= t.farmingPanicPct * 100;
  return [...plain, ...rungs, ...(farming ? farms : [])];
}
