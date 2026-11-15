/**
 * Entry point of the terminal CLI: `npm run cli -- [--json] [--data <dir>]`. It composes the engine with file
 * storage and the Autopilot AIs of the Game build, then executes one command per line of standard input.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { AUTOPILOT_AIS } from '../ai/index.ts';
import { createEngine } from '../engine/index.ts';
import { createCli } from './cli.ts';
import { FileStorage } from './file-storage.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const dataIndex = args.indexOf('--data');
  const dataDir = dataIndex >= 0 ? (args[dataIndex + 1] ?? '.data') : '.data';

  const engine = await createEngine(
    {
      storage: new FileStorage(dataDir),
      newId: () => randomUUID(),
      randomNumbers: (count) => Array.from({ length: count }, () => randomInt(0, 2 ** 32)),
      yieldToHost: () => new Promise((resolve) => setImmediate(resolve)),
    },
    { autopilotAis: [...AUTOPILOT_AIS] },
  );
  const cli = createCli(engine, { json, write: (text) => console.log(text) });

  const interactive = process.stdin.isTTY && !json;
  const lines = createInterface({ input: process.stdin, terminal: false });
  if (interactive) {
    console.log('game-v5-impl-web terminal. Type help for the commands, quit to leave.');
    process.stdout.write('> ');
  }
  for await (const line of lines) {
    const command = line.trim();
    if (command === 'quit' || command === 'exit') {
      break;
    }
    try {
      await cli.execute(command);
    } catch (error) {
      // Nothing the engine reports arrives here; this keeps the Session alive after an unexpected failure.
      const message = error instanceof Error ? error.message : 'Unexpected failure.';
      console.log(
        json
          ? JSON.stringify({ command, ok: false, error: { code: 'cli_failure', message } })
          : `error: ${message}`,
      );
    }
    if (interactive) {
      process.stdout.write('> ');
    }
  }
  lines.close();
}

await main();
