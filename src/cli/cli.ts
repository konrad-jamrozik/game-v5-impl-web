/**
 * The terminal adapter: one command per line over the engine API. It implements no gameplay rule: every figure it
 * prints comes from a query, and every command is one engine API operation; see ENG, API hierarchy.
 */
import type { AutopilotLimit, Engine, Result } from '../engine/index.ts';

export interface CliOutput {
  /** Whether to print each result as one line of JSON, for scripts and LLM players. */
  readonly json: boolean;
  write(text: string): void;
}

type Row = Record<string, string | number | boolean | null>;

function table(rows: readonly Row[]): string {
  const [first] = rows;
  if (first === undefined) {
    return '(none)';
  }
  const columns = Object.keys(first);
  const cell = (value: Row[string]) => (value === null ? '-' : String(value));
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => cell(row[column] ?? null).length)),
  );
  const line = (values: string[]) =>
    values.map((value, index) => value.padEnd(widths[index] ?? 0)).join('  ');
  return [
    line(columns),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map((row) => line(columns.map((column) => cell(row[column] ?? null)))),
  ].join('\n');
}

const HELP = `Commands
  Session    status | new [seed] | close | presets | preset <id> | edit <preset> <key> <value> | unedit <preset> <key>
             select <preset> | saves | load <saveId> | save | saveas | config | set <setting> <value> | reset <setting>
  Look       state | agents | leads | investigations | sites | missions | factions | upgrades
             report | history | retained | actions | gamedata | preview <site> <agent...>
  Act        assign <Standby|Contracting|Training> <agent...> | hire | dismiss <agent...> | buy <upgrade>
             investigate <lead> <agent...> | join <investigation> <agent...> | deploy <site> <agent...> | next
  Timeline   timeline | undo | redo | undoall | redoall | autosaves | back | forward
  Autopilot  ais | auto <ai> single | auto <ai> turn | auto <ai> turns <count>
  Developer  dev on | dev off | inspect | addmoney <amount> | addagents <count> | override <outcome> <value>
  Other      help | quit`;

function parseValue(text: string): string | number | boolean {
  if (text === 'true' || text === 'false') {
    return text === 'true';
  }
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

export function createCli(engine: Engine, out: CliOutput) {
  const { session, player, developer } = engine;

  /** Prints a result: as JSON, or through `show` for a person; a failure prints the engine's own message. */
  function print<T>(command: string, result: Result<T>, show: (value: T) => string): Result<T> {
    if (out.json) {
      out.write(JSON.stringify({ command, ...result }));
    } else if (result.ok) {
      const failures = result.autosaveFailures.map((failure) => `warning: ${failure.message}`);
      out.write([show(result.value), ...failures].filter((text) => text !== '').join('\n'));
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

  const done = (text: string) => () => text;
  const state = () => player.queries.getCurrentState();

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
        const shown =
          status.ok && !status.value.devMode
            ? { ...status, value: { ...status.value, campaignSeed: null } }
            : status;
        return print(command, shown, (s) =>
          s.hasCurrentCampaign
            ? `Campaign ${s.campaignId ?? ''} | Turn ${s.turn ?? 0}${s.devMode ? ` | seed "${s.campaignSeed ?? ''}"` : ''} | Dev mode ${s.devMode ? 'on' : 'off'}` +
              ` | save ${s.currentSaveId ?? '(none)'}${s.campaignEnded ? ' | ended' : ''}`
            : 'Main menu: no Current campaign.',
        );
      }
      case 'new':
        return print(
          command,
          await session.campaign.create(first === '' ? {} : { seed: args.join(' ') }),
          done('Campaign created.'),
        );
      case 'close':
        return print(command, await session.campaign.close(), done('Campaign closed.'));
      case 'presets':
        return print(command, session.newCampaignSetup.listPresets(), (rows) =>
          table(rows as unknown as Row[]),
        );
      case 'preset':
        return print(command, session.newCampaignSetup.getPreset(first), (rows) =>
          table(rows as unknown as Row[]),
        );
      case 'select':
        return print(
          command,
          session.newCampaignSetup.selectPreset(first),
          done(`Preset ${first} selected.`),
        );
      case 'edit':
        return print(
          command,
          session.newCampaignSetup.setPresetEdit(first, { key: rest[0] ?? '', value: Number(rest[1]) }),
          done('Preset edit set.'),
        );
      case 'unedit':
        return print(
          command,
          session.newCampaignSetup.removePresetEdit(first, rest[0] ?? ''),
          done('Preset edit removed.'),
        );
      case 'saves':
        return print(command, await session.saves.list(), (rows) => table(rows as unknown as Row[]));
      case 'load':
        return print(command, await session.saves.load(first), done('Campaign save loaded.'));
      case 'save':
        return print(command, await session.saves.save(), (v) => `Saved as ${v.saveId}.`);
      case 'saveas':
        return print(command, await session.saves.saveAsNew(), (v) => `Saved as ${v.saveId}.`);
      case 'config':
        return print(command, session.globalConfiguration.get(), (v) =>
          [table(v.settings as unknown as Row[]), ...v.problems].join('\n'),
        );
      case 'set':
        return print(
          command,
          await session.globalConfiguration.set(first, parseValue(rest[0] ?? '')),
          done('Setting stored.'),
        );
      case 'reset':
        return print(command, await session.globalConfiguration.reset(first), done('Setting reset.'));

      case 'state':
        return print(command, state(), (v) =>
          [
            `Turn ${v.turn} | money ${v.agency.money} | funding ${v.agency.funding}` +
              ` | income ${v.agency.projectedIncome} | upkeep ${v.agency.projectedUpkeep} | Panic ${v.panic}% of ${v.panicLimit}%`,
            `Agents ${v.agency.servingAgents}/${v.agency.agentCap} | deployed ${v.agency.deployedAgents}/${v.agency.transportCap}` +
              ` | training ${v.agency.trainingAgents}/${v.agency.trainingCap}`,
            v.ending === null
              ? ''
              : `Campaign ending: ${v.ending.ending} (${v.ending.reasons.join(', ')}) in Turn ${v.ending.turn}`,
          ]
            .filter((text) => text !== '')
            .join('\n'),
        );
      case 'agents':
        return print(command, state(), (v) =>
          table(
            v.agents.map((a) => ({
              id: a.id,
              skill: a.skill,
              effective: a.effectiveSkill,
              health: `${a.currentHealth}/${a.baseHealth}`,
              exhaustion: a.exhaustion,
              damage: a.weaponDamage,
              assignment:
                a.assignment === null
                  ? null
                  : a.assignment.kind === 'Investigation'
                    ? `Investigation ${a.assignment.investigation}`
                    : a.assignment.kind === 'Deployed'
                      ? `Deployed ${a.assignment.mission}`
                      : a.assignment.kind,
              phase: a.taskPhase === 'InTransit' ? 'In transit' : 'At assignment',
              orderable: a.canBeOrdered,
              recovery: a.recoveryTurnsRemaining,
            })),
          ),
        );
      case 'leads':
        return print(command, state(), (v) =>
          table(
            v.leads.map((l) => ({
              id: l.id,
              name: l.name,
              difficulty: l.difficulty,
              available: l.available,
              blocking: l.blockingConditions.join(',') || null,
              investigable: l.canBeInvestigatedNow,
              investigation: l.activeInvestigation,
              wins: l.recordedWins.length,
              creates: l.createsMissionSite,
            })),
          ),
        );
      case 'investigations':
        return print(command, state(), (v) =>
          table(
            v.investigations.map((i) => ({
              id: i.id,
              lead: i.lead,
              progress: `${i.progress}/${i.progressForCertainCompletion}`,
              completion:
                i.projectedCompletionProbability === null
                  ? null
                  : `${i.projectedCompletionProbability.n}/${i.projectedCompletionProbability.d}`,
              team: i.currentTeam.map((m) => m.agent).join(' '),
            })),
          ),
        );
      case 'sites':
        return print(command, state(), (v) =>
          table(
            v.missionSites.map((s) => ({
              id: s.id,
              name: s.name,
              kind: s.kind,
              state: s.lifecycle,
              expires: s.turnsUntilExpiry,
              enemies: s.enemies.length,
              rating: s.enemiesCombatRating,
              reward:
                `money ${s.rewards.money}, funding ${s.rewards.fundingChange}, panic -${s.rewards.panicReduction}` +
                (s.rewards.defeatsTargetFaction ? ', defeats Faction' : ''),
              penalty: `panic +${s.penalties.panicIncrease}, funding ${s.penalties.fundingChange}`,
              mission: s.mission,
            })),
          ),
        );
      case 'missions':
        return print(command, state(), (v) =>
          table(
            v.missions.map((m) => ({
              id: m.id,
              site: m.missionSite,
              kind: m.kind,
              state: m.lifecycle,
              team: m.currentTeam.join(' '),
            })),
          ),
        );
      case 'factions':
        return print(command, state(), (v) =>
          table(
            v.factions.map((f) => ({
              id: f.id,
              name: f.name,
              activity: f.activityLevel.name,
              next: f.activityLevel.next,
              defeated: f.defeated,
              defeatedTurn: f.defeatedTurn,
            })),
          ),
        );
      case 'upgrades':
        return print(command, state(), (v) => table(v.agency.upgrades as unknown as Row[]));
      case 'report':
        return print(command, player.queries.getTurnReport(), (r) =>
          r === null
            ? 'No Turn report yet.'
            : [
                `Turn ${r.turn}: income ${r.income.income}, upkeep ${r.upkeep.upkeep}, money ${r.money.turnEnd} -> ${r.money.after},` +
                  ` Panic ${r.panic.before} -> ${r.panic.after}, funding ${r.funding.before} -> ${r.funding.after}`,
                ...r.investigations.map(
                  (i) =>
                    `Investigation ${i.investigation}: +${i.progressGain} = ${i.progressAfter}${i.completed ? `, completed, created ${i.createdMissionSite ?? 'nothing'}` : ''}`,
                ),
                ...r.missions.map(
                  (m, index) =>
                    `Mission ${m.mission} at ${m.missionSite}: ${m.result} (${r.combatReports[index]?.outcome ?? '-'}, ` +
                    `${r.combatReports[index]?.rounds ?? 0} rounds), killed ${m.killed.length}, to Recovery ${m.toRecovery.length}`,
                ),
                ...r.expiredMissionSites.map(
                  (s) => `Mission site ${s.missionSite} expired: Panic +${s.consequence.panicIncrease}`,
                ),
                ...r.cancelledMissionSites.map((s) => `Mission site ${s} cancelled`),
                ...r.factionActivity.map(
                  (f) =>
                    `Faction ${f.faction}:${f.escalatedTo ? ` escalated to ${f.escalatedTo}` : ''}${f.createdMissionSite ? ` created ${f.createdMissionSite}` : ''}`,
                ),
                r.ending === null ? '' : `Campaign ending: ${r.ending.ending}`,
              ]
                .filter((text) => text !== '')
                .join('\n'),
        );
      case 'history':
        return print(command, player.queries.getHistory(), (h) =>
          table(
            h.entries.map((e) => ({
              turn: e.turn,
              moneyStart: e.turnStart.money,
              moneyEnd: e.turnEnd.money,
              panic: e.report.panicAfter,
              missions: e.report.missions.map((m) => m.result).join(' ') || null,
              expired: e.report.expiredMissionSites.length,
            })),
          ),
        );
      case 'retained':
        return print(command, player.queries.getHistory(), (h) =>
          [
            `Agents: ${h.retained.agents.map((a) => `${a.id} ${a.lifecycle}`).join(', ') || '(none)'}`,
            `Missions: ${h.retained.missions.map((m) => `${m.id} ${m.lifecycle}`).join(', ') || '(none)'}`,
            `Mission sites: ${h.retained.missionSites.map((s) => `${s.id} ${s.lifecycle}`).join(', ') || '(none)'}`,
            `Investigations: ${h.retained.investigations.map((i) => `${i.id} ${i.lifecycle}`).join(', ') || '(none)'}`,
          ].join('\n'),
        );
      case 'actions':
        return print(command, player.queries.getAvailableActions(), (a) => JSON.stringify(a, null, 2));
      case 'gamedata':
        return print(command, player.queries.getGameData(), (g) => JSON.stringify(g, null, 2));
      case 'preview':
        return print(
          command,
          player.queries.previewDeployment(first, rest),
          (p) =>
            `Team Combat rating ${p.teamCombatRating} against ${p.enemiesCombatRating ?? '-'}; ` +
            (p.accepted ? 'deployAgents would be accepted.' : `rejected: ${p.message ?? ''}`),
        );

      case 'assign':
        return print(
          command,
          await player.actions.assignAgents(rest, first as 'Standby'),
          done('Agents ordered.'),
        );
      case 'hire':
        return print(command, await player.actions.hireAgent(), done('Agent hired.'));
      case 'dismiss':
        return print(command, await player.actions.dismissAgents(args), done('Agents dismissed.'));
      case 'buy':
        return print(command, await player.actions.purchaseUpgrade(first), done('Upgrade purchased.'));
      case 'investigate':
        return print(
          command,
          await player.actions.startInvestigation(first, rest),
          done('Investigation started.'),
        );
      case 'join':
        return print(
          command,
          await player.actions.assignAgentsToInvestigation(first, rest),
          done('Agents added.'),
        );
      case 'deploy':
        return print(command, await player.actions.deployAgents(first, rest), done('Agents deployed.'));
      case 'next':
        return print(command, await player.actions.advanceTurn(), done('Turn advanced.'));

      case 'timeline':
        return print(
          command,
          session.timeline.getStatus(),
          (t) => `${t.timelineEntries} Timeline entries, ${t.undoneActions} Undone actions.`,
        );
      case 'undo':
        return print(command, await session.timeline.undoAction(), done('Action undone.'));
      case 'redo':
        return print(command, await session.timeline.redoAction(), done('Action redone.'));
      case 'undoall':
        return print(command, await session.timeline.undoAllActions(), done('All actions undone.'));
      case 'redoall':
        return print(command, await session.timeline.redoAllActions(), done('All actions redone.'));
      case 'autosaves':
        return print(
          command,
          await session.timeline.getAutosaveStatus(),
          (s) =>
            `back: ${s.undoToAutosave ? `${s.undoToAutosave.autosaveKind} of Turn ${s.undoToAutosave.turn}` : 'unavailable'} | ` +
            `forward: ${s.redoToAutosave ? `${s.redoToAutosave.autosaveKind} of Turn ${s.redoToAutosave.turn}` : 'unavailable'}`,
        );
      case 'back':
        return print(
          command,
          await session.timeline.undoToAutosave(),
          (t) => `Loaded the ${t.autosaveKind} Autosave of Turn ${t.turn}.`,
        );
      case 'forward':
        return print(
          command,
          await session.timeline.redoToAutosave(),
          (t) => `Loaded the ${t.autosaveKind} Autosave of Turn ${t.turn}.`,
        );

      case 'ais':
        return print(command, session.autopilot.listAutopilotAis(), (rows) =>
          table(rows as unknown as Row[]),
        );
      case 'auto': {
        const limit: AutopilotLimit | null =
          rest[0] === 'single'
            ? { kind: 'singleAction' }
            : rest[0] === 'turn'
              ? { kind: 'untilTurnAdvanced' }
              : rest[0] === 'turns'
                ? { kind: 'turnAdvancements', count: Number(rest[1]) }
                : null;
        if (limit === null) {
          return usage(command, 'usage: auto <ai> single | auto <ai> turn | auto <ai> turns <count>');
        }
        const engaged = await session.autopilot.engage(first, limit);
        if (!engaged.ok) {
          return print(command, engaged, done(''));
        }
        return print(
          command,
          await session.autopilot.whenDisengaged(engaged.value.engagementId),
          (r) =>
            `Autopilot disengaged: ${r.reason}; ${r.progress.playerActions} Player actions, ${r.progress.turnAdvancements} turn advancements.`,
        );
      }

      case 'dev':
        if (first !== 'on' && first !== 'off') {
          return usage(command, 'usage: dev on | dev off');
        }
        return print(
          command,
          first === 'on' ? session.developer.enable() : session.developer.disable(),
          done(`Dev mode ${first}.`),
        );
      case 'inspect':
        return print(command, developer.queries.getCampaignState(), (v) => JSON.stringify(v, null, 2));
      case 'addmoney':
        return print(command, await developer.actions.addMoney(Number(first)), done('Money added.'));
      case 'addagents':
        return print(command, await developer.actions.addAgents(Number(first)), done('Agents added.'));
      case 'override':
        return print(
          command,
          await developer.actions.overrideRandomOutcome(first, parseValue(rest[0] ?? '')),
          done('Override set.'),
        );
      default:
        return usage(command, `Unknown command "${command}". Type help.`);
    }
  }

  return { execute };
}
