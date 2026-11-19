/**
 * An internal invariant violation or a defect in the data the Game build supplies. It is never an expected rejection
 * of a request; see ENG, World state integrity.
 */
export class EngineDefect extends Error {
  override readonly name = 'EngineDefect';
}

export function defect(message: string): never {
  throw new EngineDefect(message);
}

/** Returns the value, or reports an engine defect when it is absent. */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new EngineDefect(`Missing ${what}`);
  }
  return value;
}
