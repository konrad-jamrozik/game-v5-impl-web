/**
 * REUSE, Combat ratings of Enemies, Agreement test: for every MissionSiteArchetype of the Game build, the Combat rating
 * that Player API reports for its Enemies (MISSION, Player-visible information) equals the Creation Combat rating of a
 * Mission site of it, and the Combat rating of that Mission site's Enemies, as a user interface shows it.
 */
import { describe, expect, it } from 'vite-plus/test';
import { createMissionSite } from '../../src/engine/mechanics/missions/missions.ts';
import { currentLiveWorldStateView, gameDataView } from '../../src/engine/views/views.ts';
import { bootstrapGdrCatalog } from '../../src/gdr/index.ts';
import { addMissionSite, gdrs, newCampaign } from '../helpers/game.ts';

describe('REUSE: Combat ratings of Enemies', () => {
  it('rates every MissionSiteArchetype of the Game build as a Mission site of it is rated when created', () => {
    const catalog = bootstrapGdrCatalog();
    const data = gameDataView(catalog);
    expect(catalog.missionSiteArchetypes.length).toBeGreaterThan(0);
    for (const archetype of catalog.missionSiteArchetypes) {
      let n = 0;
      const { site } = createMissionSite({
        newId: (type) => `${type}-${(n += 1)}`,
        archetype,
        origin: { kind: 'Investigation', investigation: 'investigation-1' },
        targetFaction: 'faction-1',
        turn: 1,
        enemyArchetypes: catalog.enemyArchetypes,
        weapons: catalog.weapons,
        armors: catalog.armors,
        combat: catalog.combatParameters,
        agentParameters: catalog.agentParameters,
      });
      const reported = data.missionSiteArchetypes.find(
        (item) => item.id === archetype.id,
      )?.enemiesCombatRating;
      expect(reported, archetype.id).toBe(site.constants.creationCombatRating);
    }
  });

  it('shows a new Mission site with the Combat rating its MissionSiteArchetype reports', () => {
    const archetype =
      gdrs.missionSiteArchetypes.find((item) => item.kind === 'response') ?? gdrs.missionSiteArchetypes[0];
    const added = addMissionSite(newCampaign(), archetype!.id);
    const view = currentLiveWorldStateView(added.state, gdrs).missionSites.find(
      (site) => site.id === added.site,
    );
    const reported = gameDataView(gdrs).missionSiteArchetypes.find((item) => item.id === archetype!.id);
    expect(view?.enemiesCombatRating).toBe(reported?.enemiesCombatRating);
    expect(view?.creationCombatRating).toBe(reported?.enemiesCombatRating);
  });
});
