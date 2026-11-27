/**
 * SOUNDS: the rules of the Sounds that need no browser: the Sound names of the Sound set, the Sound name of a file,
 * the gain, and which Sound a button plays. The browser player in sound-player.ts applies them.
 */

/** SOUNDS, Sound set: the Sounds the GUI plays; a file whose Sound name is not here is never played. */
export const SOUND = {
  main: 'main-click',
  select: 'select-click',
  back: 'go-back-click',
  turnSummary: 'interesting-turn-summary',
} as const;

export type SoundName = (typeof SOUND)[keyof typeof SOUND];

/**
 * SOUNDS, Sound set: the Combat replay Sounds: `shot-` followed by a shot with a hyphen for each underscore, the
 * three hit Sounds, and the three Sounds of a kinetic miss.
 */
export const REPLAY_SOUNDS: ReadonlySet<string> = new Set([
  'shot-blade',
  'shot-light-pistol',
  'shot-heavy-pistol',
  'shot-rifle',
  'shot-sighted-rifle',
  'shot-machine-gun',
  'shot-laser-pistol',
  'shot-laser-rifle',
  'shot-focused-laser-rifle',
  'hit-blade',
  'hit-kinetic',
  'hit-energy',
  'miss-kinetic-1',
  'miss-kinetic-2',
  'miss-kinetic-3',
]);

/** SOUNDS, Combat replay Sounds: a kinetic miss, which is heard as one of its three Sounds. */
export const KINETIC_MISS = 'miss-kinetic';

/**
 * SOUNDS, Combat replay Sounds: the Sound name an attack plays for one of its moments. A kinetic miss is one of
 * `miss-kinetic-1`, `miss-kinetic-2`, and `miss-kinetic-3`, each chosen about as often as the others, by the
 * attack's place in the Combat log, so that the same attack always sounds the same.
 */
export function replaySoundName(sound: string, attack: number): string {
  if (sound !== KINETIC_MISS) {
    return sound;
  }
  const s = Math.sin((attack + 1) * 78.233) * 43758.5453;
  return `${KINETIC_MISS}-${1 + Math.floor((s - Math.floor(s)) * 3)}`;
}

/** SOUNDS, Combat replay Sounds: at most this many Combat replay Sounds play at the same time. */
export const REPLAY_SOUND_LIMIT = 6;

/**
 * SOUNDS, Combat replay Sounds: the rate the Sounds of one attack are played at, up to 6% lower or higher in pitch
 * than authored, which follows from the attack's place in the Combat log, so that the same attack always sounds the
 * same.
 */
export function replaySoundRate(attack: number): number {
  const s = Math.sin((attack + 1) * 12.9898) * 43758.5453;
  return 0.94 + (s - Math.floor(s)) * 0.12;
}

/** SOUNDS, Glossary, Sound name: the file name without its extension, e.g. `main-click.wav` is `main-click`. */
export function soundName(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** SOUNDS, Sound settings: gain = (v / 100)², where v is the Sounds volume; no rounding occurs. */
export function soundGain(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return v * v;
}

/** SOUNDS, Sound settings: the effective Sounds on and Sounds volume among the Global configuration settings. */
export function soundSettings(
  settings: readonly { readonly setting: string; readonly effectiveValue: unknown }[],
): { on: boolean; volume: number } {
  const find = (setting: string) => settings.find((item) => item.setting === setting)?.effectiveValue;
  const on = find('soundsOn');
  const volume = find('soundsVolume');
  return { on: on !== false, volume: typeof volume === 'number' ? volume : 100 };
}

/**
 * How a button answers a click, from its `data-sound` attribute: `back` marks a Go back, `select` a Select click,
 * e.g. an item of a list in a pane of a Detail view, `none` an input that only toggles, filters, sorts, or changes a
 * tab, and any other enabled button is a Main click.
 */
export type ButtonSound = 'main' | 'select' | 'back' | 'none';

export function buttonSound(attribute: string | null): SoundName | null {
  switch (attribute) {
    case 'none':
      return null;
    case 'back':
      return SOUND.back;
    case 'select':
      return SOUND.select;
    default:
      return SOUND.main;
  }
}
