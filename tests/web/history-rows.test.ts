/** HVIEW, Turn by Turn table: the current Turn's row from the Open History entry, on top of the ended Turns. */
import { describe, expect, it } from 'vite-plus/test';
import type { Engine } from '../../src/engine/index.ts';
import { historyRows } from '../../src/web/history-rows.ts';
import { ok, startEngine } from '../helpers/engine.ts';

function rowsOf(engine: Engine) {
  return historyRows({
    state: ok(engine.player.queries.getCurrentLiveWorldState()),
    history: ok(engine.player.queries.getHistory()),
  });
}

describe('HVIEW: the current Turn row', () => {
  it('is the only row before the first Advance turn, follows undo and redo, and sits on top afterwards', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'history rows' }));
    const start = ok(engine.player.queries.getCurrentLiveWorldState());
    let rows = rowsOf(engine);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      turn: 1,
      now: true,
      moneyStart: start.agency.money,
      moneyEnd: start.agency.money,
      income: start.agency.projectedIncome,
      upkeep: start.agency.projectedUpkeep,
      panic: start.panicHundredths,
      agents: start.agency.servingAgents,
      actions: [],
      entry: null,
    });

    ok(await engine.player.actions.hireAgent());
    const hired = ok(engine.player.queries.getCurrentLiveWorldState());
    rows = rowsOf(engine);
    expect(rows[0]).toMatchObject({
      now: true,
      moneyEnd: hired.agency.money,
      upkeep: hired.agency.projectedUpkeep,
      agents: start.agency.servingAgents + 1,
    });
    expect(rows[0]!.actions).toHaveLength(1);

    ok(await engine.session.timeline.undoAction());
    expect(rowsOf(engine)[0]).toMatchObject({ actions: [], agents: start.agency.servingAgents });
    ok(await engine.session.timeline.redoAction());
    expect(rowsOf(engine)[0]!.actions).toHaveLength(1);

    ok(await engine.player.actions.advanceTurn());
    rows = rowsOf(engine);
    expect(rows.map((row) => [row.turn, row.now])).toEqual([
      [2, true],
      [1, false],
    ]);
    expect(rows[1]).toMatchObject({ moneyEnd: hired.agency.money, agents: start.agency.servingAgents + 1 });
    expect(rows[1]!.actions).toHaveLength(1);
    expect(rows[0]!.actions).toEqual([]);
  });

  it('is left out once the Campaign has a Campaign ending', async () => {
    const { engine } = await startEngine();
    ok(await engine.session.campaign.create({ seed: 'idle' }));
    while (ok(engine.player.queries.getCurrentLiveWorldState()).ending === null) {
      ok(await engine.player.actions.advanceTurn());
    }
    const rows = rowsOf(engine);
    expect(rows.some((row) => row.now)).toBe(false);
    expect(rows).toHaveLength(ok(engine.player.queries.getHistory()).entries.length);
  });
});
