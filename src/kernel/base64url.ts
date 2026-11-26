/**
 * URL-safe Base64 of ASCII text, without padding, for the setup seeds a player copies and pastes. It is written out
 * because the engine also runs where no `btoa` is defined.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i);
    const b = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
    const c = i + 2 < text.length ? text.charCodeAt(i + 2) : 0;
    const triple = (a << 16) | (b << 8) | c;
    const chars = [18, 12, 6, 0].map((shift) => ALPHABET[(triple >> shift) & 63] ?? '');
    out += chars.slice(0, Math.min(4, text.length - i + 1)).join('');
  }
  return out;
}

/** The text of URL-safe Base64; throws on a character that is not of its alphabet. */
export function fromBase64Url(text: string): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('not Base64');
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  return out;
}
