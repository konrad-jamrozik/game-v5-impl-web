/**
 * GUI, Digit grouping: the digits of a whole part with a comma between each group of three digits, counted from the
 * right, e.g. "45817" as "45,817" and "999" as "999". Built from the digits themselves, never from the browser locale.
 */
export function groupDigitString(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
