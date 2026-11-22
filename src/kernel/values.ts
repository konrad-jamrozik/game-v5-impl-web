/** Structural equality of plain data: objects, arrays, and primitive values. Property order does not matter. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !deepEqual(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

/** A detached copy of plain data, so that a caller holding it cannot reach the original. */
export function detach<T>(value: T): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => detach(item)) as T;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    copy[key] = detach(item);
  }
  return copy as T;
}

/** Freezes plain data in depth and returns it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
  }
  return value;
}

/** Whether a value is a whole number an implementation can store exactly. */
export function isStoredWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Finds the first value in plain data that is a number but not a safe whole number, and returns its path; returns
 * null when every number is one. Used to check NUMBERS, Whole-number quantities at each commit.
 */
export function findNonWholeNumber(value: unknown, path = ''): string | null {
  return wholeWalk(value, path).found;
}

/**
 * The objects already found to hold only whole numbers that can never change: frozen, with every object under them
 * frozen too. Successive states share every part a commit did not change, so each commit walks only the new parts.
 */
const WHOLE_AND_FROZEN = new WeakSet<object>();

/** The walk of `findNonWholeNumber`; `sealed` tells whether the value can never change, so its result holds forever. */
function wholeWalk(value: unknown, path: string): { found: string | null; sealed: boolean } {
  if (typeof value === 'number') {
    return { found: Number.isSafeInteger(value) ? null : path, sealed: true };
  }
  if (typeof value !== 'object' || value === null) {
    return { found: null, sealed: true };
  }
  if (WHOLE_AND_FROZEN.has(value)) {
    return { found: null, sealed: true };
  }
  let sealed = Object.isFrozen(value);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const result = wholeWalk(item, path === '' ? key : `${path}.${key}`);
    if (result.found !== null) {
      return { found: result.found, sealed: false };
    }
    sealed &&= result.sealed;
  }
  if (sealed) {
    WHOLE_AND_FROZEN.add(value);
  }
  return { found: null, sealed };
}
