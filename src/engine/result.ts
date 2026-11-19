/**
 * The result of every engine API operation. A failed operation changes nothing; see ENG, World state integrity.
 * The error representation is the Implementer's choice; see DEC-009.
 */
export type ErrorCode =
  /** The operation needs a Current campaign and the Session has none. */
  | 'no_current_campaign'
  /** The Principal has no access to this API surface. */
  | 'unauthorized'
  /** The operation is unavailable to the Session controller while an Autopilot engagement is active. */
  | 'autopilot_active'
  /** Developer API was called while Dev mode is disabled. */
  | 'dev_mode_disabled'
  /** The Autopilot engagement the call belongs to has ended. */
  | 'engagement_ended'
  /** The input is malformed, e.g. a value of the wrong Type. */
  | 'invalid_input'
  /** A precondition of the action or operation does not hold. */
  | 'rejected'
  /** The Campaign has ended and the action is no longer possible. */
  | 'campaign_ended'
  /** A navigation operation has no target. */
  | 'no_target'
  /** Load reason: the Campaign save was written by a different Game build. */
  | 'incompatible_game_build'
  /** Load reason: the Campaign save can be read but is not a valid Campaign save. */
  | 'corrupt_campaign_save'
  /** Load reason: the Campaign save cannot be read. */
  | 'unreadable_campaign_save'
  /** Save reason: the Campaign save would exceed the Save size limit. */
  | 'save_size_limit_exceeded'
  /** Save reason: the Campaign save cannot be written. */
  | 'unwritable_campaign_save'
  /** Delete reason: the Campaign save, or the Campaign, belongs to the Current campaign. */
  | 'current_campaign'
  /** Delete reason: no Campaign save has that Campaign save ID, or none has that Campaign ID. */
  | 'unknown_campaign_save'
  /** Delete reason: Game storage cannot delete the Campaign save. */
  | 'undeletable_campaign_save'
  /** The engine or the data of the Game build is defective. */
  | 'engine_defect';

export interface EngineError {
  readonly code: ErrorCode;
  /** A message for the caller. It contains only Player-visible information. */
  readonly message: string;
  /** For a rejected gameplay action: which precondition failed, as a stable identifier. */
  readonly reason: string | null;
}

/** An Autosave that could not be written while the operation that caused it still completed. */
export interface AutosaveFailure {
  readonly autosave: 'current' | 'turnEnd' | 'engagement' | 'disengagement';
  readonly code: 'save_size_limit_exceeded' | 'unwritable_campaign_save';
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly autosaveFailures: readonly AutosaveFailure[] }
  | { readonly ok: false; readonly error: EngineError };

export function ok<T>(value: T, autosaveFailures: readonly AutosaveFailure[] = []): Result<T> {
  return { ok: true, value, autosaveFailures };
}

export function fail(code: ErrorCode, message: string, reason: string | null = null): Result<never> {
  return { ok: false, error: { code, message, reason } };
}

/** A rejection of a gameplay action by one of its preconditions. */
export interface Rejection {
  readonly rejected: true;
  readonly code: ErrorCode;
  readonly reason: string;
  readonly message: string;
}

export function reject(reason: string, message: string, code: ErrorCode = 'rejected'): Rejection {
  return { rejected: true, code, reason, message };
}

export function isRejection(value: unknown): value is Rejection {
  return typeof value === 'object' && value !== null && (value as { rejected?: unknown }).rejected === true;
}
