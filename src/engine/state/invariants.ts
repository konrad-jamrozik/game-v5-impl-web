/**
 * The invariants every Committed state satisfies, as the specifications state them; see ENG, Committed state
 * integrity. A violation is an engine defect and is never repaired into different gameplay.
 */
import { findNonWholeNumber } from '../../kernel/index.ts';
import type { GdrCatalog } from '../../gdr/index.ts';
import {
  reachesActualRequiredProgress,
  requiredProgressRange,
} from '../mechanics/investigations/investigations.ts';
import { isServing, type CampaignState } from './types.ts';

export function checkInvariants(state: CampaignState, gdrs: GdrCatalog): string[] {
  const problems: string[] = [];
  const fail = (message: string) => problems.push(message);
  const world = state.world.current;

  // NUMBERS, Whole-number quantities.
  const fraction = findNonWholeNumber(state);
  if (fraction !== null) {
    fail(`NUMBERS: ${fraction} is not a whole number`);
  }

  // DOM, Campaign instance identity scope: Instance IDs are unique across all seven Types.
  const ids = new Set<string>([world.agency.id]);
  const collections: Readonly<Record<string, { readonly id: string }>>[] = [
    world.agents,
    world.factions,
    world.investigations,
    world.missionSites,
    world.missions,
    world.enemies,
  ];
  for (const collection of collections) {
    for (const [key, instance] of Object.entries(collection)) {
      if (key !== instance.id || ids.has(instance.id)) {
        fail(`DOM: Instance ID ${instance.id} is not unique`);
      }
      ids.add(instance.id);
    }
  }

  // ECON, Agency properties; ENDING, State invariants; TURN, Turn number.
  if (world.agency.archetype !== gdrs.agencyArchetype.id) {
    fail('ECON: the Agency has no AgencyArchetype');
  }
  if (world.agency.state.funding < 0) {
    fail('ECON: funding is below 0');
  }
  for (const upgrade of gdrs.upgrades) {
    if ((world.agency.state.acquisitions[upgrade.id] ?? -1) < 0) {
      fail(`ECON: acquisitions of ${upgrade.id} are missing or negative`);
    }
  }
  if (world.turn < 1) {
    fail('TURN: the turn number is below 1');
  }
  if (world.panic < 0 || world.panic > 100) {
    fail('ENDING: Panic is outside 0 to 100');
  }
  const ended = world.ending !== null;
  if (ended !== world.endingReasons.length > 0 || ended !== (world.endingTurn !== null)) {
    fail('ENDING: the Campaign ending, Ending reasons, and Ending turn do not agree');
  }
  if (world.ending === 'Victory' && world.endingReasons.join() !== 'EveryFactionEliminated') {
    fail('ENDING: Victory has an Ending reason other than Every Faction Eliminated');
  }
  if (
    world.ending === 'Defeat' &&
    (new Set(world.endingReasons).size !== world.endingReasons.length ||
      world.endingReasons.some((reason) => reason === 'EveryFactionEliminated'))
  ) {
    fail('ENDING: Defeat has an invalid Ending reason');
  }

  // AGENT, Agent status, Attribute ranges and Orders.
  for (const agent of Object.values(world.agents)) {
    const s = agent.state;
    const where = `AGENT ${agent.id}`;
    if (agent.archetype !== gdrs.agentArchetype.id || agent.constants.agency !== world.agency.id) {
      fail(`${where}: Archetype or Agency does not resolve`);
    }
    if (!gdrs.weapons.has(s.weapon) || s.weaponDamage < 1) {
      fail(`${where}: Weapon does not resolve or weapon damage is below 1`);
    }
    if (s.skill < 0 || s.baseHealth < 1 || s.currentHealth < 0 || s.currentHealth > s.baseHealth) {
      fail(`${where}: skill or health is outside its range`);
    }
    if (s.exhaustion < 0) {
      fail(`${where}: exhaustion is outside its range`);
    }
    if (isServing(s) !== (s.assignment !== null)) {
      fail(`${where}: Current assignment is not present exactly when the Agent is Serving`);
    }
    if ((s.status === 'Recovering') !== (s.assignment?.kind === 'Recovery' && s.status !== 'InTransit')) {
      fail(`${where}: Recovering does not agree with a Recovery assignment that is not In transit`);
    }
    if ((s.status === 'Killed') !== (s.currentHealth === 0)) {
      fail(`${where}: current health does not agree with the Agent status`);
    }
    if (s.assignment?.kind === 'Deployed') {
      const mission = world.missions[s.assignment.mission];
      if (
        s.status !== 'AtAssignment' ||
        mission?.state.lifecycle !== 'Deployed' ||
        !mission.state.currentTeam.includes(agent.id)
      ) {
        fail(`${where}: Deployed without a Deployed Mission whose Current team contains it`);
      }
    }
    if (s.assignment?.kind === 'Investigation') {
      const investigation = world.investigations[s.assignment.investigation];
      if (
        investigation?.state.lifecycle !== 'Active' ||
        !investigation.state.currentTeam.includes(agent.id)
      ) {
        fail(`${where}: on an Investigation that is not Active or whose Current team lacks it`);
      }
    }
  }

  // INVSTG, Investigation properties.
  const activeLeads = new Set<string>();
  for (const investigation of Object.values(world.investigations)) {
    const where = `INVSTG ${investigation.id}`;
    const lead = gdrs.leads.find((item) => item.id === investigation.constants.lead);
    const active = investigation.state.lifecycle === 'Active';
    if (lead === undefined || investigation.archetype !== gdrs.investigationArchetype.id) {
      fail(`${where}: Lead or Archetype does not resolve`);
      continue;
    }
    if (active !== investigation.state.currentTeam.length > 0) {
      fail(`${where}: the Current team is non-empty exactly when Active`);
    }
    const actual = investigation.constants.actualRequiredProgress;
    if (active && reachesActualRequiredProgress(investigation.state.progress, actual)) {
      fail(`${where}: Active with Investigation progress at or above its Actual required progress × 100`);
    }
    const range = requiredProgressRange(lead.requiredProgress, gdrs.investigationParameters);
    if (actual < range.min || actual > range.max) {
      fail(`${where}: Actual required progress outside the Required progress range of ${lead.id}`);
    }
    if (investigation.state.lifecycle === 'Completed' && !investigation.state.assessed) {
      fail(`${where}: Completed but not Assessed`);
    }
    if (investigation.state.progress < 0) {
      fail(`${where}: negative Investigation progress`);
    }
    if (active && activeLeads.has(lead.id)) {
      fail(`${where}: a second Active Investigation of ${lead.id}`);
    }
    if (active) {
      activeLeads.add(lead.id);
    }
    for (const member of investigation.state.currentTeam) {
      const assignment = world.agents[member]?.state.assignment;
      if (assignment?.kind !== 'Investigation' || assignment.investigation !== investigation.id) {
        fail(`${where}: Current team member ${member} has another Current assignment`);
      }
    }
  }

  // MISSION, Mission site properties and Mission properties.
  const missionsBySite = new Map<string, number>();
  for (const mission of Object.values(world.missions)) {
    const where = `MISSION ${mission.id}`;
    const site = world.missionSites[mission.constants.missionSite];
    missionsBySite.set(
      mission.constants.missionSite,
      (missionsBySite.get(mission.constants.missionSite) ?? 0) + 1,
    );
    const siteHasMission = site?.state.lifecycle === 'Attempted' || site?.state.lifecycle === 'Concluded';
    if (!siteHasMission || mission.archetype !== gdrs.missionArchetype.id) {
      fail(`${where}: its Mission site is not Attempted or Concluded, or its Archetype does not resolve`);
    }
    const deployed = mission.state.lifecycle === 'Deployed';
    const sameTeam =
      mission.state.currentTeam.length === mission.constants.teamSent.length &&
      mission.state.currentTeam.every((id, index) => id === mission.constants.teamSent[index]);
    if (
      deployed ? !sameTeam || mission.constants.teamSent.length === 0 : mission.state.currentTeam.length > 0
    ) {
      fail(`${where}: the Current team equals the Team sent exactly when Deployed`);
    }
    for (const member of mission.state.currentTeam) {
      const assignment = world.agents[member]?.state.assignment;
      if (assignment?.kind !== 'Deployed' || assignment.mission !== mission.id) {
        fail(`${where}: Current team member ${member} is not Deployed on it`);
      }
    }
  }
  for (const site of Object.values(world.missionSites)) {
    const where = `MISSION site ${site.id}`;
    const archetype = gdrs.missionSiteArchetypes.find((item) => item.id === site.archetype);
    if (archetype === undefined || world.factions[site.constants.targetFaction] === undefined) {
      fail(`${where}: Archetype or target Faction does not resolve`);
      continue;
    }
    if ((archetype.kind === 'initiative') !== (site.constants.kind === 'Initiative')) {
      fail(`${where}: its kind differs from its MissionSiteArchetype`);
    }
    const origin = site.constants.origin;
    const originResolves =
      origin.kind === 'Investigation'
        ? site.constants.kind === 'Initiative' && world.investigations[origin.investigation] !== undefined
        : site.constants.kind === 'Response' &&
          world.factions[origin.initiatingFaction] !== undefined &&
          gdrs.factionOperationLevels.some((level) => level.id === origin.operationLevel);
    if (!originResolves) {
      fail(`${where}: its origin does not resolve or does not match its kind`);
    }
    const expired = site.state.lifecycle === 'Expired';
    const turns = site.state.turnsUntilExpiration;
    if (expired ? turns !== 0 : turns < 1 || turns > archetype.expiresInTurns) {
      fail(`${where}: Turns until expiration is 0 exactly when Expired`);
    }
    const missions = missionsBySite.get(site.id) ?? 0;
    const hasMission = site.state.lifecycle === 'Attempted' || site.state.lifecycle === 'Concluded';
    if (missions !== (hasMission ? 1 : 0)) {
      fail(`${where}: a Mission references it exactly when it is Attempted or Concluded, and at most one`);
    }
    const expected = archetype.enemies.flatMap(([enemyArchetype, count]) =>
      new Array<string>(count).fill(enemyArchetype),
    );
    const actual = site.state.enemies.map((id) => world.enemies[id]);
    if (
      actual.length !== expected.length ||
      actual.some(
        (enemy, index) =>
          enemy === undefined ||
          enemy.archetype !== expected[index] ||
          enemy.constants.missionSite !== site.id,
      )
    ) {
      fail(`${where}: its Enemies do not match its MissionSiteArchetype`);
    }
  }

  // COMBAT, Enemy properties.
  for (const enemy of Object.values(world.enemies)) {
    const s = enemy.state;
    if (
      !world.missionSites[enemy.constants.missionSite]?.state.enemies.includes(enemy.id) ||
      !gdrs.enemyArchetypes.has(enemy.archetype) ||
      !gdrs.weapons.has(s.weapon) ||
      s.skill < 0 ||
      s.baseHealth < 1 ||
      s.currentHealth < 0 ||
      s.currentHealth > s.baseHealth ||
      s.exhaustion < 0 ||
      s.weaponDamage < 1
    ) {
      fail(`COMBAT ${enemy.id}: a value is outside its range or a reference does not resolve`);
    }
  }

  // FACTION, Faction State; DOM, Initial Campaign state.
  for (const archetype of gdrs.factionArchetypes) {
    if (Object.values(world.factions).filter((faction) => faction.archetype === archetype.id).length !== 1) {
      fail(`FACTION: not exactly one Faction for the FactionArchetype ${archetype.id}`);
    }
  }
  for (const faction of Object.values(world.factions)) {
    const where = `FACTION ${faction.id}`;
    if (!gdrs.factionArchetypes.some((archetype) => archetype.id === faction.archetype)) {
      fail(`${where}: its FactionArchetype is not supplied by the Game build`);
    }
    if (faction.state.eliminatedTurn !== null && faction.state.eliminatedTurn < 1) {
      fail(`${where}: Eliminated turn is below 1`);
    }
    const level = gdrs.factionActivityLevels.get(faction.state.activityLevel);
    if (level === undefined) {
      fail(`${where}: its Faction activity level does not resolve`);
      continue;
    }
    if (faction.state.eliminated !== (faction.state.eliminatedTurn !== null)) {
      fail(`${where}: Eliminated turn is present exactly when Eliminated`);
    }
    if ((faction.state.turnsUntilNextLevel === null) !== (level.next === null)) {
      fail(`${where}: Turns until the next level is absent exactly at a final level`);
    }
    if (
      !faction.state.eliminated &&
      (faction.state.turnsUntilNextOperation < 1 || (faction.state.turnsUntilNextLevel ?? 1) < 1)
    ) {
      fail(`${where}: a countdown is below 1`);
    }
  }

  return problems;
}
