/**
 * COMP (Compendium): Article visibility, a Derived value of the Committed state it is read in, never stored. No game
 * behavior reads an Encyclopedia article, so nothing here changes Campaign state.
 */
import type { CatalogEncyclopediaArticle, GdrCatalog } from '../../../gdr/index.ts';
import { leadDiscovered, type LeadWorld } from '../leads/leads.ts';

/**
 * COMP, Article visibility: a Guide article is always Player-visible; any other article exactly when its subject is
 * Player-visible, as the specification that owns the subject's Type declares it.
 */
export function articleVisible(
  article: CatalogEncyclopediaArticle,
  world: LeadWorld,
  gdrs: GdrCatalog,
): boolean {
  const subject = article.subject;
  if (subject === null || article.subjectType === null) {
    return true;
  }
  const discovered = (leadId: string) => {
    const lead = gdrs.leads.find((item) => item.id === leadId);
    return lead !== undefined && leadDiscovered(lead, world);
  };
  switch (article.subjectType) {
    // AGENT, COMBAT, ECON, Player-visible information: in every Committed state.
    case 'AgentArchetype':
    case 'EnemyArchetype':
    case 'Weapon':
    case 'Upgrade':
      return true;
    // FACTION, Player-visible information: while a Faction whose Archetype it is exists.
    case 'FactionArchetype':
      return Object.values(world.factions).some((faction) => faction.archetype === subject);
    // LEAD, Player-visible information: once the Lead is discovered.
    case 'Lead':
      return discovered(subject);
    // MISSION, Player-visible information: while a Mission site whose Archetype it is exists, in any lifecycle
    // state, or a discovered Lead creates a Mission site from it.
    case 'MissionSiteArchetype':
      return (
        Object.values(world.missionSites).some((site) => site.archetype === subject) ||
        gdrs.leads.some((lead) => lead.onCompletion.createMissionSite === subject && discovered(lead.id))
      );
    // Player API reports these GDRs in every Committed state: `getGameData()`, with every BackgroundArtwork, and the
    // Agency, Investigation, and Mission names, and the Panic limit of the current state.
    case 'AgentParameters':
    case 'CombatParameters':
    case 'RecoveryParameters':
    case 'EconomyParameters':
    case 'InvestigationParameters':
    case 'FactionActivityLevel':
    case 'FactionOperationLevel':
    case 'AgencyArchetype':
    case 'InvestigationArchetype':
    case 'MissionArchetype':
    case 'EndingParameters':
    case 'BackgroundArtwork':
      return true;
    // No Player API value includes a Campaign configuration preset or the default-preset choice.
    case 'CampaignConfiguration':
    case 'ConfigurationParameters':
      return false;
  }
}

/** COMP, Player-visible information: the Player-visible Encyclopedia articles, in Game build order. */
export function visibleArticles(world: LeadWorld, gdrs: GdrCatalog): CatalogEncyclopediaArticle[] {
  return gdrs.encyclopediaArticles.filter((article) => articleVisible(article, world, gdrs));
}
