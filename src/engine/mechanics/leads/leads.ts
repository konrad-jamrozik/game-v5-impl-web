/**
 * LEAD (Leads and Progression): Lead discovery, Lead availability, Lead status, and the Initiative operation level.
 */
import type { Condition, LeadGdr, MissionSiteArchetypeGdr } from '../../../gdr/index.ts';
import type { Enemy, Faction, Investigation, Mission, MissionSite } from '../../state/types.ts';
import { conditionHolds, wonMissionIndex } from '../conditions/conditions.ts';
import { missionSiteCanExist } from '../missions/missions.ts';
import { contractingCap } from '../economy/economy.ts';
import type { EconomyParametersGdr } from '../../../gdr/index.ts';

/** The parts of a World state that Lead discovery and Lead availability read. */
export interface LeadWorld {
  readonly missionSites: Readonly<Record<string, MissionSite>>;
  readonly missions: Readonly<Record<string, Mission>>;
  readonly investigations: Readonly<Record<string, Investigation>>;
  /** The Enemies, which an `mission_won_with_enemy` Condition reads through each Mission site's Enemies list. */
  readonly enemies: Readonly<Record<string, Enemy>>;
  readonly factions: Readonly<Record<string, Faction>>;
  /** LEAD, Lead discovery: the set of discovered Leads, by GDR identifier, in the order they were discovered. */
  readonly discoveredLeads: readonly string[];
}

/** The five conditions of LEAD, Lead availability, each read from one World state; never Player-visible. */
export interface LeadAvailability {
  readonly available: boolean;
  /** Condition 1: Discovered. */
  readonly discovered: boolean;
  /** Condition 2: May be investigated again, under its `investigate_again`. */
  readonly mayBeInvestigatedAgain: boolean;
  /** Condition 3: No Unfinished Mission site; always holds for a Lead that creates no Mission site. */
  readonly noUnfinishedMissionSite: boolean;
  /** Condition 4: It creates no Mission site, or its Mission site can exist. */
  readonly missionSiteCanExist: boolean;
  /** Condition 5: It has no Faction, or its Faction is not Eliminated. */
  readonly factionNotEliminated: boolean;
}

/** LEAD, Lead availability: a Lead creates a Mission site exactly when its `on_completion` holds a `create_mission_site`. */
export function createsMissionSite(lead: LeadGdr): boolean {
  return lead.onCompletion.createMissionSite !== null;
}

/**
 * COMPV, Article sections: whether a Lead's `discovered_when` names a Won Mission, i.e. holds a `mission_won` or a
 * `mission_won_with_enemy` Condition anywhere in it.
 */
export function discoveredByWonMission(lead: LeadGdr): boolean {
  const names = (condition: Condition): boolean => {
    switch (condition.kind) {
      case 'all':
      case 'any':
        return condition.conditions.some(names);
      case 'not':
        return names(condition.condition);
      case 'lead_completed':
        return false;
      case 'mission_won':
      case 'mission_won_with_enemy':
        return true;
    }
  };
  return lead.discoveredWhen !== null && names(lead.discoveredWhen);
}

/** The Lead that created a Mission site: the Lead of its origin Investigation; none for a Response Mission site. */
export function leadOfMissionSite(
  site: MissionSite,
  investigations: Readonly<Record<string, Investigation>>,
): string | null {
  if (site.constants.origin.kind !== 'Investigation') {
    return null;
  }
  return investigations[site.constants.origin.investigation]?.constants.lead ?? null;
}

/** The Faction of a Lead: the Faction whose Archetype is its `faction`; none for a Lead without `faction`. */
export function factionOfLead(lead: LeadGdr, world: Pick<LeadWorld, 'factions'>): Faction | undefined {
  return lead.faction === null
    ? undefined
    : Object.values(world.factions).find((item) => item.archetype === lead.faction);
}

/** LEAD, Missions from a Lead: the completion count, i.e. the number of Completed Investigations of the Lead. */
export function completionCount(
  leadId: string,
  investigations: Readonly<Record<string, Investigation>>,
): number {
  return Object.values(investigations).filter(
    (item) => item.constants.lead === leadId && item.state.lifecycle === 'Completed',
  ).length;
}

/** LEAD, Lead availability: the five conditions, each read from the given World state. */
export function leadAvailability(
  lead: LeadGdr,
  world: LeadWorld,
  missionSiteArchetypes: readonly MissionSiteArchetypeGdr[],
): LeadAvailability {
  const faction = factionOfLead(lead, world);
  const discovered = world.discoveredLeads.includes(lead.id);
  const sites = Object.values(world.missionSites).filter(
    (site) => leadOfMissionSite(site, world.investigations) === lead.id,
  );
  // The `investigate_again` table: `never` allows another Investigation while none is Completed, `until_mission_won`
  // while no Mission from the Lead is Won, and `always` always.
  let mayBeInvestigatedAgain: boolean;
  switch (lead.investigateAgain) {
    case 'never':
      mayBeInvestigatedAgain = completionCount(lead.id, world.investigations) === 0;
      break;
    case 'until_mission_won':
      mayBeInvestigatedAgain = !Object.values(world.missions).some(
        (mission) =>
          mission.state.lifecycle === 'Won' &&
          sites.some((site) => site.id === mission.constants.missionSite),
      );
      break;
    case 'always':
      mayBeInvestigatedAgain = true;
      break;
  }
  // MISSION, Glossary: an Unfinished Mission site is Active or Deployed.
  const noUnfinishedMissionSite = !sites.some(
    (site) => site.state.lifecycle === 'Active' || site.state.lifecycle === 'Deployed',
  );
  let canExist = true;
  if (createsMissionSite(lead)) {
    const archetype = missionSiteArchetypes.find((item) => item.id === lead.onCompletion.createMissionSite);
    canExist = archetype !== undefined && missionSiteCanExist(archetype, faction, world);
  }
  // Condition 5. A Lead whose `faction` names no Faction of the Campaign cannot occur for a valid Game build, and is
  // treated as an Eliminated one.
  const factionNotEliminated = lead.faction === null || (faction !== undefined && !faction.state.eliminated);
  return {
    available:
      discovered && mayBeInvestigatedAgain && noUnfinishedMissionSite && canExist && factionNotEliminated,
    discovered,
    mayBeInvestigatedAgain,
    noUnfinishedMissionSite,
    missionSiteCanExist: canExist,
    factionNotEliminated,
  };
}

/** LEAD, Lead discovery: whether the Lead is in the stored set of discovered Leads. */
export function leadDiscovered(lead: LeadGdr, world: Pick<LeadWorld, 'discoveredLeads'>): boolean {
  return world.discoveredLeads.includes(lead.id);
}

/**
 * LEAD, Lead discovery: adds to the set of discovered Leads every Lead not yet in it whose `discovered_when` holds in
 * the given World state, with the Faction of the Lead supplied to every `mission_won` Condition; a Lead without
 * `discovered_when` always joins it. Leads that join together are added in Game build order. No Lead ever
 * leaves the set. Returns the Leads it added.
 */
export function discoverLeads(
  world: LeadWorld & { discoveredLeads: string[] },
  leads: readonly LeadGdr[],
): string[] {
  // Nothing changes while the Leads are evaluated, so the Won Missions are read once for all of them.
  const won = wonMissionIndex(world);
  const added = leads
    .filter(
      (lead) =>
        !world.discoveredLeads.includes(lead.id) &&
        (lead.discoveredWhen === null ||
          conditionHolds(lead.discoveredWhen, world, {
            faction: factionOfLead(lead, world)?.id ?? null,
            won,
          })),
    )
    .map((lead) => lead.id);
  world.discoveredLeads.push(...added);
  return added;
}

/**
 * LEAD, Turn report: whether a discovered Lead is credited to a Won Mission at `site`: the Mission site's target
 * Faction is the Faction of the Lead, and the Lead's `discovered_when` holds, outside any `not`, a `mission_won` naming
 * the Mission site's MissionSiteArchetype or a `mission_won_with_enemy` naming the EnemyArchetype of one of its
 * Enemies.
 */
export function leadCreditedTo(
  lead: LeadGdr,
  site: MissionSite,
  world: Pick<LeadWorld, 'enemies' | 'factions'>,
): boolean {
  if (lead.discoveredWhen === null || factionOfLead(lead, world)?.id !== site.constants.targetFaction) {
    return false;
  }
  const enemies = new Set(site.state.enemies.flatMap((id) => world.enemies[id]?.archetype ?? []));
  const names = (condition: Condition): boolean => {
    switch (condition.kind) {
      case 'all':
      case 'any':
        return condition.conditions.some(names);
      case 'not':
      case 'lead_completed':
        return false;
      case 'mission_won':
        return condition.missionSiteArchetype === site.archetype;
      case 'mission_won_with_enemy':
        return enemies.has(condition.enemyArchetype);
    }
  };
  return names(lead.discoveredWhen);
}

/**
 * LEAD, Turn report: whether a discovered Lead is credited to a completed Investigation of the Lead `completedLead`:
 * the Lead's `discovered_when` holds, outside any `not`, a `lead_completed` naming `completedLead`.
 */
export function leadCreditedToInvestigation(lead: LeadGdr, completedLead: string): boolean {
  if (lead.discoveredWhen === null) {
    return false;
  }
  const names = (condition: Condition): boolean => {
    switch (condition.kind) {
      case 'all':
      case 'any':
        return condition.conditions.some(names);
      case 'not':
      case 'mission_won':
      case 'mission_won_with_enemy':
        return false;
      case 'lead_completed':
        return condition.lead === completedLead;
    }
  };
  return names(lead.discoveredWhen);
}

export type LeadStatus = 'Available' | 'Inactive' | 'Archived';

/**
 * LEAD, Lead status of a discovered Lead, in the order of the table: Archived when condition 2 or condition 5 of Lead
 * availability does not hold, otherwise Inactive when it is not available, otherwise Available.
 */
export function leadStatus(availability: LeadAvailability): LeadStatus {
  if (!availability.mayBeInvestigatedAgain || !availability.factionNotEliminated) {
    return 'Archived';
  }
  return availability.available ? 'Available' : 'Inactive';
}

/** The Active Investigation of a Lead, if any; see INVSTG, One Active Investigation per Lead. */
export function activeInvestigationOf(
  leadId: string,
  investigations: Readonly<Record<string, Investigation>>,
): Investigation | null {
  return (
    Object.values(investigations).find(
      (item) => item.constants.lead === leadId && item.state.lifecycle === 'Active',
    ) ?? null
  );
}

/**
 * LEAD, Initiative operation level: the level of every Lead and of every MissionSiteArchetype of kind initiative of a
 * Game build, by GDR identifier, in Game build order; null for one that has none.
 */
export interface InitiativeOperationLevels {
  readonly leads: ReadonlyMap<string, number | null>;
  readonly missionSiteArchetypes: ReadonlyMap<string, number | null>;
}

/** The lowest of several values, ignoring those without one; none when none has one. */
function lowest(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : Math.min(...present);
}

/** The Lead and MissionSiteArchetype GDRs whose Initiative operation levels were last calculated, by Lead list. */
const levelsByBuild = new WeakMap<readonly LeadGdr[], InitiativeOperationLevels>();

/**
 * LEAD, Initiative operation level: a Derived value of the Game build, calculated from the Lead and
 * MissionSiteArchetype GDRs alone, once per Game build. Every Lead starts with no value and the equations are applied
 * to every Lead again and again until no value changes; values only fall, so the calculation ends.
 */
export function initiativeOperationLevels(gdrs: {
  readonly leads: readonly LeadGdr[];
  readonly missionSiteArchetypes: readonly MissionSiteArchetypeGdr[];
}): InitiativeOperationLevels {
  const known = levelsByBuild.get(gdrs.leads);
  if (known !== undefined) {
    return known;
  }
  const kinds = new Map(gdrs.missionSiteArchetypes.map((item) => [item.id, item.kind]));
  const required = new Map<string, number | null>(gdrs.leads.map((lead) => [lead.id, null]));
  const levelOf = (lead: LeadGdr): number | null => {
    const value = required.get(lead.id) ?? null;
    return value === null ? null : value + (createsMissionSite(lead) ? 1 : 0);
  };
  // The lowest level among the Leads, of the given Faction when one is given, whose `create_mission_site` names it.
  const archetypeLevel = (archetype: string, faction: { readonly of: string | null } | null): number | null =>
    lowest(
      gdrs.leads
        .filter(
          (lead) =>
            lead.onCompletion.createMissionSite === archetype &&
            (faction === null || lead.faction === faction.of),
        )
        .map(levelOf),
    );
  const requiredOf = (condition: Condition, lead: LeadGdr): number | null => {
    switch (condition.kind) {
      case 'lead_completed':
        return required.get(condition.lead) ?? null;
      case 'mission_won':
        // A Response Mission site needs no Initiative Mission to be Won first.
        return kinds.get(condition.missionSiteArchetype) === 'response'
          ? 0
          : archetypeLevel(condition.missionSiteArchetype, { of: lead.faction });
      case 'mission_won_with_enemy': {
        // The lowest level among the MissionSiteArchetypes of kind initiative whose `enemies` has the EnemyArchetype,
        // as a `mission_won` naming each would have. One of kind response adds nothing: a Won Response Mission there
        // is a shortcut past the level. 0 when only MissionSiteArchetypes of kind response have it; none when none do.
        const holding = gdrs.missionSiteArchetypes.filter((item) =>
          item.enemies.some(([key]) => key === condition.enemyArchetype),
        );
        const initiative = holding.filter((item) => item.kind === 'initiative');
        if (initiative.length === 0) {
          return holding.length > 0 ? 0 : null;
        }
        return lowest(initiative.map((item) => archetypeLevel(item.id, { of: lead.faction })));
      }
      case 'all': {
        const values = condition.conditions.map((item) => requiredOf(item, lead));
        return values.includes(null) ? null : Math.max(0, ...(values as number[]));
      }
      case 'any':
        return lowest(condition.conditions.map((item) => requiredOf(item, lead)));
      case 'not':
        return 0;
    }
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const lead of gdrs.leads) {
      const next = lead.discoveredWhen === null ? 0 : requiredOf(lead.discoveredWhen, lead);
      if (next !== required.get(lead.id)) {
        required.set(lead.id, next);
        changed = true;
      }
    }
  }
  const levels: InitiativeOperationLevels = {
    leads: new Map(gdrs.leads.map((lead) => [lead.id, levelOf(lead)])),
    missionSiteArchetypes: new Map(
      gdrs.missionSiteArchetypes
        .filter((item) => item.kind === 'initiative')
        .map((item) => [item.id, archetypeLevel(item.id, null)]),
    ),
  };
  levelsByBuild.set(gdrs.leads, levels);
  return levels;
}

/**
 * LEAD, Contracting cap growth: for each Initiative operation level, the entries of contracting_cap_per_initiative_level
 * that the distinct Factions Won against at that level bring, the first Faction the first entry; summed over the levels.
 */
export function contractingCapGrowth(
  world: InitiativeWinWorld,
  gdrs: Parameters<typeof initiativeOperationLevels>[0] & { readonly economy: EconomyParametersGdr },
): number {
  let growth = 0;
  for (const factions of wonFactionsByLevel(world, gdrs).values()) {
    for (let i = 0; i < factions.length; i += 1) {
      growth += gdrs.economy.contractingCapPerInitiativeLevel[i] ?? 0;
    }
  }
  return growth;
}

/** The parts of a World state that Contracting cap growth reads. */
export interface InitiativeWinWorld {
  readonly missions: Readonly<Record<string, Mission>>;
  readonly missionSites: Readonly<Record<string, MissionSite>>;
  readonly investigations: Readonly<Record<string, Investigation>>;
}

/**
 * LEAD, Contracting cap growth: for each Initiative operation level at which a Mission is Won, the target Factions of
 * its Won Missions, each once, in the order of their first Won Mission there, i.e. the order the Missions were created.
 */
export function wonFactionsByLevel(
  world: InitiativeWinWorld,
  gdrs: Parameters<typeof initiativeOperationLevels>[0],
): Map<number, string[]> {
  const byLevel = new Map<number, string[]>();
  for (const mission of Object.values(world.missions)) {
    const level = mission.state.lifecycle === 'Won' ? missionInitiativeLevel(mission, world, gdrs) : null;
    const faction = world.missionSites[mission.constants.missionSite]?.constants.targetFaction;
    if (level === null || faction === undefined) {
      continue;
    }
    const factions = byLevel.get(level) ?? [];
    if (!factions.includes(faction)) {
      factions.push(faction);
    }
    byLevel.set(level, factions);
  }
  return byLevel;
}

/**
 * LEAD, Contracting cap growth: the Initiative operation level of a Mission's Mission site, i.e. that of the Lead
 * whose Investigation created it; null for a Response Mission site or one whose Lead has none.
 */
export function missionInitiativeLevel(
  mission: Pick<Mission, 'constants'>,
  world: InitiativeWinWorld,
  gdrs: Parameters<typeof initiativeOperationLevels>[0],
): number | null {
  const site = world.missionSites[mission.constants.missionSite];
  const lead = site === undefined ? null : leadOfMissionSite(site, world.investigations);
  return lead === null ? null : leadInitiativeOperationLevel(lead, gdrs);
}

/** ECON, Contracting cap, with G the Contracting cap growth of the given World state. */
export function currentContractingCap(
  world: Parameters<typeof contractingCapGrowth>[0] & {
    readonly agency: { readonly state: { readonly contractingUnlocked: boolean } };
  },
  gdrs: Parameters<typeof initiativeOperationLevels>[0] & { readonly economy: EconomyParametersGdr },
): number {
  const unlocked = world.agency.state.contractingUnlocked;
  return contractingCap(gdrs.economy, unlocked, unlocked ? contractingCapGrowth(world, gdrs) : 0);
}

/** LEAD, Initiative operation level of one Lead; null for one that has none. */
export function leadInitiativeOperationLevel(
  leadId: string,
  gdrs: Parameters<typeof initiativeOperationLevels>[0],
): number | null {
  return initiativeOperationLevels(gdrs).leads.get(leadId) ?? null;
}
