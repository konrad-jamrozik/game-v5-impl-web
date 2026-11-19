/**
 * The terminal adapter: one command per line over the engine API. It implements no gameplay rule: every figure it
 * prints comes from a query, and every command is one engine API operation; see ENG, API hierarchy, and CLI, Reach of
 * the CLI. Each result is printed in one of the two Output forms of CLI, readable text or one line of JSON, and both
 * carry the whole value the operation returned; see DEC-027.
 */
import type { AutopilotLimit, Engine, Result } from '../engine/index.ts';

export interface CliOutput {
  /** Whether to print each result as one line of JSON, for scripts and LLM players. */
  readonly json: boolean;
  write(text: string): void;
}

type Scalar = string | number | boolean | null | undefined;

function isScalar(value: unknown): value is Scalar {
  return value === null || value === undefined || typeof value !== 'object';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarText(value: Scalar): string {
  return value === null || value === undefined ? '-' : String(value);
}

/** A table of rows whose every value is a scalar, with one column for every key any row has. */
function table(rows: readonly Record<string, Scalar>[]): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => scalarText(row[column]).length)),
  );
  const line = (values: string[]) =>
    values
      .map((value, index) => value.padEnd(widths[index] ?? 0))
      .join('  ')
      .trimEnd();
  return [
    line(columns),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map((row) => line(columns.map((column) => scalarText(row[column])))),
  ].join('\n');
}

/**
 * The readable form of a value: every scalar, every key, and every list item it holds, so that it carries exactly what
 * its structured form carries. A list of flat records becomes a table.
 */
export function readable(value: unknown, indent = ''): string {
  if (isScalar(value)) {
    return indent + scalarText(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}(none)`;
    }
    if (value.every((item) => isRecord(item) && Object.values(item).every(isScalar))) {
      return table(value as Record<string, Scalar>[])
        .split('\n')
        .map((text) => indent + text)
        .join('\n');
    }
    return value
      .map((item) =>
        isScalar(item) ? `${indent}- ${scalarText(item)}` : `${indent}-\n${readable(item, `${indent}  `)}`,
      )
      .join('\n');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return `${indent}(empty)`;
  }
  return entries
    .map(([key, item]) =>
      isScalar(item)
        ? `${indent}${key}: ${scalarText(item)}`
        : `${indent}${key}:\n${readable(item, `${indent}  `)}`,
    )
    .join('\n');
}

const HELP = `Commands
  Session    status | new [seed] | close | presets | preset <id> | setup | select <preset>
             edit <preset> <key> <value> | unedit <preset> <key> | adjust [<key> <value>]...
             saves | load <saveId> | save | delete <saveId> | deletecampaign <campaignId>
             config | set <setting> <value> | reset <setting>
  Look       state | agents | leads | investigations | sites | missions | factions | upgrades
             report | history | retained | actions | gamedata | articles | preview <site> <agent...>
  Act        assign <Standby|Contracting|Training> <agent...> | hire | dismiss <agent...> | buy <upgrade>
             investigate <lead> <agent...> | join <investigation> <agent...> | deploy <site> <agent...> | next
  Timeline   timeline | undo | redo | undoall | redoall | autosaves | back | forward
  Autopilot  ais | auto <ai> <limit> | engage <ai> <limit> | autostatus <engagement> | disengage <engagement>
             wait <engagement>; <limit> is single (one action), turn (this Turn's actions), or turns <count>;
             auto engages and waits
  Developer  dev on | dev off | inspect | addmoney <amount> | addagents <count> | override <outcome> <value>
  Other      help | quit
Each command prints the whole result of its operation; --json prints it as one line of JSON. The commands agents,
leads, investigations, sites, missions, factions, and upgrades print that part of state; retained that part of history.`;

function parseValue(text: string): string | number | boolean {
  if (text === 'true' || text === 'false') {
    return text === 'true';
  }
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

function parseLimit(words: readonly string[]): AutopilotLimit | null {
  switch (words[0]) {
    case 'single':
      return { kind: 'singleAction' };
    case 'turn':
      return { kind: 'turnActions' };
    case 'turns':
      return { kind: 'turnAdvancements', count: Number(words[1]) };
    default:
      return null;
  }
}

/** One part of a successful result, e.g. the Agents of the current state; a failure stays as it is. */
function part<T, P>(result: Result<T>, pick: (value: T) => P): Result<P> {
  return result.ok ? { ...result, value: pick(result.value) } : result;
}

export function createCli(engine: Engine, out: CliOutput) {
  const { session, player, developer } = engine;

  /** Prints a result in the chosen Output form; a failure prints the engine's own code and message. */
  function print<T>(command: string, result: Result<T>): Result<T> {
    if (out.json) {
      out.write(JSON.stringify({ command, ...result }));
    } else if (result.ok) {
      const failures = result.autosaveFailures.map((failure) => `warning: ${failure.message}`);
      out.write([result.value === null ? 'ok' : readable(result.value), ...failures].join('\n'));
    } else {
      out.write(`error (${result.error.code}): ${result.error.message}`);
    }
    return result;
  }

  /** Reports a command the CLI cannot turn into an engine API operation. */
  function usage(command: string, message: string): null {
    out.write(
      out.json
        ? JSON.stringify({ command, ok: false, error: { code: 'invalid_command', message } })
        : message,
    );
    return null;
  }

  const state = () => player.queries.getCurrentState();
  const autopilotUsage = (command: string) =>
    usage(command, `usage: ${command} <ai> single | ${command} <ai> turn | ${command} <ai> turns <count>`);

  async function execute(line: string): Promise<Result<unknown> | null> {
    const [command = '', ...args] = line.trim().split(/\s+/);
    const rest = args.slice(1);
    const first = args[0] ?? '';
    switch (command) {
      case '':
        return null;
      case 'help':
        out.write(out.json ? JSON.stringify({ command, ok: true, value: HELP }) : HELP);
        return null;
      case 'status': {
        // The Campaign seed is a hidden value: the CLI shows it only while Dev mode is enabled.
        const status = session.getStatus();
        return print(
          command,
          status.ok && !status.value.devMode
            ? part(status, (value) => ({ ...value, campaignSeed: null }))
            : status,
        );
      }
      case 'new':
        return print(command, await session.campaign.create(first === '' ? {} : { seed: args.join(' ') }));
      case 'close':
        return print(command, await session.campaign.close());
      case 'presets':
        return print(command, session.newCampaignSetup.listPresets());
      case 'preset':
        return print(command, session.newCampaignSetup.getPreset(first));
      case 'setup':
        return print(command, session.newCampaignSetup.getSetup());
      case 'select':
        return print(command, session.newCampaignSetup.selectPreset(first));
      case 'edit':
        return print(
          command,
          session.newCampaignSetup.setPresetEdit(first, { key: rest[0] ?? '', value: Number(rest[1]) }),
        );
      case 'unedit':
        return print(command, session.newCampaignSetup.removePresetEdit(first, rest[0] ?? ''));
      case 'adjust': {
        // `adjust <key> <value> ...`: session.campaignConfiguration.set with every named value at once.
        const words = args.filter((word) => word !== '');
        if (words.length % 2 !== 0) {
          return usage(command, 'usage: adjust [<key> <value>]...');
        }
        const values: Record<string, number> = {};
        for (let i = 0; i < words.length; i += 2) {
          values[words[i] ?? ''] = Number(words[i + 1]);
        }
        return print(command, await session.campaignConfiguration.set(values));
      }
      case 'saves':
        return print(command, await session.saves.list());
      case 'load':
        return print(command, await session.saves.load(first));
      case 'save':
        return print(command, await session.saves.save());
      case 'delete':
        return print(command, await session.saves.delete(first));
      case 'deletecampaign':
        return print(command, await session.saves.deleteCampaign(first));
      case 'config':
        return print(command, session.globalConfiguration.get());
      case 'set':
        return print(command, await session.globalConfiguration.set(first, parseValue(rest[0] ?? '')));
      case 'reset':
        return print(command, await session.globalConfiguration.reset(first));

      case 'state':
        return print(command, state());
      case 'agents':
        return print(
          command,
          part(state(), (v) => v.agents),
        );
      case 'leads':
        return print(
          command,
          part(state(), (v) => v.leads),
        );
      case 'investigations':
        return print(
          command,
          part(state(), (v) => v.investigations),
        );
      case 'sites':
        return print(
          command,
          part(state(), (v) => v.missionSites),
        );
      case 'missions':
        return print(
          command,
          part(state(), (v) => v.missions),
        );
      case 'factions':
        return print(
          command,
          part(state(), (v) => v.factions),
        );
      case 'upgrades':
        return print(
          command,
          part(state(), (v) => v.agency.upgrades),
        );
      case 'report':
        return print(command, player.queries.getTurnReport());
      case 'history':
        return print(command, player.queries.getHistory());
      case 'retained':
        return print(
          command,
          part(player.queries.getHistory(), (h) => h.retained),
        );
      case 'actions':
        return print(command, player.queries.getAvailableActions());
      case 'gamedata':
        return print(command, player.queries.getGameData());
      case 'articles':
        return print(command, player.queries.getEncyclopediaArticles());
      case 'preview':
        return print(command, player.queries.previewDeployment(first, rest));

      case 'assign':
        return print(command, await player.actions.assignAgents(rest, first as 'Standby'));
      case 'hire':
        return print(command, await player.actions.hireAgent());
      case 'dismiss':
        return print(command, await player.actions.dismissAgents(args));
      case 'buy':
        return print(command, await player.actions.purchaseUpgrade(first));
      case 'investigate':
        return print(command, await player.actions.startInvestigation(first, rest));
      case 'join':
        return print(command, await player.actions.assignAgentsToInvestigation(first, rest));
      case 'deploy':
        return print(command, await player.actions.deployAgents(first, rest));
      case 'next':
        return print(command, await player.actions.advanceTurn());

      case 'timeline':
        return print(command, session.timeline.getStatus());
      case 'undo':
        return print(command, await session.timeline.undoAction());
      case 'redo':
        return print(command, await session.timeline.redoAction());
      case 'undoall':
        return print(command, await session.timeline.undoAllActions());
      case 'redoall':
        return print(command, await session.timeline.redoAllActions());
      case 'autosaves':
        return print(command, await session.timeline.getAutosaveStatus());
      case 'back':
        return print(command, await session.timeline.undoToAutosave());
      case 'forward':
        return print(command, await session.timeline.redoToAutosave());

      case 'ais':
        return print(command, session.autopilot.listAutopilotAis());
      case 'engage': {
        const limit = parseLimit(rest);
        return limit === null
          ? autopilotUsage(command)
          : print(command, await session.autopilot.engage(first, limit));
      }
      case 'auto': {
        const limit = parseLimit(rest);
        if (limit === null) {
          return autopilotUsage(command);
        }
        const engaged = await session.autopilot.engage(first, limit);
        if (!engaged.ok) {
          return print(command, engaged);
        }
        return print(command, await session.autopilot.whenDisengaged(engaged.value.engagementId));
      }
      case 'autostatus':
        return print(command, session.autopilot.getStatus(first));
      case 'disengage':
        return print(command, await session.autopilot.disengage(first));
      case 'wait':
        return print(command, await session.autopilot.whenDisengaged(first));

      case 'dev':
        if (first !== 'on' && first !== 'off') {
          return usage(command, 'usage: dev on | dev off');
        }
        return print(command, first === 'on' ? session.developer.enable() : session.developer.disable());
      case 'inspect':
        return print(command, developer.queries.getCampaignState());
      case 'addmoney':
        return print(command, await developer.actions.addMoney(Number(first)));
      case 'addagents':
        return print(command, await developer.actions.addAgents(Number(first)));
      case 'override':
        return print(
          command,
          await developer.actions.overrideRandomOutcome(first, parseValue(rest[0] ?? '')),
        );
      default:
        return usage(command, `Unknown command "${command}". Type help.`);
    }
  }

  return { execute };
}
