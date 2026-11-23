/// <reference types="vite/client" />
/**
 * SOUNDS, Playing a Sound: plays the Sound set in the browser, one new audio element per Sound, so that a Sound plays
 * over the music and over any Sound already playing. Every failure is silent: a missing file, a file that cannot be
 * played, and a Sound the browser withholds before the first interaction, which is never played later.
 */
import { buttonSound, SOUND, soundGain, soundName, type SoundName } from './sounds.ts';

/** PLACE, Sounds in an Implementation: the copy of the Sound set in assets/sounds/, served by the Game build. */
const FILES = import.meta.glob<string>('../../assets/sounds/*.{wav,opus,mp3}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const URLS: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [soundName(path), url]),
);

let soundsOn = true;
let soundsVolume = 100;

/** SOUNDS, Sound settings: a change applies to the Sounds that start after it. */
export function configureSounds(on: boolean, volume: number): void {
  soundsOn = on;
  soundsVolume = volume;
}

/**
 * Plays a Sound once, from its beginning to its end, over the music and any Sound already playing. `at` plays it at
 * that Sounds volume whatever Sounds on holds, for a Sound that answers a change of the Sound settings themselves
 * before the stored settings reach this player, under SOUNDS, Main click and Sound settings.
 */
export function playSound(name: SoundName, at?: { readonly volume: number }): void {
  const url = URLS.get(name);
  if ((at === undefined && !soundsOn) || url === undefined || typeof Audio === 'undefined') {
    return;
  }
  const audio = new Audio(url);
  audio.volume = soundGain(at?.volume ?? soundsVolume);
  audio.play().catch(() => {
    // SOUNDS, Playing a Sound: a Sound that cannot play is silent.
  });
}

/**
 * SOUNDS, Main click and Go back: every enabled button plays the Sound its `data-sound` attribute names, `main-click`
 * when it names none. Listening in the capture phase plays the Sound before the engine answers.
 */
export function installButtonSounds(target: Document): () => void {
  const onClick = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button === null || button.disabled) {
      return;
    }
    const name = buttonSound(button.getAttribute('data-sound'));
    if (name !== null) {
      playSound(name);
    }
  };
  target.addEventListener('click', onClick, true);
  return () => {
    target.removeEventListener('click', onClick, true);
  };
}

/** A confirmation dialog: declining it is a Go back, under SOUNDS, Go back. */
export function confirmOrGoBack(message: string): boolean {
  const confirmed = window.confirm(message);
  if (!confirmed) {
    playSound(SOUND.back);
  }
  return confirmed;
}
