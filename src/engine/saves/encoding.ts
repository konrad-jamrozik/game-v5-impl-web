import type { ActionRecord, ShellState } from '../rules.ts';
import type { MemoryValue, MemoryWrite, SavedCampaign } from '../timeline/campaign-runtime.ts';
import type { SaveHeader, SaveKind } from './storage.ts';

/** The Save size limit: 100 MiB; see SAVES, Save size limit. */
export const SAVE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;

const FORMAT = 4;

/** Encoded Turn-start states, reused while the same Turn-start state is written again; see DEC-008. */
const turnStartCache = new WeakMap<object, string>();

function encodeTurnStart(state: object): string {
  let text = turnStartCache.get(state);
  if (text === undefined) {
    text = JSON.stringify(state);
    turnStartCache.set(state, text);
  }
  return text;
}

/** The body of a Campaign save: one JSON text; see DEC-008. */
export function encodeSave<S extends ShellState>(header: SaveHeader, saved: SavedCampaign<S>): string {
  const rest = JSON.stringify({
    pastStamps: saved.pastStamps,
    entries: saved.entries,
    stamps: saved.stamps,
    position: saved.position,
    memoryBase: saved.memoryBase,
    memoryWrites: saved.memoryWrites,
  });
  const head = JSON.stringify({
    format: FORMAT,
    gameBuild: header.gameBuild,
    saveId: header.saveId,
    campaignId: header.campaignId,
    kind: header.kind,
  });
  return `${head.slice(0, -1)},"turnStart":${encodeTurnStart(saved.turnStart)},${rest.slice(1)}`;
}

/** The size of a text in bytes when written as UTF-8. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export interface DecodedSave<S extends ShellState> {
  readonly campaignId: string;
  readonly saveId: string;
  readonly kind: SaveKind;
  readonly saved: SavedCampaign<S>;
}

export type DecodeFailure = 'incompatible_game_build' | 'corrupt_campaign_save';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isActionRecord(value: unknown): value is ActionRecord {
  return (
    isRecord(value) &&
    (value['surface'] === 'player' || value['surface'] === 'developer') &&
    typeof value['name'] === 'string' &&
    'args' in value
  );
}

function isMemoryValue(value: unknown): value is MemoryValue {
  return isRecord(value) && typeof value['autopilotAiId'] === 'string' && 'memory' in value;
}

function isMemoryWrite(value: unknown): value is MemoryWrite {
  return isMemoryValue(value) && Number.isSafeInteger((value as { position?: unknown }).position);
}

const KINDS: readonly string[] = [
  'manual',
  'currentAutosave',
  'turnEndAutosave',
  'engagementAutosave',
  'disengagementAutosave',
  'returnAutosave',
];

/** Reads the body of a Campaign save, or says why the Game build does not load it. */
export function decodeSave<S extends ShellState>(
  body: string,
  gameBuild: string,
  isCampaignState: (value: unknown) => value is S,
): DecodedSave<S> | DecodeFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return 'corrupt_campaign_save';
  }
  if (!isRecord(parsed) || typeof parsed['gameBuild'] !== 'string' || typeof parsed['format'] !== 'number') {
    return 'corrupt_campaign_save';
  }
  if (parsed['gameBuild'] !== gameBuild || parsed['format'] !== FORMAT) {
    return 'incompatible_game_build';
  }
  const {
    campaignId,
    saveId,
    kind,
    pastStamps,
    turnStart,
    entries,
    stamps,
    position,
    memoryBase,
    memoryWrites,
  } = parsed;
  if (
    typeof campaignId !== 'string' ||
    typeof saveId !== 'string' ||
    typeof kind !== 'string' ||
    !KINDS.includes(kind) ||
    !isStringArray(pastStamps) ||
    !isStringArray(stamps) ||
    !Array.isArray(entries) ||
    !entries.every(isActionRecord) ||
    typeof position !== 'number' ||
    !Number.isSafeInteger(position) ||
    position < 0 ||
    position > entries.length ||
    stamps.length !== entries.length + 1 ||
    !(memoryBase === null || isMemoryValue(memoryBase)) ||
    !Array.isArray(memoryWrites) ||
    !memoryWrites.every(isMemoryWrite) ||
    !isCampaignState(turnStart)
  ) {
    return 'corrupt_campaign_save';
  }
  return {
    campaignId,
    saveId,
    kind: kind as SaveKind,
    saved: { pastStamps, turnStart, entries, stamps, position, memoryBase, memoryWrites },
  };
}

/** The stamps of every Committed state from creation up to the saved one, read from a Campaign save body. */
export function lineOfSave(body: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) {
      return null;
    }
    const { pastStamps, stamps, position } = parsed;
    if (!isStringArray(pastStamps) || !isStringArray(stamps) || typeof position !== 'number') {
      return null;
    }
    return [...pastStamps, ...stamps.slice(0, position + 1)];
  } catch {
    return null;
  }
}
