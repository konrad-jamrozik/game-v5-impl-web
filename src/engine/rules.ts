import type { Rejection } from './result.ts';

/**
 * The seam between the engine subsystems of the Foundation family, e.g. Timeline and Saves, and the game behavior
 * of the Mechanics family. The engine subsystems know only this interface; they never look inside Campaign state
 * beyond the few values named by ShellState.
 */
export interface ShellState {
  /** Campaign configuration: every Campaign configuration value, resolved at creation. */
  readonly configuration: Readonly<Record<string, number>>;
  readonly world: {
    readonly current: {
      /** The Campaign seed; never Player-visible. */
      readonly seed: string;
      readonly turn: number;
    };
    readonly history: unknown;
  };
}

/** One committed Player API or Developer API action other than Advance turn, as the Timeline records it. */
export interface ActionRecord {
  readonly surface: 'player' | 'developer';
  readonly name: string;
  /** Plain data, so that a Campaign save can hold it and replay can apply it again. */
  readonly args: unknown;
}

/** One Campaign configuration value, as the Mechanics specification introducing it states it. */
export interface ConfigurationValueDescriptor {
  readonly key: string;
  readonly name: string;
  /** Whether the value is adjustable during play, or fixed after creation. */
  readonly adjustable: boolean;
  /** The permitted values, described for an interface. */
  readonly permitted: string;
  isPermitted(value: unknown): value is number;
}

export interface PresetDescriptor {
  readonly id: string;
  readonly name: string;
  readonly values: Readonly<Record<string, number>>;
}

export interface GameRules<S extends ShellState> {
  /** Identifies the Game build; a Campaign save written by another Game build is rejected. */
  readonly gameBuild: string;
  readonly presets: readonly PresetDescriptor[];
  readonly defaultPresetId: string;
  readonly configurationValues: readonly ConfigurationValueDescriptor[];

  /** Creation: equal inputs give equal initial Campaign state. */
  createCampaign(input: { configuration: Readonly<Record<string, number>>; seed: string }): S;
  /**
   * Applies one action other than Advance turn. Returns the next Committed state, the same state when the action
   * has no effect, or a rejection. It never changes its input.
   */
  applyAction(state: S, record: ActionRecord): S | Rejection;
  /** Applies Advance turn atomically. */
  advanceTurn(state: S): S | Rejection;
  /** Every violated invariant of a Committed state; empty when the state is valid. */
  checkInvariants(state: S): string[];
  /** Whether the Campaign has ended, i.e. has a Campaign ending. */
  isEnded(state: S): boolean;
  /** Whether a decoded value has the shape of Campaign state, for loading a Campaign save. */
  isCampaignState(value: unknown): value is S;

  currentStateView(state: S): unknown;
  turnReportView(state: S): unknown;
  historyView(state: S): unknown;
  availableActionsView(state: S): unknown;
  /** Full Campaign state for Developer API inspection, detached. */
  inspect(state: S): unknown;
  /** A further Player API query, by name; it returns only Player-visible information. */
  extraPlayerQuery?(state: S, query: string, args: unknown): unknown;
}
