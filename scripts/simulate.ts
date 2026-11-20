/**
 * Plays whole Campaigns with the Basic Autopilot AI and reports how they end. Used to tune its thresholds.
 * Usage: node scripts/simulate.ts [seeds] [maxTurns]
 */
import { createBasicAutopilotAi } from '../src/ai/index.ts';
import { MemoryStorage, createEngine } from '../src/engine/index.ts';

const seeds = Number(process.argv[2] ?? 20);
const maxTurns = Number(process.argv[3] ?? 400);
const tally: Record<string, number> = {};
const turns: number[] = [];
const started = Date.now();

const first = Number(process.env['FIRST_SEED'] ?? 0);
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
  const engaged = await engine.session.autopilot.engage('basic', {
    kind: 'turnAdvancements',
    count: maxTurns,
  });
  if (!engaged.ok) {
    throw new Error(engaged.error.message);
  }
  const result = await engine.session.autopilot.whenDisengaged(engaged.value.engagementId);
  const state = engine.player.queries.getCurrentLiveWorldState();
  if (!result.ok || !state.ok) {
    throw new Error('simulation failed');
  }
  const ending = state.value.ending;
  const key =
    result.value.reason === 'aiFailed'
      ? `AI FAILED: ${result.value.detail ?? ''}`
      : ending === null
        ? 'no ending'
        : `${ending.ending} (${ending.reasons.join(', ')})`;
  tally[key] = (tally[key] ?? 0) + 1;
  turns.push(state.value.turn);
  if (process.argv.includes('--verbose')) {
    console.log(
      `seed ${i}: ${key} at turn ${state.value.turn}, panic ${(state.value.panicHundredths / 100).toFixed(2)}%, agents ${state.value.agency.servingAgents}`,
    );
  }
}
turns.sort((a, b) => a - b);
console.log(tally);
console.log(
  `median turn ${turns[Math.floor(turns.length / 2)]}, min ${turns[0]}, max ${turns.at(-1)}, ${Date.now() - started} ms`,
);
