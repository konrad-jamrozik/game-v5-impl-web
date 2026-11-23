import { EngineDefect } from '../../kernel/index.ts';
import { isRejection, type Rejection } from '../result.ts';
import type { ActionRecord, GameRules, ShellState } from '../rules.ts';

/**
 * One Campaign as a Session holds it: its Campaign ID, the Timeline of the current Turn with its Timeline pointer,
 * and the stamps that order its World states on the line of play; see TIMELINE. A stamp for each World state,
 * unlike a comparison of Turn numbers and action counts, tells lines of play apart exactly, also after a Campaign
 * save of another line of play is loaded, and costs a few bytes for each Player action.
 *
 * `states[i]` is the World state after `i` Timeline entries, and `states[0]` is the Turn-start state. The
 * Timeline pointer is `position`: the Current world state is `states[position]`, and the Timeline entries from
 * `position` on are the Undone actions.
 *
 * `configuration` is the Campaign configuration in force. Each World state holds the Campaign configuration it
 * was produced under, which a later change never rewrites; see CONFIG, Changing Campaign configuration during play.
 */
export interface CampaignRuntime<S extends ShellState> {
  readonly campaignId: string;
  /** The stamps of every World state of earlier Turns on this line of play, in order. */
  pastStamps: string[];
  states: S[];
  entries: ActionRecord[];
  /** `stamps[i]` identifies `states[i]`. */
  stamps: string[];
  position: number;
  configuration: Readonly<Record<string, number>>;
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
    configuration: initial.configuration,
  };
}

export function currentState<S extends ShellState>(campaign: CampaignRuntime<S>): S {
  const state = campaign.states[campaign.position];
  if (state === undefined) {
    throw new EngineDefect('The Timeline has no World state at its position');
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

/** The stamps of every World state from creation up to and including the current one. */
export function ancestorStamps<S extends ShellState>(campaign: CampaignRuntime<S>): string[] {
  return [...campaign.pastStamps, ...campaign.stamps.slice(0, campaign.position + 1)];
}

export function undoneCount<S extends ShellState>(campaign: CampaignRuntime<S>): number {
  return campaign.entries.length - campaign.position;
}

/** Removes every Undone action for good. */
function discardUndone<S extends ShellState>(campaign: CampaignRuntime<S>): void {
  campaign.entries.length = campaign.position;
  campaign.states.length = campaign.position + 1;
  campaign.stamps.length = campaign.position + 1;
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
  campaign.pastStamps = [...campaign.pastStamps, ...campaign.stamps];
  campaign.states = [next];
  campaign.entries = [];
  campaign.stamps = [stamp];
  campaign.position = 0;
}

/** What a Campaign save holds of a Campaign besides its identifiers; see SAVES, Campaign save contents. */
export interface SavedCampaign<S extends ShellState> {
  readonly pastStamps: readonly string[];
  readonly turnStart: S;
  readonly entries: readonly ActionRecord[];
  readonly stamps: readonly string[];
  /** The Timeline pointer: the number of Timeline entries that are not Undone actions. */
  readonly position: number;
  /**
   * The Campaign configuration in force; absent in a Campaign save written before it was kept, whose Campaign
   * configuration is then that of its saved World state.
   */
  readonly configuration?: Readonly<Record<string, number>>;
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
    configuration: campaign.configuration,
  };
}

/**
 * Rebuilds a Campaign from what a Campaign save holds, by committing its Timeline entries again from the Turn-start
 * state, each under the Campaign configuration it was first committed under. Returns a rejection when an entry cannot
 * be committed again, which means the Campaign save is not valid.
 */
export function fromSaved<S extends ShellState>(
  campaignId: string,
  saved: SavedCampaign<S>,
  rules: GameRules<S>,
): CampaignRuntime<S> | Rejection {
  const states: S[] = [saved.turnStart];
  let state = saved.turnStart;
  for (const record of saved.entries) {
    const base =
      record.configuration === undefined ? state : rules.withConfiguration(state, record.configuration);
    const next = rules.applyAction(base, record);
    if (isRejection(next)) {
      return next;
    }
    states.push(next);
    state = next;
  }
  const current = states[saved.position];
  if (current === undefined) {
    throw new EngineDefect('The Timeline pointer of a Campaign save is beyond its Timeline');
  }
  return {
    campaignId,
    pastStamps: [...saved.pastStamps],
    states,
    entries: [...saved.entries],
    stamps: [...saved.stamps],
    position: saved.position,
    configuration: saved.configuration ?? current.configuration,
  };
}
