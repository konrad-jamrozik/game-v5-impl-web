import { EngineDefect, detach } from '../../kernel/index.ts';
import { isRejection, type Rejection } from '../result.ts';
import type { ActionRecord, GameRules, ShellState } from '../rules.ts';

/** The Autopilot memory of a Campaign at one Committed state, with the Autopilot AI that wrote it. */
export interface MemoryValue {
  readonly autopilotAiId: string;
  readonly memory: unknown;
}

/** Autopilot memory written at one Committed state of the current Turn. */
export interface MemoryWrite extends MemoryValue {
  /** How many Timeline entries were not Undone actions at the Committed state it was written at. */
  readonly position: number;
}

/**
 * One Campaign as a Session holds it: its Campaign ID, the Timeline of the current Turn, the Autopilot memory, and
 * the stamps that order its Committed states on the line of play; see TIMELINE and DEC-010.
 *
 * `states[i]` is the Committed state after `i` Timeline entries, and `states[0]` is the Turn-start state. The
 * Campaign state is `states[position]`, and the Timeline entries from `position` on are the Undone actions.
 */
export interface CampaignRuntime<S extends ShellState> {
  readonly campaignId: string;
  /** The stamps of every Committed state of earlier Turns on this line of play, in order. */
  pastStamps: string[];
  states: S[];
  entries: ActionRecord[];
  /** `stamps[i]` identifies `states[i]`. */
  stamps: string[];
  position: number;
  /** The Autopilot memory at the Turn-start state, or null when there is none. */
  memoryBase: MemoryValue | null;
  memoryWrites: MemoryWrite[];
}

export function newCampaignRuntime<S extends ShellState>(
  campaignId: string,
  initial: S,
  stamp: string,
): CampaignRuntime<S> {
  return {
    campaignId,
    pastStamps: [],
    states: [initial],
    entries: [],
    stamps: [stamp],
    position: 0,
    memoryBase: null,
    memoryWrites: [],
  };
}

export function currentState<S extends ShellState>(campaign: CampaignRuntime<S>): S {
  const state = campaign.states[campaign.position];
  if (state === undefined) {
    throw new EngineDefect('The Timeline has no Committed state at its position');
  }
  return state;
}

export function currentStamp<S extends ShellState>(campaign: CampaignRuntime<S>): string {
  const stamp = campaign.stamps[campaign.position];
  if (stamp === undefined) {
    throw new EngineDefect('The Timeline has no stamp at its position');
  }
  return stamp;
}

/** The stamps of every Committed state from creation up to and including the current one. */
export function ancestorStamps<S extends ShellState>(campaign: CampaignRuntime<S>): string[] {
  return [...campaign.pastStamps, ...campaign.stamps.slice(0, campaign.position + 1)];
}

export function undoneCount<S extends ShellState>(campaign: CampaignRuntime<S>): number {
  return campaign.entries.length - campaign.position;
}

/** Discards every Undone action, with the Autopilot memory written at the discarded Committed states. */
function discardUndone<S extends ShellState>(campaign: CampaignRuntime<S>): void {
  campaign.entries.length = campaign.position;
  campaign.states.length = campaign.position + 1;
  campaign.stamps.length = campaign.position + 1;
  campaign.memoryWrites = campaign.memoryWrites.filter((write) => write.position <= campaign.position);
}

/** Records one committed action other than Advance turn as a Timeline entry. */
export function commitEntry<S extends ShellState>(
  campaign: CampaignRuntime<S>,
  record: ActionRecord,
  next: S,
  stamp: string,
): void {
  discardUndone(campaign);
  campaign.entries.push(record);
  campaign.states.push(next);
  campaign.stamps.push(stamp);
  campaign.position += 1;
}

/** Ends the current Turn: discards its Timeline and starts the Timeline of the next Turn. */
export function commitAdvanceTurn<S extends ShellState>(
  campaign: CampaignRuntime<S>,
  next: S,
  stamp: string,
): void {
  discardUndone(campaign);
  const memory = readMemory(campaign);
  campaign.pastStamps = [...campaign.pastStamps, ...campaign.stamps];
  campaign.states = [next];
  campaign.entries = [];
  campaign.stamps = [stamp];
  campaign.position = 0;
  campaign.memoryBase = memory;
  campaign.memoryWrites = [];
}

/** The Autopilot memory most recently written at or before the current Committed state. */
export function readMemory<S extends ShellState>(campaign: CampaignRuntime<S>): MemoryValue | null {
  let found: MemoryValue | null = campaign.memoryBase;
  let foundPosition = -1;
  for (const write of campaign.memoryWrites) {
    if (write.position <= campaign.position && write.position >= foundPosition) {
      found = { autopilotAiId: write.autopilotAiId, memory: write.memory };
      foundPosition = write.position;
    }
  }
  return found;
}

/** Replaces the Autopilot memory at the current Committed state. */
export function writeMemory<S extends ShellState>(
  campaign: CampaignRuntime<S>,
  autopilotAiId: string,
  memory: unknown,
): void {
  campaign.memoryWrites = campaign.memoryWrites.filter((write) => write.position !== campaign.position);
  campaign.memoryWrites.push({ position: campaign.position, autopilotAiId, memory: detach(memory) });
}

/** Discards the Autopilot memory at every Committed state the Timeline can restore. */
export function discardMemory<S extends ShellState>(campaign: CampaignRuntime<S>): void {
  campaign.memoryBase = null;
  campaign.memoryWrites = [];
}

/** What a Campaign save holds of a Campaign besides its identifiers; see SAVES, Campaign save contents. */
export interface SavedCampaign<S extends ShellState> {
  readonly pastStamps: readonly string[];
  readonly turnStart: S;
  readonly entries: readonly ActionRecord[];
  readonly stamps: readonly string[];
  /** The number of Timeline entries that are not Undone actions. */
  readonly position: number;
  readonly memoryBase: MemoryValue | null;
  readonly memoryWrites: readonly MemoryWrite[];
}

export function toSaved<S extends ShellState>(campaign: CampaignRuntime<S>): SavedCampaign<S> {
  const turnStart = campaign.states[0];
  if (turnStart === undefined) {
    throw new EngineDefect('The Timeline has no Turn-start state');
  }
  return {
    pastStamps: campaign.pastStamps,
    turnStart,
    entries: [...campaign.entries],
    stamps: [...campaign.stamps],
    position: campaign.position,
    memoryBase: campaign.memoryBase,
    memoryWrites: [...campaign.memoryWrites],
  };
}

/**
 * Rebuilds a Campaign from what a Campaign save holds, by committing its Timeline entries again from the Turn-start
 * state. Returns a rejection when an entry cannot be committed again, which means the Campaign save is not valid.
 */
export function fromSaved<S extends ShellState>(
  campaignId: string,
  saved: SavedCampaign<S>,
  rules: GameRules<S>,
): CampaignRuntime<S> | Rejection {
  const states: S[] = [saved.turnStart];
  let state = saved.turnStart;
  for (const record of saved.entries) {
    const next = rules.applyAction(state, record);
    if (isRejection(next)) {
      return next;
    }
    states.push(next);
    state = next;
  }
  return {
    campaignId,
    pastStamps: [...saved.pastStamps],
    states,
    entries: [...saved.entries],
    stamps: [...saved.stamps],
    position: saved.position,
    memoryBase: saved.memoryBase,
    memoryWrites: [...saved.memoryWrites],
  };
}
