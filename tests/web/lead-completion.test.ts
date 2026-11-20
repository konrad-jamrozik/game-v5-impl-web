/** LVIEW, Selected Lead: the Faction and the "On completion" lines of a Lead. CSCR, Autopilot controls: kept state. */
import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  currentLiveWorldStateView,
  currentRetiredWorldStateView,
  gameDataView,
} from '../../src/engine/views/views.ts';
import {
  NEW_SESSION_CONTROLS,
  keepAutopilotControls,
  keptAutopilotControls,
  resetAutopilotControls,
  shownAutopilotAi,
} from '../../src/web/autopilot-controls.ts';
import { leadFactionName, onCompletionLines, onCompletionText } from '../../src/web/lead-completion.ts';
import { gdrs, newCampaign, tweak } from '../helpers/game.ts';

/** The Player API view of every Lead of the test Game build, all discovered. */
function leadViews() {
  const state = tweak(newCampaign(), (world) => {
    for (const lead of gdrs.leads) {
      if (!world.discoveredLeads.includes(lead.id)) {
        world.discoveredLeads.push(lead.id);
      }
    }
  });
  const view = currentLiveWorldStateView(state, gdrs);
  const retired = currentRetiredWorldStateView(state, gdrs);
  const lead = (id: string) => {
    const found = retired.leads.find((item) => item.id === id);
    if (found === undefined) {
      throw new Error(`No discovered Lead ${id}`);
    }
    return found;
  };
  return { view, lead, gameData: gameDataView(gdrs) };
}

describe('LVIEW: Selected Lead', () => {
  it('shows the Faction only of a Lead that has one', () => {
    const { view, lead } = leadViews();
    expect(leadFactionName(lead('locate_red_dawn_member'), view)).toBe('Red Dawn');
    expect(leadFactionName(lead('criminal_organizations'), view)).toBeNull();
  });

  it('shows one "On completion" line for each Effect, and none for an empty `on_completion`', () => {
    const { view, lead, gameData } = leadViews();
    const lines = (id: string) => onCompletionLines(lead(id), gameData, view);
    const site = gameData.missionSiteArchetypes.find((item) => item.id === 'apprehend_member')!;
    const enemies = site.enemies.reduce((sum, item) => sum + item.count, 0);
    expect(lines('locate_red_dawn_member').map(onCompletionText)).toEqual([
      `Creates the Mission site ${site.name} · ${enemies} Enemies`,
    ]);
    expect(lines('locate_red_dawn_member')[0]).toMatchObject({ strong: site.name, good: false });
    expect(lines('terminate_red_dawn')).toEqual([
      { key: 'eliminate', before: 'Eliminates ', strong: 'Red Dawn', after: '', good: true },
    ]);
    expect(lines('peace_on_earth').map(onCompletionText)).toEqual(['Wins the Campaign']);
    expect(lines('peace_on_earth')[0]?.good).toBe(true);
    expect(lines('criminal_organizations')).toEqual([]);
  });
});

describe('CSCR: Autopilot controls', () => {
  afterEach(() => {
    resetAutopilotControls();
  });

  it('start a Session collapsed and keep every change for the rest of it', () => {
    expect(keptAutopilotControls()).toEqual(NEW_SESSION_CONTROLS);
    expect(NEW_SESSION_CONTROLS.expanded).toBe(false);
    keepAutopilotControls({ expanded: true });
    keepAutopilotControls({ turns: 100 });
    expect(keptAutopilotControls()).toEqual({ expanded: true, aiId: null, turns: 100 });
  });

  it('show the kept Autopilot AI while it is listed, and otherwise the first one listed', () => {
    expect(shownAutopilotAi('second', ['first', 'second'])).toBe('second');
    expect(shownAutopilotAi('gone', ['first', 'second'])).toBe('first');
    expect(shownAutopilotAi(null, ['first'])).toBe('first');
    expect(shownAutopilotAi(null, [])).toBe('');
  });
});
