/** The longest permitted Campaign seed; see DETERM, Campaign seed. */
export const SEED_MAX_LENGTH = 64;
/** The length of a Campaign seed the engine chooses itself. */
export const CHOSEN_SEED_LENGTH = 10;

/** A permitted Campaign seed is 1 to 64 printable ASCII characters, i.e. codes 32 to 126 inclusive. */
export function isPermittedSeed(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > SEED_MAX_LENGTH) {
    return false;
  }
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code > 126) {
      return false;
    }
  }
  return true;
}

const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Builds a permitted Campaign seed of exactly 10 characters from whole numbers supplied by the caller. */
export function seedFromNumbers(numbers: readonly number[]): string {
  let text = '';
  for (let i = 0; i < CHOSEN_SEED_LENGTH; i += 1) {
    const value = Math.abs(Math.trunc(numbers[i] ?? 0));
    text += SEED_ALPHABET.charAt(value % SEED_ALPHABET.length);
  }
  return text;
}

/**
 * The Campaign-scoped identifier of a Campaign instance: its Type and a number taken from one counter that all
 * Campaign instance Types share, so that Instance IDs are unique across the Types; see DEC-006.
 */
export function formatInstanceId(type: string, sequence: number): string {
  return `${type}-${sequence}`;
}
