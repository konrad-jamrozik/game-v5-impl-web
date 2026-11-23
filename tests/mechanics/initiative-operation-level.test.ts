/** Tests of LEAD, Initiative operation level, and of how Player API, Developer API, and the Basic Autopilot AI read it. */
import { describe, expect, it } from 'vite-plus/test';
import { BASIC_AI_THRESHOLDS, createBasicAutopilotAi } from '../../src/ai/index.ts';
import type { LeadView, PlayerApi } from '../../src/engine/index.ts';
import { initiativeOperationLevels } from '../../src/engine/mechanics/leads/leads.ts';
import { currentLiveWorldStateView, currentRetiredWorldStateView } from '../../src/engine/views/views.ts';
import {
  bootstrapGdrCatalog,
  type Condition,
  type LeadGdr,
  type MissionSiteArchetypeGdr,
} from '../../src/gdr/index.ts';
import { errorCode, ok, startEngine } from '../helpers/engine.ts';
import { addMissionSite, gdrs, newCampaign } from '../helpers/game.ts';

function lead(
  id: string,
  options: { faction?: string | null; discoveredWhen?: Condition | null; creates?: string | null } = {},
): LeadGdr {
  return {
    type: 'Lead',
    id,
    name: id,
    description: id,
    faction: options.faction === undefined ? 'red_dawn' : options.faction,
    requiredProgress: 10,
    discoveredWhen: options.discoveredWhen ?? null,
    investigateAgain: 'never',
    onCompletion: {
      createMissionSite: options.creates ?? null,
      eliminateFaction: false,
      unlockContracting: false,
      winCampaign: false,
    },
  };
}

function archetype(id: string, kind: 'initiative' | 'response'): MissionSiteArchetypeGdr {
  return {
    type: 'MissionSiteArchetype',
    id,
    name: id,
    kind,
    expiresInTurns: 3,
    enemies: [],
    onWin: { money: 0, funding: 0, panicReductionHundredths: 0, eliminateTargetFaction: false },
    operationLevel: kind === 'response' ? 1 : null,
    canExistWhen: null,
  };
}

const ARCHETYPES = [
  archetype('site_a', 'initiative'),
  archetype('site_b', 'initiative'),
  archetype('site_c', 'initiative'),
  archetype('response_site', 'response'),
];

const completed = (id: string): Condition => ({ kind: 'lead_completed', lead: id });
const won = (id: string): Condition => ({ kind: 'mission_won', missionSiteArchetype: id });

function levelsOf(leads: LeadGdr[]) {
  return initiativeOperationLevels({ leads, missionSiteArchetypes: ARCHETYPES });
}

describe('LEAD, Initiative operation level with the Bootstrap GDRs', () => {
  const catalog = bootstrapGdrCatalog();
  const levels = initiativeOperationLevels(catalog);
  const initiative = new Set(
    catalog.missionSiteArchetypes.filter((item) => item.kind === 'initiative').map((item) => item.id),
  );

  it('gives every Lead a level that never falls along its chain', () => {
    // A Lead discovered by winning a Mission at an Initiative Mission site lies at least at that site's level.
    const chained = catalog.leads.filter(
      (item) =>
        item.discoveredWhen?.kind === 'mission_won' &&
        initiative.has(item.discoveredWhen.missionSiteArchetype),
    );
    expect(chained.length).toBeGreaterThan(0);
    for (const item of chained) {
      const site = (item.discoveredWhen as { missionSiteArchetype: string }).missionSiteArchetype;
      expect([item.id, levels.leads.get(item.id)! >= levels.missionSiteArchetypes.get(site)!]).toEqual([
        item.id,
        true,
      ]);
    }
  });

  it('gives every MissionSiteArchetype of kind initiative a Lead creates a level, at most that of the Lead', () => {
    const creators = catalog.leads.filter(
      (item) =>
        item.onCompletion.createMissionSite !== null && initiative.has(item.onCompletion.createMissionSite),
    );
    expect(creators.length).toBeGreaterThan(0);
    for (const item of creators) {
      const site = levels.missionSiteArchetypes.get(item.onCompletion.createMissionSite!);
      expect([item.id, site! >= 1 && site! <= levels.leads.get(item.id)!]).toEqual([item.id, true]);
    }
    expect([...levels.missionSiteArchetypes.keys()].sort()).toEqual(
      [...new Set(creators.map((item) => item.onCompletion.createMissionSite!))].sort(),
    );
  });

  it('gives every Lead of the Game build a level', () => {
    expect(catalog.leads.every((item) => levels.leads.get(item.id) !== null)).toBe(true);
  });

  it('is calculated once per Game build', () => {
    expect(initiativeOperationLevels(bootstrapGdrCatalog())).toBe(
      initiativeOperationLevels(bootstrapGdrCatalog()),
    );
  });
});

describe('LEAD, Required level of each Condition form', () => {
  it('takes the highest of `all`, 0 for an empty `all`, and the lowest of `any`', () => {
    const levels = levelsOf([
      lead('first', { creates: 'site_a' }),
      lead('second', { discoveredWhen: won('site_a'), creates: 'site_b' }),
      lead('both', { discoveredWhen: { kind: 'all', conditions: [won('site_a'), won('site_b')] } }),
      lead('either', { discoveredWhen: { kind: 'any', conditions: [won('site_a'), won('site_b')] } }),
      lead('empty', { discoveredWhen: { kind: 'all', conditions: [] } }),
    ]);
    expect(levels.leads.get('first')).toBe(1);
    expect(levels.leads.get('second')).toBe(2);
    expect(levels.leads.get('both')).toBe(2);
    expect(levels.leads.get('either')).toBe(1);
    expect(levels.leads.get('empty')).toBe(0);
  });

  it('adds nothing for `not` and for a `mission_won` of a response MissionSiteArchetype', () => {
    const levels = levelsOf([
      lead('first', { creates: 'site_a' }),
      lead('negated', { discoveredWhen: { kind: 'not', condition: won('site_a') }, creates: 'site_b' }),
      lead('response', { discoveredWhen: won('response_site') }),
      lead('mixed', {
        discoveredWhen: {
          kind: 'all',
          conditions: [won('response_site'), { kind: 'not', condition: won('site_a') }],
        },
      }),
    ]);
    expect(levels.leads.get('negated')).toBe(1);
    expect(levels.leads.get('response')).toBe(0);
    expect(levels.leads.get('mixed')).toBe(0);
  });

  it('reads the Required level, not the level, of a completed Lead', () => {
    const levels = levelsOf([
      lead('first', { creates: 'site_a' }),
      lead('after', { discoveredWhen: completed('first'), creates: 'site_b' }),
    ]);
    expect(levels.leads.get('after')).toBe(1);
  });

  it('counts only the Leads of the same Faction for a `mission_won`', () => {
    const levels = levelsOf([
      lead('other', { faction: 'exalt', creates: 'site_a' }),
      lead('mine', { discoveredWhen: won('site_a') }),
    ]);
    expect(levels.leads.get('mine')).toBeNull();
    expect(levels.missionSiteArchetypes.get('site_a')).toBe(1);
  });
});

describe('LEAD, Initiative operation level edge cases', () => {
  it('gives no level to a Lead whose discovery requires the Lead itself, nor to what only it creates', () => {
    const levels = levelsOf([
      lead('first', { creates: 'site_a' }),
      lead('self', { discoveredWhen: completed('self'), creates: 'site_c' }),
      lead('loop', { discoveredWhen: won('site_b'), creates: 'site_b' }),
      lead('never_discoverable', { discoveredWhen: { kind: 'any', conditions: [completed('self')] } }),
    ]);
    expect(levels.leads.get('self')).toBeNull();
    expect(levels.leads.get('loop')).toBeNull();
    expect(levels.leads.get('never_discoverable')).toBeNull();
    expect(levels.missionSiteArchetypes.get('site_c')).toBeNull();
    expect(levels.missionSiteArchetypes.get('site_b')).toBeNull();
    expect(levels.missionSiteArchetypes.has('response_site')).toBe(false);
  });

  it('gives a MissionSiteArchetype that several Leads create the lowest of their levels', () => {
    const levels = levelsOf([
      lead('first', { creates: 'site_a' }),
      lead('second', { discoveredWhen: won('site_a'), creates: 'site_b' }),
      lead('late', { discoveredWhen: won('site_b'), creates: 'site_c' }),
      lead('early', { faction: 'exalt', creates: 'site_c' }),
    ]);
    expect(levels.leads.get('late')).toBe(3);
    expect(levels.leads.get('early')).toBe(1);
    expect(levels.missionSiteArchetypes.get('site_c')).toBe(1);
  });

  it('lets a level fall when a shorter chain is found later in Game build order', () => {
    // In the first pass `reader` takes level 2 from `second`, then falls to 0 once `base` has a value.
    const levels = levelsOf([
      lead('first', { creates: 'site_a' }),
      lead('second', { discoveredWhen: won('site_a'), creates: 'site_b' }),
      lead('reader', { discoveredWhen: { kind: 'any', conditions: [won('site_b'), completed('base')] } }),
      lead('base', { discoveredWhen: completed('first') }),
    ]);
    expect(levels.leads.get('reader')).toBe(0);
  });
});

describe('LEAD, Reading Initiative operation levels', () => {
  it('returns the level with every discovered Lead and every Initiative Mission site, and none for a Response one', () => {
    let state = newCampaign();
    const initiative = addMissionSite(state, 'raid_outpost', { lead: 'locate_red_dawn_outpost' });
    state = initiative.state;
    const response = gdrs.missionSiteArchetypes.find((item) => item.kind === 'response');
    const responseSite = addMissionSite(state, response!.id);
    state = responseSite.state;
    const levels = initiativeOperationLevels(gdrs);
    const leads = currentRetiredWorldStateView(state, gdrs).leads;
    expect(leads.length).toBeGreaterThan(0);
    for (const item of leads) {
      expect([item.id, item.initiativeOperationLevel]).toEqual([item.id, levels.leads.get(item.id) ?? null]);
    }
    // A Lead with no `discovered_when` that creates no Mission site, e.g. the first Lead, has level 0.
    const head = gdrs.leads.find(
      (item) => item.discoveredWhen === null && item.onCompletion.createMissionSite === null,
    )!;
    expect(leads.find((item) => item.id === head.id)?.initiativeOperationLevel).toBe(0);
    const sites = currentLiveWorldStateView(state, gdrs).missionSites;
    expect(sites.find((site) => site.id === initiative.site)?.initiativeOperationLevel).toBe(
      levels.missionSiteArchetypes.get('raid_outpost'),
    );
    expect(sites.find((site) => site.id === responseSite.site)?.initiativeOperationLevel).toBeNull();
  });

  it('reports every level through Developer API only while Dev mode is enabled', async () => {
    const { engine } = await startEngine();
    expect(errorCode(engine.developer.queries.getInitiativeOperationLevels())).toBe('no_current_campaign');
    ok(await engine.session.campaign.create({ seed: 'levels' }));
    expect(errorCode(engine.developer.queries.getInitiativeOperationLevels())).toBe('dev_mode_disabled');
    ok(engine.session.developer.enable());
    const before = ok(engine.session.timeline.getStatus());
    const report = ok(engine.developer.queries.getInitiativeOperationLevels());
    const catalog = bootstrapGdrCatalog();
    const levels = initiativeOperationLevels(catalog);
    expect(report.leads).toEqual(
      catalog.leads.map((item) => ({
        id: item.id,
        name: item.name,
        level: levels.leads.get(item.id) ?? null,
      })),
    );
    expect(report.missionSiteArchetypes).toEqual(
      catalog.missionSiteArchetypes
        .filter((item) => item.kind === 'initiative')
        .map((item) => ({
          id: item.id,
          name: item.name,
          level: levels.missionSiteArchetypes.get(item.id) ?? null,
        })),
    );
    expect(report.leadsWithoutLevel).toEqual([]);
    expect(report.missionSiteArchetypesWithoutLevel).toEqual([]);
    // A query: it changes no Campaign state.
    expect(ok(engine.session.timeline.getStatus())).toEqual(before);
  });
});

describe('Basic Autopilot AI, Keep Mission sites coming', () => {
  it('tries the Lead with the highest Initiative operation level first, and one with none last', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'order' }));
    const attempts: string[] = [];
    const fake = (base: LeadView, id: string, level: number | null): LeadView => ({
      ...base,
      id,
      factionArchetype: 'red_dawn',
      createsMissionSite: null,
      eliminatesFaction: false,
      winsCampaign: false,
      canBeInvestigatedNow: true,
      initiativeOperationLevel: level,
    });
    const real = engine.player;
    const player: PlayerApi = {
      ...real,
      queries: {
        ...real.queries,
        getCurrentRetiredWorldState: () => {
          const result = real.queries.getCurrentRetiredWorldState();
          if (!result.ok) {
            return result;
          }
          const [base] = result.value.leads;
          return {
            ...result,
            value: {
              ...result.value,
              leads: [fake(base!, 'no_level', null), fake(base!, 'low', 2), fake(base!, 'high', 3)],
            },
          };
        },
      },
      actions: {
        ...real.actions,
        startInvestigation: async (leadId, agents) => {
          attempts.push(leadId);
          return real.actions.startInvestigation(leadId, agents);
        },
      },
    };
    // Fixture values: no Agent reserve and every Agent an investigator, so that the AI starts an Investigation at once.
    const ai = createBasicAutopilotAi({
      ...BASIC_AI_THRESHOLDS,
      reserveSharePct: 0,
      investigatorSharePct: 100,
    });
    for (let turn = 0; turn < 5 && attempts.length === 0; turn += 1) {
      await ai.step({ player });
    }
    expect(attempts.slice(0, 3)).toEqual(['high', 'low', 'no_level']);
  });
});
