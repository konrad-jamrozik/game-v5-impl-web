/** SOUNDS: the Sound set, the gain, the Sound of a button, and the Sound settings. */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { SETTINGS } from '../../src/engine/session/global-configuration.ts';
import {
  buttonSound,
  REPLAY_SOUNDS,
  SOUND,
  soundGain,
  soundName,
  soundSettings,
} from '../../src/web/sounds.ts';

describe('SOUNDS: Sound set', () => {
  it('names a Sound by its file name without the extension', () => {
    expect(soundName('main-click.wav')).toBe('main-click');
    expect(soundName('../../assets/sounds/go-back-click.wav')).toBe('go-back-click');
    expect(soundName('main-click.opus')).toBe(soundName('main-click.mp3'));
  });

  it('holds a copy of every Sound the GUI plays, each a WAV, Ogg Opus, or MP3 file with a distinct Sound name', () => {
    const files = readdirSync(new URL('../../assets/sounds/', import.meta.url));
    expect(files.every((file) => /\.(wav|opus|mp3)$/.test(file))).toBe(true);
    expect(new Set(files.map(soundName)).size).toBe(files.length);
    expect(new Set(files.map(soundName))).toEqual(new Set([...Object.values(SOUND), ...REPLAY_SOUNDS]));
  });
});

describe('SOUNDS: When Sounds play', () => {
  it('makes a button a Main click unless it is marked a Select click, a Go back, or silent', () => {
    expect(buttonSound(null)).toBe('main-click');
    expect(buttonSound('main')).toBe('main-click');
    expect(buttonSound('select')).toBe('select-click');
    expect(buttonSound('back')).toBe('go-back-click');
    expect(buttonSound('none')).toBeNull();
  });
});

describe('SOUNDS: Sound settings', () => {
  it('plays at the gain (v / 100)², unrounded', () => {
    expect(soundGain(50)).toBe(0.25);
    expect(soundGain(100)).toBe(1);
    expect(soundGain(0)).toBe(0);
    expect(soundGain(33)).toBeCloseTo(0.1089, 10);
  });

  it('defaults to Sounds on and a Sounds volume of 100, and permits only their values', () => {
    const on = SETTINGS.find((item) => item.setting === 'soundsOn');
    const volume = SETTINGS.find((item) => item.setting === 'soundsVolume');
    expect(on?.gameBuildDefault).toBe(true);
    expect(volume?.gameBuildDefault).toBe(100);
    expect(on?.isPermitted('yes')).toBe(false);
    expect(volume?.isPermitted(101)).toBe(false);
    expect(volume?.isPermitted(7.5)).toBe(false);
    expect(soundSettings([])).toEqual({ on: true, volume: 100 });
    expect(
      soundSettings([
        { setting: 'soundsOn', effectiveValue: false },
        { setting: 'soundsVolume', effectiveValue: 20 },
      ]),
    ).toEqual({ on: false, volume: 20 });
  });
});
