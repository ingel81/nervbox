import { Injectable } from '@angular/core';
import * as Cesium from 'cesium';

/**
 * Manages global audio playback
 */
@Injectable()
export class AudioManager {
  private sounds = new Map<string, string>(); // id -> URL
  private audioInstances = new Map<string, HTMLAudioElement[]>();
  private viewer: Cesium.Viewer | null = null;

  initialize(viewer: Cesium.Viewer): void {
    this.viewer = viewer;
  }

  /**
   * Register a sound
   */
  registerSound(id: string, url: string): void {
    this.sounds.set(id, url);
  }

  /**
   * Play a sound
   */
  play(id: string, volume = 1.0, loop = false, position?: Cesium.Cartesian3): void {
    const url = this.sounds.get(id);
    if (!url) {
      console.warn(`Sound '${id}' not registered`);
      return;
    }

    const audio = new Audio(url);
    audio.volume = position ? this.calculateDistanceVolume(position, volume) : volume;
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

  /**
   * Calculate volume based on distance from camera
   */
  private calculateDistanceVolume(position: Cesium.Cartesian3, baseVolume: number): number {
    if (!this.viewer) return baseVolume;

    const cameraPosition = this.viewer.camera.positionWC;
    const distance = Cesium.Cartesian3.distance(cameraPosition, position);

    const minDist = 10; // Full volume up to 10m
    const maxDist = 300; // Silent at 300m

    if (distance <= minDist) return baseVolume;
    if (distance >= maxDist) return 0;

    const attenuation = 1 - (distance - minDist) / (maxDist - minDist);
    return baseVolume * attenuation;
  }
}
