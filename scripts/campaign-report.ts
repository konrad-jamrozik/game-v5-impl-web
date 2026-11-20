/**
 * Plays whole Campaigns with the Basic Autopilot AI and prints one table row for each Campaign seed: its Campaign
 * ending and Ending reasons, the Turn it ended, the furthest raid tier won against each Faction, whether each Faction is
 * Eliminated, the Agents hired and Killed, and the peak Panic. Evidence for a balance review; it changes nothing.
 * Usage: node scripts/campaign-report.ts [seeds] [maxTurns]
 */
import { createBasicAutopilotAi } from '../src/ai/index.ts';
import { MemoryStorage, createEngine } from '../src/engine/index.ts';

const seeds = Number(process.argv[2] ?? 10);
const maxTurns = Number(process.argv[3] ?? 600);
const first = Number(process.env['FIRST_SEED'] ?? 0);

/** The tier of each Initiative MissionSiteArchetype on the Victory path of a Faction; see BOOT, Victory path. */
const TIER: Readonly<Record<string, number>> = {
  apprehend_member: 1,
  raid_safehouse: 2,
  raid_outpost: 3,
  raid_training_facility: 4,
  raid_logistics_hub: 5,
  raid_command_center: 6,
  raid_regional_stronghold: 7,
  raid_hq: 8,
};

const hundredths = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;

console.log(
  '| Seed | Ending | Ending reasons | Turn | Tier won (RD/EX/BL) | Eliminated | Hired | Killed | Peak Panic | Leads completed |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (let i = first; i < first + seeds; i += 1) {
  let id = 0;
  const engine = await createEngine(
    {
      storage: new MemoryStorage(),
      newId: () => `id-${(id += 1)}`,
      randomNumbers: (n) => new Array<number>(n).fill(i),
    },
    { autopilotAis: [createBasicAutopilotAi()] },
  );
  await engine.session.globalConfiguration.set('autosaveLimit', 0);
  await engine.session.campaign.create({ seed: `simulation-${i}` });
  const initialRoster = engine.player.queries.getCurrentState();
  if (!initialRoster.ok) {
    throw new Error(initialRoster.error.message);
  }
  const engaged = await engine.session.autopilot.engage('basic', {
    kind: 'turnAdvancements',
    count: maxTurns,
  });
  if (!engaged.ok) {
    throw new Error(engaged.error.message);
  }
  const result = await engine.session.autopilot.whenDisengaged(engaged.value.engagementId);
  const state = engine.player.queries.getCurrentState();
  const history = engine.player.queries.getHistory();
  if (!result.ok || !state.ok || !history.ok) {
    throw new Error('simulation failed');
  }
  if (result.value.reason === 'aiFailed') {
    console.log(`| ${i} | AI FAILED: ${result.value.detail ?? ''} | | | | | | | | |`);
    continue;
  }
  const view = state.value;
  const sites = [...view.missionSites, ...history.value.retained.missionSites];
  const targetOf = new Map(sites.map((site) => [site.id, site.targetFaction]));
  const best = new Map<string, number>();
  for (const entry of history.value.entries) {
    for (const mission of entry.report.missions) {
      const tier = TIER[mission.missionSiteArchetype];
      const faction = targetOf.get(mission.missionSite);
      if (mission.result === 'Won' && tier !== undefined && faction !== undefined) {
        best.set(faction, Math.max(best.get(faction) ?? 0, tier));
      }
    }
  }
  const allAgents = [...view.agents, ...history.value.retained.agents];
  const killed = allAgents.filter((agent) => agent.agentStatus === 'Killed').length;
  const hired = allAgents.length - initialRoster.value.agents.length;
  const peak = Math.max(0, ...history.value.entries.map((entry) => entry.report.panicAfterHundredths));
  const tiers = view.factions.map((faction) => String(best.get(faction.id) ?? 0)).join('/');
  const eliminated = view.factions.filter((faction) => faction.eliminated).length;
  const completed = view.leads.filter((lead) => lead.completionCount > 0).length;
  const ending = view.ending;
  console.log(
    `| ${i} | ${ending?.ending ?? 'none'} | ${ending?.reasons.join(', ') ?? ''} | ${ending?.turn ?? `${view.turn - 1} (limit)`} | ${tiers} | ${eliminated}/3 | ${hired} | ${killed} | ${hundredths(peak)}% | ${completed}/${view.leads.length} discovered |`,
  );
}
