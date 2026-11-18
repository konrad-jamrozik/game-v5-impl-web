/**
 * SOUNDS: the rules of the Sounds that need no browser: the Sound names of the Sound set, the Sound name of a file,
 * the gain, and which Sound a button plays. The browser player in sound-player.ts applies them.
 */

/** SOUNDS, Sound set: the Sounds the GUI plays; a file whose Sound name is not here is never played. */
export const SOUND = {
  main: 'main-click',
  back: 'go-back-click',
  turnSummary: 'interesting-turn-summary',
} as const;

export type SoundName = (typeof SOUND)[keyof typeof SOUND];

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
 * How a button answers a click, from its `data-sound` attribute: `back` marks a Go back, `none` an input that only
 * selects, toggles, filters, sorts, or changes a tab, and any other enabled button is a Main click.
 */
export type ButtonSound = 'main' | 'back' | 'none';

export function buttonSound(attribute: string | null): SoundName | null {
  if (attribute === 'none') {
    return null;
  }
  return attribute === 'back' ? SOUND.back : SOUND.main;
}
