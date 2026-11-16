/**
 * The Player-visible views that Player API returns. Each view is built anew from the Committed state it is asked
 * for, so it is detached and always equals what the current Campaign state gives; see ENG, Derived value
 * consistency. No view reads a hidden value.
 */
import { deepFreeze, detach, must, q, toProbabilityPair } from '../../kernel/index.ts';
import { GAME_BUILD, type GdrCatalog, type MissionSiteArchetypeGdr } from '../../gdr/index.ts';
import { applyGameAction } from '../actions/actions.ts';
import { canBeAssigned, effectiveSkill } from '../mechanics/agents/agents.ts';
import { combatRating, isAbleToFight } from '../mechanics/combat/combat.ts';
import {
  agencyCaps,
  countContractingAtAssignment,
  countDeployed,
  countServing,
  countTraining,
  income,
  upkeep,
} from '../mechanics/economy/economy.ts';
import {
  completionProbability,
  progressToCertainCompletion,
} from '../mechanics/investigations/investigations.ts';
import {
  activeInvestigationOf,
  leadAvailability,
  leadOfMissionSite,
  leadStatus,
} from '../mechanics/leads/leads.ts';
import { consequencesOf, type ConsequenceAmounts } from '../mechanics/missions/missions.ts';
import { healthRecoveryRate, recoveryTurnsRemaining } from '../mechanics/recovery/recovery.ts';
import type {
  ActionAvailability,
  ActivityLevelView,
  AgencyView,
  AgentView,
  AvailableActionsView,
  ConsequenceView,
  CurrentStateView,
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
import type { Rejection } from '../result.ts';
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

function agentView(agent: Agent, gdrs: GdrCatalog): AgentView {
  const s = agent.state;
  const serving = isServing(s);
  return {
    id: agent.id,
    archetype: agent.archetype,
    archetypeName: gdrs.agentArchetype.name,
    agency: agent.constants.agency,
    turnHired: agent.constants.turnHired,
    agentStatus: s.status,
    skill: s.skill,
    effectiveSkill: effectiveSkill(s, gdrs.agentParameters),
    currentHealth: s.currentHealth,
    baseHealth: s.baseHealth,
    exhaustion: s.exhaustion,
    weapon: s.weapon,
    weaponName: gdrs.weapons.get(s.weapon)?.name ?? s.weapon,
    weaponDamage: s.weaponDamage,
    assignment: s.assignment === null ? null : { ...s.assignment },
    canBeAssigned: canBeAssigned(s),
    ableToFight: serving && isAbleToFight(s, gdrs.combatParameters, gdrs.agentParameters),
    participationHistory: s.participationHistory.map((item) => ({ ...item })),
    healthRecoveryRate: serving ? healthRecoveryRate(s.baseHealth, gdrs.recoveryParameters) : null,
    recoveryTurnsRemaining:
      serving && s.assignment?.kind === 'Recovery'
        ? recoveryTurnsRemaining(s, gdrs.recoveryParameters)
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
    effectiveSkill: effectiveSkill(s, gdrs.agentParameters),
    currentHealth: s.currentHealth,
    baseHealth: s.baseHealth,
    exhaustion: s.exhaustion,
    weapon: s.weapon,
    weaponName: gdrs.weapons.get(s.weapon)?.name ?? s.weapon,
    weaponDamage: s.weaponDamage,
  };
}

function consequenceView(amounts: ConsequenceAmounts): ConsequenceView {
  return {
    money: amounts.money,
    fundingChange: amounts.fundingChange,
    panicIncrease: amounts.panicIncrease,
    panicReduction: amounts.panicReduction,
    eliminatesTargetFaction: amounts.eliminateTargetFaction,
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
      enemies.map((enemy) => enemy.state),
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
  // INVSTG, Projected completion probability: only members At assignment add to S′.
  const projected =
    investigation.state.lifecycle === 'Active'
      ? completionProbability(
          investigation.state.progress +
            members
              .filter((agent) => agent.state.status === 'AtAssignment')
              .reduce((sum, agent) => sum + effectiveSkill(agent.state, gdrs.agentParameters), 0),
          lead.difficulty,
        )
      : null;
  return {
    id: investigation.id,
    archetype: investigation.archetype,
    lead: lead.id,
    leadName: lead.name,
    difficulty: lead.difficulty,
    turnStarted: investigation.constants.turnStarted,
    lifecycle: investigation.state.lifecycle,
    progress: investigation.state.progress,
    progressForCertainCompletion: progressToCertainCompletion(lead.difficulty),
    currentTeam: members.map((agent) => ({ agent: agent.id, agentStatus: agent.state.status })),
    projectedCompletionProbability: projected === null ? null : toProbabilityPair(projected),
  };
}

/** LEAD, Player-visible information: only discovered Leads; an undiscovered Lead is left out of every result. */
function leadViews(world: CurrentWorldState, gdrs: GdrCatalog): LeadView[] {
  return gdrs.leads.flatMap((lead) => {
    const availability = leadAvailability(lead, world);
    if (!availability.prerequisitesHold) {
      return [];
    }
    const active = activeInvestigationOf(lead.id, world.investigations);
    return {
      id: lead.id,
      name: lead.name,
      description: lead.description,
      factionArchetype: lead.faction,
      faction:
        Object.values(world.factions).find((faction) => faction.archetype === lead.faction)?.id ?? null,
      difficulty: lead.difficulty,
      requires: availability.prerequisites.map((item) => ({ ...item })),
      createsMissionSite: lead.onCompletion.createMissionSite,
      available: availability.available,
      conditions: {
        prerequisitesHold: availability.prerequisitesHold,
        noMissionWon: availability.noMissionWon,
        noMissionSiteInProgress: availability.noMissionSiteInProgress,
        factionNotEliminated: availability.factionNotEliminated,
      },
      blockingConditions: [...availability.blockingConditions],
      status: leadStatus(availability),
      canBeInvestigatedNow: availability.available && active === null,
      activeInvestigation: active?.id ?? null,
    } satisfies LeadView;
  });
}

function activityLevelView(id: string, gdrs: GdrCatalog): ActivityLevelView {
  const level = must(gdrs.factionActivityLevels.get(id), `FactionActivityLevel ${id}`);
  return {
    id: level.id,
    name: level.name,
    lastsTurns: level.lastsTurns === null ? null : [level.lastsTurns[0], level.lastsTurns[1]],
    operationEveryTurns: [level.operationEveryTurns[0], level.operationEveryTurns[1]],
    operationLevelWeights: level.operationLevelWeights.map(([key, weight]) => ({ level: key, weight })),
    next: level.next,
  };
}

function factionViews(world: CurrentWorldState, gdrs: GdrCatalog): FactionView[] {
  return Object.values(world.factions).map((faction) => ({
    id: faction.id,
    archetype: faction.archetype,
    name: gdrs.factionArchetypes.find((item) => item.id === faction.archetype)?.name ?? faction.archetype,
    activityLevel: activityLevelView(faction.state.activityLevel, gdrs),
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
      increment: upgrade.increment,
      acquisitions: world.agency.state.acquisitions[upgrade.id] ?? 0,
    })),
    ...caps,
    servingAgents: serving,
    deployedAgents: countDeployed(agents),
    trainingAgents: countTraining(agents),
    // ECON, Projected income and upkeep.
    projectedIncome: income(world.agency.state.funding, countContractingAtAssignment(agents), gdrs.economy),
    projectedUpkeep: upkeep(serving, gdrs.economy),
    hireCost: gdrs.economy.hireCost,
  };
}

/** Whether a Mission site still participates in current gameplay, rather than being retained in World history. */
function siteIsCurrent(site: MissionSite, world: CurrentWorldState): boolean {
  return (
    site.state.lifecycle === 'Active' ||
    (site.state.lifecycle === 'Attempted' && missionOfSite(world, site.id)?.state.lifecycle === 'Deployed')
  );
}

/** `player.queries.getCurrentState()`. */
export function currentStateView(state: CampaignState, gdrs: GdrCatalog): CurrentStateView {
  const world = state.world.current;
  return {
    turn: world.turn,
    panic: world.panic,
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
      .map((agent) => agentView(agent, gdrs)),
    investigations: Object.values(world.investigations)
      .filter((investigation) => investigation.state.lifecycle === 'Active')
      .map((investigation) => investigationView(investigation, world, gdrs)),
    leads: leadViews(world, gdrs),
    missionSites: Object.values(world.missionSites)
      .filter((site) => siteIsCurrent(site, world))
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
    turnSeries: {
      moneyAtStartOfTurn: detach(history.moneyAtStartOfTurn),
      moneyAtEndOfTurn: detach(history.moneyAtEndOfTurn),
    },
    retained: {
      agents: Object.values(world.agents)
        .filter((agent) => !isServing(agent.state))
        .map((agent) => agentView(agent, gdrs)),
      investigations: Object.values(world.investigations)
        .filter((investigation) => investigation.state.lifecycle !== 'Active')
        .map((investigation) => investigationView(investigation, world, gdrs)),
      missionSites: Object.values(world.missionSites)
        .filter((site) => !siteIsCurrent(site, world))
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
              leadAvailability(lead, world).available &&
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
    return agent === undefined ? [] : [agent.state];
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
            site.state.enemies.map((id) => must(world.enemies[id], `Enemy ${id}`).state),
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
      economy: numbers(gdrs.economy),
      weapons: [...gdrs.weapons.values()].map((weapon) => ({
        id: weapon.id,
        name: weapon.name,
        damage: weapon.damage,
      })),
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
      factionActivityLevels: [...gdrs.factionActivityLevels.keys()].map((id) => activityLevelView(id, gdrs)),
      names: {
        agency: gdrs.agencyArchetype.name,
        investigation: gdrs.investigationArchetype.name,
        mission: gdrs.missionArchetype.name,
      },
    });
    gameDataCache.set(gdrs, view);
  }
  return view;
}

/**
 * `developer.queries.getCampaignState()`: Campaign state in full, detached, in its conceptual hierarchy, with each
 * Campaign instance as its four properties; see DEV, Inspection contract and DEC-019.
 */
export function inspectCampaignState(state: CampaignState): unknown {
  const world = state.world.current;
  const retainedAgent = (agent: Agent) => !isServing(agent.state);
  const retainedInvestigation = (item: Investigation) => item.state.lifecycle !== 'Active';
  const retainedSite = (site: MissionSite) => !siteIsCurrent(site, world);
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
  return deepFreeze(
    detach({
      campaignConfiguration: state.configuration,
      worldState: {
        currentWorldState: {
          campaignSeed: world.seed,
          randomGenerator: world.rng,
          nextInstanceNumbers: world.nextInstanceNumbers,
          pendingRandomOutcomeOverrides: world.randomOverrides,
          turn: world.turn,
          panic: world.panic,
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
        worldHistory: {
          turnReport: state.world.history.turnReport,
          historyEntries: state.world.history.historyEntries,
          turnSeries: {
            moneyAtStartOfTurn: state.world.history.moneyAtStartOfTurn,
            moneyAtEndOfTurn: state.world.history.moneyAtEndOfTurn,
          },
          currentTurnStart: state.world.history.currentTurnStart,
          retainedCampaignInstances: {
            agents: agents.retained,
            investigations: investigations.retained,
            missionSites: missionSites.retained,
            missions: missions.retained,
            enemies: enemies.retained,
          },
        },
      },
    }),
  );
}
