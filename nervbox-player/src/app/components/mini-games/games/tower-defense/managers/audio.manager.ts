import { Injectable } from '@angular/core';

/**
 * Manages global audio playback for the game
 */
@Injectable()
export class AudioManager {
  private sounds = new Map<string, string>(); // id -> URL
  private audioInstances = new Map<string, HTMLAudioElement[]>();

  /**
   * Register a sound
   */
  registerSound(id: string, url: string): void {
    this.sounds.set(id, url);
  }

  /**
   * Play a sound
   */
  play(id: string, volume = 1.0, loop = false): void {
    const url = this.sounds.get(id);
    if (!url) {
      console.warn(`Sound '${id}' not registered`);
      return;
    }

    const audio = new Audio(url);
    audio.volume = volume;
    audio.loop = loop;

    audio.play().catch(() => {
      // Ignore autoplay restrictions
    });

    // Track instance
    if (!this.audioInstances.has(id)) {
      this.audioInstances.set(id, []);
    }
    this.audioInstances.get(id)!.push(audio);

    // Cleanup after playback
    if (!loop) {
      audio.addEventListener('ended', () => {
        const instances = this.audioInstances.get(id);
        if (instances) {
          const index = instances.indexOf(audio);
          if (index > -1) instances.splice(index, 1);
        }
      });
    }
  }

  /**
   * Stop a specific sound
   */
  stop(id: string): void {
    const instances = this.audioInstances.get(id);
    if (instances) {
      instances.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      instances.length = 0;
    }
  }

  /**
   * Stop all sounds
   */
  stopAll(): void {
    for (const instances of this.audioInstances.values()) {
      instances.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      instances.length = 0;
    }
  }
}
