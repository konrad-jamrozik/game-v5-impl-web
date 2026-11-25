/**
 * Measures the size of Campaign saves and the time of one Advance turn.
 * Usage: node scripts/measure.ts [seeds] [extraAgents] [stressTurns]
 * It plays Campaigns with the Basic Autopilot AI, at most 2 of at most 200 Turns each under CTEST, Limits, and one
 * scripted stress Campaign in which cheats keep a large roster in play for many Turns.
 */
import { createBasicAutopilotAi } from '../src/ai/index.ts';
import { MemoryStorage, createEngine, type Engine } from '../src/engine/index.ts';

/** CTEST, Limits: at most 2 Campaigns of the Basic Autopilot AI, each of at most 200 Turns. */
const MAX_CAMPAIGNS = 2;
const MAX_TURNS = 200;
const seeds = Math.min(MAX_CAMPAIGNS, Number(process.argv[2] ?? 1));
const extraAgents = Number(process.argv[3] ?? 300);
const stressTurns = Number(process.argv[4] ?? 300);

async function start(storage: MemoryStorage): Promise<Engine> {
  let id = 0;
  return createEngine(
    { storage, newId: () => `id-${(id += 1)}`, randomNumbers: (n) => new Array<number>(n).fill(7) },
    { autopilotAis: [createBasicAutopilotAi()] },
  );
}

function largestSave(storage: MemoryStorage): number {
  let largest = 0;
  for (const save of storage.saves.values()) {
    largest = Math.max(largest, Buffer.byteLength(save.body, 'utf8'));
  }
  return largest;
}

function summary(name: string, times: number[], bytes: number, turn: number): void {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (share: number) =>
    (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0).toFixed(1);
  console.log(
    `${name}: ${turn} Turns; Advance turn median ${at(0.5)} ms, 95th percentile ${at(0.95)} ms, ` +
      `max ${at(1)} ms; largest Campaign save ${(bytes / 1024).toFixed(0)} KiB`,
  );
}

// Whole Campaigns played by the Basic Autopilot AI, one Turn at a time so that each Advance turn is timed
// together with the Player actions before it and its Autosaves.
let longest = { turn: 0, bytes: 0, times: [] as number[] };
for (let seed = 0; seed < seeds; seed += 1) {
  const storage = new MemoryStorage();
  const engine = await start(storage);
  await engine.session.campaign.create({ seed: `measure-${seed}` });
  const times: number[] = [];
  for (;;) {
    const state = engine.player.queries.getCurrentLiveWorldState();
    if (!state.ok || state.value.ending !== null || state.value.turn > MAX_TURNS) {
      break;
    }
    const began = performance.now();
    const engaged = await engine.session.autopilot.engage('basic', { kind: 'turnAdvancements', count: 1 });
    if (!engaged.ok) {
      throw new Error(engaged.error.message);
    }
    await engine.session.autopilot.whenDisengaged(engaged.value.engagementId);
    times.push(performance.now() - began);
  }
  const status = engine.session.getStatus();
  const turn = status.ok ? (status.value.turn ?? 0) : 0;
  if (turn > longest.turn) {
    longest = { turn, bytes: largestSave(storage), times };
  }
}
summary(
  `Longest of ${seeds} Campaigns of the Basic Autopilot AI (a whole Turn of play)`,
  longest.times,
  longest.bytes,
  longest.turn,
);

// A stress Campaign: a large roster, money added every Turn so that the Campaign does not end by money.
const storage = new MemoryStorage();
const engine = await start(storage);
await engine.session.campaign.create({ seed: 'measure-stress' });
engine.session.developer.enable();
await engine.developer.actions.addAgents(extraAgents);
const times: number[] = [];
for (let turn = 0; turn < stressTurns; turn += 1) {
  const state = engine.player.queries.getCurrentLiveWorldState();
  if (!state.ok || state.value.ending !== null) {
    break;
  }
  await engine.developer.actions.addMoney(100000);
  const ids = engine.player.queries.getAvailableActions();
  if (ids.ok && ids.value.agentsThatCanTakeOrders.length > 0) {
    await engine.player.actions.assignAgents(ids.value.agentsThatCanTakeOrders, 'Contracting');
  }
  const began = performance.now();
  const advanced = await engine.player.actions.advanceTurn();
  times.push(performance.now() - began);
  if (!advanced.ok) {
    throw new Error(advanced.error.message);
  }
}
const final = engine.session.getStatus();
summary(
  `Stress Campaign with ${extraAgents} added Agents (Advance turn alone)`,
  times,
  largestSave(storage),
  final.ok ? (final.value.turn ?? 0) : 0,
);
