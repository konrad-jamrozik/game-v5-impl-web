/**
 * CONFIG, Campaign setup seed: one line of text from which a Campaign can be created again exactly as it was. It holds
 * the Campaign seed, the Campaign configuration preset, every Preset edit, and the Game build. Its encoding is this
 * Implementation's: `ss1-` followed by URL-safe Base64 of compact JSON. It is always longer than 64 characters, so it
 * is never a permitted Campaign seed, and one field can take either.
 */
import { fromBase64Url, toBase64Url } from '../../kernel/index.ts';

const PREFIX = 'ss1-';

/** The new-Campaign setup a Campaign was created with: its preset and its Preset edits. */
export interface CampaignSetup {
  readonly preset: string;
  readonly edits: Readonly<Record<string, number>>;
}

/** What a Campaign setup seed holds. */
export interface CampaignSetupSeed extends CampaignSetup {
  readonly gameBuild: string;
  readonly seed: string;
}

export function encodeCampaignSetupSeed(setup: CampaignSetupSeed): string {
  const json = JSON.stringify({ b: setup.gameBuild, s: setup.seed, p: setup.preset, e: setup.edits });
  const text = `${PREFIX}${toBase64Url(json)}`;
  // Longer than any permitted Campaign seed, so that the two never mix.
  return text.length > 64 ? text : `${text}${'.'.repeat(65 - text.length)}`;
}

/** Whether a text is meant as a Campaign setup seed rather than a Campaign seed. */
export const isCampaignSetupSeedText = (text: unknown): text is string =>
  typeof text === 'string' && text.trim().startsWith(PREFIX) && text.trim().length > 64;

/** CONFIG, Campaign setup seed: what a text holds, or null when it is not a Campaign setup seed. */
export function decodeCampaignSetupSeed(text: string): CampaignSetupSeed | null {
  if (!isCampaignSetupSeedText(text)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(text.trim().slice(PREFIX.length).replace(/\.+$/, '')));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const edits = record['e'];
  if (
    typeof record['b'] !== 'string' ||
    typeof record['s'] !== 'string' ||
    typeof record['p'] !== 'string' ||
    typeof edits !== 'object' ||
    edits === null ||
    Array.isArray(edits) ||
    !Object.values(edits).every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    return null;
  }
  return {
    gameBuild: record['b'],
    seed: record['s'],
    preset: record['p'],
    edits: edits as Record<string, number>,
  };
}
