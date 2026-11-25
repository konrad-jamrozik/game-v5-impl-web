/**
 * The Player-visible views that Player API returns. Each view is built anew from the World state it is asked
 * for, so it is detached and always equals what the current Campaign state gives; see ENG, Derived value
 * consistency. No view reads a hidden value.
 */
import { deepFreeze, detach, must, q } from '../../kernel/index.ts';
import { GAME_BUILD, type GdrCatalog, type MissionSiteArchetypeGdr } from '../../gdr/index.ts';
import { applyGameAction } from '../actions/actions.ts';
import {
  canTakeOrders,
  effectiveSkill,
  enemyCombatantValues,
  type AgentUpgradeBonus,
  exhaustionOf,
  isAway,
  isFitForWork,
  isInBase,
} from '../mechanics/agents/agents.ts';
import {
  agentCombatantState,
  combatRating,
  damageBounds,
  enemyCombatantState,
  isAbleToFight,
  type CombatantState,
} from '../mechanics/combat/combat.ts';
import { missionSiteEnemyArchetypes } from '../mechanics/combat/detached-combat.ts';
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
  countContracting,
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
  initiativeOperationLevels,
  leadAvailability,
  leadInitiativeOperationLevel,
  leadOfMissionSite,
  leadStatus,
  currentContractingCap,
  initiativeLevelsWon,
} from '../mechanics/leads/leads.ts';
import {
  consequencesOf,
  isDeployableAgent,
  type ConsequenceAmounts,
} from '../mechanics/missions/missions.ts';
import { healthRecoveryRateHundredths, recoveryTurnsRemaining } from '../mechanics/recovery/recovery.ts';
import {
  ammoNeeds,
  equippedCounts,
  storageCount,
  unlockedEquipment,
} from '../mechanics/equipment/equipment.ts';
import {
  articleForTerm,
  resolveArticles,
  visibleArticles,
  type ResolvedArticle,
} from '../mechanics/compendium/compendium.ts';
import type {
  ActionAvailability,
  AgencyView,
  EquipmentItemView,
  EquipmentView,
  AgentView,
  AvailableActionsView,
  CollectionChanges,
  ConsequenceView,
  CampaignConfigurationView,
  CurrentLiveWorldStateView,
  CurrentRetiredWorldStateView,
  CompendiumArticleView,
  DeploymentPreview,
  EnemyView,
  FactionView,
  GameDataView,
  CombatSimulatorContent,
  HistoryView,
  InvestigationView,
  LeadView,
  MissionSiteView,
  MissionView,
  WorldStateChanges,
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

/** An Enemy's values in the hundredths form that effective skill and a Combat read. */
function enemyCombatant(enemy: Enemy['state']): CombatantState {
  return enemyCombatantState(enemy);
}

/** ECON, Upgrade bonus: what the Upgrades of this World state add to every Serving Agent's effective values. */
function bonusOf(world: CurrentWorldState, gdrs: GdrCatalog): AgentUpgradeBonus {
  return agentUpgradeBonus(gdrs.upgrades, world.agency.state.acquisitions);
}

/** An Agent's values, with its effective max health and current health, as effective skill and a Combat read them. */
function agentCombatant(agent: Agent['state'], bonus: AgentUpgradeBonus): CombatantState {
  return agentCombatantState(agent, bonus);
}

/**
 * COMBAT, Rested and Equipment Combat ratings of one Serving Agent: the Combat rating with exhaustion 0 and health lost
 * 0, and the Combat rating minus that in the AgentArchetype's `weapon` and `armor`.
 */
function equipmentRatings(
  s: Agent['state'],
  values: CombatantState,
  serving: boolean,
  gdrs: GdrCatalog,
  bonus: AgentUpgradeBonus,
): { restedCombatRating: number | null; equipmentCombatRating: number | null } {
  if (!serving) {
    return { restedCombatRating: null, equipmentCombatRating: null };
  }
  const rate = (state: CombatantState): number =>
    combatRating([state], gdrs.combatParameters, gdrs.agentParameters);
  const rested = agentCombatant({ ...s, exactExhaustionHundredths: 0, healthLostHundredths: 0 }, bonus);
  const weapon = must(gdrs.weapons.get(gdrs.agentArchetype.weapon), 'Weapon of the AgentArchetype');
  const armor = must(gdrs.armors.get(gdrs.agentArchetype.armor), 'Armor of the AgentArchetype');
  const issued = { ...values, weaponDamage: weapon.damage, armor: armor.armor };
  return { restedCombatRating: rate(rested), equipmentCombatRating: rate(values) - rate(issued) };
}

/** EQUIP: the Storage and every Item and AmmoType with its counts, Unlocked, and Ammo needs. */
function equipmentView(world: CurrentWorldState, gdrs: GdrCatalog): EquipmentView {
  const equipped = equippedCounts(
    Object.values(world.agents).map((agent) => agent.state),
    gdrs,
  );
  const unlocked = unlockedEquipment(world, gdrs);
  const needs = new Map(ammoNeeds(world, gdrs).map((need) => [need.ammoType, need]));
  const row = (
    id: string,
    kind: EquipmentItemView['kind'],
    name: string,
    price: number,
    stat: number | null,
    ammoType: string | null,
  ): EquipmentItemView => {
    const available = storageCount(world, id);
    const used = equipped.get(id) ?? 0;
    const need = needs.get(id);
    return {
      id,
      kind,
      name,
      price,
      stat,
      ammoType,
      owned: available + used,
      equipped: used,
      available,
      unlocked: unlocked.has(id),
      ammoAgents: need?.agents ?? 0,
      ammoNeeded: need?.needed ?? 0,
      ammoShort: need?.short ?? false,
    };
  };
  const items: EquipmentItemView[] = [];
  for (const weapon of gdrs.weapons.values()) {
    if (weapon.price !== null) {
      items.push(row(weapon.id, 'weapon', weapon.name, weapon.price, weapon.damage, weapon.ammoType));
    }
  }
  for (const armor of gdrs.armors.values()) {
    if (armor.price !== null) {
      items.push(row(armor.id, 'armor', armor.name, armor.price, armor.armor, null));
    }
  }
  for (const ammo of gdrs.ammoTypes.values()) {
    items.push(row(ammo.id, 'ammo', ammo.name, ammo.price, null, null));
  }
  return {
    items,
    salePriceFraction: {
      numerator: Number(gdrs.equipment.salePriceFraction.n),
      denominator: Number(gdrs.equipment.salePriceFraction.d),
    },
    ammoShortRoundsPerAgent: gdrs.equipment.ammoShortRoundsPerAgent,
    fallbackWeapon: gdrs.combatParameters.fallbackWeapon,
    fallbackArmor: gdrs.equipment.fallbackArmor,
    fallbackWeaponName: gdrs.weapons.get(gdrs.combatParameters.fallbackWeapon)?.name ?? '',
    fallbackArmorName: gdrs.armors.get(gdrs.equipment.fallbackArmor)?.name ?? '',
    fallbackWeaponDamage: gdrs.weapons.get(gdrs.combatParameters.fallbackWeapon)?.damage ?? 0,
    fallbackArmorValue: gdrs.armors.get(gdrs.equipment.fallbackArmor)?.armor ?? 0,
  };
}

function agentView(
  agent: Agent,
  gdrs: GdrCatalog,
  healthRecoveryPctHundredths: number,
  bonus: AgentUpgradeBonus,
  shortAmmo: ReadonlySet<string>,
): AgentView {
  const s = agent.state;
  const serving = isServing(s);
  const values = agentCombatant(s, bonus);
  // COMBAT, Combat rating: one Agent's base Combat rating is its effective skill, even when it is not able to fight.
  const base = effectiveSkill(values, gdrs.agentParameters);
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
    armor: s.armor,
    armorName: gdrs.armors.get(s.armor)?.name ?? s.armor,
    baseArmor: s.baseArmor,
    effectiveArmor: values.armor,
    assignment: s.assignment === null ? null : { ...s.assignment },
    canTakeOrders: canTakeOrders(s),
    fitForWork: isFitForWork(s, gdrs.agentParameters),
    inBase: isInBase(s),
    away: isAway(s),
    ableToFight: serving && isAbleToFight(values, gdrs.combatParameters, gdrs.agentParameters),
    deployable: isDeployableAgent(s, bonus, gdrs.combatParameters, gdrs.agentParameters),
    baseCombatRating: serving ? base : null,
    // COMBAT, Combat rating: one Agent's Combat rating is that of a side holding it alone.
    combatRating: serving ? combatRating([values], gdrs.combatParameters, gdrs.agentParameters) : null,
    ...equipmentRatings(s, values, serving, gdrs, bonus),
    weaponAmmoType: gdrs.weapons.get(s.weapon)?.ammoType ?? null,
    ammoShort: shortAmmo.has(gdrs.weapons.get(s.weapon)?.ammoType ?? ''),
    participationHistory: s.participationHistory.map((item) => ({ ...item })),
    enemiesKilled: s.enemiesKilled,
    turnTerminated: s.turnTerminated,
    killedBy: s.killedBy === null ? null : { ...s.killedBy },
    finalMaxHealth: s.finalMaxHealth,
    finalWeaponDamage: s.finalWeaponDamage,
    finalArmor: s.finalArmor,
    healthRecoveryRateHundredths: serving
      ? healthRecoveryRateHundredths(values.maxHealth, healthRecoveryPctHundredths)
      : null,
    recoveryTurnsRemaining:
      serving && s.assignment?.kind === 'Recovery'
        ? recoveryTurnsRemaining(values, healthRecoveryPctHundredths)
        : null,
  };
}

/** A built Agent view with the inputs it was built from, so that it is reused only while all of them are the same. */
interface CachedAgentView {
  readonly gdrs: GdrCatalog;
  readonly healthRecoveryPctHundredths: number;
  readonly bonusKey: string;
  readonly view: AgentView;
}

/**
 * Agent views by the Agent they show. An Agent in Campaign state is immutable, and a commit that changes an Agent
 * replaces its object, so an entry found for the same object, GDRs, rate, and Upgrade bonus is the view `agentView`
 * would build again. The views are frozen because every caller shares them.
 */
const AGENT_VIEWS = new WeakMap<Agent, CachedAgentView>();

/** The views of the given Agents, built with the Agency's current rates and Upgrade bonus, each reused when unchanged. */
function agentViews(agents: readonly Agent[], world: CurrentWorldState, gdrs: GdrCatalog): AgentView[] {
  const healthRecoveryPctHundredths = ratesOf(world, gdrs).healthRecoveryPctHundredths;
  const bonus = bonusOf(world, gdrs);
  // EQUIP, Ammo short: read from the whole Agency, so the cache key holds it with the Upgrade bonus.
  const shortAmmo = new Set(
    ammoNeeds(world, gdrs)
      .filter((need) => need.short)
      .map((need) => need.ammoType),
  );
  const bonusKey = JSON.stringify({ bonus, short: [...shortAmmo] });
  return agents.map((agent) => {
    const cached = AGENT_VIEWS.get(agent);
    if (
      cached !== undefined &&
      cached.gdrs === gdrs &&
      cached.healthRecoveryPctHundredths === healthRecoveryPctHundredths &&
      cached.bonusKey === bonusKey
    ) {
      return cached.view;
    }
    const view = deepFreeze(agentView(agent, gdrs, healthRecoveryPctHundredths, bonus, shortAmmo));
    if (Object.isFrozen(agent)) {
      AGENT_VIEWS.set(agent, { gdrs, healthRecoveryPctHundredths, bonusKey, view });
    }
    return view;
  });
}

function enemyView(enemy: Enemy, gdrs: GdrCatalog): EnemyView {
  const s = enemy.state;
  return {
    id: enemy.id,
    archetype: enemy.archetype,
    archetypeName: gdrs.enemyArchetypes.get(enemy.archetype)?.name ?? enemy.archetype,
    archetypeAbbreviation: gdrs.enemyArchetypes.get(enemy.archetype)?.abbreviation ?? enemy.archetype,
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
    armor: s.armor,
    armorName: gdrs.armors.get(s.armor)?.name ?? s.armor,
    baseArmor: s.baseArmor,
    combatRating: combatRating([enemyCombatant(s)], gdrs.combatParameters, gdrs.agentParameters),
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

/** `missionBySite`, when given, is the Mission of each Mission site of `world`, so that no Mission is searched for. */
function missionSiteView(
  site: MissionSite,
  world: CurrentWorldState,
  gdrs: GdrCatalog,
  missionBySite?: ReadonlyMap<string, Mission>,
): MissionSiteView {
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
  const lead = leadOfMissionSite(site, world.investigations);
  return {
    id: site.id,
    archetype: site.archetype,
    name: archetype.name,
    kind: site.constants.kind,
    origin: { ...origin },
    lead,
    initiativeOperationLevel: lead === null ? null : leadInitiativeOperationLevel(lead, gdrs),
    operationLevel: level === null ? null : { id: level.id, level: level.level, name: level.name },
    targetFaction: site.constants.targetFaction,
    turnCreated: site.constants.turnCreated,
    creationCombatRating: site.constants.creationCombatRating,
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
    mission:
      (missionBySite === undefined ? missionOfSite(world, site.id) : missionBySite.get(site.id))?.id ?? null,
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

/**
 * LEAD, Player-visible information: only discovered Leads; an undiscovered Lead is left out of every result. With
 * `reveal`, DEV, Revealed presentation: every Lead, each as though discovered and Assessed, while
 * `canBeInvestigatedNow` still follows the Lead as it is, because every Player action is validated as without it.
 */
function leadViews(world: CurrentWorldState, gdrs: GdrCatalog, reveal = false): LeadView[] {
  return gdrs.leads.flatMap((lead) => {
    const actual = leadAvailability(lead, world, gdrs.missionSiteArchetypes);
    if (!actual.discovered && !reveal) {
      return [];
    }
    const availability = reveal
      ? {
          ...actual,
          discovered: true,
          available:
            actual.mayBeInvestigatedAgain &&
            actual.noUnfinishedMissionSite &&
            actual.missionSiteCanExist &&
            actual.factionNotEliminated,
        }
      : actual;
    const active = activeInvestigationOf(lead.id, world.investigations);
    // INVSTG, Player-visible information: the Required progress and its range only for an Assessed Lead.
    const assessed = reveal || isAssessedLead(lead.id, world.investigations);
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
      unlocksContracting: lead.onCompletion.unlockContracting,
      winsCampaign: lead.onCompletion.winCampaign,
      completionCount: completionCount(lead.id, world.investigations),
      initiativeOperationLevel: leadInitiativeOperationLevel(lead.id, gdrs),
      available: availability.available,
      status: leadStatus(availability),
      canBeInvestigatedNow: actual.available && active === null,
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
  const bonus = bonusOf(world, gdrs);
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
    contractingCap: currentContractingCap(world, gdrs),
    contractingUnlocked: world.agency.state.contractingUnlocked,
    initiativeLevelsWon: initiativeLevelsWon(world, gdrs),
    contractingAgents: countContracting(agents),
    ...ratesOf(world, gdrs),
    equipment: equipmentView(world, gdrs),
    servingAgents: serving,
    deployedAgents: countDeployed(agents),
    trainingAgents: countTraining(agents),
    // ECON, Projected income and upkeep.
    projectedIncome: income(
      world.agency.state.funding,
      contractingAtAssignment(agents).map((agent) =>
        effectiveSkill(agentCombatant(agent, bonus), gdrs.agentParameters),
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

/** `player.queries.getCurrentLiveWorldState()`; see WHIST, Current world state, Turn report, and history. */
export function currentLiveWorldStateView(state: CampaignState, gdrs: GdrCatalog): CurrentLiveWorldStateView {
  const world = state.world.current;
  return {
    ...currentLiveScalars(world, gdrs),
    agency: agencyView(world, gdrs),
    agents: agentViews(
      Object.values(world.agents).filter((agent) => isServing(agent.state)),
      world,
      gdrs,
    ),
    investigations: Object.values(world.investigations)
      .filter((investigation) => investigation.state.lifecycle === 'Active')
      .map((investigation) => investigationView(investigation, world, gdrs)),
    missionSites: Object.values(world.missionSites)
      .filter((site) => siteIsCurrent(site))
      .map((site) => missionSiteView(site, world, gdrs)),
    missions: Object.values(world.missions)
      .filter((mission) => mission.state.lifecycle === 'Deployed')
      .map((mission) => missionView(mission, world)),
    factions: factionViews(world, gdrs),
  };
}

/** `player.queries.getCurrentRetiredWorldState()`; see WHIST, Current world state, Turn report, and history. */
export function currentRetiredWorldStateView(
  state: CampaignState,
  gdrs: GdrCatalog,
): CurrentRetiredWorldStateView {
  const world = state.world.current;
  return {
    leads: leadViews(world, gdrs),
    agents: agentViews(
      Object.values(world.agents).filter((agent) => !isServing(agent.state)),
      world,
      gdrs,
    ),
    investigations: Object.values(world.investigations)
      .filter((investigation) => investigation.state.lifecycle !== 'Active')
      .map((investigation) => investigationView(investigation, world, gdrs)),
    missionSites: retiredSites(world).map((site) =>
      missionSiteView(site, world, gdrs, missionsBySite(world)),
    ),
    missions: retiredMissions(world).map((mission) => missionView(mission, world)),
  };
}

const retiredSites = (world: CurrentWorldState): MissionSite[] =>
  Object.values(world.missionSites).filter((site) => !siteIsCurrent(site));
const retiredMissions = (world: CurrentWorldState): Mission[] =>
  Object.values(world.missions).filter((mission) => mission.state.lifecycle !== 'Deployed');
const retiredInvestigations = (world: CurrentWorldState): Investigation[] =>
  Object.values(world.investigations).filter((investigation) => investigation.state.lifecycle !== 'Active');

/** The Mission at each Mission site that has one, read once rather than searched for each Mission site. */
function missionsBySite(world: CurrentWorldState): ReadonlyMap<string, Mission> {
  return new Map(Object.values(world.missions).map((mission) => [mission.constants.missionSite, mission]));
}

/**
 * The changes of one collection of a World state view: the elements whose view differs, compared as values, and the
 * order of all of them when elements entered or left it. `same` tells, from the state alone, that an element's view
 * cannot have changed, so that a long collection that an action leaves alone is not built again.
 */
function collectionChanges<E extends { readonly id: string }, V extends { readonly id: string }>(
  before: readonly E[],
  after: readonly E[],
  viewBefore: (element: E) => V,
  viewAfter: (element: E) => V,
  same: (was: E, now: E) => boolean,
): CollectionChanges<V> | undefined {
  const was = new Map(before.map((element) => [element.id, element]));
  const changed: V[] = [];
  for (const element of after) {
    const old = was.get(element.id);
    if (old !== undefined && same(old, element)) {
      continue;
    }
    const view = viewAfter(element);
    if (old === undefined || JSON.stringify(viewBefore(old)) !== JSON.stringify(view)) {
      changed.push(view);
    }
  }
  const membership =
    before.length !== after.length || after.some((element, index) => before[index]?.id !== element.id);
  if (changed.length === 0 && !membership) {
    return undefined;
  }
  return membership ? { changed, order: after.map((element) => element.id) } : { changed };
}

/** The changes of a collection of Agent views; cached views show by identity which Agents did not change. */
function agentChanges(
  before: readonly Agent[],
  beforeWorld: CurrentWorldState,
  after: readonly Agent[],
  afterWorld: CurrentWorldState,
  gdrs: GdrCatalog,
): CollectionChanges<AgentView> | undefined {
  const viewsBefore = new Map(agentViews(before, beforeWorld, gdrs).map((view) => [view.id, view]));
  const viewsAfter = new Map(agentViews(after, afterWorld, gdrs).map((view) => [view.id, view]));
  const view = (views: ReadonlyMap<string, AgentView>, agent: Agent) =>
    must(views.get(agent.id), `Agent ${agent.id}`);
  return collectionChanges(
    before,
    after,
    (agent) => view(viewsBefore, agent),
    (agent) => view(viewsAfter, agent),
    (was, now) => view(viewsBefore, was) === view(viewsAfter, now),
  );
}

/**
 * PAPI, Action results: every change from `before` to `after` in what `currentLiveWorldStateView` and
 * `currentRetiredWorldStateView` return. Within a Turn, a Retired Campaign instance other than an Agent changes only
 * when its own object or a Campaign instance its view reads changes, so the long Retired collections are compared by
 * object identity; Agent views are cached, so identity shows which changed; the short collections of the Live world
 * state and the Leads are built again and compared.
 */
export function worldStateChanges(
  before: CampaignState,
  after: CampaignState,
  gdrs: GdrCatalog,
): WorldStateChanges {
  const b = before.world.current;
  const a = after.world.current;
  const liveBefore = currentLiveScalars(b, gdrs);
  const liveAfter = currentLiveScalars(a, gdrs);
  const scalar = <K extends keyof typeof liveAfter>(key: K) =>
    JSON.stringify(liveBefore[key]) === JSON.stringify(liveAfter[key]) ? {} : { [key]: liveAfter[key] };
  const always = () => false;
  const serving = (world: CurrentWorldState) =>
    Object.values(world.agents).filter((agent) => isServing(agent.state));
  const notServing = (world: CurrentWorldState) =>
    Object.values(world.agents).filter((agent) => !isServing(agent.state));
  const activeInvestigations = (world: CurrentWorldState) =>
    Object.values(world.investigations).filter((investigation) => investigation.state.lifecycle === 'Active');
  const currentSites = (world: CurrentWorldState) =>
    Object.values(world.missionSites).filter((site) => siteIsCurrent(site));
  const deployedMissions = (world: CurrentWorldState) =>
    Object.values(world.missions).filter((mission) => mission.state.lifecycle === 'Deployed');
  const sitesBefore = missionsBySite(b);
  const sitesAfter = missionsBySite(a);
  // What a Mission site's view reads besides the GDRs: itself, its Enemies, the Investigation it came from, its Mission.
  const siteDeps = (site: MissionSite, world: CurrentWorldState, missions: ReadonlyMap<string, Mission>) => [
    site,
    ...site.state.enemies.map((id) => world.enemies[id]),
    site.constants.origin.kind === 'Investigation'
      ? world.investigations[site.constants.origin.investigation]
      : null,
    missions.get(site.id) ?? null,
  ];
  const sameDeps = (x: readonly unknown[], y: readonly unknown[]) =>
    x.length === y.length && x.every((item, index) => item === y[index]);
  const investigationDeps = (investigation: Investigation, world: CurrentWorldState) => [
    investigation,
    ...investigation.state.currentTeam.map((id) => world.agents[id]),
  ];
  const leadsMayChange =
    b.investigations !== a.investigations ||
    b.missions !== a.missions ||
    b.missionSites !== a.missionSites ||
    b.factions !== a.factions ||
    b.discoveredLeads !== a.discoveredLeads;
  // An unchanged collection is left out rather than given as undefined.
  const entries = <T extends object>(value: T) =>
    Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as {
      [K in keyof T]?: Exclude<T[K], undefined>;
    };
  return {
    live: {
      ...scalar('turn'),
      ...scalar('panicHundredths'),
      ...scalar('panicLimit'),
      ...scalar('ending'),
      agency: agencyView(a, gdrs),
      ...entries({
        agents: agentChanges(serving(b), b, serving(a), a, gdrs),
        investigations: collectionChanges(
          activeInvestigations(b),
          activeInvestigations(a),
          (investigation) => investigationView(investigation, b, gdrs),
          (investigation) => investigationView(investigation, a, gdrs),
          always,
        ),
        missionSites: collectionChanges(
          currentSites(b),
          currentSites(a),
          (site) => missionSiteView(site, b, gdrs, sitesBefore),
          (site) => missionSiteView(site, a, gdrs, sitesAfter),
          always,
        ),
        missions: collectionChanges(
          deployedMissions(b),
          deployedMissions(a),
          (mission) => missionView(mission, b),
          (mission) => missionView(mission, a),
          always,
        ),
        factions: collectionChanges(
          Object.values(b.factions),
          Object.values(a.factions),
          (faction) =>
            must(
              factionViews(b, gdrs).find((view) => view.id === faction.id),
              'Faction',
            ),
          (faction) =>
            must(
              factionViews(a, gdrs).find((view) => view.id === faction.id),
              'Faction',
            ),
          (was, now) => was === now,
        ),
      }),
    },
    retired: entries({
      leads: leadsMayChange
        ? collectionChanges(
            leadViews(b, gdrs),
            leadViews(a, gdrs),
            (lead) => lead,
            (lead) => lead,
            always,
          )
        : undefined,
      agents: agentChanges(notServing(b), b, notServing(a), a, gdrs),
      investigations: collectionChanges(
        retiredInvestigations(b),
        retiredInvestigations(a),
        (investigation) => investigationView(investigation, b, gdrs),
        (investigation) => investigationView(investigation, a, gdrs),
        (was, now) => sameDeps(investigationDeps(was, b), investigationDeps(now, a)),
      ),
      missionSites: collectionChanges(
        retiredSites(b),
        retiredSites(a),
        (site) => missionSiteView(site, b, gdrs, sitesBefore),
        (site) => missionSiteView(site, a, gdrs, sitesAfter),
        (was, now) => sameDeps(siteDeps(was, b, sitesBefore), siteDeps(now, a, sitesAfter)),
      ),
      missions: collectionChanges(
        retiredMissions(b),
        retiredMissions(a),
        (mission) => missionView(mission, b),
        (mission) => missionView(mission, a),
        (was, now) =>
          was === now &&
          b.missionSites[was.constants.missionSite] === a.missionSites[now.constants.missionSite],
      ),
    }),
  };
}

/** The values of the Live world state view that are not collections. */
function currentLiveScalars(world: CurrentWorldState, gdrs: GdrCatalog) {
  return {
    turn: world.turn,
    panicHundredths: world.panicHundredths,
    panicLimit: gdrs.endingParameters.defeatAtPanicPct,
    ending:
      world.ending === null || world.endingTurn === null
        ? null
        : { ending: world.ending, reasons: [...world.endingReasons], turn: world.endingTurn },
  };
}

/** `player.queries.getCampaignConfiguration()`; see WHIST, Current world state, Turn report, and history. */
export function campaignConfigurationView(state: CampaignState): CampaignConfigurationView {
  return {
    startingMoney: state.configuration.startingMoney,
    startingFunding: state.configuration.startingFunding,
    // A Campaign save written before the Prologue existed lacks the value: its Campaign had none.
    prologue: state.configuration.prologue ?? 0,
  };
}

/** `player.queries.getTurnReport()`. */
export function turnReportView(state: CampaignState): TurnReport | null {
  return detach(state.world.history.turnReport);
}

/** `player.queries.getHistory()`: only the History; see WHIST, Current world state, Turn report, and history. */
export function historyView(state: CampaignState, gdrs: GdrCatalog): HistoryView {
  const world = state.world.current;
  const history = state.world.history;
  return {
    entries: detach(history.historyEntries),
    openEntry: {
      turn: world.turn,
      turnStart: detach(history.currentTurnStart),
      turnEnd: summarize(world, gdrs),
      actions: detach(history.currentActions),
    },
    turnSeries: {
      moneyAtStartOfTurn: detach(history.moneyAtStartOfTurn),
      moneyAtEndOfTurn: detach(history.moneyAtEndOfTurn),
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
    hireAgents: ended ? endedReason : availability(tryAction(world, gdrs, 'hireAgents', { count: 1 })),
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
    agentsThatCanTakeOrders: ended
      ? []
      : agents.filter((agent) => canTakeOrders(agent.state)).map((agent) => agent.id),
    assignAgents: {
      assignments: ['Standby', 'Contracting', 'Training'],
      trainingPlacesLeft: ended ? 0 : Math.max(0, caps.trainingCap - countTraining(states)),
      contractingPlacesLeft: ended
        ? 0
        : Math.max(0, currentContractingCap(world, gdrs) - countContracting(states)),
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
    // COMBAT, Combat rating: Agents and Enemies are rated alike, by their effective values.
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
  const view = deepFreeze<CompendiumArticleView[]>(resolveArticles(visible).map(articleView));
  articlesCache.set(gdrs, { key, view });
  return view;
}

/** The reported form of one resolved article, detached from the catalog. */
function articleView({ article, body, formulas, seeAlso }: ResolvedArticle): CompendiumArticleView {
  return {
    id: article.id,
    category: article.category,
    title: article.title,
    subject: article.subject,
    subjectType: article.subjectType,
    listedUnder: article.listedUnder,
    body: body.map((segment) => ({ ...segment })),
    formulas: formulas.map((row) => ({
      label: row.label.map((segment) => ({ ...segment })),
      text: row.text.map((segment) => ({ ...segment })),
    })),
    seeAlso: seeAlso.map((segment) => ({ ...segment })),
  };
}

/** One article of the Revealed Compendium, with whether it is Player-visible in the Current world state. */
export interface RevealedArticleView extends CompendiumArticleView {
  readonly playerVisible: boolean;
}

/**
 * `developer.queries.getRevealedCompendium()`: COMP, Revealed Compendium. Every Compendium article of the Game build
 * in Game build order, each resolved with every article taking part in Article links, and `terms`, the Article term
 * lookup over every article: the identifier of the article each Article term in lower case names.
 */
export interface RevealedCompendiumView {
  readonly articles: readonly RevealedArticleView[];
  readonly terms: Readonly<Record<string, string>>;
}

/** The resolved Revealed Compendium of each catalog; it depends on the Game build only, so it is built once. */
const revealedCache = new WeakMap<
  GdrCatalog,
  { readonly articles: readonly CompendiumArticleView[]; readonly terms: Readonly<Record<string, string>> }
>();

/** `developer.queries.getRevealedCompendium()`: reads the Current world state only for each article's visibility. */
export function revealedCompendiumView(state: CampaignState, gdrs: GdrCatalog): RevealedCompendiumView {
  let revealed = revealedCache.get(gdrs);
  if (revealed === undefined) {
    const terms: Record<string, string> = {};
    for (const article of gdrs.compendiumArticles) {
      for (const term of article.terms) {
        // COMP, Player-visible information, Article term lookup: the first article in Game build order, as
        // `articleForTerm` finds it.
        terms[term.toLowerCase()] ??= article.id;
      }
    }
    revealed = deepFreeze({ articles: resolveArticles(gdrs.compendiumArticles).map(articleView), terms });
    revealedCache.set(gdrs, revealed);
  }
  const visible = new Set(visibleArticles(state.world.current, gdrs).map((article) => article.id));
  return {
    articles: revealed.articles.map((article) => ({ ...article, playerVisible: visible.has(article.id) })),
    terms: revealed.terms,
  };
}

/**
 * `developer.queries.getRevealedLeads()`: DEV, Revealed presentation of the Leads. Every Lead of the Game
 * build, in Game build order, as `getCurrentRetiredWorldState()` would report it if it were discovered and Assessed.
 */
export function revealedLeadsView(state: CampaignState, gdrs: GdrCatalog): readonly LeadView[] {
  return leadViews(state.world.current, gdrs, true);
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
        armor: gdrs.agentArchetype.armor,
      },
      agentParameters: numbers(gdrs.agentParameters),
      combatParameters: {
        weaponDamageRange: decimalText(gdrs.combatParameters.weaponDamageRange),
        retreatBelowAgentRatingFraction: decimalText(gdrs.combatParameters.retreatBelowAgentRatingFraction),
        retreatAtEnemyToAgentRating: decimalText(gdrs.combatParameters.retreatAtEnemyToAgentRating),
        incapacitationSkillFraction: decimalText(gdrs.combatParameters.incapacitationSkillFraction),
        targetBaseWeight: String(gdrs.combatParameters.targetBaseWeight),
        targetPreferredHitChance: decimalText(gdrs.combatParameters.targetPreferredHitChance),
        // COMBAT, Player-visible information: every property of CombatParameters, including those the Combat rating
        // reads.
        ratingBaseHealth: String(gdrs.combatParameters.ratingBaseHealth),
        ratingBaseArmor: String(gdrs.combatParameters.ratingBaseArmor),
        ratingBaseWeaponDamage: String(gdrs.combatParameters.ratingBaseWeaponDamage),
        ratingTeamSizeExponent: decimalText(gdrs.combatParameters.ratingTeamSizeExponent),
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
          price: weapon.price,
          ammoType: weapon.ammoType,
        };
      }),
      armors: [...gdrs.armors.values()].map((armor) => ({
        id: armor.id,
        name: armor.name,
        armor: armor.armor,
        price: armor.price,
      })),
      ammoTypes: [...gdrs.ammoTypes.values()].map((ammo) => ({
        id: ammo.id,
        name: ammo.name,
        price: ammo.price,
        shot: ammo.shot,
      })),
      enemyArchetypes: [...gdrs.enemyArchetypes.values()].map((enemy) => ({
        id: enemy.id,
        name: enemy.name,
        abbreviation: enemy.abbreviation,
        skill: enemy.skill,
        baseHealth: enemy.baseHealth,
        weapon: enemy.weapon,
        armor: enemy.armor,
      })),
      missionSiteArchetypes: gdrs.missionSiteArchetypes.map((archetype) => ({
        id: archetype.id,
        name: archetype.name,
        kind: archetype.kind,
        firstWinPhrase: archetype.firstWinPhrase,
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
      ranks: gdrs.ranks.map((rank) => ({
        id: rank.id,
        name: rank.name,
        minBaseSkill: rank.minBaseSkill,
        mark: rank.mark,
        count: rank.count,
      })),
    });
    gameDataCache.set(gdrs, view);
  }
  return view;
}

/** `session.combatSimulator.getContent()`: COMBAT, Detached Combat without a Current campaign. */
export function combatSimulatorContentView(gdrs: GdrCatalog): CombatSimulatorContent {
  const data = gameDataView(gdrs);
  return deepFreeze<CombatSimulatorContent>({
    agentArchetype: data.agentArchetype,
    weapons: data.weapons,
    armors: data.armors,
    ammoTypes: data.ammoTypes,
    enemyArchetypes: data.enemyArchetypes,
    ranks: data.ranks,
    missionSiteArchetypes: gdrs.missionSiteArchetypes.map((archetype) => ({
      id: archetype.id,
      name: archetype.name,
      enemies: missionSiteEnemyArchetypes(gdrs, archetype),
    })),
    teams: gdrs.detachedCombatTeams.map((team) => ({
      id: team.id,
      name: team.name,
      agents: team.agents.map((group) => ({ ...group })),
    })),
  });
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
 * Campaign instance as its four properties; see CSTATE, Campaign state composition, and DEV, Inspection
 * contract. The Timeline holds its World states, each after the first with the Player action that produced it.
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

/** One Lead or MissionSiteArchetype with its Initiative operation level; null names one that has none. */
export interface InitiativeOperationLevelEntry {
  readonly id: string;
  readonly name: string;
  readonly level: number | null;
}

/**
 * `developer.queries.getInitiativeOperationLevels()`: LEAD, Reading Initiative operation levels. The level of every
 * Lead and of every MissionSiteArchetype of kind initiative of the Game build, discovered or not, in Game build order;
 * each one that has none is named in its list with a null level, and again in the matching `without` list.
 */
export interface InitiativeOperationLevelsView {
  readonly leads: readonly InitiativeOperationLevelEntry[];
  readonly missionSiteArchetypes: readonly InitiativeOperationLevelEntry[];
  readonly leadsWithoutLevel: readonly string[];
  readonly missionSiteArchetypesWithoutLevel: readonly string[];
}

/** `developer.queries.getInitiativeOperationLevels()`: reads only the Game build, never Campaign state. */
export function initiativeOperationLevelsView(gdrs: GdrCatalog): InitiativeOperationLevelsView {
  const levels = initiativeOperationLevels(gdrs);
  const leads = gdrs.leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    level: levels.leads.get(lead.id) ?? null,
  }));
  const missionSiteArchetypes = gdrs.missionSiteArchetypes
    .filter((item) => item.kind === 'initiative')
    .map((item) => ({
      id: item.id,
      name: item.name,
      level: levels.missionSiteArchetypes.get(item.id) ?? null,
    }));
  return deepFreeze({
    leads,
    missionSiteArchetypes,
    leadsWithoutLevel: leads.filter((item) => item.level === null).map((item) => item.id),
    missionSiteArchetypesWithoutLevel: missionSiteArchetypes
      .filter((item) => item.level === null)
      .map((item) => item.id),
  });
}

/** SAVES, Saving: the World state, the History, and the Turn report. */
export function placeInPlay(state: CampaignState): unknown {
  return {
    worldState: state.world.current,
    history: historyOf(state),
    turnReport: state.world.history.turnReport,
  };
}
