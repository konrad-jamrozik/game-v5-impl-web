/// <reference types="vite/client" />
/**
 * MUSIC, Playback: plays the Soundtrack in the browser through one audio element, applying the rules of music.ts.
 * The player lives for the whole page, so changing screen never restarts the Current Track. It reads no game state and
 * draws its playing order from Math.random, never from a Campaign.
 */
import { drawRound, gain, stepToggleFade, trackFade, trackTitle } from './music.ts';

interface Track {
  readonly title: string;
  readonly url: string;
}

/** PLACE, Music in an Implementation: the copy of the Soundtrack in assets/music/, served by the Game build. */
const FILES = import.meta.glob<string>('../../assets/music/*.{opus,mp3}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const TRACKS: readonly Track[] = Object.entries(FILES)
  .map(([path, url]) => ({ title: trackTitle(path), url }))
  .sort((a, b) => a.title.localeCompare(b.title));

const TICK_MS = 50;

export interface MusicStatus {
  /** The Track title of the Current Track once it has started; null before the first Track starts or when none can play. */
  readonly title: string | null;
}

class MusicPlayer {
  private readonly audio: HTMLAudioElement | null = typeof Audio === 'undefined' ? null : new Audio();
  private round: Track[] = [];
  private previousLast: Track | null = null;
  private current: Track | null = null;
  private on = false;
  private volume = 50;
  private previewVolume: number | null = null;
  /** The fade of Music on, from 0 to 1; f is the smaller of it and the Track's own fade. */
  private toggle = 1;
  private paused = false;
  private configured = false;
  private waitingForInteraction = false;
  private consecutiveFailures = 0;
  private dead = false;
  /** Whether a Track has started playing in this Session; before that the Track title reads nothing. */
  private started = false;
  private status: MusicStatus = { title: null };
  private readonly listeners = new Set<() => void>();
  private lastTick = 0;

  constructor() {
    const audio = this.audio;
    if (audio === null) {
      return;
    }
    audio.preload = 'auto';
    audio.volume = 0;
    audio.addEventListener('ended', () => {
      this.next();
    });
    audio.addEventListener('error', () => {
      this.fail();
    });
    audio.addEventListener('playing', () => {
      this.consecutiveFailures = 0;
      this.started = true;
      this.publish();
    });
  }

  /** Applies the effective Music on and Music volume; the first call starts the music. */
  configure(on: boolean, volume: number): void {
    this.volume = volume;
    if (!this.configured) {
      this.configured = true;
      this.on = on;
      if (on) {
        this.next();
      }
      this.startTicking();
      return;
    }
    if (on === this.on) {
      return;
    }
    this.on = on;
    const audio = this.audio;
    if (audio === null) {
      return;
    }
    // A new fade starts from the current value of f.
    this.toggle = Math.min(this.toggle, this.trackFade());
    if (on) {
      if (this.current === null) {
        this.toggle = 1;
        this.next();
      } else if (this.paused) {
        this.paused = false;
        this.toggle = 0;
        this.play();
      }
    }
    this.publish();
  }

  /** While the Player drags the Volume slider, the gain follows it before the Music volume is stored. */
  preview(volume: number | null): void {
    this.previewVolume = volume;
    this.apply();
  }

  getStatus = (): MusicStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private next(): void {
    const audio = this.audio;
    if (audio === null || this.dead || TRACKS.length === 0) {
      return;
    }
    if (this.round.length === 0) {
      this.round = drawRound(TRACKS, this.previousLast, Math.random);
      this.previousLast = this.round.at(-1) ?? null;
    }
    const track = this.round.shift();
    if (track === undefined) {
      return;
    }
    this.current = track;
    this.paused = false;
    this.toggle = 1;
    audio.src = track.url;
    audio.currentTime = 0;
    audio.volume = 0;
    this.publish();
    if (this.on) {
      this.play();
    }
  }

  private play(): void {
    const audio = this.audio;
    if (audio === null) {
      return;
    }
    audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.waitForInteraction();
      }
    });
  }

  /** MUSIC, Playback, Start: a browser that blocks sound starts the first Track at the first interaction. */
  private waitForInteraction(): void {
    if (this.waitingForInteraction) {
      return;
    }
    this.waitingForInteraction = true;
    const start = (): void => {
      document.removeEventListener('pointerdown', start, true);
      document.removeEventListener('keydown', start, true);
      this.waitingForInteraction = false;
      if (this.audio !== null && this.on && !this.paused) {
        this.audio.currentTime = 0;
        this.play();
      }
    };
    document.addEventListener('pointerdown', start, true);
    document.addEventListener('keydown', start, true);
  }

  /** MUSIC, Edge cases: a Track that cannot be played is skipped; when every Track fails, the music stops. */
  private fail(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= TRACKS.length) {
      this.dead = true;
      this.current = null;
      this.publish();
      return;
    }
    this.next();
  }

  private trackFade(): number {
    const audio = this.audio;
    return audio === null ? 0 : trackFade(audio.currentTime, audio.duration);
  }

  private startTicking(): void {
    if (this.audio === null) {
      return;
    }
    this.lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      const seconds = (now - this.lastTick) / 1000;
      this.lastTick = now;
      this.toggle = stepToggleFade(this.toggle, this.on ? 1 : 0, seconds);
      this.apply();
      if (!this.on && !this.paused && this.toggle === 0 && this.audio !== null && this.current !== null) {
        this.audio.pause();
        this.paused = true;
      }
    }, TICK_MS);
  }

  private apply(): void {
    const audio = this.audio;
    if (audio === null) {
      return;
    }
    const fade = Math.min(this.toggle, this.trackFade());
    audio.volume = gain(fade, this.previewVolume ?? this.volume);
  }

  private publish(): void {
    const title = this.started && !this.dead ? (this.current?.title ?? null) : null;
    if (title !== this.status.title) {
      this.status = { title };
      for (const listener of this.listeners) {
        listener();
      }
    }
  }
}

export const music = new MusicPlayer();
