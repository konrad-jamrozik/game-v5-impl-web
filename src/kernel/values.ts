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
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? null : path;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const found = findNonWholeNumber(item, path === '' ? key : `${path}.${key}`);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
