/**
 * The Player-visible views that Player API returns. Each view is built anew from the World state it is asked
 * for, so it is detached and always equals what the current Campaign state gives; see ENG, Derived value
 * consistency. No view reads a hidden value.
 */
import { deepFreeze, detach, must, q } from '../../kernel/index.ts';
import { GAME_BUILD, type GdrCatalog, type MissionSiteArchetypeGdr } from '../../gdr/index.ts';
import { applyGameAction } from '../actions/actions.ts';
import {
  agentCombatantValues,
  canBeAssigned,
  effectiveSkill,
  effectiveWeaponDamage,
  enemyCombatantValues,
  type AgentUpgradeBonus,
  exhaustionOf,
  isAway,
  isFitForWork,
  isInBase,
} from '../mechanics/agents/agents.ts';
import {
  combatRating,
  damageBounds,
  isAbleToFight,
  type CombatantState,
} from '../mechanics/combat/combat.ts';
import {
  agencyCaps,
  agentUpgradeBonus,
  contractingAtAssignment,
  countDeployed,
  countServing,
  countTraining,
  income,
  upgradedRates,
  upkeep,
  type UpgradedRates,
} from '../mechanics/economy/economy.ts';
import {
  isAssessedLead,
  progressGain,
  requiredProgressRange,
} from '../mechanics/investigations/investigations.ts';
import {
  activeInvestigationOf,
  completionCount,
  factionOfLead,
  leadAvailability,
  leadOfMissionSite,
  leadStatus,
} from '../mechanics/leads/leads.ts';
import { consequencesOf, type ConsequenceAmounts } from '../mechanics/missions/missions.ts';
import { healthRecoveryRateHundredths, recoveryTurnsRemaining } from '../mechanics/recovery/recovery.ts';
import { articleForTerm, resolveArticles, visibleArticles } from '../mechanics/compendium/compendium.ts';
import type {
  ActionAvailability,
  SimpleAssignment,
  AgencyView,
  AgentView,
  AvailableActionsView,
  ConsequenceView,
  CurrentStateView,
  CompendiumArticleView,
  DeploymentPreview,
  EnemyView,
  FactionView,
  GameDataView,
  HistoryView,
  InvestigationView,
  LeadView,
  MissionSiteView,
  MissionView,
} from '../player-api.ts';
import { reject, type Rejection } from '../result.ts';
import type { ActionRecord } from '../rules.ts';
import { summarize } from '../state/summary.ts';
import { isServing } from '../state/types.ts';
import type {
  Agent,
  CampaignState,
  CurrentWorldState,
  Enemy,
  Investigation,
  Mission,
  MissionSite,
  TurnReport,
} from '../state/types.ts';

function ratesOf(world: CurrentWorldState, gdrs: GdrCatalog): UpgradedRates {
  return upgradedRates(
    gdrs.agentParameters,
    gdrs.recoveryParameters,
    gdrs.upgrades,
    world.agency.state.acquisitions,
  );
}

/** An Enemy's values in the hundredths form that effective skill and a Combat read; see DEC-056. */
function enemyCombatant(enemy: Enemy['state']): CombatantState {
  return { ...enemyCombatantValues(enemy), weaponDamage: enemy.baseWeaponDamage };
}

/** ECON, Upgrade bonus: what the Upgrades of this World state add to every Serving Agent's effective values. */
function bonusOf(world: CurrentWorldState, gdrs: GdrCatalog): AgentUpgradeBonus {
  return agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
}

/** An Agent's values, with its effective max health and current health, as effective skill and a Combat read them. */
function agentCombatant(agent: Agent['state'], bonus: AgentUpgradeBonus): CombatantState {
  return { ...agentCombatantValues(agent, bonus), weaponDamage: effectiveWeaponDamage(agent, bonus) };
}

function agentView(
  agent: Agent,
  gdrs: GdrCatalog,
  healthRecoveryPctHundredths: number,
  bonus: AgentUpgradeBonus,
): AgentView {
  const s = agent.state;
  const serving = isServing(s);
  const values = agentCombatant(s, bonus);
  return {
    id: agent.id,
    archetype: agent.archetype,
    archetypeName: gdrs.agentArchetype.name,
    agency: agent.constants.agency,
    turnHired: agent.constants.turnHired,
    agentStatus: s.status,
    skillHundredths: s.skillHundredths,
    experience: s.experience,
    effectiveSkill: effectiveSkill(values, gdrs.agentParameters),
    currentHealthHundredths: values.currentHealthHundredths,
    healthLostHundredths: s.healthLostHundredths,
    baseHealth: s.baseHealth,
    effectiveMaxHealth: values.maxHealth,
    exhaustion: exhaustionOf(s),
    exactExhaustionHundredths: s.exactExhaustionHundredths,
    weapon: s.weapon,
    weaponName: gdrs.weapons.get(s.weapon)?.name ?? s.weapon,
    baseWeaponDamage: s.baseWeaponDamage,
    effectiveWeaponDamage: values.weaponDamage,
    assignment: s.assignment === null ? null : { ...s.assignment },
    canBeAssigned: canBeAssigned(s),
    fitForWork: isFitForWork(s, gdrs.agentParameters),
    inBase: isInBase(s),
    away: isAway(s),
    ableToFight: serving && isAbleToFight(values, gdrs.combatParameters, gdrs.agentParameters),
    participationHistory: s.participationHistory.map((item) => ({ ...item })),
    enemiesKilled: s.enemiesKilled,
    turnTerminated: s.turnTerminated,
    killedBy: s.killedBy === null ? null : { ...s.killedBy },
    finalMaxHealth: s.finalMaxHealth,
    finalWeaponDamage: s.finalWeaponDamage,
    healthRecoveryRateHundredths: serving
      ? healthRecoveryRateHundredths(values.maxHealth, healthRecoveryPctHundredths)
      : null,
    recoveryTurnsRemaining:
      serving && s.assignment?.kind === 'Recovery'
        ? recoveryTurnsRemaining(values, healthRecoveryPctHundredths)
        : null,
  };
}

function enemyView(enemy: Enemy, gdrs: GdrCatalog): EnemyView {
  const s = enemy.state;
  return {
    id: enemy.id,
    archetype: enemy.archetype,
    archetypeName: gdrs.enemyArchetypes.get(enemy.archetype)?.name ?? enemy.archetype,
    missionSite: enemy.constants.missionSite,
    skill: s.skill,
    effectiveSkill: effectiveSkill(enemyCombatantValues(s), gdrs.agentParameters),
    currentHealth: s.baseHealth - s.healthLost,
    healthLost: s.healthLost,
    baseHealth: s.baseHealth,
    exhaustion: s.exhaustion,
    weapon: s.weapon,
    weaponName: gdrs.weapons.get(s.weapon)?.name ?? s.weapon,
    weaponDamage: s.baseWeaponDamage,
  };
}

function consequenceView(amounts: ConsequenceAmounts): ConsequenceView {
  return {
    money: amounts.money,
    fundingChange: amounts.fundingChange,
    panicIncreaseHundredths: amounts.panicIncreaseHundredths,
    panicReductionHundredths: amounts.panicReductionHundredths,
    eliminatesTargetFaction: amounts.eliminateTargetFaction,
    defeat: amounts.defeat,
  };
}

function missionOfSite(world: CurrentWorldState, siteId: string): Mission | null {
  return Object.values(world.missions).find((mission) => mission.constants.missionSite === siteId) ?? null;
}

function missionSiteView(site: MissionSite, world: CurrentWorldState, gdrs: GdrCatalog): MissionSiteView {
  const archetype = must(
    gdrs.missionSiteArchetypes.find((item) => item.id === site.archetype),
    `MissionSiteArchetype ${site.archetype}`,
  );
  const origin = site.constants.origin;
  const level =
    origin.kind === 'FactionOperation'
      ? (gdrs.factionOperationLevels.find((item) => item.id === origin.operationLevel) ?? null)
      : null;
  const enemies = site.state.enemies.map((id) => must(world.enemies[id], `Enemy ${id}`));
  return {
    id: site.id,
    archetype: site.archetype,
    name: archetype.name,
    kind: site.constants.kind,
    origin: { ...origin },
    lead: leadOfMissionSite(site, world.investigations),
    operationLevel: level === null ? null : { id: level.id, level: level.level, name: level.name },
    targetFaction: site.constants.targetFaction,
    turnCreated: site.constants.turnCreated,
    lifecycle: site.state.lifecycle,
    turnsUntilExpiration: site.state.turnsUntilExpiration,
    enemies: enemies.map((enemy) => enemyView(enemy, gdrs)),
    enemiesCombatRating: combatRating(
      enemies.map((enemy) => enemyCombatant(enemy.state)),
      gdrs.combatParameters,
      gdrs.agentParameters,
    ),
    rewards: consequenceView(consequencesOf('Won', archetype, level)),
    penalties: consequenceView(consequencesOf('Lost', archetype, level)),
    mission: missionOfSite(world, site.id)?.id ?? null,
  };
}

function missionView(mission: Mission, world: CurrentWorldState): MissionView {
  return {
    id: mission.id,
    archetype: mission.archetype,
    missionSite: mission.constants.missionSite,
    kind: must(world.missionSites[mission.constants.missionSite], 'Mission site').constants.kind,
    turnDeployed: mission.constants.turnDeployed,
    teamSent: [...mission.constants.teamSent],
    lifecycle: mission.state.lifecycle,
    currentTeam: [...mission.state.currentTeam],
  };
}

function investigationView(
  investigation: Investigation,
  world: CurrentWorldState,
  gdrs: GdrCatalog,
): InvestigationView {
  const lead = must(
    gdrs.leads.find((item) => item.id === investigation.constants.lead),
    `Lead ${investigation.constants.lead}`,
  );
  const members = investigation.state.currentTeam.map((id) => must(world.agents[id], `Agent ${id}`));
  // INVSTG, Projected progress gain: n and S over the members At assignment only.
  const working = members.filter((agent) => agent.state.status === 'AtAssignment');
  const projected =
    investigation.state.lifecycle === 'Active'
      ? progressGain(
          working.length,
          working.reduce(
            (sum, agent) =>
              sum + effectiveSkill(agentCombatant(agent.state, bonusOf(world, gdrs)), gdrs.agentParameters),
            0,
          ),
          gdrs.investigationParameters,
        )
      : null;
  return {
    id: investigation.id,
    archetype: investigation.archetype,
    lead: lead.id,
    leadName: lead.name,
    turnStarted: investigation.constants.turnStarted,
    lifecycle: investigation.state.lifecycle,
    progress: investigation.state.progress,
    assessed: investigation.state.assessed,
    actualRequiredProgress: 'unknown',
    currentTeam: members.map((agent) => ({ agent: agent.id, agentStatus: agent.state.status })),
    projectedProgressGain: projected,
  };
}

/** LEAD, Player-visible information: only discovered Leads; an undiscovered Lead is left out of every result. */
function leadViews(world: CurrentWorldState, gdrs: GdrCatalog): LeadView[] {
  return gdrs.leads.flatMap((lead) => {
    const availability = leadAvailability(lead, world, gdrs.missionSiteArchetypes);
    if (!availability.discovered) {
      return [];
    }
    const active = activeInvestigationOf(lead.id, world.investigations);
    // INVSTG, Player-visible information: the Required progress and its range only for an Assessed Lead.
    const assessed = isAssessedLead(lead.id, world.investigations);
    return {
      id: lead.id,
      name: lead.name,
      description: lead.description,
      factionArchetype: lead.faction,
      faction: factionOfLead(lead, world)?.id ?? null,
      assessed,
      requiredProgress: assessed ? lead.requiredProgress : 'unknown',
      requiredProgressRange: assessed
        ? requiredProgressRange(lead.requiredProgress, gdrs.investigationParameters)
        : 'unknown',
      investigateAgain: lead.investigateAgain,
      createsMissionSite: lead.onCompletion.createMissionSite,
      eliminatesFaction: lead.onCompletion.eliminateFaction,
      winsCampaign: lead.onCompletion.winCampaign,
      completionCount: completionCount(lead.id, world.investigations),
      available: availability.available,
      status: leadStatus(availability),
      canBeInvestigatedNow: availability.available && active === null,
      activeInvestigation: active?.id ?? null,
    } satisfies LeadView;
  });
}

/** FACTION, Player-visible information: never the Faction activity level or either countdown. */
function factionViews(world: CurrentWorldState, gdrs: GdrCatalog): FactionView[] {
  return Object.values(world.factions).map((faction) => ({
    id: faction.id,
    archetype: faction.archetype,
    name: gdrs.factionArchetypes.find((item) => item.id === faction.archetype)?.name ?? faction.archetype,
    eliminated: faction.state.eliminated,
    eliminatedTurn: faction.state.eliminatedTurn,
  }));
}

function agencyView(world: CurrentWorldState, gdrs: GdrCatalog): AgencyView {
  const agents = Object.values(world.agents).map((agent) => agent.state);
  const caps = agencyCaps(gdrs.economy, gdrs.upgrades, world.agency.state.acquisitions);
  const serving = countServing(agents);
  return {
    id: world.agency.id,
    archetype: world.agency.archetype,
    name: gdrs.agencyArchetype.name,
    money: world.agency.state.money,
    funding: world.agency.state.funding,
    upgrades: gdrs.upgrades.map((upgrade) => ({
      id: upgrade.id,
      name: upgrade.name,
      price: upgrade.price,
      effect: upgrade.effect,
      incrementHundredths: upgrade.incrementHundredths,
      acquisitions: world.agency.state.acquisitions[upgrade.id] ?? 0,
    })),
    ...caps,
    ...ratesOf(world, gdrs),
    servingAgents: serving,
    deployedAgents: countDeployed(agents),
    trainingAgents: countTraining(agents),
    // ECON, Projected income and upkeep.
    projectedIncome: income(
      world.agency.state.funding,
      contractingAtAssignment(agents).map((agent) =>
        effectiveSkill(agentCombatant(agent, bonusOf(world, gdrs)), gdrs.agentParameters),
      ),
      gdrs.economy,
    ),
    projectedUpkeep: upkeep(serving, gdrs.economy),
    hireCost: gdrs.economy.hireCost,
  };
}

/**
 * Whether a Mission site is in Current world state: an Unfinished Mission site. One in a Final Mission site state is
 * Retired; see MISSION, Mission site properties.
 */
function siteIsCurrent(site: MissionSite): boolean {
  return site.state.lifecycle === 'Active' || site.state.lifecycle === 'Deployed';
}

/** `player.queries.getCurrentState()`. */
export function currentStateView(state: CampaignState, gdrs: GdrCatalog): CurrentStateView {
  const world = state.world.current;
  return {
    turn: world.turn,
    panicHundredths: world.panicHundredths,
    panicLimit: gdrs.endingParameters.defeatAtPanicPct,
    ending:
      world.ending === null || world.endingTurn === null
        ? null
        : { ending: world.ending, reasons: [...world.endingReasons], turn: world.endingTurn },
    configuration: {
      startingMoney: state.configuration.startingMoney,
      startingFunding: state.configuration.startingFunding,
    },
    agency: agencyView(world, gdrs),
    agents: Object.values(world.agents)
      .filter((agent) => isServing(agent.state))
      .map((agent) =>
        agentView(agent, gdrs, ratesOf(world, gdrs).healthRecoveryPctHundredths, bonusOf(world, gdrs)),
      ),
    investigations: Object.values(world.investigations)
      .filter((investigation) => investigation.state.lifecycle === 'Active')
      .map((investigation) => investigationView(investigation, world, gdrs)),
    leads: leadViews(world, gdrs),
    missionSites: Object.values(world.missionSites)
      .filter((site) => siteIsCurrent(site))
      .map((site) => missionSiteView(site, world, gdrs)),
    missions: Object.values(world.missions)
      .filter((mission) => mission.state.lifecycle === 'Deployed')
      .map((mission) => missionView(mission, world)),
    factions: factionViews(world, gdrs),
  };
}

/** `player.queries.getTurnReport()`. */
export function turnReportView(state: CampaignState): TurnReport | null {
  return detach(state.world.history.turnReport);
}

/** `player.queries.getHistory()`. */
export function historyView(state: CampaignState, gdrs: GdrCatalog): HistoryView {
  const world = state.world.current;
  const history = state.world.history;
  return {
    entries: detach(history.historyEntries),
    openEntry: {
      turn: world.turn,
      turnStart: detach(history.currentTurnStart),
      turnEnd: summarize(world),
      actions: detach(history.currentActions),
    },
    turnSeries: {
      moneyAtStartOfTurn: detach(history.moneyAtStartOfTurn),
      moneyAtEndOfTurn: detach(history.moneyAtEndOfTurn),
    },
    retained: {
      agents: Object.values(world.agents)
        .filter((agent) => !isServing(agent.state))
        .map((agent) =>
          agentView(agent, gdrs, ratesOf(world, gdrs).healthRecoveryPctHundredths, bonusOf(world, gdrs)),
        ),
      investigations: Object.values(world.investigations)
        .filter((investigation) => investigation.state.lifecycle !== 'Active')
        .map((investigation) => investigationView(investigation, world, gdrs)),
      missionSites: Object.values(world.missionSites)
        .filter((site) => !siteIsCurrent(site))
        .map((site) => missionSiteView(site, world, gdrs)),
      missions: Object.values(world.missions)
        .filter((mission) => mission.state.lifecycle !== 'Deployed')
        .map((mission) => missionView(mission, world)),
    },
  };
}

function availability(rejection: Rejection | null): ActionAvailability {
  return rejection === null
    ? { available: true, reason: null, message: null }
    : { available: false, reason: rejection.reason, message: rejection.message };
}

/** Tries an action on a copy of Current world state and reports the rejection, changing nothing. */
function tryAction(
  world: CurrentWorldState,
  gdrs: GdrCatalog,
  name: string,
  args: Record<string, unknown>,
): Rejection | null {
  return applyGameAction(detach(world), { surface: 'player', name, args }, gdrs);
}

/**
 * `player.queries.previewAssignAgentsAlone()`: for each Assignment, the Agents that `assignAgents` would accept on their
 * own; see DEC-046. It is a query of its own, not part of `getAvailableActions()`, because it tries the action once per
 * Agent and Assignment.
 */
export function previewAssignAgentsAlone(
  state: CampaignState,
  gdrs: GdrCatalog,
): Record<SimpleAssignment, string[]> {
  const world = state.world.current;
  const ended = world.ending !== null;
  const result: Record<SimpleAssignment, string[]> = { Standby: [], Contracting: [], Training: [] };
  if (ended) {
    return result;
  }
  for (const agent of Object.values(world.agents)) {
    if (!canBeAssigned(agent.state)) {
      continue;
    }
    for (const assignment of ['Standby', 'Contracting', 'Training'] as const) {
      if (tryAction(world, gdrs, 'assignAgents', { agents: [agent.id], assignment }) === null) {
        result[assignment].push(agent.id);
      }
    }
  }
  return result;
}

/** `player.queries.previewAssignAgents(agents, assignment)`: the outcome `assignAgents` would have; see DEC-046. */
export function previewAssignAgents(
  state: CampaignState,
  gdrs: GdrCatalog,
  agents: unknown,
  assignment: unknown,
): ActionAvailability {
  const world = state.world.current;
  if (world.ending !== null) {
    return {
      available: false,
      reason: 'campaign_ended',
      message: `The Campaign has ended in ${world.ending}.`,
    };
  }
  return availability(tryAction(world, gdrs, 'assignAgents', { agents, assignment }));
}

/** `player.queries.getAvailableActions()`. */
export function availableActionsView(state: CampaignState, gdrs: GdrCatalog): AvailableActionsView {
  const world = state.world.current;
  const ended = world.ending !== null;
  const endedReason: ActionAvailability = {
    available: false,
    reason: 'campaign_ended',
    message: `The Campaign has ended in ${world.ending ?? ''}.`,
  };
  const agents = Object.values(world.agents);
  const caps = agencyCaps(gdrs.economy, gdrs.upgrades, world.agency.state.acquisitions);
  const states = agents.map((agent) => agent.state);
  return {
    campaignEnded: ended,
    advanceTurn: ended ? endedReason : availability(null),
    hireAgent: ended ? endedReason : availability(tryAction(world, gdrs, 'hireAgent', {})),
    purchaseUpgrade: gdrs.upgrades.map((upgrade) => ({
      upgrade: upgrade.id,
      ...(ended
        ? endedReason
        : availability(
            world.agency.state.money < upgrade.price
              ? {
                  rejected: true,
                  code: 'rejected',
                  reason: 'not_enough_money',
                  message: `${upgrade.name} costs ${upgrade.price} and the Agency has ${world.agency.state.money}.`,
                }
              : null,
          )),
    })),
    assignableAgents: ended
      ? []
      : agents.filter((agent) => canBeAssigned(agent.state)).map((agent) => agent.id),
    assignAgents: {
      assignments: ['Standby', 'Contracting', 'Training'],
      trainingPlacesLeft: ended ? 0 : Math.max(0, caps.trainingCap - countTraining(states)),
    },
    dismissableAgents: ended
      ? []
      : agents
          .filter(
            (agent) => agent.state.status === 'AtAssignment' && agent.state.assignment?.kind === 'Standby',
          )
          .map((agent) => agent.id),
    startInvestigation: ended
      ? []
      : gdrs.leads
          .filter(
            (lead) =>
              leadAvailability(lead, world, gdrs.missionSiteArchetypes).available &&
              activeInvestigationOf(lead.id, world.investigations) === null,
          )
          .map((lead) => lead.id),
    assignAgentsToInvestigation: ended
      ? []
      : Object.values(world.investigations)
          .filter((investigation) => investigation.state.lifecycle === 'Active')
          .map((investigation) => investigation.id),
    deployAgents: {
      missionSites: ended
        ? []
        : Object.values(world.missionSites)
            .filter((site) => site.state.lifecycle === 'Active')
            .map((site) => site.id),
      transportPlacesLeft: ended ? 0 : Math.max(0, caps.transportCap - countDeployed(states)),
    },
  };
}

/**
 * INVSTG, Team progress estimate: the gain that Progress gain would add if exactly the listed Agents were the working
 * members of an Investigation, with n the number of distinct Agents and S the sum of their current effective skill, in
 * hundredths of a progress point. It reads no Investigation and takes every Agent as working, whatever its Agent
 * status and Assignment. It rejects a list that names an Instance ID that is not of a Serving Agent.
 */
export function estimateTeamProgressGain(
  state: CampaignState,
  gdrs: GdrCatalog,
  agentIds: unknown,
): number | Rejection {
  if (!Array.isArray(agentIds) || !agentIds.every((id): id is string => typeof id === 'string')) {
    return reject('invalid_agents', 'The Agents must be given as a list of Instance IDs.', 'invalid_input');
  }
  const world = state.world.current;
  const ids = [...new Set(agentIds)];
  const notServing = ids.filter((id) => {
    const agent = world.agents[id];
    return agent === undefined || !isServing(agent.state);
  });
  if (notServing.length > 0) {
    return reject(
      'agents_not_serving',
      `These Instance IDs identify no Serving Agent: ${notServing.join(', ')}.`,
    );
  }
  const skillSum = ids.reduce(
    (sum, id) =>
      sum +
      effectiveSkill(
        agentCombatant(must(world.agents[id], `Agent ${id}`).state, bonusOf(world, gdrs)),
        gdrs.agentParameters,
      ),
    0,
  );
  return progressGain(ids.length, skillSum, gdrs.investigationParameters);
}

/** The Combat ratings a deployment would start with, and whether `deployAgents` would be accepted. */
export function previewDeployment(
  state: CampaignState,
  gdrs: GdrCatalog,
  missionSite: unknown,
  agentIds: unknown,
): DeploymentPreview {
  const world = state.world.current;
  const ids = Array.isArray(agentIds) ? agentIds.filter((id): id is string => typeof id === 'string') : [];
  const team = [...new Set(ids)].flatMap((id) => {
    const agent = world.agents[id];
    return agent === undefined ? [] : [agentCombatant(agent.state, bonusOf(world, gdrs))];
  });
  const site = typeof missionSite === 'string' ? world.missionSites[missionSite] : undefined;
  const rejection =
    site === undefined ? null : tryAction(world, gdrs, 'deployAgents', { missionSite: site.id, agents: ids });
  return {
    teamCombatRating: combatRating(team, gdrs.combatParameters, gdrs.agentParameters),
    enemiesCombatRating:
      site === undefined
        ? null
        : combatRating(
            site.state.enemies.map((id) => enemyCombatant(must(world.enemies[id], `Enemy ${id}`).state)),
            gdrs.combatParameters,
            gdrs.agentParameters,
          ),
    accepted: site !== undefined && rejection === null,
    reason: rejection?.reason ?? (site === undefined ? 'no_mission_site' : null),
    message: rejection?.message ?? (site === undefined ? 'No Mission site is selected.' : null),
  };
}

const gameDataCache = new WeakMap<GdrCatalog, GameDataView>();

function archetypeRating(archetype: MissionSiteArchetypeGdr, gdrs: GdrCatalog): number {
  // A newly created Enemy has current health equal to base health and exhaustion 0, so its Combat rating is its
  // skill unless it meets the incapacitation condition.
  let total = 0;
  for (const [enemyId, count] of archetype.enemies) {
    const enemy = must(gdrs.enemyArchetypes.get(enemyId), `EnemyArchetype ${enemyId}`);
    const able = q(enemy.skill).gt(gdrs.combatParameters.incapacitationSkillFraction.mul(enemy.skill));
    total += able ? enemy.skill * count : 0;
  }
  return total;
}

function decimalText(value: { n: bigint; d: bigint }): string {
  // The CombatParameters values are finite decimals; write them back as decimals.
  let n = value.n;
  let d = value.d;
  let scale = 0;
  while (d !== 1n && scale < 30) {
    n *= 10n;
    if (n % d === 0n) {
      n /= d;
      d = 1n;
    }
    scale += 1;
  }
  if (d !== 1n) {
    return `${value.n.toString()}/${value.d.toString()}`;
  }
  const digits = n.toString().padStart(scale + 1, '0');
  return scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/**
 * The resolved articles of the last set of Player-visible articles read from each catalog. A resolved article depends,
 * of the World state, only on which articles are Player-visible (COMP, Article resolution), so the result is reused
 * while that set stays the same. It is a cache of a Derived value, never part of Campaign state.
 */
const articlesCache = new WeakMap<
  GdrCatalog,
  { readonly key: string; readonly view: readonly CompendiumArticleView[] }
>();

/**
 * `player.queries.getCompendiumArticles()`: the Player-visible Compendium articles in their resolved form, in Game
 * build order (COMP, Player-visible information). The authored `body`, `formulas`, `terms`, and `see_also` are not
 * reported.
 */
export function compendiumArticlesView(
  state: CampaignState,
  gdrs: GdrCatalog,
): readonly CompendiumArticleView[] {
  const visible = visibleArticles(state.world.current, gdrs);
  const key = visible.map((article) => article.id).join(' ');
  const cached = articlesCache.get(gdrs);
  if (cached?.key === key) {
    return cached.view;
  }
  const view = deepFreeze<CompendiumArticleView[]>(
    resolveArticles(visible).map(({ article, body, formulas, seeAlso }) => ({
      id: article.id,
      category: article.category,
      title: article.title,
      subject: article.subject,
      subjectType: article.subjectType,
      body: body.map((segment) => ({ ...segment })),
      formulas: formulas.map((row) => ({
        label: row.label.map((segment) => ({ ...segment })),
        text: row.text.map((segment) => ({ ...segment })),
      })),
      seeAlso: seeAlso.map((segment) => ({ ...segment })),
    })),
  );
  articlesCache.set(gdrs, { key, view });
  return view;
}

/**
 * `player.queries.getArticleForTerm(text)`: the identifier of the Player-visible article that has an Article term
 * equal to the text ignoring case, or null when there is none (COMP, Player-visible information, Article term lookup).
 */
export function articleForTermView(state: CampaignState, gdrs: GdrCatalog, text: unknown): string | null {
  if (typeof text !== 'string') {
    return null;
  }
  return articleForTerm(text, visibleArticles(state.world.current, gdrs))?.id ?? null;
}

/** `player.queries.getGameData()`: the Player-visible properties of the GDRs. It is the same for every Campaign. */
export function gameDataView(gdrs: GdrCatalog): GameDataView {
  let view = gameDataCache.get(gdrs);
  if (view === undefined) {
    const numbers = (gdr: object): Record<string, number> =>
      Object.fromEntries(
        Object.entries(gdr).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
      );
    view = deepFreeze<GameDataView>({
      gameBuild: GAME_BUILD,
      agentArchetype: {
        id: gdrs.agentArchetype.id,
        name: gdrs.agentArchetype.name,
        skill: gdrs.agentArchetype.skill,
        baseHealth: gdrs.agentArchetype.baseHealth,
        weapon: gdrs.agentArchetype.weapon,
      },
      agentParameters: numbers(gdrs.agentParameters),
      combatParameters: {
        weaponDamageRange: decimalText(gdrs.combatParameters.weaponDamageRange),
        retreatBelowAgentRatingFraction: decimalText(gdrs.combatParameters.retreatBelowAgentRatingFraction),
        retreatAtEnemyToAgentRating: decimalText(gdrs.combatParameters.retreatAtEnemyToAgentRating),
        incapacitationSkillFraction: decimalText(gdrs.combatParameters.incapacitationSkillFraction),
      },
      recoveryParameters: numbers(gdrs.recoveryParameters),
      investigationParameters: {
        teamEfficiencyExponent: decimalText(gdrs.investigationParameters.teamEfficiencyExponent),
        requiredProgressMaxPct: gdrs.investigationParameters.requiredProgressMaxPct,
        assessmentThresholdPct: gdrs.investigationParameters.assessmentThresholdPct,
      },
      economy: numbers(gdrs.economy),
      weapons: [...gdrs.weapons.values()].map((weapon) => {
        const bounds = damageBounds(weapon.damage, gdrs.combatParameters);
        return {
          id: weapon.id,
          name: weapon.name,
          damage: weapon.damage,
          damageOfAHit: { min: bounds.lo, max: bounds.hi },
        };
      }),
      enemyArchetypes: [...gdrs.enemyArchetypes.values()].map((enemy) => ({
        id: enemy.id,
        name: enemy.name,
        skill: enemy.skill,
        baseHealth: enemy.baseHealth,
        weapon: enemy.weapon,
      })),
      missionSiteArchetypes: gdrs.missionSiteArchetypes.map((archetype) => ({
        id: archetype.id,
        name: archetype.name,
        kind: archetype.kind,
        expiresInTurns: archetype.expiresInTurns,
        enemies: archetype.enemies.map(([enemyArchetype, count]) => ({ enemyArchetype, count })),
        enemiesCombatRating: archetypeRating(archetype, gdrs),
        onWin:
          archetype.kind === 'initiative' ? consequenceView(consequencesOf('Won', archetype, null)) : null,
        operationLevel: archetype.operationLevel,
      })),
      factionOperationLevels: gdrs.factionOperationLevels.map((level) => ({
        id: level.id,
        level: level.level,
        name: level.name,
        onWin: { ...level.onWin },
        onIgnoredOrLost: { ...level.onIgnoredOrLost },
      })),
      names: {
        agency: gdrs.agencyArchetype.name,
        investigation: gdrs.investigationArchetype.name,
        mission: gdrs.missionArchetype.name,
      },
      backgroundArtworks: gdrs.backgroundArtworks.map((artwork) => ({
        id: artwork.id,
        detailView: artwork.detailView,
        image: artwork.image,
        opacityPct: artwork.opacityPct,
      })),
    });
    gameDataCache.set(gdrs, view);
  }
  return view;
}

/** One World state, i.e. its Live world state and its Retired world state; see CSTATE, Campaign state composition. */
function inspectWorldState(state: CampaignState): unknown {
  const world = state.world.current;
  const retainedAgent = (agent: Agent) => !isServing(agent.state);
  const retainedInvestigation = (item: Investigation) => item.state.lifecycle !== 'Active';
  const retainedSite = (site: MissionSite) => !siteIsCurrent(site);
  const retainedMission = (mission: Mission) => mission.state.lifecycle !== 'Deployed';
  const retainedEnemy = (enemy: Enemy) => {
    const site = world.missionSites[enemy.constants.missionSite];
    return site === undefined || retainedSite(site);
  };
  const split = <T>(items: Record<string, T>, retained: (item: T) => boolean) => ({
    current: Object.values(items).filter((item) => !retained(item)),
    retained: Object.values(items).filter(retained),
  });
  const agents = split(world.agents, retainedAgent);
  const investigations = split(world.investigations, retainedInvestigation);
  const missionSites = split(world.missionSites, retainedSite);
  const missions = split(world.missions, retainedMission);
  const enemies = split(world.enemies, retainedEnemy);
  return {
    liveWorldState: {
      campaignSeed: world.seed,
      randomGenerator: world.rng,
      nextInstanceNumbers: world.nextInstanceNumbers,
      pendingRandomOutcomeOverrides: world.randomOverrides,
      turn: world.turn,
      panicHundredths: world.panicHundredths,
      campaignEnding: world.ending,
      endingReasons: world.endingReasons,
      endingTurn: world.endingTurn,
      agency: world.agency,
      agents: agents.current,
      factions: Object.values(world.factions),
      investigations: investigations.current,
      missionSites: missionSites.current,
      missions: missions.current,
      enemies: enemies.current,
    },
    retiredWorldState: {
      agents: agents.retained,
      investigations: investigations.retained,
      missionSites: missionSites.retained,
      missions: missions.retained,
      enemies: enemies.retained,
    },
  };
}

/**
 * The History: the History entries and the recorded values of every Turn series for the ended Turns only. The
 * recorded values of the current Turn are read off the Timeline; see WHIST, Turn series.
 */
function historyOf(state: CampaignState): unknown {
  const ended = (values: readonly { readonly turn: number }[]) =>
    values.filter((value) => value.turn < state.world.current.turn);
  return {
    historyEntries: state.world.history.historyEntries,
    turnSeries: {
      moneyAtStartOfTurn: ended(state.world.history.moneyAtStartOfTurn),
      moneyAtEndOfTurn: ended(state.world.history.moneyAtEndOfTurn),
    },
  };
}

/**
 * `developer.queries.getCampaignState()`: Campaign state in full, detached, in its conceptual hierarchy, with each
 * Campaign instance as its four properties; see CSTATE, Campaign state composition, DEV, Inspection contract, and
 * DEC-019. The Timeline holds its World states, each after the first with the Player action that produced it.
 */
export function inspectCampaignState(timeline: {
  readonly states: readonly CampaignState[];
  readonly entries: readonly ActionRecord[];
  readonly position: number;
  readonly configuration: Readonly<Record<string, number>>;
}): unknown {
  const turnStart = must(timeline.states[0], 'The Timeline has no Turn-start state');
  const current = must(timeline.states[timeline.position], 'The Timeline has no World state at its pointer');
  return deepFreeze(
    detach({
      timeline: {
        turnStartState: inspectWorldState(turnStart),
        timelineEntries: timeline.entries.map((entry, index) => ({
          playerAction: entry,
          worldState: inspectWorldState(
            must(timeline.states[index + 1], 'The Timeline has no World state for an entry'),
          ),
        })),
      },
      timelinePointer: timeline.position,
      history: historyOf(current),
      campaignConfiguration: timeline.configuration,
      turnReport: current.world.history.turnReport,
    }),
  );
}

/** SAVES, Saving: the World state, the History, and the Turn report. */
export function placeInPlay(state: CampaignState): unknown {
  return {
    worldState: state.world.current,
    history: historyOf(state),
    turnReport: state.world.history.turnReport,
  };
}
