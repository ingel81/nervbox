import { Component } from '../core/component';
import { GameObject } from '../core/game-object';

export interface AudioConfig {
  volume?: number;
  loop?: boolean;
  randomStart?: boolean;
}

/**
 * AudioComponent manages sounds for a GameObject
 */
export class AudioComponent extends Component {
  private sounds = new Map<string, { url: string; config: AudioConfig }>();
  private activeSounds = new Map<string, HTMLAudioElement>();

  constructor(gameObject: GameObject) {
    super(gameObject);
  }

  /**
   * Register a sound
   */
  registerSound(id: string, url: string, config: AudioConfig = {}): void {
    this.sounds.set(id, { url, config });
  }

  /**
   * Play a registered sound
   */
  play(id: string, loop?: boolean): void {
    const sound = this.sounds.get(id);
    if (!sound) {
      console.warn(`Sound '${id}' not registered on ${this.gameObject.id}`);
      return;
    }

    // Stop existing instance if playing
    this.stop(id);

    const audio = new Audio(sound.url);
    audio.loop = loop ?? sound.config.loop ?? false;
    audio.volume = sound.config.volume ?? 1.0;

    // Random start position for variety
    if (sound.config.randomStart) {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (audio.duration > 0) {
            audio.currentTime = Math.random() * audio.duration;
          }
        },
        { once: true }
      );
    }

    audio.play().catch(() => {
      // Ignore autoplay restrictions
    });

    this.activeSounds.set(id, audio);
  }

  /**
   * Stop a playing sound
   */
  stop(id: string): void {
    const audio = this.activeSounds.get(id);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      this.activeSounds.delete(id);
    }
  }

  /**
   * Stop all playing sounds
   */
  stopAll(): void {
    for (const audio of this.activeSounds.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.activeSounds.clear();
  }

  /**
   * Set volume for a sound
   */
  setVolume(id: string, volume: number): void {
    const audio = this.activeSounds.get(id);
    if (audio) {
      audio.volume = volume;
    }
  }

  update(deltaTime: number): void {
    // Audio playback is handled by browser
  }

  override onDestroy(): void {
    this.stopAll();
  }
}
