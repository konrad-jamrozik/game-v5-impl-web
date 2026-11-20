/**
 * Plays one Campaign with the Basic Autopilot AI and prints one line for each Turn. Used to tune its thresholds.
 * Usage: node scripts/trace-campaign.ts [seed] [turns]
 */
import { createBasicAutopilotAi } from '../src/ai/index.ts';
import { MemoryStorage, createEngine } from '../src/engine/index.ts';

const seed = process.argv[2] ?? 'simulation-0';
const turns = Number(process.argv[3] ?? 80);
let id = 0;
const engine = await createEngine(
  {
    storage: new MemoryStorage(),
    newId: () => `id-${(id += 1)}`,
    randomNumbers: (n) => new Array<number>(n).fill(1),
  },
  { autopilotAis: [createBasicAutopilotAi()] },
);
await engine.session.globalConfiguration.set('autosaveLimit', 0);
await engine.session.campaign.create({ seed });
for (let t = 0; t < turns; t += 1) {
  const engaged = await engine.session.autopilot.engage('basic', { kind: 'turnAdvancements', count: 1 });
  if (!engaged.ok) {
    throw new Error(engaged.error.message);
  }
  await engine.session.autopilot.whenDisengaged(engaged.value.engagementId);
  const state = engine.player.queries.getCurrentLiveWorldState();
  const report = engine.player.queries.getTurnReport();
  if (!state.ok || !report.ok || report.value === null) {
    break;
  }
  const view = state.value;
  const counts: Record<string, number> = {};
  for (const agent of view.agents) {
    const kind = agent.assignment?.kind ?? '-';
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  const events = [
    ...report.value.missions.map(
      (mission) => `${mission.missionSiteArchetype}:${mission.result}(killed ${mission.killed.length})`,
    ),
    ...report.value.expiredMissionSites.map((site) => `expired:${site.missionSiteArchetype}`),
    ...report.value.investigations.filter((item) => item.completed).map((item) => `completed:${item.lead}`),
  ];
  const sites = view.missionSites.map((site) => `${site.archetype}:${site.turnsUntilExpiration}`).join(',');
  console.log(
    [
      `turn ${view.turn}`,
      `money ${view.agency.money}`,
      `funding ${view.agency.funding}`,
      `panic ${(view.panicHundredths / 100).toFixed(2)}%`,
      `caps ${view.agency.agentCap}/${view.agency.transportCap}/${view.agency.trainingCap}`,
      JSON.stringify(counts),
      `sites [${sites}]`,
      events.join(' '),
    ].join(' | '),
  );
  if (view.ending !== null) {
    console.log(JSON.stringify(view.ending));
    break;
  }
}
