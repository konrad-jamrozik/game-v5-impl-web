/**
 * TURN (Turn Advancement): the twelve Turn advancement steps, each applied once and in the canonical order. The
 * steps hold Campaign state and hand each rule function only the values it needs; see DEC-003.
 *
 * Within a step, every rule uses Step-start values apart from the exceptions TURN lists, so the order in which
 * Campaign instances are processed does not change the result. `order` lets a test choose that order.
 */
import { byInstanceId, formatInstanceId, must } from '../../kernel/index.ts';
import type { GdrCatalog } from '../../gdr/index.ts';
import {
  addExhaustion,
  agentCombatantValues,
  agentCurrentHealthHundredths,
  applyMissionGrowth,
  applyWorkExhaustion,
  effectiveSkill,
  effectiveWeaponDamage,
  enemyCombatantValues,
  exhaustionOf,
  recordParticipation,
  setAgentCurrentHealth,
  terminateAgent,
  trainingGainProbability,
  type CombatantValues,
} from '../mechanics/agents/agents.ts';
import { fightCombat } from '../mechanics/combat/combat.ts';
import {
  agentUpgradeBonus,
  fundingAfter,
  income,
  upgradedRates,
  upkeep,
} from '../mechanics/economy/economy.ts';
import { applyPendingPanicChange, checkEnding } from '../mechanics/endings/endings.ts';
import {
  applyFactionActivity,
  eliminateFaction,
  type FactionOperationOccurrence,
} from '../mechanics/factions/factions.ts';
import {
  assessmentThreshold,
  progressAfterLoss,
  progressGain,
  reachesActualRequiredProgress,
} from '../mechanics/investigations/investigations.ts';
import { discoverLeads, leadAvailability } from '../mechanics/leads/leads.ts';
import {
  consequencesOf,
  createMissionSite,
  missionExhaustion,
  missionSiteCanExist,
  selectResponseArchetype,
} from '../mechanics/missions/missions.ts';
import { recoverAgent } from '../mechanics/recovery/recovery.ts';
import type { Random } from '../random.ts';
import { summarize } from '../state/summary.ts';
import {
  isServing,
  type AgentState,
  type AgentStatus,
  type Assignment,
  type CampaignState,
  type CombatReport,
  type ConsequenceRecord,
  type CurrentWorldState,
  type HistoryEntry,
  type InvestigationInterruptedRecord,
  type MissionGrowthRecord,
  type MissionResultRecord,
  type TurnReport,
  type WorldHistory,
} from '../state/types.ts';

/** Campaign state while Advance turn changes it. No intermediate value of it is ever observable. */
export interface MutableCampaignState {
  readonly configuration: CampaignState['configuration'];
  readonly world: { current: CurrentWorldState; history: WorldHistory };
}

export type ProcessingOrder = <T>(items: readonly T[]) => T[];

const stateOrder: ProcessingOrder = (items) => [...items];

/** CINST, Campaign instance identity: each Campaign instance Type numbers its Campaign instances from 1. */
export function newInstanceId(current: CurrentWorldState, type: string): string {
  const number = current.nextInstanceNumbers[type] ?? 1;
  current.nextInstanceNumbers[type] = number + 1;
  return formatInstanceId(type, number);
}

/**
 * Applies Advance turn to `draft`, which starts as a copy of the Turn-end state `turnEnd`.
 */
export function applyAdvanceTurn(
  draft: MutableCampaignState,
  turnEnd: CampaignState,
  gdrs: GdrCatalog,
  random: Random,
  order: ProcessingOrder = stateOrder,
): void {
  const world = draft.world.current;
  const before = turnEnd.world.current;
  const turn = world.turn;
  const agentParameters = gdrs.agentParameters;
  // ECON, Rate Upgrades: the rates come from the Acquisitions of the Turn-end state.
  const rates = upgradedRates(
    agentParameters,
    gdrs.recoveryParameters,
    gdrs.upgrades,
    before.agency.state.acquisitions,
  );
  // ECON, Weapon damage Upgrade and Max health Upgrade: no Upgrade is purchased in an Advance turn, so the effective
  // values of every Serving Agent read one Upgrade bonus throughout.
  const bonus = agentUpgradeBonus(gdrs.upgrades, before.agency.state.acquisitions);
  const valuesOf = (agent: { readonly state: AgentState }): CombatantValues =>
    agentCombatantValues(agent.state, bonus);

  /**
   * TURN, Transit across the steps: At assignment or Recovering as a Step-start value. The arrivals step comes last
   * among the steps that apply to Agents, so an Agent In transit in the Turn-end state is still In transit here.
   */
  const worksNow = (agentId: string): boolean => {
    const status: AgentStatus | undefined = world.agents[agentId]?.state.status;
    return status === 'AtAssignment' || status === 'Recovering';
  };

  let pendingPanicChange = 0;
  const panicBefore = world.panic;
  const fundingBefore = world.agency.state.funding;

  // AGENT, Forced return: the Agents a step sent back to Standby after their work, in the order of the steps.
  const forcedReturns: { agent: string; from: 'Contracting' | 'Training' | 'Investigation' }[] = [];

  // Step 1: Agency income, from the Step-start effective skills; then each counted Agent's work exhaustion and
  // Forced return (TURN, Exceptions to Step-start values).
  const contracting = Object.values(world.agents).filter(
    (agent) => agent.state.assignment?.kind === 'Contracting' && worksNow(agent.id),
  );
  const incomeAmount = income(
    world.agency.state.funding,
    contracting.map((agent) => effectiveSkill(valuesOf(agent), agentParameters)),
    gdrs.economy,
  );
  world.agency.state.money += incomeAmount;
  const incomeReport = {
    funding: world.agency.state.funding,
    contractingAgents: contracting.length,
    income: incomeAmount,
    moneyAfter: world.agency.state.money,
  };
  for (const agent of order(contracting)) {
    if (applyWorkExhaustion(agent.state, agentParameters.exhaustionPerContractingTurn, agentParameters)) {
      agent.state.assignment = { kind: 'Standby' };
      agent.state.status = 'InTransit';
      forcedReturns.push({ agent: agent.id, from: 'Contracting' });
    }
  }
  sortByAgent(world, forcedReturns);

  // Step 2: Upkeep.
  const serving = Object.values(world.agents).filter((agent) => isServing(agent.state)).length;
  const upkeepAmount = upkeep(serving, gdrs.economy);
  world.agency.state.money -= upkeepAmount;
  const upkeepReport = { servingAgents: serving, upkeep: upkeepAmount, moneyAfter: world.agency.state.money };

  // Step 3: Training.
  // AGENT, Training growth: the Training gain outcome and any gain, then work exhaustion and the Forced return.
  const training: {
    agent: string;
    gained: boolean;
    skillAfterHundredths: number;
    exhaustionAfter: number;
  }[] = [];
  const trainingReturns: typeof forcedReturns = [];
  for (const agent of order(Object.values(world.agents))) {
    if (agent.state.assignment?.kind === 'Training' && worksNow(agent.id)) {
      const gained = random.chance(
        `agent.trainingGain.${agent.id}`,
        trainingGainProbability(valuesOf(agent), agentParameters),
      );
      if (gained) {
        // AGENT, Training growth: no rounding occurs, as the sum of two Decimal quantities is one.
        agent.state.skillHundredths += rates.trainingSkillGainHundredths;
      }
      if (applyWorkExhaustion(agent.state, agentParameters.exhaustionPerTrainingTurn, agentParameters)) {
        // A Forced return from Training, a Base Assignment, is At assignment at once.
        agent.state.assignment = { kind: 'Standby' };
        trainingReturns.push({ agent: agent.id, from: 'Training' });
      }
      training.push({
        agent: agent.id,
        gained,
        skillAfterHundredths: agent.state.skillHundredths,
        exhaustionAfter: exhaustionOf(agent.state),
      });
    }
  }
  sortByAgent(world, training);
  forcedReturns.push(...sortByAgent(world, trainingReturns));

  // Step 4: Investigation progress.
  const investigationResults = new Map<
    string,
    {
      progressGain: number;
      becameAssessed: boolean;
      completed: boolean;
      progressLost: number;
      progressAfter: number;
      abandoned: boolean;
    }
  >();
  const investigationReturns: typeof forcedReturns = [];
  for (const investigation of order(Object.values(world.investigations))) {
    if (investigation.state.lifecycle !== 'Active') {
      continue;
    }
    const lead = must(
      gdrs.leads.find((item) => item.id === investigation.constants.lead),
      `Lead ${investigation.constants.lead}`,
    );
    // INVSTG, Progress gain: the effective skill of the working members, reduced by team efficiency.
    const workingMembers = investigation.state.currentTeam.filter((member) => worksNow(member));
    const skillOf = new Map(
      workingMembers.map((member) => [
        member,
        effectiveSkill(valuesOf(must(world.agents[member], `Agent ${member}`)), agentParameters),
      ]),
    );
    const skillSum = [...skillOf.values()].reduce((sum, skill) => sum + skill, 0);
    const gain = progressGain(workingMembers.length, skillSum, gdrs.investigationParameters);
    investigation.state.progress += gain;
    // INVSTG, Assessment.
    let becameAssessed = false;
    if (
      !investigation.state.assessed &&
      investigation.state.progress >= assessmentThreshold(lead.requiredProgress, gdrs.investigationParameters)
    ) {
      investigation.state.assessed = true;
      becameAssessed = true;
    }
    // INVSTG, Completion check: certain, with no random outcome.
    const completes = reachesActualRequiredProgress(
      investigation.state.progress,
      investigation.constants.actualRequiredProgress,
    );
    if (completes) {
      investigation.state.lifecycle = 'Completed';
      // INVSTG, Completion: every member goes to Standby, In transit, including one still In transit to the
      // Investigation, whose new transit does not arrive in step 9 of this Advance turn.
      for (const member of investigation.state.currentTeam) {
        const agent = must(world.agents[member], `Agent ${member}`);
        agent.state.assignment = { kind: 'Standby' };
        agent.state.status = 'InTransit';
        recordParticipation(agent.state, 'Investigation', investigation.id);
      }
      investigation.state.currentTeam = [];
    }
    // AGENT, Work exhaustion: every working member gains exhaustion after the progress and the completion; one still
    // on the Investigation has a Forced return at exhaustion_work_limit (INVSTG, Investigation progress).
    let returned = false;
    for (const member of workingMembers) {
      const agent = must(world.agents[member], `Agent ${member}`);
      const limitReached = applyWorkExhaustion(
        agent.state,
        agentParameters.exhaustionPerInvestigationTurn,
        agentParameters,
      );
      if (limitReached && investigation.state.currentTeam.includes(member)) {
        agent.state.assignment = { kind: 'Standby' };
        agent.state.status = 'InTransit';
        recordParticipation(agent.state, 'Investigation', investigation.id);
        investigation.state.currentTeam = investigation.state.currentTeam.filter((id) => id !== member);
        investigationReturns.push({ agent: member, from: 'Investigation' });
        returned = true;
      }
    }
    // INVSTG, Progress loss: once, after every Forced return of this step, in proportion to the effective skill
    // of the working members that left.
    let progressLost = 0;
    if (returned) {
      const skillAfter = workingMembers
        .filter((member) => investigation.state.currentTeam.includes(member))
        .reduce((sum, member) => sum + (skillOf.get(member) ?? 0), 0);
      const before = investigation.state.progress;
      investigation.state.progress = progressAfterLoss(before, skillSum, skillAfter);
      progressLost = before - investigation.state.progress;
    }
    // INVSTG, Abandonment: the Forced returns of this step left the Investigation with an empty Current team.
    let abandoned = false;
    if (investigation.state.lifecycle === 'Active' && investigation.state.currentTeam.length === 0) {
      investigation.state.lifecycle = 'Abandoned';
      abandoned = true;
    }
    investigationResults.set(investigation.id, {
      progressGain: gain,
      becameAssessed,
      completed: completes,
      progressLost,
      progressAfter: investigation.state.progress,
      abandoned,
    });
  }
  forcedReturns.push(...sortByAgent(world, investigationReturns));
  // INVSTG, Independence within the step: the completion effects create their Mission sites in the order of the
  // completed Investigations' Instance IDs, so that the Instance IDs they take do not depend on the processing order.
  // INVSTG, Turn report: the Turn report lists the Investigations in the same order.
  const investigationReports: TurnReport['investigations'][number][] = [];
  const createdMissionSites: string[] = [];
  for (const investigation of Object.values(world.investigations).sort(byInstanceId)) {
    const result = investigationResults.get(investigation.id);
    if (result === undefined) {
      continue;
    }
    let created: string | null = null;
    if (result.completed) {
      const lead = must(
        gdrs.leads.find((item) => item.id === investigation.constants.lead),
        'Lead of a completed Investigation',
      );
      const archetype = must(
        gdrs.missionSiteArchetypes.find((item) => item.id === lead.onCompletion.createMissionSite),
        `MissionSiteArchetype ${lead.onCompletion.createMissionSite}`,
      );
      const faction = must(
        Object.values(world.factions).find((item) => item.archetype === lead.faction),
        `Faction of Lead ${lead.id}`,
      );
      const { site, enemies } = createMissionSite({
        newId: (type) => newInstanceId(world, type),
        archetype,
        origin: { kind: 'Investigation', investigation: investigation.id },
        targetFaction: faction.id,
        turn,
        enemyArchetypes: gdrs.enemyArchetypes,
        weapons: gdrs.weapons,
      });
      world.missionSites[site.id] = site;
      for (const enemy of enemies) {
        world.enemies[enemy.id] = enemy;
      }
      created = site.id;
      createdMissionSites.push(site.id);
    }
    investigationReports.push({
      investigation: investigation.id,
      lead: investigation.constants.lead,
      ...result,
      createdMissionSite: created,
    });
  }

  // Step 5: Mission resolution, then cancellation, then interruption.
  const missionResults = new Map<string, MissionResultRecord>();
  const combatReports = new Map<string, CombatReport>();
  const missionFunding: number[] = [];
  const fundingAtStep5 = world.agency.state.funding;
  for (const mission of order(Object.values(world.missions))) {
    if (mission.state.lifecycle !== 'Deployed') {
      continue;
    }
    const site = must(world.missionSites[mission.constants.missionSite], 'Mission site of a Mission');
    const archetype = must(
      gdrs.missionSiteArchetypes.find((item) => item.id === site.archetype),
      `MissionSiteArchetype ${site.archetype}`,
    );
    const team = mission.state.currentTeam.map((id) => must(world.agents[id], `Agent ${id}`));
    // An Enemy fights in the hundredths form of an Agent and its whole values are written back after the Combat;
    // see DEC-056.
    const siteEnemies = site.state.enemies.map((id) => must(world.enemies[id], `Enemy ${id}`));
    const enemyStates = siteEnemies.map((enemy) => ({
      ...enemyCombatantValues(enemy.state),
      weaponDamage: enemy.state.baseWeaponDamage,
    }));
    // An Agent fights with its effective max health, current health, and effective weapon damage; its current health
    // and Exact exhaustion are written back after the Combat, current health as the health lost it leaves.
    const agentStates = team.map((agent) => ({
      ...agentCombatantValues(agent.state, bonus),
      weaponDamage: effectiveWeaponDamage(agent.state, bonus),
    }));
    const report = fightCombat({
      missionId: mission.id,
      agents: team.map((agent, index) => ({ id: agent.id, state: must(agentStates[index], 'Agent') })),
      enemies: siteEnemies.map((enemy, index) => ({
        id: enemy.id,
        state: must(enemyStates[index], 'Enemy'),
      })),
      combat: gdrs.combatParameters,
      agentParameters,
      random,
    });
    siteEnemies.forEach((enemy, index) => {
      const fought = must(enemyStates[index], 'Enemy');
      enemy.state.healthLost = enemy.state.baseHealth - fought.currentHealthHundredths / 100;
      enemy.state.exhaustion = fought.exactExhaustionHundredths / 100;
    });
    team.forEach((agent, index) => {
      const fought = must(agentStates[index], 'Agent');
      setAgentCurrentHealth(agent.state, fought.currentHealthHundredths, bonus);
      agent.state.exactExhaustionHundredths = fought.exactExhaustionHundredths;
    });
    const currentHealthOf = (agent: (typeof team)[number]): number =>
      agentCurrentHealthHundredths(agent.state, bonus);
    combatReports.set(mission.id, report);
    // AGENT, Service record, and COMBAT, Killed and Incapacitated: each attack that leaves its defender dead raises
    // the attacking Agent's Enemies killed, or records the attacking Enemy and its Mission site as the Killed by of
    // the dead Agent.
    const teamById = new Map(team.map((agent) => [agent.id, agent]));
    for (const attack of report.log) {
      if (!attack.defenderDead) {
        continue;
      }
      const attackingAgent = teamById.get(attack.attacker);
      if (attackingAgent !== undefined) {
        attackingAgent.state.enemiesKilled += 1;
      }
      const deadAgent = teamById.get(attack.defender);
      if (deadAgent !== undefined) {
        deadAgent.state.killedBy = { enemy: attack.attacker, missionSite: site.id };
      }
    }
    const result = report.outcome === 'Prevailed' ? 'Won' : 'Lost';
    mission.state.lifecycle = result;
    // MISSION, Mission site lifecycle: Deployed to Concluded when its Mission becomes Won or Lost.
    site.state.lifecycle = 'Concluded';

    const killed: string[] = [];
    const toRecovery: string[] = [];
    const toStandby: string[] = [];
    // MISSION, Mission exhaustion: every survivor gains the same amount, from K Killed of the D sent.
    const killedCount = team.filter((agent) => currentHealthOf(agent) === 0).length;
    const survivorExhaustion = missionExhaustion(killedCount, team.length, agentParameters);
    for (const agent of team) {
      recordParticipation(agent.state, 'Mission', mission.id);
      if (currentHealthOf(agent) === 0) {
        // AGENT, Service record: the Turn that this Advance turn ends, and the Final max health and Final weapon
        // damage.
        terminateAgent(agent.state, 'Killed', turn, bonus);
        killed.push(agent.id);
      } else {
        if (agent.state.healthLostHundredths > 0) {
          agent.state.assignment = { kind: 'Recovery' };
          toRecovery.push(agent.id);
        } else {
          agent.state.assignment = { kind: 'Standby' };
          toStandby.push(agent.id);
        }
        agent.state.status = 'InTransit';
        addExhaustion(agent.state, survivorExhaustion);
      }
    }
    // MISSION, Resolving one Mission, step 7, and AGENT, Mission growth: every survivor, Won or Lost, gains its combat
    // skill gain from the Combat report and its survival skill gain; a Killed Agent's combat skill gain is lost.
    const growth: MissionGrowthRecord[] = [];
    for (const agent of team) {
      if (agent.state.status === 'Killed') {
        continue;
      }
      const participant = must(
        report.participants.find((item) => item.id === agent.id),
        'Combat report participant',
      );
      const missionsSurvived = agent.state.participationHistory.filter(
        (item) => item.kind === 'Mission',
      ).length;
      const gained = applyMissionGrowth(
        agent.state,
        must(participant.combatSkillGain, 'combat skill gain of an Agent'),
        missionsSurvived,
        agentParameters,
      );
      growth.push({
        agent: agent.id,
        ...gained,
        skillAfterHundredths: agent.state.skillHundredths,
        experienceAfter: agent.state.experience,
      });
    }
    mission.state.currentTeam = [];

    const operationLevel =
      site.constants.origin.kind === 'FactionOperation'
        ? (gdrs.factionOperationLevels.find(
            (level) =>
              site.constants.origin.kind === 'FactionOperation' &&
              level.id === site.constants.origin.operationLevel,
          ) ?? null)
        : null;
    const amounts = consequencesOf(result, archetype, operationLevel);
    world.agency.state.money += amounts.money;
    missionFunding.push(amounts.fundingChange);
    pendingPanicChange += amounts.panicIncrease - amounts.panicReduction;
    let eliminatedFaction: string | null = null;
    if (amounts.eliminateTargetFaction) {
      const target = must(world.factions[site.constants.targetFaction], 'target Faction');
      if (!target.state.eliminated) {
        eliminatedFaction = target.id;
      }
      eliminateFaction(target.state, turn);
    }
    missionResults.set(mission.id, {
      mission: mission.id,
      missionSite: site.id,
      missionSiteArchetype: site.archetype,
      kind: site.constants.kind,
      result,
      killed,
      toRecovery,
      toStandby,
      growth,
      consequence: toRecord(amounts, eliminatedFaction),
    });
  }
  world.agency.state.funding = fundingAfter(fundingAtStep5, missionFunding);
  // MISSION, Cancellation: every Active Mission site that cannot exist, read after every resolution of the step.
  const cancelledMissionSites: string[] = [];
  for (const site of Object.values(world.missionSites)) {
    if (site.state.lifecycle !== 'Active') {
      continue;
    }
    const archetype = must(
      gdrs.missionSiteArchetypes.find((item) => item.id === site.archetype),
      `MissionSiteArchetype ${site.archetype}`,
    );
    if (!missionSiteCanExist(archetype, world.factions[site.constants.targetFaction], world)) {
      site.state.lifecycle = 'Cancelled';
      cancelledMissionSites.push(site.id);
    }
  }
  // INVSTG, Lead no longer available: after the Cancellation part, every Active Investigation whose Lead is not
  // available is interrupted. Its members, including one still In transit to it, go to Standby, In transit, and leave
  // its Current team; it becomes Abandoned with Investigation progress 0 and creates no Mission site. Their new transit
  // does not arrive in step 9 of this Advance turn.
  const investigationsInterrupted: InvestigationInterruptedRecord[] = [];
  for (const investigation of Object.values(world.investigations).sort(byInstanceId)) {
    if (investigation.state.lifecycle !== 'Active') {
      continue;
    }
    const lead = must(
      gdrs.leads.find((item) => item.id === investigation.constants.lead),
      'Lead of an Investigation',
    );
    if (leadAvailability(lead, world, gdrs.missionSiteArchetypes).available) {
      continue;
    }
    for (const member of investigation.state.currentTeam) {
      const agent = must(world.agents[member], `Agent ${member}`);
      agent.state.assignment = { kind: 'Standby' };
      agent.state.status = 'InTransit';
      recordParticipation(agent.state, 'Investigation', investigation.id);
    }
    investigation.state.currentTeam = [];
    investigation.state.progress = 0;
    investigation.state.lifecycle = 'Abandoned';
    investigationsInterrupted.push({ investigation: investigation.id, lead: lead.id });
  }
  // When two Won Missions defeat one Faction, the Turn report names the defeat once, on the first in state order.
  const reportedEliminations = new Set<string>();
  const missionReports: MissionResultRecord[] = [];
  for (const mission of Object.values(world.missions)) {
    const result = missionResults.get(mission.id);
    if (result === undefined) {
      continue;
    }
    const site = must(world.missionSites[result.missionSite], 'Mission site');
    const archetype = must(
      gdrs.missionSiteArchetypes.find((item) => item.id === site.archetype),
      'MissionSiteArchetype',
    );
    const eliminates =
      result.result === 'Won' &&
      archetype.kind === 'initiative' &&
      archetype.onWin.eliminateTargetFaction &&
      before.factions[site.constants.targetFaction]?.state.eliminated === false &&
      !reportedEliminations.has(site.constants.targetFaction);
    if (eliminates) {
      reportedEliminations.add(site.constants.targetFaction);
    }
    missionReports.push({
      ...result,
      consequence: {
        ...result.consequence,
        eliminatedFaction: eliminates ? site.constants.targetFaction : null,
      },
    });
  }

  // Step 6: Mission site expiration.
  const expiryFunding: number[] = [];
  const fundingAtStep6 = world.agency.state.funding;
  const expiredMissionSites: TurnReport['expiredMissionSites'][number][] = [];
  for (const site of order(Object.values(world.missionSites))) {
    if (site.state.lifecycle !== 'Active' || before.missionSites[site.id] === undefined) {
      continue;
    }
    site.state.turnsUntilExpiration -= 1;
    if (site.state.turnsUntilExpiration !== 0) {
      continue;
    }
    site.state.lifecycle = 'Expired';
    const archetype = must(
      gdrs.missionSiteArchetypes.find((item) => item.id === site.archetype),
      `MissionSiteArchetype ${site.archetype}`,
    );
    const origin = site.constants.origin;
    const operationLevel =
      origin.kind === 'FactionOperation'
        ? (gdrs.factionOperationLevels.find((level) => level.id === origin.operationLevel) ?? null)
        : null;
    const amounts = consequencesOf('Expired', archetype, operationLevel);
    world.agency.state.money += amounts.money;
    expiryFunding.push(amounts.fundingChange);
    pendingPanicChange += amounts.panicIncrease - amounts.panicReduction;
    expiredMissionSites.push({
      missionSite: site.id,
      missionSiteArchetype: site.archetype,
      kind: site.constants.kind,
      consequence: toRecord(amounts, null),
    });
  }
  world.agency.state.funding = fundingAfter(fundingAtStep6, expiryFunding);
  expiredMissionSites.sort((a, b) => siteIndex(world, a.missionSite) - siteIndex(world, b.missionSite));

  // Step 7: Faction activity.
  const occurrences = new Map<string, FactionOperationOccurrence | null>();
  const levelBefore = new Map<string, string>();
  for (const faction of order(Object.values(world.factions))) {
    if (faction.state.eliminated) {
      continue;
    }
    levelBefore.set(faction.id, faction.state.activityLevel);
    occurrences.set(
      faction.id,
      applyFactionActivity(
        faction.id,
        faction.state,
        turn,
        (id) => must(gdrs.factionActivityLevels.get(id), `FactionActivityLevel ${id}`),
        random,
      ),
    );
  }
  // FACTION, Several Factions: the Response Mission sites are created in the order of the initiating Factions'
  // Instance IDs. FACTION, Turn report: the Turn report lists the Factions in the same order.
  const factionActivity: TurnReport['factionActivity'][number][] = [];
  for (const faction of Object.values(world.factions).sort(byInstanceId)) {
    if (!occurrences.has(faction.id)) {
      continue;
    }
    const occurrence = occurrences.get(faction.id) ?? null;
    let created: string | null = null;
    let operationLevelId: string | null = null;
    if (occurrence !== null) {
      const level = must(
        gdrs.factionOperationLevels.find((item) => item.level === occurrence.operationLevel),
        `FactionOperationLevel ${occurrence.operationLevel}`,
      );
      const archetype = selectResponseArchetype(random, faction.id, level.level, gdrs.missionSiteArchetypes);
      const { site, enemies } = createMissionSite({
        newId: (type) => newInstanceId(world, type),
        archetype,
        origin: { kind: 'FactionOperation', initiatingFaction: faction.id, operationLevel: level.id },
        targetFaction: faction.id,
        turn,
        enemyArchetypes: gdrs.enemyArchetypes,
        weapons: gdrs.weapons,
      });
      world.missionSites[site.id] = site;
      for (const enemy of enemies) {
        world.enemies[enemy.id] = enemy;
      }
      created = site.id;
      operationLevelId = level.id;
      createdMissionSites.push(site.id);
    }
    const escalatedTo =
      levelBefore.get(faction.id) === faction.state.activityLevel ? null : faction.state.activityLevel;
    if (escalatedTo !== null || created !== null) {
      factionActivity.push({
        faction: faction.id,
        escalatedTo,
        createdMissionSite: created,
        operationLevel: operationLevelId,
      });
    }
  }

  // Step 8: Agent recovery.
  const recovery: TurnReport['recovery'][number][] = [];
  for (const agent of order(Object.values(world.agents))) {
    const kind = agent.state.assignment?.kind;
    if ((kind === 'Recovery' || kind === 'Standby') && worksNow(agent.id)) {
      const healthLost = agent.state.healthLostHundredths;
      const exactExhaustion = agent.state.exactExhaustionHundredths;
      recoverAgent(agent.state, rates, bonus);
      const kindAfter: string | undefined = agent.state.assignment?.kind;
      if (
        agent.state.healthLostHundredths !== healthLost ||
        agent.state.exactExhaustionHundredths !== exactExhaustion ||
        kind === 'Recovery'
      ) {
        recovery.push({
          agent: agent.id,
          healthAfterHundredths: agentCurrentHealthHundredths(agent.state, bonus),
          exactExhaustionAfterHundredths: agent.state.exactExhaustionHundredths,
          exhaustionAfter: exhaustionOf(agent.state),
          recovered: kind === 'Recovery' && kindAfter === 'Standby',
        });
      }
    }
  }
  recovery.sort((a, b) => agentIndex(world, a.agent) - agentIndex(world, b.agent));

  // Step 9: Previous turn transit arrivals. TURN, Values a step uses: the only transit read of the Turn-end state. An
  // Agent arrives exactly when it is In transit with the same Assignment both in the Turn-end state and now, so every
  // transit started in this Advance turn, including a redirect from an Investigation that ended, is skipped.
  const arrived: string[] = [];
  for (const agent of Object.values(world.agents)) {
    const atTurnEnd = before.agents[agent.id]?.state;
    if (
      agent.state.status === 'InTransit' &&
      atTurnEnd?.status === 'InTransit' &&
      sameAssignment(atTurnEnd.assignment, agent.state.assignment)
    ) {
      agent.state.status = agent.state.assignment?.kind === 'Recovery' ? 'Recovering' : 'AtAssignment';
      arrived.push(agent.id);
    }
  }

  // Step 10: Panic.
  world.panic = applyPendingPanicChange(world.panic, pendingPanicChange);

  // Step 11: Ending check.
  const decision = checkEnding({
    factionsEliminated: Object.values(world.factions).map((faction) => faction.state.eliminated),
    panic: world.panic,
    panicLimit: gdrs.endingParameters.defeatAtPanicPct,
    money: world.agency.state.money,
  });
  if (decision !== null) {
    world.ending = decision.ending;
    world.endingReasons = decision.reasons;
    world.endingTurn = turn;
  }

  // Step 12: Turn close.
  const history = draft.world.history;
  history.moneyAtEndOfTurn.push({ turn, value: before.agency.state.money });
  world.turn = turn + 1;
  history.moneyAtStartOfTurn.push({ turn: world.turn, value: world.agency.state.money });

  // LEAD, Lead discovery: within an Advance turn only the World state it produces counts. The Turn report lists the
  // Leads that joined the set of discovered Leads, in Game build order (DEC-035).
  const discoveredLeads = discoverLeads(world, gdrs.leads);

  const report: TurnReport = {
    turn,
    transit: { arrived },
    income: incomeReport,
    upkeep: upkeepReport,
    training,
    // AGENT, Turn report: every Forced return of the Advance turn, whichever step made it, in Agent order.
    forcedReturns: sortByAgent(world, forcedReturns),
    investigations: investigationReports,
    investigationsCompleted: investigationReports
      .filter((item) => item.completed)
      .map((item) => ({ investigation: item.investigation, gain: item.progressGain })),
    missions: missionReports,
    combatReports: missionReports.map((item) => must(combatReports.get(item.mission), 'Combat report')),
    discoveredLeads,
    investigationsInterrupted,
    createdMissionSites,
    cancelledMissionSites,
    expiredMissionSites,
    factionActivity,
    recovery,
    panic: { before: panicBefore, after: world.panic },
    funding: { before: fundingBefore, after: world.agency.state.funding },
    money: { turnEnd: before.agency.state.money, after: world.agency.state.money },
    ending: decision === null ? null : { ending: decision.ending, reasons: decision.reasons },
  };
  history.turnReport = report;
  history.historyEntries.push(
    reduceReport(report, history.currentTurnStart, summarize(before), history.currentActions),
  );
  history.currentTurnStart = summarize(world);
  // WHIST, Action record: the Advance turn moves the Turn's Action record into its History entry and starts an empty one.
  history.currentActions = [];
}

function toRecord(
  amounts: ReturnType<typeof consequencesOf>,
  eliminatedFaction: string | null,
): ConsequenceRecord {
  return {
    money: amounts.money,
    fundingChange: amounts.fundingChange,
    panicIncrease: amounts.panicIncrease,
    panicReduction: amounts.panicReduction,
    eliminatedFaction,
  };
}

/** AGENT, Transit rule, Arrival: whether an Agent kept the Assignment it was In transit to. */
function sameAssignment(a: Assignment | null | undefined, b: Assignment | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }
  if (a.kind === 'Investigation' && b.kind === 'Investigation') {
    return a.investigation === b.investigation;
  }
  if (a.kind === 'Deployed' && b.kind === 'Deployed') {
    return a.mission === b.mission;
  }
  return a.kind === b.kind;
}

function agentIndex(world: CurrentWorldState, id: string): number {
  return Object.keys(world.agents).indexOf(id);
}

/** Sorts report items in the order of the Agents in Campaign state, so that reports do not depend on `order`. */
function sortByAgent<T extends { readonly agent: string }>(world: CurrentWorldState, items: T[]): T[] {
  return items.sort((a, b) => agentIndex(world, a.agent) - agentIndex(world, b.agent));
}

function siteIndex(world: CurrentWorldState, id: string): number {
  return Object.keys(world.missionSites).indexOf(id);
}

/** The reduced form of a Turn report that its History entry keeps; see DEC-016. */
function reduceReport(
  report: TurnReport,
  turnStart: HistoryEntry['turnStart'],
  turnEnd: HistoryEntry['turnEnd'],
  actions: HistoryEntry['actions'],
): HistoryEntry {
  return {
    turn: report.turn,
    turnStart,
    turnEnd,
    actions: [...actions],
    report: {
      income: report.income.income,
      upkeep: report.upkeep.upkeep,
      missions: report.missions.map((mission, index) => {
        const combat = must(report.combatReports[index], 'Combat report');
        return {
          mission: mission.mission,
          missionSite: mission.missionSite,
          missionSiteArchetype: mission.missionSiteArchetype,
          kind: mission.kind,
          result: mission.result,
          combatOutcome: combat.outcome,
          combatRounds: combat.rounds,
          killed: mission.killed,
          wounded: mission.toRecovery,
          unharmed: mission.toStandby,
        };
      }),
      investigationsCompleted: report.investigationsCompleted.map((item) => ({ ...item })),
      discoveredLeads: [...report.discoveredLeads],
      investigationsInterrupted: report.investigationsInterrupted.map((item) => ({ ...item })),
      createdMissionSites: [...report.createdMissionSites],
      expiredMissionSites: report.expiredMissionSites.map((item) => item.missionSite),
      cancelledMissionSites: report.cancelledMissionSites,
      escalatedFactions: report.factionActivity
        .filter((item) => item.escalatedTo !== null)
        .map((item) => item.faction),
      panicAfter: report.panic.after,
      moneyAfter: report.money.after,
      fundingAfter: report.funding.after,
      ending: report.ending?.ending ?? null,
    },
  };
}
